const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { LeadRepository, pool } = require('./modules/m1_storage/leadRepository');
const { ingestGmbCsv } = require('./modules/m2_gmb_integration/gmbParser');
const { executeLiveHunt } = require('./modules/m2_gmb_integration/liveHunter');
const { LOCATIONS_DATA, ALL_COUNTRIES } = require('./modules/locations');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Get Summary Stats
app.get('/api/stats', async (req, res) => {
    try {
        const stats = await LeadRepository.getStats();
        res.json({ success: true, stats });
    } catch (err) {
        console.error("Error fetching stats:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. List Leads with filtering
app.get('/api/leads', async (req, res) => {
    try {
        const { status, city, country, list_name, limit = 100, offset = 0 } = req.query;
        const leads = await LeadRepository.listLeads({
            status,
            city,
            country,
            list_name,
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10)
        });
        res.json({ success: true, count: leads.length, leads });
    } catch (err) {
        console.error("Error listing leads:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Get Single Lead with Decision Makers
app.get('/api/leads/:id', async (req, res) => {
    try {
        const lead = await LeadRepository.getLeadById(req.params.id);
        if (!lead) {
            return res.status(404).json({ success: false, error: 'Lead not found' });
        }
        res.json({ success: true, lead });
    } catch (err) {
        console.error("Error getting lead:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3.5. Trigger Deep Crawl on a Lead's Website
app.post('/api/leads/:id/enrich', async (req, res) => {
    try {
        const { crawlWebsite } = require('./modules/m3_website_crawler/crawler');
        const lead = await LeadRepository.getLeadById(req.params.id);
        if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
        if (!lead.website) return res.status(400).json({ success: false, error: 'Lead has no website to crawl' });

        const crawlResult = await crawlWebsite(lead.website, lead.id);
        const updatedLead = await LeadRepository.getLeadById(lead.id);

        res.json({ success: true, crawlResult, lead: updatedLead });
    } catch (err) {
        console.error("Error enriching lead:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3.6. Trigger Google/Search Dorking for Owner Contacts
app.post('/api/leads/:id/dork', async (req, res) => {
    try {
        const { resolveDorkContacts } = require('./modules/m4_dork_resolver/dorkResolver');
        const lead = await LeadRepository.getLeadById(req.params.id);
        if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

        const dorkResult = await resolveDorkContacts(lead.title, lead.city || 'Lahore', lead.id);
        const updatedLead = await LeadRepository.getLeadById(lead.id);

        res.json({ success: true, dorkResult, lead: updatedLead });
    } catch (err) {
        console.error("Error running dork search:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Location Taxonomy Hierarchy
app.get('/api/locations', (req, res) => {
    res.json({
        success: true,
        countries: ALL_COUNTRIES,
        hierarchy: LOCATIONS_DATA
    });
});

// 5. Lead Lists API
app.get('/api/lists', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT l.id, l.name, l.description, l.target_country, l.target_region, l.target_city, l.target_area, l.target_niche, l.created_at,
                   COUNT(le.id)::int AS lead_count
            FROM lead_lists l
            LEFT JOIN leads le ON le.list_name = l.name
            GROUP BY l.id, l.name
            ORDER BY l.created_at DESC;
        `);
        res.json({ success: true, lists: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/lists', async (req, res) => {
    try {
        const { name, description = '', country = '', region = '', city = '', area = '', niche = '' } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, error: 'List name is required' });
        }
        const result = await pool.query(`
            INSERT INTO lead_lists (name, description, target_country, target_region, target_city, target_area, target_niche)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (name) DO UPDATE SET
                description = EXCLUDED.description,
                target_country = EXCLUDED.target_country,
                target_region = EXCLUDED.target_region,
                target_city = EXCLUDED.target_city,
                target_area = EXCLUDED.target_area,
                target_niche = EXCLUDED.target_niche
            RETURNING *;
        `, [name.trim(), description, country, region, city, area, niche]);
        res.json({ success: true, list: result.rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6. Get Unique Cities in DB for filtering
app.get('/api/cities', async (req, res) => {
    try {
        const result = await pool.query(`SELECT DISTINCT city FROM leads WHERE city IS NOT NULL ORDER BY city ASC;`);
        const cities = result.rows.map(r => r.city).filter(Boolean);
        res.json({ success: true, cities });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 7. Get Hunt Scraping Jobs History
app.get('/api/jobs', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM scraping_jobs ORDER BY created_at DESC LIMIT 25;`);
        res.json({ success: true, jobs: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 8. Start a New Live Hunt Session
app.post('/api/hunt/start', async (req, res) => {
    try {
        const {
            listName = 'General Ingestion',
            country = 'Pakistan',
            state = '',
            city = 'Lahore',
            area = '',
            niche = 'Dentists',
            limit = 20
        } = req.body;

        if (!city || !niche) {
            return res.status(400).json({ success: false, error: 'City and Niche are required' });
        }

        const jobId = `hunt_${Date.now()}`;
        const fullQuery = `${niche} in ${area ? area + ', ' : ''}${city}, ${country}`;

        // 1. Insert job into Supabase
        await pool.query(`
            INSERT INTO scraping_jobs (job_id, query, city, status, created_at)
            VALUES ($1, $2, $3, 'running', NOW());
        `, [jobId, fullQuery, city]);

        // 2. Run live extraction engine
        const huntResult = await executeLiveHunt({
            listName: listName.trim(),
            country,
            state,
            city,
            area,
            niche,
            limit: parseInt(limit, 10) || 20
        });

        // 3. Mark job completed
        await pool.query(`
            UPDATE scraping_jobs 
            SET status = 'completed', total_found = $1, completed_at = NOW(), log_output = 'Completed extraction successfully.'
            WHERE job_id = $2;
        `, [huntResult.totalFound, jobId]);

        res.json({
            success: true,
            job: {
                job_id: jobId,
                query: fullQuery,
                city,
                country,
                area,
                list_name: listName,
                total_found: huntResult.totalFound,
                status: 'completed'
            }
        });
    } catch (err) {
        console.error("Error starting hunt:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Fallback to index.html
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, () => {
    console.log(`=================================================`);
    console.log(`🚀 CLIENT BUNNY DASHBOARD RUNNING AT:`);
    console.log(`   http://localhost:${PORT}`);
    console.log(`=================================================`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        const altPort = 3005;
        console.log(`Port ${PORT} in use, retrying on port ${altPort}...`);
        app.listen(altPort, () => {
            console.log(`🚀 CLIENT BUNNY DASHBOARD RUNNING AT: http://localhost:${altPort}`);
        });
    } else {
        console.error("Server error:", err);
    }
});
