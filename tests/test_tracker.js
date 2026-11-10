const assert = require('assert');
const { OutreachTracker, TRANSPARENT_GIF } = require('../modules/tracking/tracker');

async function testTracker() {
    console.log("🧪 Testing OutreachTracker Module...");

    // 1. Transparent GIF Buffer
    assert(TRANSPARENT_GIF.length >= 42 && TRANSPARENT_GIF.length <= 45, "GIF buffer must be a valid 1x1 GIF");
    console.log(`  ✅ Transparent 1x1 GIF verification passed (${TRANSPARENT_GIF.length} bytes).`);

    // 2. Token Generation
    const token = OutreachTracker.generateToken();
    assert.strictEqual(typeof token, 'string');
    assert.strictEqual(token.length, 32, "Token must be a 32-char hex string");
    console.log(`  ✅ Token generation passed: ${token}`);

    // 3. HTML Content Preparation & Pixel Injection
    const sampleHtml = `<p>Hi Dr. Usman, check out our work at <a href="https://example.com/portfolio">our portfolio</a>.</p>`;
    const prepared = OutreachTracker.prepareOutreachContent({
        bodyHtml: sampleHtml,
        token,
        baseUrl: 'http://localhost:3000'
    });

    assert(prepared.html.includes(`<img src="http://localhost:3000/api/track/open/${token}`), "Pixel tag must be injected");
    assert(prepared.html.includes(`http://localhost:3000/api/track/click/${token}?url=https%3A%2F%2Fexample.com%2Fportfolio`), "Hyperlink must be wrapped with click tracker");
    console.log("  ✅ Tracking Pixel and Link Wrapping passed.");

    // 4. Cadence Calculator Tests
    const now = new Date();

    // Test A: Brand new lead
    const newCadence = OutreachTracker.calculateCadence({ status: 'new' });
    assert.strictEqual(newCadence.cadenceState, 'not_contacted');
    assert.strictEqual(newCadence.isActionRequired, true);

    // Test B: Sent 1 hour ago
    const oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));
    const recentCadence = OutreachTracker.calculateCadence({
        status: 'emailed',
        last_contacted_at: oneHourAgo,
        open_count: 0
    });
    assert.strictEqual(recentCadence.cadenceState, 'waiting');
    assert.strictEqual(recentCadence.isActionRequired, false);

    // Test C: Sent 3.5 days ago (Follow-up 1 Due)
    const threeDaysAgo = new Date(now.getTime() - (3.5 * 24 * 60 * 60 * 1000));
    const dueCadence = OutreachTracker.calculateCadence({
        status: 'emailed',
        last_contacted_at: threeDaysAgo,
        open_count: 2
    });
    assert.strictEqual(dueCadence.cadenceState, 'due_step_1');
    assert.strictEqual(dueCadence.isActionRequired, true);
    assert(dueCadence.badgeLabel.includes('Follow-Up 1 Due'));
    assert(dueCadence.badgeLabel.includes('Opened 2x'));

    // Test D: Lead Replied
    const repliedCadence = OutreachTracker.calculateCadence({
        status: 'replied',
        last_contacted_at: threeDaysAgo,
        open_count: 3
    });
    assert.strictEqual(repliedCadence.cadenceState, 'replied');
    assert.strictEqual(repliedCadence.isActionRequired, false);

    console.log("  ✅ Follow-up Cadence & Days Elapsed Engine passed all edge cases.");
    console.log("🎉 All OutreachTracker tests passed successfully!");
}

testTracker().catch(e => {
    console.error("❌ Test failed:", e);
    process.exit(1);
});
