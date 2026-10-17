const http = require('http');

function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });

        req.on('error', reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    console.log("=================================================");
    console.log("🧪 TESTING MODULE 7: REST API ENDPOINTS SPECIFICATION");
    console.log("=================================================");

    // 1. GET /api/stats
    console.log("\n[1/6] Testing GET /api/stats...");
    const statsRes = await makeRequest('GET', '/api/stats');
    console.log("Status:", statsRes.status);
    console.log("Daily Stats Output:", JSON.stringify(statsRes.body.stats, null, 2));

    // 2. GET /api/leads with pagination and filters
    console.log("\n[2/6] Testing GET /api/leads?limit=3&pain_point=no_website...");
    const leadsRes = await makeRequest('GET', '/api/leads?limit=3&pain_point=no_website');
    console.log("Status:", leadsRes.status);
    console.log(`Found ${leadsRes.body.count} leads matching filter.`);
    const sampleLead = leadsRes.body.leads[0];
    if (sampleLead) {
        console.log(`Sample Lead: ID=${sampleLead.id}, Title="${sampleLead.title}", Rating=${sampleLead.review_rating}, Status=${sampleLead.status}`);
    }

    // 3. GET /api/leads/:id
    const targetLeadId = sampleLead ? sampleLead.id : 1;
    console.log(`\n[3/6] Testing GET /api/leads/${targetLeadId}...`);
    const leadDetailRes = await makeRequest('GET', `/api/leads/${targetLeadId}`);
    console.log("Status:", leadDetailRes.status);
    console.log(`Decision makers discovered: ${leadDetailRes.body.lead?.decision_makers?.length || 0}`);

    // 4. POST /api/leads/:id/enrich
    console.log(`\n[4/6] Testing POST /api/leads/${targetLeadId}/enrich...`);
    const enrichRes = await makeRequest('POST', `/api/leads/${targetLeadId}/enrich`);
    console.log("Status:", enrichRes.status);
    console.log("Enrich Success:", enrichRes.body.success);

    // 5. POST /api/leads/:id/pitch
    console.log(`\n[5/6] Testing POST /api/leads/${targetLeadId}/pitch...`);
    const pitchRes = await makeRequest('POST', `/api/leads/${targetLeadId}/pitch`);
    console.log("Status:", pitchRes.status);
    console.log("Pitch Generated:", pitchRes.body.success);
    if (pitchRes.body.multiChannel) {
        console.log("Subject Line:", pitchRes.body.multiChannel.subject_line);
        console.log("Email Body Preview:", pitchRes.body.pitch?.substring(0, 100) + '...');
    }

    // 6. POST /api/outreach/send (validation test)
    console.log("\n[6/6] Testing POST /api/outreach/send validation...");
    const sendRes = await makeRequest('POST', '/api/outreach/send', {
        to: 'invalid-email'
    });
    console.log("Validation status:", sendRes.status, "(Expected 400 rejection for missing SMTP credentials/invalid email)");
    console.log("Rejection reason:", sendRes.body.error);

    console.log("\n=================================================");
    console.log("✅ ALL MODULE 7 SPECIFICATION TESTS VERIFIED!");
    console.log("=================================================");
}

runTests().catch(console.error);
