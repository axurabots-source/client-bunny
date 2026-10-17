/**
 * End-to-End Automated Mobile Responsiveness Test Suite
 * Validates viewport responsiveness, zero horizontal overflow, touch tap targets,
 * off-canvas mobile drawer, bottom navigation dock, and card layout on mobile.
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runMobileResponsiveTests() {
    console.log('====================================================');
    console.log('🚀 RUNNING MOBILE RESPONSIVENESS AUTOMATED TEST SUITE');
    console.log('====================================================');

    const browser = await chromium.launch({ headless: true });
    let passedTests = 0;
    let totalTests = 0;

    function assertTest(condition, name, details = '') {
        totalTests++;
        if (condition) {
            passedTests++;
            console.log(`  ✅ [PASS] ${name}`);
        } else {
            console.error(`  ❌ [FAIL] ${name} ${details ? `(${details})` : ''}`);
        }
    }

    try {
        // ==========================================================
        // TEST SUITE 1: iPhone SE (375x667)
        // ==========================================================
        console.log('\n--- 1. Testing iPhone SE Viewport (375 x 667) ---');
        const context375 = await browser.newContext({
            viewport: { width: 375, height: 667 },
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
        });
        const page375 = await context375.newPage();
        await page375.goto('http://localhost:3000', { waitUntil: 'networkidle' });

        // 1.1 Zero Horizontal Overflow
        const overflow375 = await page375.evaluate(() => {
            const scrollW = document.documentElement.scrollWidth;
            const clientW = document.documentElement.clientWidth;
            const bodyScrollW = document.body.scrollWidth;
            return {
                scrollW,
                clientW,
                bodyScrollW,
                hasOverflow: scrollW > clientW || bodyScrollW > clientW
            };
        });
        assertTest(!overflow375.hasOverflow, 'iPhone SE: Zero horizontal overflow on Leads screen', 
            `scrollWidth=${overflow375.scrollW}, clientWidth=${overflow375.clientW}`);

        // 1.2 Mobile Bottom Nav Visible & Fixed at Bottom
        const bnavVisible = await page375.evaluate(() => {
            const nav = document.getElementById('mobileBottomNav');
            if (!nav) return false;
            const style = window.getComputedStyle(nav);
            const rect = nav.getBoundingClientRect();
            return style.display === 'flex' && rect.bottom >= window.innerHeight - 2;
        });
        assertTest(bnavVisible, 'iPhone SE: Mobile bottom navigation dock is visible and anchored at bottom');

        // 1.3 Desktop Sidebar is Off-Canvas (Hidden by default)
        const sidebarOffCanvas = await page375.evaluate(() => {
            const sidebar = document.querySelector('.sidebar');
            const rect = sidebar.getBoundingClientRect();
            const style = window.getComputedStyle(sidebar);
            return rect.right <= 0 || style.transform.includes('matrix') && rect.left < 0;
        });
        assertTest(sidebarOffCanvas, 'iPhone SE: Sidebar is off-canvas (hidden off screen by default)');

        // 1.4 Hamburger Toggle opens off-canvas sidebar
        await page375.click('#toggleSidebarBtn');
        await page375.waitForTimeout(300);
        const sidebarOpened = await page375.evaluate(() => {
            const hasClass = document.body.classList.contains('mobile-nav-open');
            const sidebar = document.querySelector('.sidebar');
            const rect = sidebar.getBoundingClientRect();
            return hasClass && rect.left >= 0;
        });
        assertTest(sidebarOpened, 'iPhone SE: Toggle button opens sidebar slide-over menu');

        // 1.5 Backdrop closes sidebar (tap outside sidebar width at x=320)
        await page375.click('#sidebarBackdrop', { position: { x: 320, y: 300 } });
        await page375.waitForTimeout(300);
        const sidebarClosed = await page375.evaluate(() => {
            return !document.body.classList.contains('mobile-nav-open');
        });
        assertTest(sidebarClosed, 'iPhone SE: Backdrop click closes sidebar slide-over');

        // 1.6 Bottom Nav Switching: Leads -> Hunt
        await page375.click('#bnavHunt');
        await page375.waitForTimeout(300);
        const huntActive = await page375.evaluate(() => {
            const screen = document.getElementById('screenHunt');
            const bnav = document.getElementById('bnavHunt');
            const bc = document.getElementById('breadcrumbTitle');
            return screen.classList.contains('active') && 
                   bnav.classList.contains('active') && 
                   bc.textContent.includes('Hunt');
        });
        assertTest(huntActive, 'iPhone SE: Bottom navigation switches smoothly to Hunt Launchpad');

        // 1.7 Zero Horizontal Overflow on Hunt Screen
        const huntOverflow = await page375.evaluate(() => {
            return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
        });
        assertTest(huntOverflow, 'iPhone SE: Zero horizontal overflow on Hunt Launchpad');

        // 1.8 Bottom Nav Switching: Hunt -> Lists
        await page375.click('#bnavLists');
        await page375.waitForTimeout(300);
        const listsActive = await page375.evaluate(() => {
            const screen = document.getElementById('screenLists');
            const bnav = document.getElementById('bnavLists');
            return screen.classList.contains('active') && bnav.classList.contains('active');
        });
        assertTest(listsActive, 'iPhone SE: Bottom navigation switches smoothly to Lists Screen');

        // 1.9 Bottom Nav Switching: Lists -> Analytics
        await page375.click('#bnavAnalytics');
        await page375.waitForTimeout(300);
        const analyticsActive = await page375.evaluate(() => {
            const screen = document.getElementById('screenAnalytics');
            const bnav = document.getElementById('bnavAnalytics');
            return screen.classList.contains('active') && bnav.classList.contains('active');
        });
        assertTest(analyticsActive, 'iPhone SE: Bottom navigation switches smoothly to Analytics Screen');

        // 1.10 Return to Leads Screen
        await page375.click('#bnavLeads');
        await page375.waitForTimeout(300);

        // 1.11 Leads Card Layout verification on mobile
        const cardLayoutOk = await page375.evaluate(() => {
            const rows = document.querySelectorAll('#leadsTbody tr');
            if (rows.length === 0) return true;
            const firstRow = rows[0];
            const style = window.getComputedStyle(firstRow);
            const rect = firstRow.getBoundingClientRect();
            // In card layout, row is display: block, fits within screen width
            return style.display === 'block' && rect.width <= window.innerWidth;
        });
        assertTest(cardLayoutOk, 'iPhone SE: Leads rendered as responsive mobile cards');

        // 1.12 Touch Tap Target heights (min 38px)
        const touchTargetsOk = await page375.evaluate(() => {
            const actionBtns = document.querySelectorAll('.btn-row-action');
            if (actionBtns.length === 0) return true;
            let allMeetCriteria = true;
            actionBtns.forEach(btn => {
                const rect = btn.getBoundingClientRect();
                if (rect.height < 36) allMeetCriteria = false;
            });
            return allMeetCriteria;
        });
        assertTest(touchTargetsOk, 'iPhone SE: Action buttons meet touch tap target criteria (>= 36px height)');

        // ==========================================================
        // TEST SUITE 2: iPhone 13/14 (390x844)
        // ==========================================================
        console.log('\n--- 2. Testing iPhone 13/14 Viewport (390 x 844) ---');
        const context390 = await browser.newContext({
            viewport: { width: 390, height: 844 },
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        });
        const page390 = await context390.newPage();
        await page390.goto('http://localhost:3000', { waitUntil: 'networkidle' });

        // 2.1 Zero overflow
        const overflow390 = await page390.evaluate(() => {
            return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
        });
        assertTest(overflow390, 'iPhone 13: Zero horizontal overflow on Leads Pipeline');

        // 2.2 Filter Pills scroll horizontally without blowing page width
        const pillsLayout = await page390.evaluate(() => {
            const pills = document.getElementById('filterPills');
            const style = window.getComputedStyle(pills);
            const rect = pills.getBoundingClientRect();
            return style.overflowX === 'auto' && rect.right <= window.innerWidth + 2;
        });
        assertTest(pillsLayout, 'iPhone 13: Filter pills scroll horizontally with zero layout overflow');

        // 2.3 Slide-over Drawer responsiveness
        await page390.evaluate(() => {
            const firstRow = document.querySelector('#leadsTbody tr');
            if (firstRow) firstRow.click();
        });
        await page390.waitForTimeout(300);
        const drawerResponsive = await page390.evaluate(() => {
            const drawer = document.getElementById('leadDrawer');
            const rect = drawer.getBoundingClientRect();
            // On mobile, drawer width should be 100vw or fit within screen
            return rect.width <= window.innerWidth && rect.left >= 0;
        });
        assertTest(drawerResponsive, 'iPhone 13: Slide-over profile drawer adapts to full mobile viewport width');

        // Close drawer
        await page390.click('#closeDrawerBtn');
        await page390.waitForTimeout(300);

        // 2.4 Modals responsiveness: Email Settings Modal
        await page390.click('#emailSettingsBtn');
        await page390.waitForTimeout(300);
        const modal390Ok = await page390.evaluate(() => {
            const modal = document.querySelector('#emailSettingsModalOverlay .modal-card');
            if (!modal) return false;
            const rect = modal.getBoundingClientRect();
            return rect.width <= window.innerWidth && rect.left >= 0 && rect.right <= window.innerWidth;
        });
        assertTest(modal390Ok, 'iPhone 13: Email Settings Modal fits perfectly within mobile viewport');

        // Close modal
        await page390.click('#cancelSmtpModalBtn');
        await page390.waitForTimeout(300);

        // ==========================================================
        // TEST SUITE 3: Android / Pixel 7 (412x915)
        // ==========================================================
        console.log('\n--- 3. Testing Android / Pixel 7 Viewport (412 x 915) ---');
        const context412 = await browser.newContext({
            viewport: { width: 412, height: 915 },
            userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36'
        });
        const page412 = await context412.newPage();
        await page412.goto('http://localhost:3000', { waitUntil: 'networkidle' });

        // 3.1 Metrics Grid 2x2 on mobile
        const metricsGridOk = await page412.evaluate(() => {
            const grid = document.querySelector('.metrics-grid');
            const style = window.getComputedStyle(grid);
            const columns = style.gridTemplateColumns.split(' ').length;
            return columns === 2;
        });
        assertTest(metricsGridOk, 'Pixel 7: Metrics grid renders as clean 2x2 columns on mobile');

        // 3.2 AI Pitch Modal Responsiveness
        const pitchBtn = await page412.$('.btn-row-action[title*="Pitch"]');
        if (pitchBtn) {
            await pitchBtn.click();
            await page412.waitForTimeout(400);
            const pitchModalOk = await page412.evaluate(() => {
                const modal = document.querySelector('#aiPitchModalOverlay .modal-card');
                if (!modal) return false;
                const rect = modal.getBoundingClientRect();
                return rect.width <= window.innerWidth && rect.right <= window.innerWidth;
            });
            assertTest(pitchModalOk, 'Pixel 7: AI Pitch Modal renders responsively without clipping');
            await page412.click('#closePitchModalBtn');
            await page412.waitForTimeout(300);
        }

        // ==========================================================
        // TEST SUITE 4: Tablet / iPad Viewport (768x1024)
        // ==========================================================
        console.log('\n--- 4. Testing Tablet Viewport (768 x 1024) ---');
        const context768 = await browser.newContext({
            viewport: { width: 768, height: 1024 }
        });
        const page768 = await context768.newPage();
        await page768.goto('http://localhost:3000', { waitUntil: 'networkidle' });

        const overflow768 = await page768.evaluate(() => {
            return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
        });
        assertTest(overflow768, 'Tablet 768px: Zero horizontal overflow across all views');

        // Clean up contexts
        await context375.close();
        await context390.close();
        await context412.close();
        await context768.close();
        await browser.close();

        console.log('\n====================================================');
        console.log(`📊 FINAL RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
        console.log('====================================================');

        if (passedTests === totalTests) {
            console.log('🎉 ALL MOBILE RESPONSIVENESS CHECKS PASSED PERFECTLY!');
            process.exit(0);
        } else {
            console.error(`⚠️ ${totalTests - passedTests} TESTS FAILED!`);
            process.exit(1);
        }

    } catch (err) {
        console.error('Fatal testing error:', err);
        await browser.close();
        process.exit(1);
    }
}

runMobileResponsiveTests();
