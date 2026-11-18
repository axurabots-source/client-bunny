const path = require('path');
const fs = require('fs');
let baileys = null;
let makeWASocket = null;
let useMultiFileAuthState = null;
let DisconnectReason = null;
let downloadMediaMessage = null;

try {
    baileys = require('@whiskeysockets/baileys');
    makeWASocket = baileys.default || baileys.makeWASocket;
    useMultiFileAuthState = baileys.useMultiFileAuthState;
    DisconnectReason = baileys.DisconnectReason;
    downloadMediaMessage = baileys.downloadMediaMessage;
} catch (e) {
    console.warn('[BaileysManager] Baileys not available in current environment (lazy fallback):', e.message);
}
const QRCode = require('qrcode');
let pino = null;
try {
    pino = require('pino');
} catch (e) {
    pino = () => ({ level: 'silent', trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {}, child: () => ({ trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {} }) });
}
const { InboxRepository } = require('./inboxRepository');
const { pool } = require('../m1_storage/leadRepository');

function safeClearFolder(folderPath) {
    if (!fs.existsSync(folderPath)) return;
    try {
        const files = fs.readdirSync(folderPath);
        for (const file of files) {
            const curPath = path.join(folderPath, file);
            try {
                if (fs.lstatSync(curPath).isDirectory()) {
                    safeClearFolder(curPath);
                    fs.rmdirSync(curPath);
                } else {
                    fs.unlinkSync(curPath);
                }
            } catch (e) {
                try { fs.writeFileSync(curPath, ''); } catch (_) {}
            }
        }
    } catch (err) {
        console.warn('[WhatsApp Baileys] Safe wipe note:', err.message);
    }
}

class BaileysManager {
    constructor() {
        this.sock = null;
        this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'qr_ready' | 'connected'
        this.currentQr = null;
        this.connectedUser = null;
        this.authFolder = path.join(__dirname, '../../auth_whatsapp');
        this.isReconnecting = false;
        this.reconnectAttempts = 0;
        this.reconnectTimeout = null;
        this.contacts = {};
        this._pendingQrResolver = null;

        // Auto-initialize if session credentials exist on disk OR in Supabase (skip in Vercel serverless)
        if (!process.env.VERCEL) {
            setTimeout(async () => {
                try {
                    let hasCreds = fs.existsSync(path.join(this.authFolder, 'creds.json'));
                    if (!hasCreds) {
                        hasCreds = await this.restoreSessionFromDb();
                    }
                    if (hasCreds) {
                        this.init().catch(err => console.warn('[WhatsApp Baileys] Auto-init notice:', err.message));
                    }
                } catch (e) {
                    console.warn('[WhatsApp Baileys] Startup check note:', e.message);
                }
            }, 1000);
        }
    }

    /**
     * Persist active WhatsApp credentials from disk to Supabase PostgreSQL channel_settings.
     * Guarantees session persistence across container restarts and Docker rebuilds.
     */
    async saveSessionToDb() {
        if (!fs.existsSync(this.authFolder)) return;
        try {
            const files = fs.readdirSync(this.authFolder);
            if (!files.includes('creds.json')) return;

            const sessionFiles = {};
            for (const f of files) {
                const fullPath = path.join(this.authFolder, f);
                try {
                    if (!fs.lstatSync(fullPath).isDirectory()) {
                        sessionFiles[f] = fs.readFileSync(fullPath, 'utf8');
                    }
                } catch (e) {}
            }

            const configData = {
                files: sessionFiles,
                connectedUser: this.connectedUser,
                savedAt: new Date().toISOString()
            };

            await pool.query(`
                INSERT INTO channel_settings (channel, is_enabled, config_data, updated_at)
                VALUES ('whatsapp', true, $1, NOW())
                ON CONFLICT (channel) DO UPDATE 
                SET config_data = $1, is_enabled = true, updated_at = NOW();
            `, [JSON.stringify(configData)]);

            console.log(`[WhatsApp Baileys] 💾 Session state synchronized to Supabase (${Object.keys(sessionFiles).length} keys).`);
        } catch (err) {
            console.warn('[WhatsApp Baileys] Session DB save note:', err.message);
        }
    }

    /**
     * Restore WhatsApp session credentials from Supabase PostgreSQL to disk.
     */
    async restoreSessionFromDb() {
        try {
            const res = await pool.query(`SELECT config_data FROM channel_settings WHERE channel = 'whatsapp' LIMIT 1;`);
            if (!res.rows.length || !res.rows[0].config_data?.files) {
                return false;
            }

            const sessionData = res.rows[0].config_data;
            const files = sessionData.files || {};
            if (!files['creds.json']) return false;

            if (!fs.existsSync(this.authFolder)) {
                fs.mkdirSync(this.authFolder, { recursive: true });
            }

            for (const [filename, content] of Object.entries(files)) {
                fs.writeFileSync(path.join(this.authFolder, filename), content, 'utf8');
            }

            if (sessionData.connectedUser) {
                this.connectedUser = sessionData.connectedUser;
            }

            console.log(`[WhatsApp Baileys] 📦 Restored WhatsApp session from Supabase (${Object.keys(files).length} keys, user: +${this.connectedUser || 'Active'}).`);
            return true;
        } catch (err) {
            console.warn('[WhatsApp Baileys] Session DB restore note:', err.message);
            return false;
        }
    }

    getStatus() {
        return {
            status: this.status,
            qr: this.currentQr,
            connectedUser: this.connectedUser
        };
    }

    /**
     * Explicitly generate a fresh QR code for linking a WhatsApp device.
     * Wipes any stale or replaced credentials so Baileys is forced to enter pairing mode.
     */
    async generateQr(force = true) {
        console.log(`[WhatsApp Baileys] generateQr requested (force: ${force}, current status: ${this.status})`);

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        this.reconnectAttempts = 0;

        // If force is false and we are already connected, return current status
        if (!force && this.sock && this.status === 'connected') {
            return this.getStatus();
        }

        // Forcibly tear down any existing socket and listeners
        if (this.sock) {
            try {
                this.sock.ev.removeAllListeners();
                await this.sock.logout().catch(() => {});
                this.sock.end(undefined);
            } catch (e) {}
            this.sock = null;
        }

        // Wipe stale credentials so Baileys produces a brand new pairing QR
        safeClearFolder(this.authFolder);
        await pool.query("DELETE FROM channel_settings WHERE channel = 'whatsapp';").catch(() => {});

        this.status = 'connecting';
        this.currentQr = null;
        this.connectedUser = null;

        // Set up a promise that resolves immediately when the QR code is generated
        return new Promise(async (resolve) => {
            let hasResolved = false;

            const timer = setTimeout(() => {
                if (!hasResolved) {
                    hasResolved = true;
                    this._pendingQrResolver = null;
                    resolve(this.getStatus());
                }
            }, 12000);

            this._pendingQrResolver = (status) => {
                if (!hasResolved) {
                    hasResolved = true;
                    clearTimeout(timer);
                    resolve(status);
                }
            };

            try {
                await this.init(true);
            } catch (err) {
                if (!hasResolved) {
                    hasResolved = true;
                    clearTimeout(timer);
                    resolve({ success: false, status: 'error', error: err.message });
                }
            }
        });
    }

    async init(forceNew = false) {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        // If already connected and not forcing new session, return active status
        if (this.sock && this.status === 'connected' && !forceNew) {
            return this.getStatus();
        }

        // If QR already generated and waiting for scan, return existing QR
        if (this.status === 'qr_ready' && this.currentQr && !forceNew) {
            return this.getStatus();
        }

        // Clean up previous socket if exists before creating a new one
        if (this.sock) {
            try {
                this.sock.ev.removeAllListeners();
                this.sock.end(undefined);
            } catch (e) {}
            this.sock = null;
        }

        try {
            if (!fs.existsSync(this.authFolder)) {
                fs.mkdirSync(this.authFolder, { recursive: true });
            }

            this.status = 'connecting';
            this.currentQr = null;
            const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);

            this.contacts = {};

            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }),
                browser: ['Client Bunny CRM', 'Chrome', '1.0.0'],
                syncFullHistory: true,
                shouldSyncHistoryMessage: () => true,
                generateHighQualityLinkPreview: true
            });

            // Initial wait promise with fallback resolver
            const initialWaitPromise = new Promise((resolve) => {
                let resolved = false;
                const timer = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        resolve(this.getStatus());
                    }
                }, 8000);

                const checkReady = () => {
                    if (!resolved && (this.status === 'qr_ready' || this.status === 'connected')) {
                        resolved = true;
                        clearTimeout(timer);
                        resolve(this.getStatus());
                    }
                };

                this.sock.ev.on('connection.update', (u) => {
                    if (u.qr || u.connection === 'open') {
                        setTimeout(checkReady, 300);
                    }
                });
            });

            this.sock.ev.on('creds.update', async () => {
                await saveCreds();
                await this.saveSessionToDb();
            });

            this.sock.ev.on('contacts.upsert', (newContacts) => {
                if (Array.isArray(newContacts)) {
                    for (const c of newContacts) {
                        if (c.id) {
                            this.contacts[c.id] = c.name || c.notify || c.verifiedName;
                        }
                    }
                }
            });

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    try {
                        this.currentQr = await QRCode.toDataURL(qr, {
                            width: 280,
                            margin: 2,
                            color: { dark: '#000000', light: '#FFFFFF' }
                        });
                        this.status = 'qr_ready';
                        console.log('[WhatsApp Baileys] Live QR Code generated and ready for scan.');
                        if (this._pendingQrResolver) {
                            this._pendingQrResolver(this.getStatus());
                            this._pendingQrResolver = null;
                        }
                    } catch (err) {
                        console.error('[WhatsApp Baileys] Failed to convert QR code to DataURL:', err.message);
                    }
                }

                if (connection === 'open') {
                    this.status = 'connected';
                    this.currentQr = null;
                    this.reconnectAttempts = 0;
                    if (this.reconnectTimeout) {
                        clearTimeout(this.reconnectTimeout);
                        this.reconnectTimeout = null;
                    }
                    const jid = this.sock?.user ? (this.sock.user.id || '') : '';
                    this.connectedUser = jid.split(':')[0] || 'Active';
                    console.log(`[WhatsApp Baileys] ✅ Connected as +${this.connectedUser}!`);
                    await this.saveSessionToDb();
                    if (this._pendingQrResolver) {
                        this._pendingQrResolver(this.getStatus());
                        this._pendingQrResolver = null;
                    }
                }

                if (connection === 'close') {
                    const statusCode = (lastDisconnect?.error)?.output?.statusCode;
                    console.log(`[WhatsApp Baileys] Connection closed (code: ${statusCode})`);

                    if (statusCode === DisconnectReason.connectionReplaced) {
                        console.log('[WhatsApp Baileys] Connection replaced by another session/device. Auto-reconnect stopped to prevent loop.');
                        this.status = 'disconnected';
                        this.currentQr = null;
                        this.sock = null;
                        return;
                    }

                    if (statusCode === DisconnectReason.loggedOut) {
                        console.log('[WhatsApp Baileys] Session logged out by WhatsApp. Clearing credentials.');
                        await this.disconnect();
                        return;
                    }

                    // For temporary drops or restartRequired, retry with backoff up to 5 times
                    if (this.reconnectAttempts < 5) {
                        this.reconnectAttempts++;
                        this.status = 'connecting';
                        const delay = Math.min(3000 * this.reconnectAttempts, 15000);
                        console.log(`[WhatsApp Baileys] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/5)...`);
                        this.reconnectTimeout = setTimeout(() => {
                            this.init();
                        }, delay);
                    } else {
                        console.warn('[WhatsApp Baileys] Max reconnect attempts reached. Resetting status to disconnected.');
                        this.status = 'disconnected';
                        this.reconnectAttempts = 0;
                        this.sock = null;
                    }
                }
            });

            // 1. Process real-time incoming/outgoing messages
            this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
                if (!messages || !Array.isArray(messages)) return;
                for (const msg of messages) {
                    await this.processBaileysMessage(msg);
                }
            });

            // 2. Process WhatsApp history sync (previous messages on phone)
            this.sock.ev.on('messaging-history.set', async ({ chats, contacts, messages, isLatest }) => {
                console.log(`[WhatsApp Baileys] History sync received: ${messages?.length || 0} messages.`);
                if (contacts && Array.isArray(contacts)) {
                    for (const c of contacts) {
                        if (c.id) this.contacts[c.id] = c.name || c.notify || c.verifiedName;
                    }
                }
                if (messages && Array.isArray(messages)) {
                    for (const msg of messages) {
                        await this.processBaileysMessage(msg);
                    }
                }
            });

            const initialStatus = await initialWaitPromise;
            return initialStatus;
        } catch (err) {
            console.error('[WhatsApp Baileys] Failed to initialize session:', err.message);
            this.status = 'disconnected';
            return { status: 'error', error: err.message };
        }
    }

    async processBaileysMessage(msg) {
        try {
            if (!msg || !msg.message) return;

            let remoteJid = msg.key?.remoteJid || '';
            // Ignore status broadcasts, group chats, and newsletters
            if (!remoteJid || remoteJid.includes('status@broadcast') || remoteJid.includes('@g.us') || remoteJid.includes('@newsletter')) {
                return;
            }

            // Resolve phone number if remoteJid is LID privacy ID
            if (remoteJid.includes('@lid') && msg.key?.remoteJidAlt && msg.key.remoteJidAlt.includes('@s.whatsapp.net')) {
                remoteJid = msg.key.remoteJidAlt;
            }

            const contactPhone = remoteJid.split('@')[0].replace(/\D/g, '');
            if (!contactPhone) return;

            const isFromMe = Boolean(msg.key?.fromMe);
            const m = msg.message;

            let mediaUrl = null;
            if (m.imageMessage || m.videoMessage || m.documentMessage || m.stickerMessage || m.audioMessage) {
                try {
                    const buffer = await downloadMediaMessage(
                        msg,
                        'buffer',
                        {},
                        {
                            logger: pino({ level: 'silent' }),
                            reuploadRequest: this.sock?.updateMediaMessage
                        }
                    );
                    if (buffer) {
                        const uploadsDir = path.join(__dirname, '../../public/uploads/whatsapp');
                        if (!fs.existsSync(uploadsDir)) {
                            fs.mkdirSync(uploadsDir, { recursive: true });
                        }
                        const isImg = Boolean(m.imageMessage || m.stickerMessage);
                        const isVid = Boolean(m.videoMessage);
                        const isDoc = Boolean(m.documentMessage);
                        const ext = isImg ? (m.stickerMessage ? 'webp' : 'jpg') : isVid ? 'mp4' : isDoc ? (path.extname(m.documentMessage.fileName || 'file.bin').replace('.', '') || 'bin') : 'ogg';
                        const safeMsgId = msg.key?.id || Math.random().toString(36).substring(2, 9);
                        const filename = `wa_${Date.now()}_${safeMsgId}.${ext}`;
                        fs.writeFileSync(path.join(uploadsDir, filename), buffer);
                        mediaUrl = `/uploads/whatsapp/${filename}`;
                    }
                } catch (dlErr) {
                    console.warn('[WhatsApp Baileys] Media auto-download notice:', dlErr.message);
                }
            }

            let messageText = '';
            if (mediaUrl) {
                if (m.imageMessage || m.stickerMessage) {
                    messageText = `![Photo](${mediaUrl})` + (m.imageMessage?.caption ? `\n${m.imageMessage.caption}` : '');
                } else if (m.videoMessage) {
                    messageText = `[Video: ${mediaUrl}]` + (m.videoMessage?.caption ? `\n${m.videoMessage.caption}` : '');
                } else if (m.documentMessage) {
                    const docName = m.documentMessage.fileName || 'Document';
                    messageText = `[Document: ${docName}](${mediaUrl})`;
                } else if (m.audioMessage) {
                    messageText = `[Audio: ${mediaUrl}]`;
                }
            } else if (m.conversation) {
                messageText = m.conversation;
            } else if (m.extendedTextMessage?.text) {
                messageText = m.extendedTextMessage.text;
            } else if (m.imageMessage?.caption) {
                messageText = `[Photo] ${m.imageMessage.caption}`;
            } else if (m.videoMessage?.caption) {
                messageText = `[Video] ${m.videoMessage.caption}`;
            } else if (m.documentMessage?.caption || m.documentMessage?.fileName) {
                messageText = `[Document: ${m.documentMessage?.fileName || 'file'}]`;
            } else if (m.audioMessage) {
                messageText = '[Voice Note / Audio]';
            } else if (m.imageMessage) {
                messageText = '[Photo / Image]';
            } else if (m.videoMessage) {
                messageText = '[Video]';
            } else if (m.stickerMessage) {
                messageText = '[Sticker]';
            } else if (m.contactMessage || m.contactsArrayMessage) {
                messageText = '[Contact Card]';
            } else if (m.locationMessage) {
                messageText = '[Location Shared]';
            } else {
                messageText = '[Media Message]';
            }

            if (!messageText.trim()) return;

            const msgTime = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000) : new Date();

            if (isFromMe) {
                await InboxRepository.recordOutboundWhatsAppMessage({
                    phone: contactPhone,
                    body: messageText,
                    timestamp: msgTime,
                    rawPayload: { ...msg, mediaUrl }
                });
            } else {
                const senderName = msg.pushName || (this.contacts && this.contacts[remoteJid]) || `+${contactPhone}`;
                await InboxRepository.recordInboundMessage({
                    channel: 'whatsapp',
                    sender: `+${contactPhone}`,
                    recipient: this.connectedUser ? `+${this.connectedUser}` : 'Me',
                    subject: 'WhatsApp Chat',
                    body: messageText,
                    senderName,
                    rawPayload: { ...msg, mediaUrl },
                    timestamp: msgTime
                });
            }
        } catch (msgErr) {
            console.error('[WhatsApp Baileys] Error processing message:', msgErr.message);
        }
    }

    async disconnect() {
        try {
            if (this.reconnectTimeout) {
                clearTimeout(this.reconnectTimeout);
                this.reconnectTimeout = null;
            }
            this.reconnectAttempts = 0;
            if (this.sock) {
                try {
                    this.sock.ev.removeAllListeners();
                    await this.sock.logout().catch(() => {});
                    this.sock.end(undefined);
                } catch (e) {}
                this.sock = null;
            }
            this.status = 'disconnected';
            this.currentQr = null;
            this.connectedUser = null;

            // Clear credentials folder and database session
            if (fs.existsSync(this.authFolder)) {
                fs.rmSync(this.authFolder, { recursive: true, force: true });
            }
            await pool.query("DELETE FROM channel_settings WHERE channel = 'whatsapp';").catch(() => {});

            return { success: true, message: 'Disconnected successfully' };
        } catch (err) {
            console.error('[WhatsApp Baileys] Disconnect error:', err.message);
            return { success: false, error: err.message };
        }
    }

    async sendMessage(phone, text, mediaPath = null) {
        if (!this.sock || this.status !== 'connected') {
            throw new Error('WhatsApp is not connected on the server. Please open Channels and scan the QR code with WhatsApp first.');
        }

        let cleanPhone = String(phone || '').replace(/\D/g, '');
        if (!cleanPhone) {
            throw new Error('Invalid phone number provided for WhatsApp dispatch.');
        }

        // If local number starts with 0 (e.g. UK 0161... / 020... or PK 03...), normalize country code
        if (cleanPhone.startsWith('0')) {
            const userCountryCode = (this.connectedUser || '').slice(0, 2);
            if (cleanPhone.length === 11 && (cleanPhone.startsWith('07') || cleanPhone.startsWith('02') || cleanPhone.startsWith('01'))) {
                // UK number
                cleanPhone = '44' + cleanPhone.slice(1);
            } else if (cleanPhone.length === 11 && cleanPhone.startsWith('03')) {
                // PK mobile
                cleanPhone = '92' + cleanPhone.slice(1);
            } else if (userCountryCode) {
                cleanPhone = userCountryCode + cleanPhone.slice(1);
            }
        }

        const jid = `${cleanPhone}@s.whatsapp.net`;
        console.log(`[WhatsApp Baileys] 🚀 Dispatching message via Baileys to JID: ${jid}...`);

        if (mediaPath && fs.existsSync(mediaPath)) {
            const isImage = /\.(jpg|jpeg|png|webp|gif)$/i.test(mediaPath);
            if (isImage) {
                return await this.sock.sendMessage(jid, {
                    image: fs.readFileSync(mediaPath),
                    caption: text || ''
                });
            } else {
                return await this.sock.sendMessage(jid, {
                    document: fs.readFileSync(mediaPath),
                    fileName: path.basename(mediaPath),
                    caption: text || ''
                });
            }
        }

        const sent = await this.sock.sendMessage(jid, { text: text || '' });
        return sent;
    }
}

// Export singleton instance
const baileysManager = new BaileysManager();
module.exports = { baileysManager };
