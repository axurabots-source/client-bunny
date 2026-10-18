/**
 * Database Migration Script: Omnichannel Unified Inbox Tables
 * Creates 'conversations', 'messages', and 'channel_settings' tables in Supabase / PostgreSQL.
 */
require('dotenv').config();
const { pool } = require('../modules/m1_storage/leadRepository');

async function initInboxTables() {
    console.log('🔄 Initializing Omnichannel Inbox database schema in Supabase...');

    try {
        await pool.query(`
            -- 1. Conversations Table
            CREATE TABLE IF NOT EXISTS conversations (
                id BIGSERIAL PRIMARY KEY,
                lead_id BIGINT REFERENCES leads(id) ON DELETE CASCADE,
                channel VARCHAR(30) NOT NULL DEFAULT 'email',
                contact_identifier VARCHAR(255) NOT NULL,
                contact_name VARCHAR(255),
                subject VARCHAR(255),
                last_message_preview TEXT,
                last_message_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                unread_count INT DEFAULT 0,
                status VARCHAR(30) DEFAULT 'open',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_conversations_lead ON conversations(lead_id);
            CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);
            CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_identifier);
            CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(last_message_at DESC);

            -- 2. Messages Table
            CREATE TABLE IF NOT EXISTS messages (
                id BIGSERIAL PRIMARY KEY,
                conversation_id BIGINT REFERENCES conversations(id) ON DELETE CASCADE,
                lead_id BIGINT REFERENCES leads(id) ON DELETE SET NULL,
                channel VARCHAR(30) NOT NULL,
                direction VARCHAR(15) NOT NULL, -- 'inbound', 'outbound'
                sender VARCHAR(255),
                recipient VARCHAR(255),
                subject VARCHAR(255),
                body TEXT NOT NULL,
                raw_payload JSONB,
                status VARCHAR(30) DEFAULT 'received',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_messages_lead ON messages(lead_id);
            CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);

            -- 3. Channel Settings Table (Credentials & Webhooks)
            CREATE TABLE IF NOT EXISTS channel_settings (
                id BIGSERIAL PRIMARY KEY,
                channel VARCHAR(30) UNIQUE NOT NULL,
                is_enabled BOOLEAN DEFAULT true,
                config_data JSONB NOT NULL DEFAULT '{}'::jsonb,
                last_synced_at TIMESTAMP WITH TIME ZONE,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `);

        console.log('✅ Omnichannel Inbox schema initialized successfully in PostgreSQL/Supabase!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Failed to initialize inbox schema:', err);
        process.exit(1);
    }
}

initInboxTables();
