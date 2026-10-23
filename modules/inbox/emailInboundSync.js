/**
 * Email Inbound Reader (IMAP Sync Engine)
 * Connects to IMAP server (Gmail, Outlook, Custom Domain) using ImapFlow + mailparser,
 * fetches incoming client replies, and syncs them directly into the Unified Inbox.
 */

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { InboxRepository } = require('./inboxRepository');

class EmailInboundSync {

    /**
     * Sync incoming emails from configured IMAP account
     */
    static async syncInbox({ host = 'imap.gmail.com', port = 993, secure = true, user, pass, limit = 15 } = {}) {
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
            connectionTimeout: 12000,
            greetingTimeout: 8000,
            socketTimeout: 15000,
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
                // Fetch the last N messages
                const mailboxStatus = client.mailbox;
                const totalMessages = mailboxStatus.exists || 0;

                if (totalMessages > 0) {
                    const startSeq = Math.max(1, totalMessages - limit + 1);
                    const range = `${startSeq}:*`;

                    for await (const message of client.fetch(range, { source: true, envelope: true })) {
                        try {
                            const parsed = await simpleParser(message.source);
                            const senderObj = (parsed.from && parsed.from.value && parsed.from.value[0]) ? parsed.from.value[0] : null;
                            const senderEmail = senderObj ? senderObj.address : (parsed.from ? parsed.from.text : '');
                            const senderName = senderObj ? senderObj.name : '';
                            const subject = parsed.subject || '(No Subject)';
                            const body = parsed.text || parsed.html || '';
                            const messageDate = parsed.date || new Date();

                            // Filter out emails sent by self
                            if (senderEmail && senderEmail.toLowerCase() !== user.toLowerCase()) {
                                const recordResult = await InboxRepository.recordInboundMessage({
                                    channel: 'email',
                                    sender: senderEmail,
                                    recipient: user,
                                    subject,
                                    body: body.trim(),
                                    senderName: senderName || senderEmail,
                                    rawPayload: {
                                        messageId: parsed.messageId,
                                        inReplyTo: parsed.inReplyTo,
                                        references: parsed.references
                                    },
                                    timestamp: messageDate
                                });

                                syncedCount++;
                                if (recordResult.matchedLead) {
                                    matchedCount++;
                                }

                                processedMessages.push({
                                    id: recordResult.message.id,
                                    from: senderEmail,
                                    subject,
                                    matchedLead: recordResult.matchedLead ? recordResult.matchedLead.title : null
                                });
                            }
                        } catch (parseErr) {
                            console.error('Failed to parse individual email:', parseErr.message);
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
}

module.exports = { EmailInboundSync };
