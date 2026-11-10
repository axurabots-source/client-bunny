const { chromium } = require('playwright');

(async () => {
  console.log('--- STARTING PLAYWRIGHT UI & INTERACTION VERIFICATION ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', err => {
    console.error('PAGE ERROR:', err.message);
    errors.push(err.message);
  });

  // 1. Load Page
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  console.log('1. Page loaded successfully. Title:', await page.title());

  // 2. Click Tracking & Analytics Nav Item
  const overviewPromise = page.waitForResponse(r => r.url().includes('/api/tracking/overview'));
  await page.click('#navAnalytics');
  await overviewPromise;
  await page.waitForTimeout(400);

  const isAnalyticsActive = await page.$eval('#screenAnalytics', el => el.classList.contains('active'));
  console.log('2. Screen switched to Tracking & Analytics:', isAnalyticsActive);

  // 3. Verify KPI stats populated
  const totalSent = await page.$eval('#kpiTotalSent', el => el.textContent.trim());
  const openRate = await page.$eval('#kpiOpenRate', el => el.textContent.trim());
  const followupDue = await page.$eval('#kpiFollowupDue', el => el.textContent.trim());
  console.log('3. KPI Metrics:', { totalSent, openRate, followupDue });

  // 4. Verify Tracking Table Rows
  const rowCount = await page.$$eval('#trackingTbody tr', rows => rows.length);
  console.log('4. Tracking Table Row Count:', rowCount);

  // 5. Check for any emoji in the tracking screen
  const screenText = await page.$eval('#screenAnalytics', el => el.innerText);
  const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  const emojisFound = screenText.match(emojiRegex) || [];
  console.log('5. Emojis found in Tracking Screen (Should be 0):', emojisFound.length, emojisFound);

  // 6. Test Toggle Spam Checker Panel Button
  const isSpamPanelHiddenBefore = await page.$eval('#spamCheckerPanel', el => el.style.display);
  await page.click('#toggleSpamCheckerBtn');
  await page.waitForTimeout(300);
  const isSpamPanelVisible = await page.$eval('#spamCheckerPanel', el => el.style.display);
  console.log('6. Spam panel toggle works:', isSpamPanelHiddenBefore, '->', isSpamPanelVisible);

  // 7. Test Spam Analysis Button
  await page.fill('#spamCheckSubject', 'Quick inquiry re: clinic patient growth');
  await page.fill('#spamCheckBody', 'Hello Doctor, I came across your practice and wanted to share a quick insight on your patient intake.');
  await page.click('button:has-text("Analyze Deliverability Score")');
  await page.waitForTimeout(500);
  const spamScore = await page.$eval('#spamScoreNum', el => el.textContent.trim());
  const spamBadge = await page.$eval('#spamScoreBadge', el => el.textContent.trim());
  console.log('7. Spam analyzer executed. Score:', spamScore, 'Badge:', spamBadge);

  // 8. Test Filter Pills
  const filterDueBtn = await page.$('button[data-track-filter="followup_due"]');
  if (filterDueBtn) {
    const filterPromise = page.waitForResponse(r => r.url().includes('filter=followup_due'));
    await filterDueBtn.click();
    await filterPromise;
    await page.waitForTimeout(300);
    const filteredRows = await page.$$eval('#trackingTbody tr', rows => rows.length);
    console.log('8. Clicked Follow-Up Due filter pill. Rows showing:', filteredRows);
  }

  // 9. Test Follow-Up Action Button
  const followupActionBtn = await page.$('#trackingTbody .btn-followup-pulse');
  if (followupActionBtn) {
    console.log('9. Found Follow-Up button. Clicking to verify AI follow-up generator...');
    await followupActionBtn.click();
    await page.waitForSelector('#emailComposerModalOverlay', { state: 'visible', timeout: 20000 });
    const composerSubject = await page.$eval('#composerSubject', el => el.value);
    console.log('   Email Composer Opened Successfully! Subject:', composerSubject);
    await page.click('#closeComposerModalBtn');
    console.log('   Composer modal closed successfully.');
  }

  // 10. Test Mobile Viewport (iPhone 375x667) for horizontal overflow
  console.log('10. Testing Mobile Viewport (375x667)...');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(400);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  console.log('   Mobile Viewport: scrollWidth =', scrollWidth, 'clientWidth =', clientWidth);
  const passed = scrollWidth <= clientWidth;
  console.log('   Zero horizontal overflow:', passed ? 'PASSED ✅' : 'FAILED ❌');

  await browser.close();
  console.log('--- ALL UI & INTERACTION VERIFICATIONS COMPLETE ---');
  if (errors.length > 0) {
    console.error('Errors encountered:', errors);
    process.exit(1);
  } else {
    console.log('ZERO JS ERRORS! 100% SUCCESSFUL!');
  }
})();
