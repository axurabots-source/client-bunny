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

        // Attach outreach history
        try {
            const outRes = await pool.query(
                `SELECT * FROM outreach_logs WHERE lead_id = $1 ORDER BY sent_at DESC, created_at DESC`,
                [id]
            );
            lead.outreach_logs = outRes.rows;
        } catch (e) {
            lead.outreach_logs = [];
        }

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
     * List leads with optional filtering and aggregated decision makers
     */
    static async listLeads({ limit = 100, offset = 0, status, city, list_name, country, pain_point } = {}) {
        let whereClauses = [];
        let values = [];
        let index = 1;

        if (status && status !== 'all') {
            whereClauses.push(`l.status = $${index++}`);
            values.push(status);
        }
        if (city && city !== 'all') {
            whereClauses.push(`l.city = $${index++}`);
            values.push(city);
        }
        if (list_name && list_name !== 'all') {
            whereClauses.push(`l.list_name = $${index++}`);
            values.push(list_name);
        }
        if (country && country !== 'all') {
            whereClauses.push(`l.country = $${index++}`);
            values.push(country);
        }
        if (pain_point && pain_point !== 'all') {
            whereClauses.push(`l.pain_points::text LIKE $${index++}`);
            values.push(`%${pain_point}%`);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
        const query = `
            SELECT l.*,
                   COALESCE(
                       json_agg(dm.*) FILTER (WHERE dm.id IS NOT NULL), 
                       '[]'::json
                   ) AS decision_makers
            FROM leads l
            LEFT JOIN decision_makers dm ON dm.lead_id = l.id
            ${whereSql}
            GROUP BY l.id
            ORDER BY l.created_at DESC
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
        const leadStats = await pool.query(`
            SELECT 
                COUNT(*)::int AS total_leads,
                COUNT(*) FILTER (WHERE status = 'new')::int AS new_leads,
                COUNT(*) FILTER (WHERE status = 'enriched')::int AS enriched_leads,
                COUNT(*) FILTER (WHERE status = 'emailed')::int AS emailed_leads,
                COUNT(*) FILTER (WHERE status = 'replied')::int AS replied_leads,
                COUNT(*) FILTER (WHERE pain_points::text LIKE '%no_website%')::int AS no_website_count,
                COUNT(*) FILTER (WHERE pain_points::text LIKE '%low_rating%')::int AS low_rating_count,
                COUNT(*) FILTER (WHERE pain_points::text LIKE '%high_ticket_spender%')::int AS high_ticket_count
            FROM leads;
        `);

        // Daily email limits and outreach metrics
        let sentToday = 0;
        let totalSent = 0;
        let repliesReceived = 0;
        try {
            const outreachRes = await pool.query(`
                SELECT 
                    COUNT(*) FILTER (WHERE status = 'sent' AND DATE(sent_at) = CURRENT_DATE)::int AS sent_today,
                    COUNT(*) FILTER (WHERE status = 'sent')::int AS total_sent,
                    COUNT(*) FILTER (WHERE status = 'replied')::int AS replies_received
                FROM outreach_logs;
            `);
            if (outreachRes.rows.length > 0) {
                sentToday = outreachRes.rows[0].sent_today || 0;
                totalSent = outreachRes.rows[0].total_sent || 0;
                repliesReceived = outreachRes.rows[0].replies_received || 0;
            }
        } catch (e) {
            // Ignore if table query fails
        }

        const stats = leadStats.rows[0] || {};
        const total = stats.total_leads || 0;
        const enriched = stats.enriched_leads || 0;
        const enrichedPercent = total > 0 ? Math.round((enriched / total) * 100) : 0;

        return {
            ...stats,
            emails_sent_today: sentToday,
            daily_limit: 30,
            emails_sent_total: totalSent,
            replies_received: repliesReceived,
            enriched_percent: enrichedPercent
        };
    }

    static async close() {
        await pool.end();
    }
}

module.exports = {
    LeadRepository,
    pool
};
