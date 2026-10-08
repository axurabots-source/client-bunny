const express = require('express');
const cors = require('cors');
const path = require('path');
const { LeadRepository } = require('./modules/m1_storage/leadRepository');
const { ingestGmbCsv } = require('./modules/m2_gmb_integration/gmbParser');
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
        const { status, city, limit = 100, offset = 0 } = req.query;
        const leads = await LeadRepository.listLeads({
            status,
            city,
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

// 4. Trigger Ingestion of dentists_in_lahore.csv
app.post('/api/ingest', async (req, res) => {
    try {
        const csvPath = path.join(__dirname, 'dentists_in_lahore.csv');
        const stats = await ingestGmbCsv(csvPath);
        res.json({ success: true, message: 'Ingestion completed', stats });
    } catch (err) {
        console.error("Error ingesting CSV:", err);
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
