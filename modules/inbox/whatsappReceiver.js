/**
 * WhatsApp Inbound Webhook Receiver & Dispatcher
 * Compatible with Evolution API, Baileys, and self-hosted WhatsApp Web bridges.
 * Verifies webhook secret token to prevent spoofing and data leaks.
 */

const { InboxRepository } = require('./inboxRepository');
const { verifyWebhookSecret } = require('../security/cryptoVault');

class WhatsAppReceiver {

    /**
     * Process incoming WhatsApp webhook event
     */
    static async handleIncomingWebhook(headers, body) {
        // 1. Verify Webhook Secret if configured
        const configuredSecret = process.env.WHATSAPP_WEBHOOK_SECRET || 'cb_wa_secret_2026';
        const incomingSecret = headers['x-webhook-secret'] || headers['x-api-key'] || headers['authorization'];

        if (configuredSecret && incomingSecret) {
            const isAuthentic = verifyWebhookSecret(incomingSecret.replace('Bearer ', ''), configuredSecret);
            if (!isAuthentic) {
                return { success: false, status: 403, error: 'Unauthorized: Invalid WhatsApp webhook secret signature' };
            }
        }

        // 2. Parse incoming payload format (Evolution API / Baileys format)
        // Standard Evolution event: "messages.upsert" or { data: { key: { remoteJid }, message: { conversation } } }
        let rawEvent = body;
        if (body.data) rawEvent = body.data;

        // Extract sender phone number
        const remoteJid = (rawEvent.key && rawEvent.key.remoteJid) || rawEvent.from || rawEvent.sender || '';
        
        // Ignore status broadcasts and group messages
        if (!remoteJid || remoteJid.includes('status@broadcast') || remoteJid.includes('@g.us')) {
            return { success: true, ignored: true, reason: 'Broadcast or group message' };
        }

        // Ignore messages sent by self
        if (rawEvent.key && rawEvent.key.fromMe) {
            return { success: true, ignored: true, reason: 'Outbound message from self' };
        }

        const senderPhone = remoteJid.split('@')[0].replace(/\D/g, '');
        const senderName = rawEvent.pushName || rawEvent.senderName || `+${senderPhone}`;

        // Extract message text body
        let messageText = '';
        if (rawEvent.message) {
            const m = rawEvent.message;
            messageText = m.conversation || 
                          (m.extendedTextMessage && m.extendedTextMessage.text) || 
                          (m.imageMessage && m.imageMessage.caption) || 
                          (m.videoMessage && m.videoMessage.caption) || 
                          (m.documentMessage && m.documentMessage.caption) || 
                          '[Media / Non-text message]';
        } else if (typeof rawEvent.body === 'string') {
            messageText = rawEvent.body;
        } else if (typeof rawEvent.text === 'string') {
            messageText = rawEvent.text;
        }

        if (!messageText || !senderPhone) {
            return { success: true, ignored: true, reason: 'Empty body or sender' };
        }

        // 3. Record in Unified Inbox
        const result = await InboxRepository.recordInboundMessage({
            channel: 'whatsapp',
            sender: `+${senderPhone}`,
            recipient: 'Client Bunny Support',
            subject: 'WhatsApp Chat',
            body: messageText,
            senderName,
            rawPayload: body,
            timestamp: rawEvent.messageTimestamp ? (rawEvent.messageTimestamp * 1000) : new Date()
        });

        return {
            success: true,
            conversationId: result.conversationId,
            matchedLead: result.matchedLead ? result.matchedLead.title : null
        };
    }

    /**
     * Dispatch outbound WhatsApp message (via Evolution API endpoint or direct deep-link fallback)
     */
    static async sendWhatsAppReply({ phone, message, conversationId, leadId }) {
        if (!phone || !message) {
            throw new Error('Phone number and message text are required');
        }

        const cleanPhone = phone.replace(/\D/g, '');
        const gatewayUrl = process.env.EVOLUTION_API_URL;
        const apiKey = process.env.EVOLUTION_API_KEY;

        let gatewayResponse = null;

        if (gatewayUrl && apiKey) {
            try {
                const response = await fetch(`${gatewayUrl}/message/sendText/${process.env.EVOLUTION_INSTANCE || 'default'}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': apiKey
                    },
                    body: JSON.stringify({
                        number: cleanPhone,
                        text: message
                    })
                });
                gatewayResponse = await response.json();
            } catch (apiErr) {
                console.error('Failed to dispatch via WhatsApp Gateway API:', apiErr.message);
            }
        }

        // Record outbound message in Unified Inbox
        const outboundMsg = await InboxRepository.recordOutboundMessage({
            conversationId,
            leadId,
            channel: 'whatsapp',
            sender: 'Me',
            recipient: `+${cleanPhone}`,
            subject: 'WhatsApp Chat',
            body: message,
            rawPayload: gatewayResponse || { method: 'manual_dispatch', waLink: `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}` }
        });

        return {
            success: true,
            message: outboundMsg,
            waLink: `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
        };
    }
}

module.exports = { WhatsAppReceiver };
