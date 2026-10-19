const fs = require('fs');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { LeadRepository, pool } = require('./modules/m1_storage/leadRepository');
const { ingestGmbCsv } = require('./modules/m2_gmb_integration/gmbParser');
const { executeLiveHunt } = require('./modules/m2_gmb_integration/liveHunter');
const { LOCATIONS_DATA, ALL_COUNTRIES } = require('./modules/locations');
const inboxRouter = require('./modules/inbox/inboxRouter');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', inboxRouter);

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

// 2. List Leads with filtering (status, city, country, list_name, pain_point)
app.get('/api/leads', async (req, res) => {
    try {
        const { status, city, country, list_name, pain_point, limit = 100, offset = 0 } = req.query;
        const leads = await LeadRepository.listLeads({
            status,
            city,
            country,
            list_name,
            pain_point,
            limit: parseInt(limit, 10),
            offset: parseInt(offset, 10)
        });
        res.json({ success: true, count: leads.length, leads });
    } catch (err) {
        console.error("Error listing leads:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Get Single Lead with Decision Makers & Outreach History
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

// 3.5. Trigger Deep Enrich on Single Lead (runs Crawler + Dorking)
app.post(['/api/leads/:id/enrich', '/api/leads/:id/full-enrich'], async (req, res) => {
    try {
        const { autoEnrichLead } = require('./modules/m3_website_crawler/autoEnricher');
        const enrichedLead = await autoEnrichLead(req.params.id);
        if (!enrichedLead) return res.status(404).json({ success: false, error: 'Lead not found' });
        res.json({ success: true, lead: enrichedLead });
    } catch (err) {
        console.error("Error running deep enrich:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3.6. Trigger Google/Search Dorking for Owner Contacts
app.post('/api/leads/:id/dork', async (req, res) => {
    try {
        const { resolveDorkContacts } = require('./modules/m4_dork_resolver/dorkResolver');
        const lead = await LeadRepository.getLeadById(req.params.id);
        if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

        const dorkResult = await resolveDorkContacts(lead.title, lead.city || lead.country || '', lead.id);
        const updatedLead = await LeadRepository.getLeadById(lead.id);

        res.json({ success: true, dorkResult, lead: updatedLead });
    } catch (err) {
        console.error("Error running dork search:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3.8. On-Demand AI Cold Pitch Generation (Gemini Flash / Groq - 3-Step Framework)
app.post(['/api/leads/:id/pitch', '/api/leads/:id/generate-pitch'], async (req, res) => {
    try {
        const lead = await LeadRepository.getLeadById(req.params.id);
        if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

        const { generateMultiChannelPitch } = require('./modules/m6_ai_engine/aiIntelligence');
        const dms = await LeadRepository.getDecisionMakers(lead.id);
        const topDecisionMaker = (dms && dms.length > 0) ? dms[0] : { full_name: lead.gmb_owner_name || 'Owner', title_role: 'Founder' };

        const pitchData = await generateMultiChannelPitch(lead, topDecisionMaker);

        // Update database with the newly generated pitch
        await pool.query(`UPDATE leads SET ai_pitch = $1, updated_at = NOW() WHERE id = $2`, [pitchData.email_body || pitchData, lead.id]);

        res.json({ success: true, pitch: pitchData.email_body, multiChannel: pitchData, leadId: lead.id });
    } catch (err) {
        console.error("Error generating pitch:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3.10. Send Approved Cold Email (Outreach Dispatcher)
app.post(['/api/outreach/send', '/api/leads/:id/send-email'], async (req, res) => {
    try {
        const leadId = req.params.id || req.body.leadId;
        const { smtpConfig, to, subject, message, decisionMakerId } = req.body;

        if (!smtpConfig || !smtpConfig.user || !smtpConfig.pass) {
            return res.status(400).json({ success: false, error: 'Please configure your Email Settings before sending.' });
        }
        if (!to || !to.includes('@')) {
            return res.status(400).json({ success: false, error: 'Valid recipient email address is required.' });
        }
        if (!subject || !subject.trim()) {
            return res.status(400).json({ success: false, error: 'Email subject cannot be empty.' });
        }
        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, error: 'Email message body cannot be empty.' });
        }

        const lead = leadId ? await LeadRepository.getLeadById(leadId) : null;
        const { sendOutreachEmail } = require('./modules/m5_email_dispatcher/mailer');
        const sendResult = await sendOutreachEmail(smtpConfig, {
            leadId: lead ? lead.id : null,
            decisionMakerId: decisionMakerId || null,
            to: to.trim(),
            subject: subject.trim(),
            bodyText: message.trim()
        });

        res.json({
            success: true,
            message: `Email sent to ${to.trim()} successfully!`,
            messageId: sendResult.messageId,
            log: sendResult.log
        });
    } catch (err) {
        console.error("Error sending email:", err);
        res.status(500).json({ success: false, error: err.message || 'Failed to dispatch email.' });
    }
});

// 3.9. Test SMTP Connection with User's Frontend Credentials
app.post('/api/email/test-connection', async (req, res) => {
    try {
        const { smtpConfig } = req.body;
        if (!smtpConfig || !smtpConfig.user || !smtpConfig.pass) {
            return res.status(400).json({ success: false, error: 'Missing SMTP credentials (User and App Password are required).' });
        }

        const { verifySmtp } = require('./modules/m5_email_dispatcher/mailer');
        await verifySmtp(smtpConfig);

        res.json({ success: true, message: 'SMTP Connection verified successfully! You are ready to send cold emails.' });
    } catch (err) {
        console.error("SMTP Test Error:", err.message);
        res.status(400).json({ success: false, error: err.message || 'SMTP Handshake failed.' });
    }
});

// 3.10. Send Cold Email using User's Frontend Credentials
app.post('/api/leads/:id/send-email', async (req, res) => {
    try {
        const { id } = req.params;
        const { smtpConfig, to, subject, message, decisionMakerId } = req.body;

        if (!smtpConfig || !smtpConfig.user || !smtpConfig.pass) {
            return res.status(400).json({ success: false, error: 'Please configure your Email Settings before sending.' });
        }
        if (!to || !to.includes('@')) {
            return res.status(400).json({ success: false, error: 'Valid recipient email address is required.' });
        }
        if (!subject || !subject.trim()) {
            return res.status(400).json({ success: false, error: 'Email subject cannot be empty.' });
        }
        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, error: 'Email message body cannot be empty.' });
        }

        const lead = await LeadRepository.getLeadById(id);
        if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });

        const { sendOutreachEmail } = require('./modules/m5_email_dispatcher/mailer');
        const sendResult = await sendOutreachEmail(smtpConfig, {
            leadId: lead.id,
            decisionMakerId: decisionMakerId || null,
            to: to.trim(),
            subject: subject.trim(),
            bodyText: message.trim()
        });

        res.json({
            success: true,
            message: `Email sent to ${to.trim()} successfully!`,
            messageId: sendResult.messageId,
            log: sendResult.log
        });
    } catch (err) {
        console.error("Error sending email:", err);
        res.status(500).json({ success: false, error: err.message || 'Failed to dispatch email.' });
    }
});

// 3.11. Get Outreach History for a Lead
app.get('/api/leads/:id/outreach-logs', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(`
            SELECT * FROM outreach_logs 
            WHERE lead_id = $1 
            ORDER BY created_at DESC;
        `, [id]);
        res.json({ success: true, logs: result.rows });
    } catch (err) {
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

// 5.5. Delete a Lead List & its Associated Leads from Database
app.delete('/api/lists/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Fetch list details
        const listRes = await pool.query(`SELECT * FROM lead_lists WHERE id::text = $1 OR name = $1`, [id]);
        if (listRes.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'List not found' });
        }
        const listRecord = listRes.rows[0];
        const listName = listRecord.name;

        // 2. Delete all leads belonging to this list (cascades to decision_makers & logs)
        const delLeadsRes = await pool.query(`DELETE FROM leads WHERE list_name = $1 RETURNING id;`, [listName]);
        const leadsDeleted = delLeadsRes.rowCount;

        // 3. Delete list from lead_lists
        await pool.query(`DELETE FROM lead_lists WHERE id = $1;`, [listRecord.id]);

        console.log(`🗑️ Deleted list "${listName}" and ${leadsDeleted} associated leads from Supabase.`);

        res.json({
            success: true,
            message: `List "${listName}" and ${leadsDeleted} leads permanently deleted.`,
            listName,
            leadsDeleted
        });
    } catch (err) {
        console.error("Error deleting list:", err);
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
            niche,
            query,
            limit = 35
        } = req.body;

        const effectiveNiche = (niche && niche.trim()) ? niche.trim() : (query ? query.trim() : 'Dentists');

        if (!city || !effectiveNiche) {
            return res.status(400).json({ success: false, error: 'City and Niche/Query are required' });
        }

        // Anti-ban safety guard: hard cap at 45 leads max
        let cappedLimit = parseInt(limit, 10) || 35;
        if (cappedLimit > 45) cappedLimit = 45;
        if (cappedLimit < 15) cappedLimit = 15;

        const jobId = `hunt_${Date.now()}`;
        const fullQuery = `${effectiveNiche} in ${area ? area + ', ' : ''}${city}, ${country}`;

        // 1. Insert job into Supabase
        await pool.query(`
            INSERT INTO scraping_jobs (job_id, query, city, status, created_at)
            VALUES ($1, $2, $3, 'running', NOW());
        `, [jobId, fullQuery, city]);

        // 2. Run live extraction engine with safe limit
        const huntResult = await executeLiveHunt({
            listName: listName.trim(),
            country,
            state,
            city,
            area,
            niche: effectiveNiche,
            limit: cappedLimit
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

// 8.1. Live Streaming SSE Hunt Endpoint (One-by-One Real-Time Push)
app.get('/api/hunt/stream', async (req, res) => {
    const {
        listName = 'General Ingestion',
        country = 'Pakistan',
        state = '',
        city = 'Lahore',
        area = '',
        niche = 'Dentists',
        limit = 35
    } = req.query;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (payload) => {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    let cappedLimit = parseInt(limit, 10) || 35;
    if (cappedLimit > 45) cappedLimit = 45;
    if (cappedLimit < 15) cappedLimit = 15;

    const fullQuery = `${niche} in ${area ? area + ', ' : ''}${city}, ${country}`;
    sendEvent({ type: 'start', query: fullQuery, limit: cappedLimit, listName });

    try {
        const huntResult = await executeLiveHunt({
            listName: listName.trim(),
            country,
            state,
            city,
            area,
            niche,
            limit: cappedLimit,
            autoEnrich: true,
            onLeadExtracted: (lead) => {
                sendEvent({ type: 'lead', lead });
            }
        });

        sendEvent({ 
              type: 'done', 
              totalFound: huntResult.totalFound,
              newLeadsCount: huntResult.newLeadsCount !== undefined ? huntResult.newLeadsCount : (huntResult.leads ? huntResult.leads.length : 0),
              skippedDuplicates: huntResult.skippedDuplicates || 0,
              message: huntResult.message
          });
        res.end();
    } catch (err) {
        console.error("Hunt stream error:", err);
        sendEvent({ type: 'error', message: err.message });
        res.end();
    }
});


// Fallback to index.html
app.use((req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Process-level Crash Guardians
process.on('unhandledRejection', (reason, promise) => {
    console.error('[Server] Intercepted Unhandled Rejection:', reason && reason.message ? reason.message : reason);
});

process.on('uncaughtException', (err) => {
    console.error('[Server] Intercepted Uncaught Exception:', err.message);
});

if (require.main === module) {
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
}

module.exports = app;
