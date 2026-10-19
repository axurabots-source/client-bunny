const { chromium } = require('playwright');

async function testButtons() {
    console.log('--- DIAGNOSING INBOX BUTTONS ---');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const errors = [];
    const logs = [];

    page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    console.log('1. Clicking #navInbox...');
    await page.click('#navInbox');
    await page.waitForTimeout(500);

    console.log('2. Clicking #openChannelsConfigBtn...');
    await page.click('#openChannelsConfigBtn');
    await page.waitForTimeout(300);

    console.log('3. Clicking Channel Modal Tabs & Simulations...');
    try {
        await page.click('#tabChanWa');
        console.log('  #tabChanWa clicked');
        // Test WhatsApp Simulation Button
        await page.click('#sendWaTestMsgBtn');
        await page.waitForTimeout(600);
        console.log('  #sendWaTestMsgBtn clicked and executed');
    } catch(e) {
        errors.push('#tabChanWa test failed: ' + e.message);
    }
    await page.waitForTimeout(200);

    try {
        await page.click('#tabChanIg');
        console.log('  #tabChanIg clicked');
        // Test Instagram Simulation Button
        await page.click('#sendIgTestMsgBtn');
        await page.waitForTimeout(600);
        console.log('  #sendIgTestMsgBtn clicked and executed');
    } catch(e) {
        errors.push('#tabChanIg test failed: ' + e.message);
    }
    await page.waitForTimeout(200);

    try {
        await page.click('#tabChanEmail');
        console.log('  #tabChanEmail clicked');
    } catch(e) {
        errors.push('#tabChanEmail test failed: ' + e.message);
    }
    await page.waitForTimeout(200);

    console.log('4. Clicking #closeChannelsModalBtn...');
    await page.click('#closeChannelsModalBtn');
    await page.waitForTimeout(300);

    console.log('5. Clicking Channel Filters...');
    await page.click('button[data-channel="email"]');
    await page.waitForTimeout(300);
    await page.click('button[data-channel="whatsapp"]');
    await page.waitForTimeout(300);
    await page.click('button[data-channel="instagram"]');
    await page.waitForTimeout(300);
    await page.click('button[data-channel="all"]');
    await page.waitForTimeout(500);

    console.log('6. Checking Threads list...');
    const threadItems = await page.locator('.thread-item').count();
    console.log(`Found ${threadItems} threads`);

    if (threadItems > 0) {
        console.log('7. Clicking first thread...');
        await page.locator('.thread-item').first().click();
        await page.waitForTimeout(600);

        console.log('8. Clicking AI Suggest Reply button...');
        try {
            await page.click('.btn-ai-suggest');
            await page.waitForTimeout(500);
            console.log('  AI Suggest clicked successfully');
        } catch(e) {
            errors.push('AI Suggest button error: ' + e.message);
        }

        console.log('9. Clicking Send button...');
        try {
            await page.click('#sendReplyBtn');
            await page.waitForTimeout(800);
            console.log('  Send button clicked successfully');
        } catch(e) {
            errors.push('Send button error: ' + e.message);
        }

        console.log('10. Clicking View Lead Dossier button...');
        try {
            const leadBtn = page.locator('#viewLeadProfileFromChatBtn');
            if (await leadBtn.isVisible()) {
                await leadBtn.click();
                await page.waitForTimeout(400);
                console.log('  Lead Dossier button clicked');
            } else {
                console.log('  Lead Dossier button is hidden (no matched lead)');
            }
        } catch(e) {
            errors.push('Lead Dossier button error: ' + e.message);
        }
    }

    console.log('11. Clicking Sync Email (IMAP) button...');
    try {
        await page.click('#inboxSyncEmailBtn');
        await page.waitForTimeout(1000);
        console.log('  Sync Email button clicked');
    } catch(e) {
        errors.push('Sync Email button error: ' + e.message);
    }

    await browser.close();

    console.log('\n--- BROWSER ERRORS ENCOUNTERED ---');
    if (errors.length === 0) {
        console.log('None! 0 uncaught errors.');
    } else {
        errors.forEach(e => console.error('❌ ' + e));
    }

    console.log('\n--- BROWSER LOGS ---');
    logs.forEach(l => console.log('  ' + l));
}

testButtons().catch(console.error);
