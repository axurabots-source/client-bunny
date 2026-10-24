/**
 * Email Inbound Reader (IMAP Sync Engine)
 * Connects to IMAP server (Gmail, Outlook, Custom Domain) using ImapFlow + mailparser,
 * fetches incoming client replies, and syncs them directly into the Unified Inbox.
 */

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { InboxRepository } = require('./inboxRepository');

const { pool } = require('../m1_storage/leadRepository');

class EmailInboundSync {

    /**
     * Sync incoming emails from configured IMAP account
     */
    static async syncInbox({ host = 'imap.gmail.com', port = 993, secure = true, user, pass, limit = 25 } = {}) {
        if (!user || !pass) {
            // Check if stored in channel_settings
            const saved = await InboxRepository.getChannelConfig('email');
            if (saved && saved.config) {
                user = user || saved.config.user || saved.config.email;
                pass = pass || saved.config.decryptedPassword;
                host = host || saved.config.imapHost || 'imap.gmail.com';
                port = port || saved.config.imapPort || 993;
            }
        }

        if (!user || !pass) {
            return {
                success: false,
                error: 'Email or App Password not configured. Please configure Email Settings first.'
            };
        }

        const client = new ImapFlow({
            host: host || 'imap.gmail.com',
            port: parseInt(port, 10) || 993,
            secure: secure !== false,
            auth: {
                user: user.trim(),
                pass: pass.trim()
            },
            connectionTimeout: 15000,
            greetingTimeout: 10000,
            socketTimeout: 20000,
            logger: false
        });

        let syncedCount = 0;
        let matchedCount = 0;
        const processedMessages = [];

        try {
            await client.connect();

            // Select and lock INBOX
            const lock = await client.getMailboxLock('INBOX');

            try {
                const mailboxStatus = client.mailbox;
                const totalMessages = mailboxStatus.exists || 0;

                if (totalMessages > 0) {
                    const fetchLimit = Math.max(limit, 30);
                    const startSeq = Math.max(1, totalMessages - fetchLimit + 1);
                    const range = `${startSeq}:*`;

                    // Phase 1: High-speed lightweight envelope fetch (< 300ms)
                    const candidateMessages = [];
                    const messageIdsToCheck = [];

                    for await (const msg of client.fetch(range, { envelope: true, uid: true })) {
                        const mId = msg.envelope?.messageId;
                        const fromArr = msg.envelope?.from || [];
                        const fromAddr = fromArr[0]?.address || '';

                        // Skip emails from self
                        if (fromAddr && fromAddr.toLowerCase() === user.toLowerCase()) {
                            continue;
                        }

                        candidateMessages.push(msg);
                        if (mId) messageIdsToCheck.push(mId);
                    }

                    // Single batch check in database for all candidate messageIds (1 query instead of 30)
                    const existingSet = new Set();
                    if (messageIdsToCheck.length > 0) {
                        try {
                            const existsRes = await pool.query(
                                `SELECT raw_payload->>'messageId' AS mid FROM messages WHERE raw_payload->>'messageId' = ANY($1::text[])`,
                                [messageIdsToCheck]
                            );
                            for (const row of existsRes.rows) {
                                if (row.mid) existingSet.add(row.mid);
                            }
                        } catch (_) {}
                    }

                    const uidsToDownload = [];
                    const envelopeMeta = new Map();

                    for (const msg of candidateMessages) {
                        const mId = msg.envelope?.messageId;
                        if (mId && existingSet.has(mId)) {
                            continue; // Already synced, skip downloading body!
                        }
                        uidsToDownload.push(msg.uid);
                        envelopeMeta.set(msg.uid, msg.envelope);
                    }

                    // Also optionally check any recent unread (UNSEEN) emails from the last 48 hours only
                    try {
                        const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
                        const recentUnseenUids = await client.search({ seen: false, since: twoDaysAgo });
                        if (Array.isArray(recentUnseenUids)) {
                            // Take at most the latest 10 unread UIDs
                            const latestUnseen = recentUnseenUids.slice(-10);
                            for (const uid of latestUnseen) {
                                if (!uidsToDownload.includes(uid)) {
                                    uidsToDownload.push(uid);
                                }
                            }
                        }
                    } catch (_) {}

                    // Phase 2: Download full body source in batch ONLY for genuinely new emails!
                    if (uidsToDownload.length > 0) {
                        try {
                            const uidsQuery = uidsToDownload.join(',');
                            for await (const msg of client.fetch(uidsQuery, { source: true, envelope: true }, { uid: true })) {
                                try {
                                    const parsed = await simpleParser(msg.source);
                                    const senderObj = (parsed.from && parsed.from.value && parsed.from.value[0]) ? parsed.from.value[0] : null;
                                    let senderEmail = senderObj ? senderObj.address : (parsed.from ? parsed.from.text : '');
                                    const emailMatch = senderEmail.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/);
                                    if (emailMatch) senderEmail = emailMatch[0].toLowerCase();

                                    const senderName = senderObj ? senderObj.name : (envelopeMeta.get(msg.uid)?.from?.[0]?.name || senderEmail);
                                    const subject = parsed.subject || envelopeMeta.get(msg.uid)?.subject || '(No Subject)';
                                    const body = parsed.text || parsed.html || '';
                                    const messageDate = parsed.date || envelopeMeta.get(msg.uid)?.date || new Date();

                                    if (senderEmail && senderEmail !== user.toLowerCase()) {
                                        const recordResult = await InboxRepository.recordInboundMessage({
                                            channel: 'email',
                                            sender: senderEmail,
                                            recipient: user,
                                            subject,
                                            body: body.trim(),
                                            senderName: senderName || senderEmail,
                                            rawPayload: {
                                                messageId: parsed.messageId || msg.envelope?.messageId,
                                                inReplyTo: parsed.inReplyTo,
                                                references: parsed.references
                                            },
                                            timestamp: messageDate
                                        });

                                        if (!recordResult.skipped) {
                                            syncedCount++;
                                            if (recordResult.matchedLead) {
                                                matchedCount++;
                                            }

                                            processedMessages.push({
                                                id: recordResult.message ? recordResult.message.id : recordResult.conversationId,
                                                from: senderEmail,
                                                subject,
                                                matchedLead: recordResult.matchedLead ? recordResult.matchedLead.title : null
                                            });
                                        }
                                    }
                                } catch (parseErr) {
                                    console.error(`[EmailSync] Error parsing email UID ${msg.uid}:`, parseErr.message);
                                }
                            }
                        } catch (batchErr) {
                            console.error('[EmailSync] Batch IMAP fetch error:', batchErr.message);
                        }
                    }
                }
            } finally {
                lock.release();
            }

            await client.logout();

            return {
                success: true,
                syncedCount,
                matchedCount,
                messages: processedMessages,
                message: `Successfully synced ${syncedCount} emails (${matchedCount} matched to existing leads).`
            };

        } catch (err) {
            console.error('IMAP Sync Error:', err.message);
            try {
                await client.logout();
            } catch (_) {}
            
            return {
                success: false,
                error: err.message || 'Failed to connect to IMAP email server.'
            };
        }
    }

    /**
     * Start background automatic IMAP polling
     */
    static startAutoSync(intervalSeconds = 12) {
        if (this.pollerInterval) return;
        console.log(`[EmailSync] 🔄 Background IMAP auto-poller initiated (every ${intervalSeconds}s)...`);

        // First run shortly after startup
        setTimeout(() => {
            this.safeBackgroundSync();
        }, 3000);

        this.pollerInterval = setInterval(() => {
            this.safeBackgroundSync();
        }, intervalSeconds * 1000);
    }

    /**
     * Safely execute background sync with lock to prevent concurrent overlaps
     */
    static async safeBackgroundSync() {
        if (this.isSyncing) return;
        this.isSyncing = true;
        try {
            const res = await this.syncInbox({ limit: 15 });
            if (res && res.success && res.syncedCount > 0) {
                console.log(`[EmailSync] 📥 Auto-synced ${res.syncedCount} new incoming prospect email(s) into Omnichannel Inbox!`);
            }
        } catch (err) {
            // Non-critical background network timeout
        } finally {
            this.isSyncing = false;
        }
    }
}

module.exports = { EmailInboundSync };
