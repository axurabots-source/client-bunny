const { Pool } = require('pg');
const { analyzePainPoints } = require('./painPointTagger');
const { formatDirectMapsLink } = require('../m2_gmb_integration/mapsHelper');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    max: 10,
    idleTimeoutMillis: 30000
});

class LeadRepository {
    /**
     * Upsert a lead record. If place_id matches, updates ratings, website, and pain points.
     */
    static async upsertLead(leadData) {
        const painPoints = analyzePainPoints(leadData);

        const query = `
            INSERT INTO leads (
                place_id, title, category, address, city, phone, website,
                review_count, review_rating, gmb_owner_name, gmb_link,
                pain_points, raw_data, list_name, country, state_province, district_area, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW()
            )
            ON CONFLICT (place_id) DO UPDATE SET
                title = EXCLUDED.title,
                phone = COALESCE(EXCLUDED.phone, leads.phone),
                website = COALESCE(EXCLUDED.website, leads.website),
                review_count = EXCLUDED.review_count,
                review_rating = EXCLUDED.review_rating,
                pain_points = EXCLUDED.pain_points,
                raw_data = EXCLUDED.raw_data,
                gmb_link = COALESCE(EXCLUDED.gmb_link, leads.gmb_link),
                list_name = COALESCE(EXCLUDED.list_name, leads.list_name),
                country = COALESCE(EXCLUDED.country, leads.country),
                state_province = COALESCE(EXCLUDED.state_province, leads.state_province),
                district_area = COALESCE(EXCLUDED.district_area, leads.district_area),
                updated_at = NOW()
            RETURNING *;
        `;

        const values = [
            leadData.place_id || null,
            leadData.title,
            leadData.category || null,
            leadData.address || null,
            leadData.city || 'Lahore',
            leadData.phone || null,
            leadData.website || null,
            parseInt(leadData.review_count, 10) || 0,
            parseFloat(leadData.review_rating) || 0.0,
            leadData.gmb_owner_name || null,
            (leadData.link && leadData.link.includes('/maps/place/')) 
                ? leadData.link 
                : formatDirectMapsLink(leadData),
            JSON.stringify(painPoints),
            JSON.stringify(leadData.raw_data || {}),
            leadData.list_name || 'General Ingestion',
            leadData.country || 'Pakistan',
            leadData.state_province || null,
            leadData.district_area || null
        ];

        const res = await pool.query(query, values);
        return res.rows[0];
    }

    /**
     * Insert or update a Decision Maker associated with a lead
     */
    static async addDecisionMaker(leadId, dmData) {
        // Check if decision maker already exists for this lead by name or email
        const existing = await pool.query(
            `SELECT id FROM decision_makers 
             WHERE lead_id = $1 
               AND (LOWER(full_name) = LOWER($2) OR (email IS NOT NULL AND LOWER(email) = LOWER($3))) 
             LIMIT 1`,
            [leadId, dmData.full_name, dmData.email || '']
        );

        if (existing.rows.length > 0) {
            const updateRes = await pool.query(`
                UPDATE decision_makers SET
                    full_name = COALESCE($1, full_name),
                    title_role = COALESCE($2, title_role),
                    email = COALESCE($3, email),
                    linkedin_url = COALESCE($4, linkedin_url),
                    facebook_url = $5,
                    instagram_url = $6,
                    twitter_url = $7,
                    whatsapp_number = COALESCE($8, whatsapp_number),
                    phone = COALESCE($9, phone),
                    confidence_score = GREATEST(confidence_score, $10),
                    updated_at = NOW()
                WHERE id = $11
                RETURNING *;
            `, [
                dmData.full_name,
                dmData.title_role,
                dmData.email || null,
                dmData.linkedin_url || null,
                dmData.facebook_url || null,
                dmData.instagram_url || null,
                dmData.twitter_url || null,
                dmData.whatsapp_number || null,
                dmData.phone || null,
                dmData.confidence_score || 50,
                existing.rows[0].id
            ]);
            return updateRes.rows[0];
        }

        const query = `
            INSERT INTO decision_makers (
                lead_id, full_name, title_role, email, email_source,
                linkedin_url, facebook_url, instagram_url, twitter_url, whatsapp_number, phone, confidence_score, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
            ) RETURNING *;
        `;

        const values = [
            leadId,
            dmData.full_name,
            dmData.title_role || 'Owner',
            dmData.email || null,
            dmData.email_source || 'website_crawl',
            dmData.linkedin_url || null,
            dmData.facebook_url || null,
            dmData.instagram_url || null,
            dmData.twitter_url || null,
            dmData.whatsapp_number || null,
            dmData.phone || null,
            dmData.confidence_score || 50
        ];

        const res = await pool.query(query, values);
        return res.rows[0];
    }

    /**
     * Fetch lead with all associated decision makers
     */
    static async getLeadById(id) {
        const leadRes = await pool.query(`SELECT * FROM leads WHERE id = $1`, [id]);
        if (leadRes.rows.length === 0) return null;

        const lead = leadRes.rows[0];
        const dmRes = await pool.query(
            `SELECT * FROM decision_makers WHERE lead_id = $1 ORDER BY confidence_score DESC`,
            [id]
        );
        lead.decision_makers = dmRes.rows;
        return lead;
    }

    /**
     * Get all decision makers for a lead
     */
    static async getDecisionMakers(leadId) {
        const dmRes = await pool.query(
            `SELECT * FROM decision_makers WHERE lead_id = $1 ORDER BY confidence_score DESC`,
            [leadId]
        );
        return dmRes.rows;
    }

    /**
     * List leads with optional filtering
     */
    static async listLeads({ limit = 100, offset = 0, status, city, list_name, country } = {}) {
        let whereClauses = [];
        let values = [];
        let index = 1;

        if (status) {
            whereClauses.push(`status = $${index++}`);
            values.push(status);
        }
        if (city && city !== 'all') {
            whereClauses.push(`city = $${index++}`);
            values.push(city);
        }
        if (list_name && list_name !== 'all') {
            whereClauses.push(`list_name = $${index++}`);
            values.push(list_name);
        }
        if (country && country !== 'all') {
            whereClauses.push(`country = $${index++}`);
            values.push(country);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const query = `
            SELECT * FROM leads
            ${whereSql}
            ORDER BY created_at DESC
            LIMIT $${index++} OFFSET $${index++};
        `;
        values.push(limit, offset);

        const res = await pool.query(query, values);
        return res.rows;
    }

    /**
     * Pipeline metrics summary
     */
    static async getStats() {
        const res = await pool.query(`
            SELECT 
                COUNT(*) AS total_leads,
                COUNT(*) FILTER (WHERE status = 'new') AS new_leads,
                COUNT(*) FILTER (WHERE status = 'enriched') AS enriched_leads,
                COUNT(*) FILTER (WHERE pain_points::text LIKE '%no_website%') AS no_website_count,
                COUNT(*) FILTER (WHERE pain_points::text LIKE '%low_rating%') AS low_rating_count,
                COUNT(*) FILTER (WHERE pain_points::text LIKE '%high_ticket_spender%') AS high_ticket_count
            FROM leads;
        `);
        return res.rows[0];
    }

    static async close() {
        await pool.end();
    }
}

module.exports = {
    LeadRepository,
    pool
};
