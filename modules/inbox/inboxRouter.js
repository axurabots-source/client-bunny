/**
 * Omnichannel Inbox Express Router
 * Mounts inbox endpoints, email sync, WhatsApp webhooks, and Meta webhooks.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { InboxRepository } = require('./inboxRepository');
const { EmailInboundSync } = require('./emailInboundSync');
const { WhatsAppReceiver } = require('./whatsappReceiver');
const { MetaReceiver } = require('./metaReceiver');
const { dispatchColdEmail } = require('../m5_email_dispatcher/mailer');
const { baileysManager } = require('./baileysManager');

// Auto-start background IMAP email sync every 12 seconds (only in persistent node servers, not serverless Vercel)
if (!process.env.VERCEL) {
    EmailInboundSync.startAutoSync(12);
}

// 1. Get Inbox Overview Stats (Total unread, counts by channel)
router.get('/inbox/stats', async (req, res) => {
    try {
        const stats = await InboxRepository.getInboxStats();
        res.json({ success: true, stats });
    } catch (err) {
        console.error('Error fetching inbox stats:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. List Conversations (Filter by channel: all, email, whatsapp, instagram)
router.get('/inbox/conversations', async (req, res) => {
    try {
        let { channel = 'all', status = 'all', search = '', limit = 50, offset = 0 } = req.query;
        if (!channel || channel === 'undefined' || channel === 'null') {
            channel = 'all';
        }
        const conversations = await InboxRepository.listConversations({
            channel,
            status,
            search,
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10)
        });
        res.json({ success: true, count: conversations.length, conversations });
    } catch (err) {
        console.error('Error listing conversations:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Get Single Conversation with Messages History
router.get('/inbox/conversations/:id', async (req, res) => {
    try {
        const conversation = await InboxRepository.getConversationWithMessages(req.params.id);
        if (!conversation) {
            return res.status(404).json({ success: false, error: 'Conversation thread not found' });
        }
        res.json({ success: true, conversation });
    } catch (err) {
        console.error('Error getting conversation details:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Mark Conversation as Read
router.post('/inbox/conversations/:id/read', async (req, res) => {
    try {
        await InboxRepository.markConversationRead(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4b. Delete Conversation Thread
router.delete('/inbox/conversations/:id', async (req, res) => {
    try {
        await InboxRepository.deleteConversation(req.params.id);
        res.json({ success: true, message: 'Conversation deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// In-memory debounce cache to prevent duplicate outbound dispatches
const recentDispatches = new Map();

// 5. Send Reply from Unified Inbox (Email, WhatsApp, or Instagram)
router.post('/inbox/conversations/:id/reply', async (req, res) => {
    try {
        const conversationId = req.params.id;
        const conversation = await InboxRepository.getConversationWithMessages(conversationId);
        if (!conversation) {
            return res.status(404).json({ success: false, error: 'Conversation not found' });
        }

        const { message, channel = conversation.channel, smtpConfig, recipientEmail, mediaUrl, subject: customSubject } = req.body;
        if (!message && !mediaUrl) {
            return res.status(400).json({ success: false, error: 'Message body or media cannot be empty' });
        }

        const fullMessageBody = mediaUrl ? `![Photo](${mediaUrl})\n${message || ''}`.trim() : (message || '');

        // --- BACKEND DEBOUNCE PROTECTION ---
        // If exact same conversationId + message text was sent within 3.5 seconds, block duplicate
        const debounceKey = `${conversationId}:${fullMessageBody}:${channel}`;
        const lastSentAt = recentDispatches.get(debounceKey);
        if (lastSentAt && (Date.now() - lastSentAt) < 3500) {
            console.warn(`[Inbox Reply] Blocked duplicate outbound dispatch within 3.5s window for conv ${conversationId}`);
            const lastOutbound = (conversation.messages || []).filter(m => m.direction === 'outbound').pop();
            return res.json({ success: true, message: lastOutbound || { body: fullMessageBody }, duplicateBlocked: true });
        }
        recentDispatches.set(debounceKey, Date.now());

        // Periodically purge old debounce entries
        if (recentDispatches.size > 200) {
            const cutoff = Date.now() - 15000;
            for (const [k, v] of recentDispatches.entries()) {
                if (v < cutoff) recentDispatches.delete(k);
            }
        }

        let outboundMsg = null;

        if (channel === 'email') {
            const recipient = recipientEmail || conversation.contact_identifier;
            if (!recipient || !recipient.includes('@')) {
                return res.status(400).json({ success: false, error: 'Invalid recipient email address for conversation.' });
            }
            
            // Allow user-customized subject or fall back to conversation thread subject
            const subject = (customSubject && customSubject.trim())
                ? customSubject.trim()
                : (conversation.subject ? (conversation.subject.toLowerCase().startsWith('re:') ? conversation.subject : `Re: ${conversation.subject}`) : 'Follow up from Client Bunny');

            // Update conversation subject in database if user customized it
            if (customSubject && customSubject.trim() && customSubject.trim() !== conversation.subject) {
                try {
                    const { pool } = require('../m1_storage/leadRepository');
                    await pool.query('UPDATE conversations SET subject = $1, updated_at = NOW() WHERE id = $2;', [subject, conversationId]);
                } catch (_) {}
            }

            // Resolve SMTP credentials from unified Inbox channel_settings in Supabase
            const { sendOutreachEmail, resolveSmtpConfig } = require('../m5_email_dispatcher/mailer');
            const resolvedSmtp = await resolveSmtpConfig(smtpConfig);

            if (!resolvedSmtp) {
                return res.status(400).json({
                    success: false,
                    error: 'Email channel is not configured. Please open Channels and configure your Email & App Password first.'
                });
            }

            // Find parent inbound message for In-Reply-To and References RFC headers
            const latestInbound = (conversation.messages || [])
                .filter(m => m.direction === 'inbound')
                .pop();
            const inReplyTo = latestInbound?.raw_payload?.messageId || null;
            const references = latestInbound?.raw_payload?.references || inReplyTo;

            let emailSendResult = null;
            try {
                emailSendResult = await sendOutreachEmail(resolvedSmtp, {
                    leadId: conversation.lead_id,
                    to: recipient,
                    subject,
                    bodyText: fullMessageBody,
                    inReplyTo,
                    references
                });
                console.log(`[Inbox Reply] Outbound email delivered to ${recipient} (Message ID: ${emailSendResult.messageId})`);
            } catch (emailErr) {
                console.error('[Inbox Reply] Outbound email failed:', emailErr.message);
                return res.status(500).json({
                    success: false,
                    error: `Failed to deliver email: ${emailErr.message}`
                });
            }

            outboundMsg = await InboxRepository.recordOutboundMessage({
                conversationId,
                leadId: conversation.lead_id,
                channel: 'email',
                sender: resolvedSmtp.user || 'Me',
                recipient,
                subject,
                body: fullMessageBody,
                rawPayload: emailSendResult
            });

            return res.json({ success: true, message: outboundMsg });

        } else if (channel === 'whatsapp') {
            const phone = conversation.contact_identifier || (conversation.lead_phone);

            // Attempt direct dispatch via Baileys if connected
            let directDispatched = false;
            if (baileysManager.status === 'connected') {
                try {
                    const localMediaPath = mediaUrl ? path.join(__dirname, '../../public', mediaUrl.replace(/^\//, '')) : null;
                    await baileysManager.sendMessage(phone, message || '', localMediaPath);
                    directDispatched = true;
                    console.log(`[WhatsApp Reply] Successfully dispatched via live Baileys to ${phone}`);
                } catch (bErr) {
                    console.warn('[WhatsApp Reply] Direct dispatch error:', bErr.message);
                }
            }

            const waResult = await WhatsAppReceiver.sendWhatsAppReply({
                phone,
                message: fullMessageBody,
                conversationId,
                leadId: conversation.lead_id
            });
            outboundMsg = waResult.message;
            return res.json({ success: true, message: outboundMsg, waLink: waResult.waLink, directDispatched });
        } else {
            // Instagram / Generic Outbound
            outboundMsg = await InboxRepository.recordOutboundMessage({
                conversationId,
                leadId: conversation.lead_id,
                channel: conversation.channel,
                sender: 'Me',
                recipient: conversation.contact_identifier,
                subject: conversation.subject,
                body: fullMessageBody
            });
        }

        res.json({ success: true, message: outboundMsg });
    } catch (err) {
        console.error('Error sending reply:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 5b. Upload media file for conversation (Photos, Documents)
router.post('/inbox/upload', async (req, res) => {
    try {
        const { filename, base64 } = req.body;
        if (!base64) {
            return res.status(400).json({ success: false, error: 'No media data provided' });
        }
        const matches = base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        const buffer = matches ? Buffer.from(matches[2], 'base64') : Buffer.from(base64, 'base64');

        const uploadsDir = path.join(__dirname, '../../public/uploads/whatsapp');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const ext = path.extname(filename || 'photo.jpg') || '.jpg';
        const safeName = `out_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
        const filePath = path.join(uploadsDir, safeName);
        fs.writeFileSync(filePath, buffer);

        return res.json({
            success: true,
            url: `/uploads/whatsapp/${safeName}`,
            filename: safeName
        });
    } catch (err) {
        console.error('Media upload error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6. Trigger On-Demand IMAP Email Sync
router.post('/inbox/email/sync', async (req, res) => {
    try {
        const syncResult = await EmailInboundSync.syncInbox(req.body);
        res.json(syncResult);
    } catch (err) {
        console.error('Error syncing incoming emails:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 7. Channel Configuration Status
router.get('/inbox/channels', async (req, res) => {
    try {
        const emailConf = await InboxRepository.getChannelConfig('email');
        const igConf = await InboxRepository.getChannelConfig('instagram');
        const waStatus = baileysManager.getStatus();

        res.json({
            success: true,
            channels: {
                email: {
                    connected: Boolean(emailConf && emailConf.is_enabled),
                    emailAddress: emailConf ? (emailConf.config.user || emailConf.config.email) : null,
                    config: emailConf ? {
                        imap_host: emailConf.config.imapHost || emailConf.config.imap_host || 'imap.gmail.com',
                        imap_port: emailConf.config.imapPort || emailConf.config.imap_port || 993,
                        email: emailConf.config.email || emailConf.config.user || ''
                    } : null
                },
                whatsapp: {
                    connected: waStatus.status === 'connected',
                    status: waStatus.status,
                    connectedUser: waStatus.connectedUser
                },
                instagram: {
                    connected: Boolean(igConf && igConf.is_enabled),
                    pageName: igConf ? igConf.config.pageName : 'ManyChat Bridge Active'
                }
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 8. Save Channel Configuration
router.post('/inbox/channels/:channel', async (req, res) => {
    try {
        const channel = req.params.channel;
        const config = req.body;
        const saved = await InboxRepository.saveChannelConfig(channel, config);
        res.json({ success: true, saved });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================================
// WHATSAPP LIVE BAILEYS QR CODE ENDPOINTS
// ==========================================================

// Get current WhatsApp connection status
router.get('/whatsapp/status', (req, res) => {
    res.json({ success: true, ...baileysManager.getStatus() });
});

// Trigger / Request QR Code for scanning
router.post('/whatsapp/qr', async (req, res) => {
    try {
        const status = await baileysManager.generateQr();
        res.json({ success: true, ...status });
    } catch (err) {
        console.error('Error generating WhatsApp QR:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Disconnect WhatsApp session
router.post('/whatsapp/disconnect', async (req, res) => {
    try {
        const result = await baileysManager.disconnect();
        res.json(result);
    } catch (err) {
        console.error('Error disconnecting WhatsApp:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ==========================================================
// WEBHOOKS (WHATSAPP, MANYCHAT & META)
// ==========================================================

// WhatsApp Inbound Webhook (Fallback for third-party bridges)
router.post('/webhooks/whatsapp', async (req, res) => {
    try {
        const result = await WhatsAppReceiver.handleIncomingWebhook(req.headers, req.body);
        if (result.status === 403) {
            return res.status(403).json(result);
        }
        res.json(result);
    } catch (err) {
        console.error('WhatsApp webhook error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ManyChat Inbound Webhook (Free Instagram & FB Messenger Bridge)
router.post('/webhooks/manychat', MetaReceiver.handleManyChatWebhook);

// Meta (Instagram / Facebook) Webhook Handshake & Inbound
router.get(['/webhooks/instagram', '/webhooks/meta'], MetaReceiver.handleVerification);
router.post(['/webhooks/instagram', '/webhooks/meta'], MetaReceiver.handleIncomingWebhook);

module.exports = router;

