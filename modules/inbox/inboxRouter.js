/**
 * Omnichannel Inbox Express Router
 * Mounts inbox endpoints, email sync, WhatsApp webhooks, and Meta webhooks.
 */

const express = require('express');
const router = express.Router();
const { InboxRepository } = require('./inboxRepository');
const { EmailInboundSync } = require('./emailInboundSync');
const { WhatsAppReceiver } = require('./whatsappReceiver');
const { MetaReceiver } = require('./metaReceiver');
const { dispatchColdEmail } = require('../m5_email_dispatcher/mailer');

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
        const { channel = 'all', status = 'all', search = '', limit = 50, offset = 0 } = req.query;
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

// 5. Send Reply from Unified Inbox (Email, WhatsApp, or Instagram)
router.post('/inbox/conversations/:id/reply', async (req, res) => {
    try {
        const conversationId = req.params.id;
        const conversation = await InboxRepository.getConversationWithMessages(conversationId);
        if (!conversation) {
            return res.status(404).json({ success: false, error: 'Conversation not found' });
        }

        const { message, channel = conversation.channel, smtpConfig, recipientEmail } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, error: 'Message body cannot be empty' });
        }

        let outboundMsg = null;

        if (channel === 'email') {
            const recipient = recipientEmail || conversation.contact_identifier;
            const subject = conversation.subject ? `Re: ${conversation.subject.replace(/^Re:\s*/i, '')}` : 'Follow up from Client Bunny';

            // Send via email dispatcher if SMTP configured
            let emailSendResult = null;
            if (smtpConfig && smtpConfig.user && smtpConfig.pass) {
                try {
                    emailSendResult = await dispatchColdEmail({
                        smtpConfig,
                        recipientEmail: recipient,
                        subject,
                        bodyText: message
                    });
                } catch (emailErr) {
                    console.error('Outbound email error:', emailErr);
                }
            }

            outboundMsg = await InboxRepository.recordOutboundMessage({
                conversationId,
                leadId: conversation.lead_id,
                channel: 'email',
                sender: (smtpConfig && smtpConfig.user) ? smtpConfig.user : 'Me',
                recipient,
                subject,
                body: message,
                rawPayload: emailSendResult
            });

        } else if (channel === 'whatsapp') {
            const phone = conversation.contact_identifier || (conversation.lead_phone);
            const waResult = await WhatsAppReceiver.sendWhatsAppReply({
                phone,
                message,
                conversationId,
                leadId: conversation.lead_id
            });
            outboundMsg = waResult.message;
            return res.json({ success: true, message: outboundMsg, waLink: waResult.waLink });
        } else {
            // Instagram / Generic Outbound
            outboundMsg = await InboxRepository.recordOutboundMessage({
                conversationId,
                leadId: conversation.lead_id,
                channel: conversation.channel,
                sender: 'Me',
                recipient: conversation.contact_identifier,
                subject: conversation.subject,
                body: message
            });
        }

        res.json({ success: true, message: outboundMsg });
    } catch (err) {
        console.error('Error sending reply:', err);
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
        const waConf = await InboxRepository.getChannelConfig('whatsapp');
        const igConf = await InboxRepository.getChannelConfig('instagram');

        res.json({
            success: true,
            channels: {
                email: {
                    connected: Boolean(emailConf && emailConf.is_enabled),
                    emailAddress: emailConf ? (emailConf.config.user || emailConf.config.email) : null
                },
                whatsapp: {
                    connected: Boolean(waConf && waConf.is_enabled),
                    instanceName: waConf ? waConf.config.instanceName : null
                },
                instagram: {
                    connected: Boolean(igConf && igConf.is_enabled),
                    pageName: igConf ? igConf.config.pageName : null
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
// WEBHOOKS (WHATSAPP & META/INSTAGRAM)
// ==========================================================

// WhatsApp Inbound Webhook
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

// Meta (Instagram / Facebook) Webhook Handshake & Inbound
router.get(['/webhooks/instagram', '/webhooks/meta'], MetaReceiver.handleVerification);
router.post(['/webhooks/instagram', '/webhooks/meta'], MetaReceiver.handleIncomingWebhook);

module.exports = router;
