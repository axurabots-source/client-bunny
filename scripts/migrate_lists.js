const { pool } = require('../modules/m1_storage/leadRepository');

async function migrate() {
    console.log("Running migration for lead_lists and granular location hierarchy...");
    await pool.query(`
        CREATE TABLE IF NOT EXISTS lead_lists (
            id BIGSERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            description TEXT,
            target_country TEXT,
            target_region TEXT,
            target_city TEXT,
            target_area TEXT,
            target_niche TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );

        ALTER TABLE leads ADD COLUMN IF NOT EXISTS list_name TEXT DEFAULT 'General Ingestion';
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Pakistan';
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS state_province TEXT DEFAULT 'Punjab';
        ALTER TABLE leads ADD COLUMN IF NOT EXISTS district_area TEXT DEFAULT 'Central';

        INSERT INTO lead_lists (name, description, target_country, target_region, target_city, target_area, target_niche)
        VALUES ('Lahore Dentists Q4', 'Initial seed dentists from Lahore', 'Pakistan', 'Punjab', 'Lahore', 'Gulberg / DHA', 'Dentists')
        ON CONFLICT (name) DO NOTHING;

        UPDATE leads 
        SET list_name = 'Lahore Dentists Q4', country = 'Pakistan', state_province = 'Punjab', district_area = 'Gulberg'
        WHERE list_name IS NULL OR list_name = 'General Ingestion';
    `);
    console.log("Migration executed successfully!");
    process.exit(0);
}

migrate().catch(err => {
    console.error("Migration failed:", err);
    process.exit(1);
});
