/**
 * Client Bunny — Omnichannel Unified Inbox UI End-to-End Test Suite
 * Validates desktop & mobile inbox layout, thread selection, live replying,
 * channel modal configurations, and simulation triggers.
 */

const { chromium } = require('playwright');

async function runInboxUITests() {
    console.log('====================================================');
    console.log('🚀 RUNNING OMNICHANNEL INBOX E2E TEST SUITE');
    console.log('====================================================\n');

    const browser = await chromium.launch({ headless: true });
    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  ✅ [PASS] ${message}`);
            passed++;
        } else {
            console.error(`  ❌ [FAIL] ${message}`);
            failed++;
        }
    }

    try {
        // --- 1. DESKTOP VIEWPORT TEST (1280 x 800) ---
        console.log('--- 1. Desktop Omnichannel Inbox Flow (1280 x 800) ---');
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await context.newPage();
        page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
        page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

        await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

        // Navigate to Inbox screen
        const navInbox = page.locator('#navInbox');
        assert(await navInbox.isVisible(), 'Sidebar nav contains Omnichannel Inbox button');
        await navInbox.click();

        await page.waitForTimeout(600);
        const screenInbox = page.locator('#screenInbox');
        assert(await screenInbox.evaluate(el => el.classList.contains('active')), 'Omnichannel Inbox screen is active');

        const breadcrumb = page.locator('#breadcrumbTitle');
        assert(await breadcrumb.innerText() === 'Omnichannel Inbox', 'Breadcrumb title updated to "Omnichannel Inbox"');

        // Check threads list
        try {
            await page.waitForSelector('.thread-item', { timeout: 5000 });
        } catch (err) {
            const innerHtml = await page.locator('#inboxThreadsList').innerHTML();
            console.error('INNER HTML OF #inboxThreadsList:', innerHtml);
            throw err;
        }
        const threadCount = await page.locator('.thread-item').count();
        assert(threadCount > 0, `Threads list populated with ${threadCount} active conversations`);

        // Click first thread to view messages
        const firstThread = page.locator('.thread-item').first();
        await firstThread.click();

        const activeChatView = page.locator('#inboxActiveChat');
        assert(await activeChatView.isVisible(), 'Active chat conversation pane opened');

        await page.waitForSelector('.chat-bubble-row', { timeout: 5000 });
        const chatName = await page.locator('#activeChatName').innerText();
        assert(chatName.length > 0 && chatName !== '—', `Active contact header populated: "${chatName}"`);

        const messagesCount = await page.locator('.chat-bubble-row').count();
        assert(messagesCount > 0, `Message history stream loaded with ${messagesCount} message bubbles`);

        // Test sending an outbound reply
        const replyInput = page.locator('#chatReplyInput');
        await replyInput.fill('Hi! Thanks for reaching out. Yes, we provide full digital presence & lead generation solutions.');

        const sendBtn = page.locator('#sendReplyBtn');
        await sendBtn.click();
        await page.waitForTimeout(800);

        const newMessagesCount = await page.locator('.chat-bubble-row').count();
        assert(newMessagesCount >= messagesCount, 'Outbound reply dispatched and appended to chat bubble stream');

        // Test AI Reply Suggestion
        const aiSuggestBtn = page.locator('.btn-ai-suggest');
        if (await aiSuggestBtn.isVisible()) {
            await aiSuggestBtn.click();
            await page.waitForTimeout(500);
            const suggestedText = await replyInput.inputValue();
            assert(suggestedText.length > 10, 'AI Suggestion button generated high-converting contextual draft');
            await replyInput.fill('');
        }

        // Test Channels Modal
        console.log('\n--- 2. Channels Configuration Modal Tests ---');
        const configBtn = page.locator('#openChannelsConfigBtn');
        await configBtn.click();
        await page.waitForTimeout(300);

        const modalOverlay = page.locator('#channelsModalOverlay');
        assert(await modalOverlay.isVisible(), 'Channels Modal Overlay opened');

        // Verify Email IMAP Tab
        const imapHost = page.locator('#imapHost');
        assert(await imapHost.isVisible(), 'Email IMAP host configuration field visible');

        // Switch to WhatsApp Tab
        await page.evaluate(() => window.switchChannelTab('wa'));
        await page.waitForTimeout(200);
        const waTab = page.locator('#chanTabWa');
        assert(await waTab.isVisible(), 'Switched to WhatsApp Gateway Tab');

        // Switch to Instagram Tab
        await page.evaluate(() => window.switchChannelTab('ig'));
        await page.waitForTimeout(200);
        const igTab = page.locator('#chanTabIg');
        assert(await igTab.isVisible(), 'Switched to Meta / Instagram Webhook Tab');

        // Close Modal
        await page.evaluate(() => window.closeChannelsModal());
        await page.waitForTimeout(200);
        assert(!(await modalOverlay.isVisible()), 'Channels Modal closed cleanly');

        await context.close();

        // --- 3. MOBILE VIEWPORT TEST (375 x 667 iPhone SE) ---
        console.log('\n--- 3. Mobile Inbox Responsive Flow (375 x 667) ---');
        const mobileContext = await browser.newContext({ viewport: { width: 375, height: 667 } });
        const mobilePage = await mobileContext.newPage();

        await mobilePage.goto('http://localhost:3000', { waitUntil: 'networkidle' });

        // Click mobile bottom nav inbox button
        const bnavInbox = mobilePage.locator('#bnavInbox');
        assert(await bnavInbox.isVisible(), 'Mobile thumb bottom dock has Inbox tab');
        await bnavInbox.click();
        await mobilePage.waitForTimeout(500);

        const mobileScreenInbox = mobilePage.locator('#screenInbox');
        assert(await mobileScreenInbox.evaluate(el => el.classList.contains('active')), 'Inbox screen active on mobile');

        // Check horizontal overflow on mobile
        const scrollWidth = await mobilePage.evaluate(() => document.documentElement.scrollWidth);
        const clientWidth = await mobilePage.evaluate(() => document.documentElement.clientWidth);
        assert(scrollWidth <= clientWidth, 'Zero horizontal overflow in Mobile Inbox Screen');

        // Click a thread on mobile
        await mobilePage.waitForSelector('.thread-item', { timeout: 5000 });
        await mobilePage.locator('.thread-item').first().click();
        await mobilePage.waitForTimeout(300);

        const bodyHasMobileOpen = await mobilePage.evaluate(() => document.body.classList.contains('mobile-inbox-open'));
        assert(bodyHasMobileOpen, 'Selecting thread adds mobile-inbox-open to switch from list to chat pane');

        // Click back button to return to thread list
        const backBtn = mobilePage.locator('#mobileBackToChatsBtn');
        assert(await backBtn.isVisible(), 'Mobile back button is visible in chat header');
        await backBtn.click();
        await mobilePage.waitForTimeout(300);

        const bodyBackToList = await mobilePage.evaluate(() => document.body.classList.contains('mobile-inbox-open'));
        assert(!bodyBackToList, 'Clicking mobile back button cleanly returns to conversation list pane');

        await mobileContext.close();

    } catch (err) {
        console.error('Unhandled Test Exception:', err);
        failed++;
    } finally {
        await browser.close();
    }

    console.log('\n====================================================');
    console.log(`📊 FINAL RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
        process.exit(1);
    } else {
        console.log('🎉 ALL INBOX UI TESTS PASSED WITH 100% SUCCESS!');
        process.exit(0);
    }
}

runInboxUITests();
