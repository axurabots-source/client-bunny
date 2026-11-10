const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    console.log("🚀 Starting Tracking & Follow-up Schema Migration on Supabase...");

    const sql = `
        -- 1. Extend outreach_logs with Tracking Fields
        ALTER TABLE outreach_logs ADD COLUMN IF NOT EXISTS tracking_token TEXT;
        ALTER TABLE outreach_logs ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
        ALTER TABLE outreach_logs ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ;
        ALTER TABLE outreach_logs ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0;
        ALTER TABLE outreach_logs ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;
        ALTER TABLE outreach_logs ADD COLUMN IF NOT EXISTS last_clicked_at TIMESTAMPTZ;
        ALTER TABLE outreach_logs ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0;
        ALTER TABLE outreach_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
        ALTER TABLE outreach_logs ADD COLUMN IF NOT EXISTS ip_hash TEXT;
        ALTER TABLE outreach_logs ADD COLUMN IF NOT EXISTS is_bot_scan BOOLEAN DEFAULT false;

        CREATE INDEX IF NOT EXISTS idx_outreach_tracking_token ON outreach_logs(tracking_token);

        -- 2. Extend leads with Follow-up and Age Tracking Fields
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_opened_at TIMESTAMPTZ;
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS open_count INTEGER DEFAULT 0;
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0;
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS followup_step INTEGER DEFAULT 0;
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_followup_due TIMESTAMPTZ;

        CREATE INDEX IF NOT EXISTS idx_leads_last_contacted ON leads(last_contacted_at);
        CREATE INDEX IF NOT EXISTS idx_leads_next_followup ON leads(next_followup_due);
    `;

    await pool.query(sql);
    console.log("✅ Schema columns and indexes successfully added to Supabase!");

    // Backfill last_contacted_at on leads from existing outreach_logs if any
    const backfillRes = await pool.query(`
        UPDATE leads l
        SET last_contacted_at = sub.max_sent
        FROM (
            SELECT lead_id, MAX(sent_at) as max_sent
            FROM outreach_logs
            GROUP BY lead_id
        ) sub
        WHERE l.id = sub.lead_id AND l.last_contacted_at IS NULL;
    `);
    console.log(`✅ Backfilled existing last_contacted_at dates (${backfillRes.rowCount || 0} rows).`);

    // Verify columns
    const cols = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'outreach_logs' AND column_name IN ('tracking_token', 'open_count', 'opened_at');
    `);
    console.log("Verified outreach_logs tracking columns:", cols.rows.map(r => r.column_name));

    await pool.end();
    console.log("🎉 Migration completed cleanly!");
}

migrate().catch(err => {
    console.error("❌ Migration error:", err.message);
    process.exit(1);
});
