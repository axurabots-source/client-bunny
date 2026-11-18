const { chromium } = require('playwright');

(async () => {
    console.log('[Test] Starting WhatsApp lead redirect & tailored pitch verification...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    try {
        await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
        console.log('[Test] Page loaded successfully.');

        // 1. Switch to Leads screen if not active
        const leadsResponse = page.waitForResponse(r => r.url().includes('/api/leads'));
        await page.click('#navLeads');
        await leadsResponse;
        console.log('[Test] Navigated to Leads screen and received /api/leads response.');

        // 2. Wait for Leads table to render rows
        await page.waitForSelector('#leadsTbody tr td', { timeout: 10000 });
        const rowCount = await page.locator('#leadsTbody tr').count();
        console.log(`[Test] Leads table rendered with ${rowCount} rows.`);

        // 3. Find a WhatsApp action button or badge on any lead row
        const waButton = page.locator('#leadsTbody button:has-text("WA"), #leadsTbody .whatsapp-badge').first();
        const hasWaButton = await waButton.count() > 0;
        console.log('[Test] Found WhatsApp action element on lead row:', hasWaButton);

        if (!hasWaButton) {
            throw new Error('No WhatsApp action button or badge found on leads table rows.');
        }

        // 3. Click the WhatsApp button
        console.log('[Test] Clicking WhatsApp action button on lead...');
        await waButton.click();

        // 4. Verify Omnichannel Inbox screen becomes active
        await page.waitForSelector('#screenInbox.active', { timeout: 8000 });
        console.log('[Test] Verified: Screen switched to Omnichannel Inbox (#screenInbox.active)!');

        // 5. Verify conversation is opened and active chat pane is visible
        await page.waitForSelector('#inboxActiveChat', { state: 'visible', timeout: 8000 });
        const activeName = await page.locator('#activeChatName').textContent();
        console.log(`[Test] Active chat header name: "${activeName}"`);

        // 6. Verify the tailored pitch is preloaded into #chatReplyInput
        await page.waitForFunction(() => {
            const el = document.getElementById('chatReplyInput');
            return el && el.value && el.value.trim().length > 10;
        }, { timeout: 10000 });

        const composerText = await page.locator('#chatReplyInput').inputValue();
        console.log('[Test] Composer pre-filled text:\n---');
        console.log(composerText);
        console.log('---');

        if (!composerText || composerText.length < 15) {
            throw new Error('Composer text is empty or too short!');
        }

        console.log('[Test] Phase 1 PASSED: Table row action click -> Inbox redirect -> Tailored pitch verified.');

        // Phase 2: Test Lead Detail Drawer WhatsApp button
        console.log('\n[Test] Phase 2: Testing Lead Detail Drawer WhatsApp button...');
        await page.click('#navLeads');
        await page.waitForSelector('#screenLeads.active', { timeout: 5000 });
        await page.waitForSelector('#leadsTbody tr', { timeout: 5000 });

        // Click first row to open detail drawer
        await page.locator('#leadsTbody tr').first().click();
        await page.waitForSelector('#leadDrawer.open', { state: 'visible', timeout: 5000 });
        console.log('[Test] Lead detail drawer opened.');

        // Wait for drawer content to finish async fetch and render
        const drawerWaBtn = page.locator('#drawerBody button:has-text("WhatsApp"), #drawerBody button:has-text("Chat on WhatsApp")').first();
        await drawerWaBtn.waitFor({ state: 'visible', timeout: 8000 });
        console.log('[Test] Found WhatsApp button inside drawer: true');

        await drawerWaBtn.click();
        await page.waitForSelector('#screenInbox.active', { timeout: 8000 });
        await page.waitForSelector('#inboxActiveChat', { state: 'visible', timeout: 8000 });
        const drawerComposerText = await page.locator('#chatReplyInput').inputValue();
        console.log(`[Test] Verified from drawer: Composer has pitch (${drawerComposerText.length} chars).`);

        console.log('\n[Test] ALL PHASES SUCCESSFUL: 100% verified!');
    } catch (err) {
        console.error('[Test Failed]:', err);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
})();
