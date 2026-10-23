const path = require('path');
const fs = require('fs');
const baileys = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const { InboxRepository } = require('./inboxRepository');

const makeWASocket = baileys.default || baileys.makeWASocket;
const { useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = baileys;

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

        // Auto-initialize if session credentials already exist on disk
        if (fs.existsSync(path.join(this.authFolder, 'creds.json'))) {
            setTimeout(() => {
                this.init().catch(err => console.warn('[WhatsApp Baileys] Auto-init notice:', err.message));
            }, 1000);
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
    async generateQr() {
        if (this.sock && this.status === 'connected') {
            return this.getStatus();
        }

        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        this.reconnectAttempts = 0;

        if (this.sock) {
            try {
                this.sock.ev.removeAllListeners();
                this.sock.end(undefined);
            } catch (e) {}
            this.sock = null;
        }

        // Wipe stale credentials so Baileys produces a brand new pairing QR
        if (fs.existsSync(this.authFolder)) {
            try {
                fs.rmSync(this.authFolder, { recursive: true, force: true });
            } catch (e) {
                console.warn('[WhatsApp Baileys] Could not wipe auth folder:', e.message);
            }
        }

        this.status = 'connecting';
        this.currentQr = null;
        return await this.init(true);
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

            // Set up a promise to wait for initial QR code or connection before returning to caller
            const initialWaitPromise = new Promise((resolve) => {
                let resolved = false;
                const timer = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        resolve(this.getStatus());
                    }
                }, 6000);

                const checkReady = () => {
                    if (!resolved && (this.status === 'qr_ready' || this.status === 'connected')) {
                        resolved = true;
                        clearTimeout(timer);
                        resolve(this.getStatus());
                    }
                };

                this.sock.ev.on('connection.update', (u) => {
                    if (u.qr || u.connection === 'open') {
                        setTimeout(checkReady, 250);
                    }
                });
            });

            this.sock.ev.on('creds.update', saveCreds);

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

            // Clear credentials folder
            if (fs.existsSync(this.authFolder)) {
                fs.rmSync(this.authFolder, { recursive: true, force: true });
            }

            return { success: true, message: 'Disconnected successfully' };
        } catch (err) {
            console.error('[WhatsApp Baileys] Disconnect error:', err.message);
            return { success: false, error: err.message };
        }
    }

    async sendMessage(phone, text, mediaPath = null) {
        if (!this.sock || this.status !== 'connected') {
            throw new Error('WhatsApp is not connected. Please scan QR Code first.');
        }

        const cleanPhone = phone.replace(/\D/g, '');
        const jid = `${cleanPhone}@s.whatsapp.net`;

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
