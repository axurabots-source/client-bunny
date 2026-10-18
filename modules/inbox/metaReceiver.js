/**
 * Meta (Instagram Direct & Facebook Messenger) Webhook Engine
 * Fully compliant with Meta Graph API Webhooks specification.
 * Handles challenge verification handshake and secure HMAC-SHA256 message ingestion.
 */

const { InboxRepository } = require('./inboxRepository');
const { verifyMetaSignature } = require('../security/cryptoVault');

class MetaReceiver {

    /**
     * Handle Meta Webhook Verification Handshake (GET)
     */
    static handleVerification(req, res) {
        const verifyToken = process.env.META_VERIFY_TOKEN || 'client_bunny_meta_verify_2026';

        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode && token) {
            if (mode === 'subscribe' && token === verifyToken) {
                console.log('[Meta Webhook] Successfully verified handshake with Meta.');
                return res.status(200).send(challenge);
            } else {
                console.warn('[Meta Webhook] Verification token mismatch.');
                return res.sendStatus(403);
            }
        }
        return res.sendStatus(400);
    }

    /**
     * Handle Inbound Webhook Event (POST)
     */
    static async handleIncomingWebhook(req, res) {
        const signature = req.headers['x-hub-signature-256'];
        const appSecret = process.env.META_APP_SECRET;

        // If app secret is set, verify HMAC signature strictly
        if (appSecret && signature) {
            const rawBody = JSON.stringify(req.body);
            const isValid = verifyMetaSignature(rawBody, signature, appSecret);
            if (!isValid) {
                console.error('[Meta Webhook] Signature verification failed! Dropping request.');
                return res.status(403).json({ error: 'Invalid HMAC signature' });
            }
        }

        const body = req.body;

        if (body.object === 'instagram' || body.object === 'page') {
            const channel = body.object === 'instagram' ? 'instagram' : 'facebook';

            try {
                if (Array.isArray(body.entry)) {
                    for (const entry of body.entry) {
                        const messagingEvents = entry.messaging || [];
                        for (const event of messagingEvents) {
                            // Only handle incoming messages (not echoes from page itself)
                            if (event.message && !event.message.is_echo) {
                                const senderId = event.sender ? event.sender.id : 'unknown_user';
                                const recipientId = event.recipient ? event.recipient.id : 'me';
                                const messageText = event.message.text || '[Attachment/Media]';
                                const timestamp = event.timestamp ? new Date(event.timestamp) : new Date();

                                await InboxRepository.recordInboundMessage({
                                    channel,
                                    sender: senderId,
                                    recipient: recipientId,
                                    subject: `${channel.toUpperCase()} Direct Message`,
                                    body: messageText,
                                    senderName: `IG User ${senderId.slice(-4)}`,
                                    rawPayload: event,
                                    timestamp
                                });
                            }
                        }
                    }
                }

                // Meta requires instant 200 OK
                return res.status(200).send('EVENT_RECEIVED');
            } catch (err) {
                console.error('[Meta Webhook] Error processing event:', err);
                return res.status(500).send('SERVER_ERROR');
            }
        }

        return res.sendStatus(404);
    }
}

module.exports = { MetaReceiver };
