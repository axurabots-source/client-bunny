const assert = require('assert');
const { Pool } = require('pg');
require('dotenv').config();

const { OutreachTracker } = require('../modules/tracking/tracker');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function runEndToEndTrackingTest() {
    console.log("==================================================");
    console.log("🧪 TESTING END-TO-END TRACKING ENGINE & DB SYNC");
    console.log("==================================================");

    // 1. Create a temporary test lead
    const placeId = 'test_track_' + Date.now();
    const leadRes = await pool.query(`
        INSERT INTO leads (place_id, title, city, category, review_rating, review_count, status, created_at, updated_at)
        VALUES ($1, 'Apex Dental Test Studio', 'Lahore', 'Dentist', 4.9, 45, 'new', NOW(), NOW())
        RETURNING *;
    `, [placeId]);

    const lead = leadRes.rows[0];
    console.log(`✅ Created test lead: ID #${lead.id} (${lead.title})`);

    const trackingToken = OutreachTracker.generateToken();

    // 2. Simulate sending an email 10 seconds ago and inserting outreach_log
    const logRes = await pool.query(`
        INSERT INTO outreach_logs (lead_id, channel, recipient_email, subject, body_content, status, tracking_token, sent_at)
        VALUES ($1, 'email', 'test@apexdental.com', 'Quick question re: Apex Dental', 'Pitch body content', 'sent', $2, NOW() - INTERVAL '10 seconds')
        RETURNING *;
    `, [lead.id, trackingToken]);

    await pool.query(`
        UPDATE leads 
        SET status = 'emailed', last_contacted_at = NOW() - INTERVAL '10 seconds', next_followup_due = NOW() + INTERVAL '3 days'
        WHERE id = $1;
    `, [lead.id]);

    console.log(`✅ Simulated email sent with token: ${trackingToken}`);

    // Verify initial state
    let verifyLog = (await pool.query('SELECT * FROM outreach_logs WHERE id = $1', [logRes.rows[0].id])).rows[0];
    let verifyLead = (await pool.query('SELECT * FROM leads WHERE id = $1', [lead.id])).rows[0];

    assert.strictEqual(verifyLog.status, 'sent');
    assert.strictEqual(verifyLog.open_count, 0);
    assert.strictEqual(verifyLead.status, 'emailed');
    assert.strictEqual(verifyLead.open_count, 0);
    console.log("  Initial state verified: status='emailed', open_count=0");

    // 3. Simulate Lead Opening the Email (Pixel Hit)
    console.log("\n👁️ Simulating prospect opening email (Pixel Hit)...");
    const openSuccess = await OutreachTracker.recordOpen(trackingToken, {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        ip: '182.185.120.50'
    });
    assert.strictEqual(openSuccess, true, "recordOpen must return true");

    verifyLog = (await pool.query('SELECT * FROM outreach_logs WHERE id = $1', [logRes.rows[0].id])).rows[0];
    verifyLead = (await pool.query('SELECT * FROM leads WHERE id = $1', [lead.id])).rows[0];

    assert.strictEqual(verifyLog.status, 'opened');
    assert.strictEqual(verifyLog.open_count, 1);
    assert.strictEqual(verifyLead.status, 'opened');
    assert.strictEqual(verifyLead.open_count, 1);
    assert(verifyLog.opened_at !== null, "opened_at must be populated");
    console.log(`  ✅ Open recorded! Log status='${verifyLog.status}', Lead status='${verifyLead.status}', Open count=${verifyLead.open_count}`);

    // 4. Simulate Link Click
    console.log("\n🔗 Simulating prospect clicking portfolio link...");
    const redirectUrl = await OutreachTracker.recordClick(
        trackingToken,
        'https://myagency.com/portfolio?ref=clientbunny',
        { userAgent: 'Mozilla/5.0', ip: '182.185.120.50' }
    );
    assert.strictEqual(redirectUrl, 'https://myagency.com/portfolio?ref=clientbunny');

    verifyLog = (await pool.query('SELECT * FROM outreach_logs WHERE id = $1', [logRes.rows[0].id])).rows[0];
    verifyLead = (await pool.query('SELECT * FROM leads WHERE id = $1', [lead.id])).rows[0];

    assert.strictEqual(verifyLog.click_count, 1);
    assert.strictEqual(verifyLead.click_count, 1);
    console.log(`  ✅ Click recorded! Log clicks=${verifyLog.click_count}, Lead clicks=${verifyLead.click_count}`);

    // 5. Cadence verification
    const cadence = OutreachTracker.calculateCadence(verifyLead);
    console.log(`\n📊 Live Lead Cadence Badge: "${cadence.badgeLabel}"`);
    assert(cadence.badgeLabel.includes('Clicked 1x'));

    // 6. Cleanup test records
    await pool.query('DELETE FROM outreach_logs WHERE id = $1', [verifyLog.id]);
    await pool.query('DELETE FROM leads WHERE id = $1', [lead.id]);
    console.log("🧹 Cleaned up temporary test lead and log.");

    console.log("\n🎉 ALL END-TO-END TRACKING TESTS PASSED PERFECTLY!");
    await pool.end();
}

runEndToEndTrackingTest().catch(err => {
    console.error("❌ Test failed:", err);
    process.exit(1);
});
