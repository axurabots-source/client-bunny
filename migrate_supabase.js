const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

async function runMigration() {
    console.log("Connecting to Supabase PostgreSQL Database...");
    console.log("Host:", process.env.DATABASE_URL ? process.env.DATABASE_URL.split('@')[1] : "Not set");

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        console.log("✅ Successfully connected to Supabase PostgreSQL!");

        const sql = fs.readFileSync(path.join(__dirname, 'schema_supabase.sql'), 'utf-8');
        console.log("Applying Schema (Tables: leads, decision_makers, outreach_logs, scraping_jobs)...");
        
        await client.query(sql);
        console.log("✅ Schema successfully applied to Supabase!");

        // Verify tables
        const res = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);

        console.log("\n📋 Active Tables in Public Schema:");
        res.rows.forEach(row => {
            console.log(` - ${row.table_name}`);
        });

    } catch (err) {
        console.error("❌ Migration error:", err.message);
    } finally {
        await client.end();
    }
}

runMigration();
