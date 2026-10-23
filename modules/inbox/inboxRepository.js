/**
 * Omnichannel Inbox Repository
 * Manages unified conversations, message logs, lead auto-matching, and channel configuration.
 */

const { pool } = require('../m1_storage/leadRepository');
const { encryptSecret, decryptSecret } = require('../security/cryptoVault');

class InboxRepository {

    /**
     * Match an inbound sender (email or phone) with an existing lead in the database
     */
    static async matchLeadByContact(sender, channel) {
        if (!sender) return null;
        const cleanSender = String(sender).trim().toLowerCase();

        try {
            if (channel === 'email') {
                // Match with lead email or decision makers email
                const res = await pool.query(`
                    SELECT l.id, l.title, l.phone, l.city, l.category
                    FROM leads l
                    LEFT JOIN decision_makers dm ON dm.lead_id = l.id
                    WHERE LOWER(COALESCE(dm.email, '')) = $1
                       OR LOWER(COALESCE(l.raw_data->>'email', '')) = $1
                       OR LOWER(COALESCE(l.raw_data->>'contact_email', '')) = $1
                    LIMIT 1;
                `, [cleanSender]);

                if (res.rows.length > 0) return res.rows[0];
            } else if (channel === 'whatsapp') {
                // Strip non-digit characters for phone matching
                const digits = cleanSender.replace(/\D/g, '');
                if (digits.length >= 7) {
                    const res = await pool.query(`
                        SELECT l.id, l.title, l.phone, l.city, l.category
                        FROM leads l
                        LEFT JOIN decision_makers dm ON dm.lead_id = l.id
                        WHERE regexp_replace(COALESCE(l.phone, ''), '[^0-9]', '', 'g') LIKE '%' || $1
                           OR regexp_replace(COALESCE(dm.phone, ''), '[^0-9]', '', 'g') LIKE '%' || $1
                           OR regexp_replace(COALESCE(dm.whatsapp_number, ''), '[^0-9]', '', 'g') LIKE '%' || $1
                        LIMIT 1;
                    `, [digits.slice(-9)]); // match last 9 digits to ignore country code variations

                    if (res.rows.length > 0) return res.rows[0];
                }
            }
        } catch (err) {
            console.error('Lead matching error:', err.message);
        }

        return null;
    }

    /**
     * Record an inbound message (from Email, WhatsApp, or Instagram)
     * Automatically creates conversation thread, attaches lead, and marks lead as 'replied'.
     */
    static async recordInboundMessage({ channel, sender, recipient, subject, body, senderName, rawPayload, timestamp }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // 1. Attempt to match with existing lead
            const matchedLead = await this.matchLeadByContact(sender, channel);
            const leadId = matchedLead ? matchedLead.id : null;
            const displayName = senderName || (matchedLead ? matchedLead.title : sender);

            // 2. Find or create conversation
            const convRes = await client.query(`
                SELECT id, unread_count FROM conversations
                WHERE channel = $1 AND contact_identifier = $2
                LIMIT 1;
            `, [channel, sender]);

            let conversationId;
            let currentUnread = 0;

            const preview = (body || '').substring(0, 150).replace(/\s+/g, ' ').trim();
            const msgTime = timestamp ? new Date(timestamp) : new Date();

            if (convRes.rows.length > 0) {
                conversationId = convRes.rows[0].id;
                currentUnread = convRes.rows[0].unread_count || 0;

                // Deduplication check: check if message key id already exists in conversation
                const msgKeyId = rawPayload?.key?.id;
                if (msgKeyId && conversationId) {
                    const exists = await client.query(`
                        SELECT id FROM messages 
                        WHERE conversation_id = $1 AND raw_payload->'key'->>'id' = $2
                        LIMIT 1;
                    `, [conversationId, msgKeyId]);
                    if (exists.rows.length > 0) {
                        await client.query('COMMIT');
                        return { conversationId, skipped: true, matchedLead };
                    }
                }

                await client.query(`
                    UPDATE conversations SET
                        lead_id = COALESCE(lead_id, $1),
                        contact_name = COALESCE($2, contact_name),
                        subject = COALESCE($3, subject),
                        last_message_preview = $4,
                        last_message_at = $5,
                        unread_count = unread_count + 1,
                        status = 'open',
                        updated_at = NOW()
                    WHERE id = $6;
                `, [leadId, displayName, subject || null, preview, msgTime, conversationId]);
            } else {
                const insertConv = await client.query(`
                    INSERT INTO conversations (
                        lead_id, channel, contact_identifier, contact_name,
                        subject, last_message_preview, last_message_at, unread_count, status, created_at, updated_at
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, 1, 'open', NOW(), NOW()
                    ) RETURNING id;
                `, [leadId, channel, sender, displayName, subject || 'Direct Inquiry', preview, msgTime]);

                conversationId = insertConv.rows[0].id;
            }

            // 3. Insert individual message
            const msgInsert = await client.query(`
                INSERT INTO messages (
                    conversation_id, lead_id, channel, direction, sender, recipient,
                    subject, body, raw_payload, status, created_at
                ) VALUES (
                    $1, $2, $3, 'inbound', $4, $5, $6, $7, $8, 'received', $9
                ) RETURNING *;
            `, [
                conversationId,
                leadId,
                channel,
                sender,
                recipient || 'Me',
                subject || null,
                body || '',
                JSON.stringify(rawPayload || {}),
                msgTime
            ]);

            // 4. If matched lead, auto update lead status to 'replied' in CRM pipeline!
            if (leadId) {
                await client.query(`
                    UPDATE leads 
                    SET status = 'replied', updated_at = NOW() 
                    WHERE id = $1 AND status != 'replied';
                `, [leadId]);
            }

            await client.query('COMMIT');
            return {
                conversationId,
                message: msgInsert.rows[0],
                matchedLead
            };
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            try { client.release(); } catch (e) {}
        }
    }

    /**
     * Record an outbound WhatsApp message sent from mobile phone or web
     */
    static async recordOutboundWhatsAppMessage({ phone, body, timestamp, rawPayload }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const cleanDigits = String(phone).replace(/\D/g, '');
            const cleanPhone = '+' + cleanDigits;
            const matchedLead = await this.matchLeadByContact(cleanPhone, 'whatsapp');
            const leadId = matchedLead ? matchedLead.id : null;
            const displayName = matchedLead ? matchedLead.title : cleanPhone;

            const convRes = await client.query(`
                SELECT id FROM conversations
                WHERE channel = 'whatsapp' AND contact_identifier = $1
                LIMIT 1;
            `, [cleanPhone]);

            let conversationId;
            const preview = (body || '').substring(0, 150).replace(/\s+/g, ' ').trim();
            const msgTime = timestamp ? new Date(timestamp) : new Date();

            if (convRes.rows.length > 0) {
                conversationId = convRes.rows[0].id;
                await client.query(`
                    UPDATE conversations SET
                        last_message_preview = $1,
                        last_message_at = $2,
                        updated_at = NOW()
                    WHERE id = $3;
                `, [preview, msgTime, conversationId]);
            } else {
                const insertConv = await client.query(`
                    INSERT INTO conversations (
                        lead_id, channel, contact_identifier, contact_name,
                        subject, last_message_preview, last_message_at, unread_count, status, created_at, updated_at
                    ) VALUES (
                        $1, 'whatsapp', $2, $3, 'WhatsApp Chat', $4, $5, 0, 'replied', NOW(), NOW()
                    ) RETURNING id;
                `, [leadId, cleanPhone, displayName, preview, msgTime]);
                conversationId = insertConv.rows[0].id;
            }

            // Deduplication check: check if message key id already exists in conversation
            const msgKeyId = rawPayload?.key?.id;
            if (msgKeyId) {
                const exists = await client.query(`
                    SELECT id FROM messages 
                    WHERE conversation_id = $1 AND raw_payload->'key'->>'id' = $2
                    LIMIT 1;
                `, [conversationId, msgKeyId]);
                if (exists.rows.length > 0) {
                    await client.query('COMMIT');
                    return { conversationId, skipped: true };
                }
            }

            await client.query(`
                INSERT INTO messages (
                    conversation_id, lead_id, channel, direction, sender, recipient,
                    subject, body, raw_payload, status, created_at
                ) VALUES (
                    $1, $2, 'whatsapp', 'outbound', 'Me', $3, 'WhatsApp Chat', $4, $5, 'sent', $6
                );
            `, [conversationId, leadId, cleanPhone, body || '', JSON.stringify(rawPayload || {}), msgTime]);

            await client.query('COMMIT');
            return { conversationId };
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            try { client.release(); } catch (e) {}
        }
    }

    /**
     * Record an outbound message sent by the agent/user
     */
    static async recordOutboundMessage({ conversationId, leadId, channel, sender, recipient, subject, body, rawPayload }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const preview = (body || '').substring(0, 150).replace(/\s+/g, ' ').trim();
            const now = new Date();

            // 1. Insert outbound message
            const msgInsert = await client.query(`
                INSERT INTO messages (
                    conversation_id, lead_id, channel, direction, sender, recipient,
                    subject, body, raw_payload, status, created_at
                ) VALUES (
                    $1, $2, $3, 'outbound', $4, $5, $6, $7, $8, 'sent', $9
                ) RETURNING *;
            `, [
                conversationId,
                leadId || null,
                channel,
                sender || 'Me',
                recipient,
                subject || null,
                body,
                JSON.stringify(rawPayload || {}),
                now
            ]);

            // 2. Update conversation record
            if (conversationId) {
                await client.query(`
                    UPDATE conversations SET
                        last_message_preview = $1,
                        last_message_at = $2,
                        status = 'replied',
                        updated_at = NOW()
                    WHERE id = $3;
                `, [preview, now, conversationId]);
            }

            await client.query('COMMIT');
            return msgInsert.rows[0];
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            try { client.release(); } catch (e) {}
        }
    }

    /**
     * List all conversations with pagination & filtering
     */
    static async listConversations({ channel = 'all', status = 'all', search = '', limit = 50, offset = 0 } = {}) {
        let query = `
            SELECT c.*, 
                   l.title as lead_title, 
                   l.category as lead_category, 
                   l.city as lead_city,
                   l.phone as lead_phone,
                   l.status as lead_status
            FROM conversations c
            LEFT JOIN leads l ON l.id = c.lead_id
            WHERE 1=1
        `;
        const params = [];

        if (channel && channel !== 'all') {
            params.push(channel);
            query += ` AND c.channel = $${params.length}`;
        }

        if (status && status !== 'all') {
            params.push(status);
            query += ` AND c.status = $${params.length}`;
        }

        if (search && search.trim()) {
            params.push(`%${search.trim().toLowerCase()}%`);
            query += ` AND (
                LOWER(c.contact_name) LIKE $${params.length} OR 
                LOWER(c.contact_identifier) LIKE $${params.length} OR 
                LOWER(COALESCE(c.subject, '')) LIKE $${params.length} OR
                LOWER(COALESCE(l.title, '')) LIKE $${params.length}
            )`;
        }

        query += ` ORDER BY c.last_message_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const res = await pool.query(query, params);
        return res.rows;
    }

    /**
     * Get a single conversation with all its message history
     */
    static async getConversationWithMessages(conversationId) {
        const convRes = await pool.query(`
            SELECT c.*, 
                   l.title as lead_title, 
                   l.category as lead_category, 
                   l.city as lead_city,
                   l.phone as lead_phone,
                   l.website as lead_website,
                   l.status as lead_status,
                   l.gmb_link as lead_gmb_link
            FROM conversations c
            LEFT JOIN leads l ON l.id = c.lead_id
            WHERE c.id = $1
            LIMIT 1;
        `, [conversationId]);

        if (convRes.rows.length === 0) return null;
        const conversation = convRes.rows[0];

        // Fetch messages
        const msgRes = await pool.query(`
            SELECT * FROM messages
            WHERE conversation_id = $1
            ORDER BY created_at ASC;
        `, [conversationId]);

        conversation.messages = msgRes.rows;
        return conversation;
    }

    /**
     * Mark a conversation as read (reset unread_count to 0)
     */
    static async markConversationRead(conversationId) {
        await pool.query(`
            UPDATE conversations 
            SET unread_count = 0, updated_at = NOW() 
            WHERE id = $1;
        `, [conversationId]);
        return { success: true };
    }

    /**
     * Get overall Inbox summary stats
     */
    static async getInboxStats() {
        const statsRes = await pool.query(`
            SELECT 
                COUNT(*) as total_conversations,
                COALESCE(SUM(unread_count), 0) as total_unread,
                COUNT(*) FILTER (WHERE channel = 'email') as email_count,
                COUNT(*) FILTER (WHERE channel = 'whatsapp') as whatsapp_count,
                COUNT(*) FILTER (WHERE channel = 'instagram') as instagram_count
            FROM conversations;
        `);

        return {
            total_conversations: parseInt(statsRes.rows[0].total_conversations, 10) || 0,
            total_unread: parseInt(statsRes.rows[0].total_unread, 10) || 0,
            email_count: parseInt(statsRes.rows[0].email_count, 10) || 0,
            whatsapp_count: parseInt(statsRes.rows[0].whatsapp_count, 10) || 0,
            instagram_count: parseInt(statsRes.rows[0].instagram_count, 10) || 0
        };
    }

    /**
     * Save channel settings (e.g. IMAP credentials or WhatsApp Webhook token) with AES-256 encryption
     */
    static async saveChannelConfig(channel, configData) {
        const safeConfig = { ...configData };

        // Encrypt passwords if present
        if (safeConfig.password) {
            safeConfig.password = encryptSecret(safeConfig.password);
        }
        if (safeConfig.appSecret) {
            safeConfig.appSecret = encryptSecret(safeConfig.appSecret);
        }

        const res = await pool.query(`
            INSERT INTO channel_settings (channel, is_enabled, config_data, updated_at)
            VALUES ($1, true, $2, NOW())
            ON CONFLICT (channel) DO UPDATE SET
                is_enabled = EXCLUDED.is_enabled,
                config_data = EXCLUDED.config_data,
                updated_at = NOW()
            RETURNING *;
        `, [channel, JSON.stringify(safeConfig)]);

        return res.rows[0];
    }

    /**
     * Retrieve decrypted channel settings
     */
    static async getChannelConfig(channel) {
        const res = await pool.query(`
            SELECT * FROM channel_settings WHERE channel = $1 LIMIT 1;
        `, [channel]);

        if (res.rows.length === 0) return null;
        const row = res.rows[0];
        const config = typeof row.config_data === 'string' ? JSON.parse(row.config_data) : row.config_data;

        // Decrypt password
        if (config.password) {
            config.decryptedPassword = decryptSecret(config.password);
        }
        if (config.appSecret) {
            config.decryptedAppSecret = decryptSecret(config.appSecret);
        }

        return {
            channel: row.channel,
            is_enabled: row.is_enabled,
            last_synced_at: row.last_synced_at,
            config
        };
    }

    /**
     * Delete a conversation thread and its messages
     */
    static async deleteConversation(conversationId) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM messages WHERE conversation_id = $1;', [conversationId]);
            await client.query('DELETE FROM conversations WHERE id = $1;', [conversationId]);
            await client.query('COMMIT');
            return { success: true };
        } catch (err) {
            await client.query('ROLLBACK').catch(() => {});
            throw err;
        } finally {
            try { client.release(); } catch (e) {}
        }
    }
}

module.exports = { InboxRepository };
