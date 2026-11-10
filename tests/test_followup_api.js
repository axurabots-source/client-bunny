const assert = require('assert');
const { Pool } = require('pg');
require('dotenv').config();

const { LeadRepository } = require('../modules/m1_storage/leadRepository');
const { OutreachTracker } = require('../modules/tracking/tracker');
const { generateFollowUpPitch } = require('../modules/m6_ai_engine/aiIntelligence');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function testFollowUpApi() {
    console.log("==================================================");
    console.log("🧪 TESTING AI FOLLOW-UP GENERATOR & CADENCE");
    console.log("==================================================");

    // 1. Fetch any lead or create sample
    const leads = await LeadRepository.listLeads({ limit: 1 });
    let lead = leads && leads.length > 0 ? leads[0] : null;

    if (!lead) {
        console.log("Creating temporary lead...");
        const res = await pool.query(`
            INSERT INTO leads (title, city, category, review_rating, review_count, status, pain_points)
            VALUES ('Elite Dental Care', 'Lahore', 'Dentist', 4.9, 88, 'emailed', '["no_website"]')
            RETURNING *;
        `);
        lead = res.rows[0];
    }

    console.log(`Using Lead: ${lead.title} (ID #${lead.id}, Status: ${lead.status})`);

    // 2. Test Cadence Calculation
    const cadence = OutreachTracker.calculateCadence(lead);
    console.log(`✅ Calculated Cadence: State=${cadence.cadenceState}, Label="${cadence.badgeLabel}", Action Required=${cadence.isActionRequired}`);

    // 3. Test Follow-up generation
    const followUp = await generateFollowUpPitch(lead, lead.decision_makers ? lead.decision_makers[0] : null, {
        step: 1,
        daysElapsed: 3,
        openCount: 2,
        previousSubject: 'quick question re: ' + lead.title
    });

    console.log("\n📋 Generated Follow-Up Pitch:");
    console.log(`Subject: ${followUp.subject_line}`);
    console.log(`Body:\n${followUp.email_body}`);

    assert(followUp.subject_line.startsWith('Re:'), "Subject must be threaded with Re:");
    assert(followUp.email_body.length > 20, "Body must contain pitch text");

    console.log("\n🎉 AI FOLLOW-UP ENGINE VERIFIED SUCCESSFULLY!");
    await pool.end();
}

testFollowUpApi().catch(err => {
    console.error("❌ Test failed:", err);
    process.exit(1);
});
