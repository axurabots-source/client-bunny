const http = require('http');
const { chromium } = require('playwright');

function fetchUrl(path) {
    return new Promise((resolve, reject) => {
        http.get(`http://localhost:3000${path}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({ status: res.statusCode, headers: res.headers, body: data });
            });
        }).on('error', reject);
    });
}

async function runPwaTests() {
    console.log("=================================================");
    console.log("🚀 TESTING CLIENT BUNNY PWA READINESS & COMPLIANCE");
    console.log("=================================================");

    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`✅ PASS: ${message}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${message}`);
            failed++;
        }
    }

    // 1. Manifest.json Verification
    console.log("\n[1/4] Verifying Web App Manifest...");
    const manifestRes = await fetchUrl('/manifest.json');
    assert(manifestRes.status === 200, "GET /manifest.json returns 200 OK");
    let manifest;
    try {
        manifest = JSON.parse(manifestRes.body);
        assert(true, "manifest.json is valid JSON");
    } catch (e) {
        assert(false, "manifest.json parsing failed: " + e.message);
    }

    if (manifest) {
        assert(!!manifest.name, `Manifest has name: "${manifest.name}"`);
        assert(!!manifest.short_name, `Manifest has short_name: "${manifest.short_name}"`);
        assert(manifest.display === 'standalone', `Manifest display is standalone: "${manifest.display}"`);
        assert(manifest.start_url === '/?source=pwa', `Manifest start_url is defined: "${manifest.start_url}"`);
        assert(manifest.theme_color === '#0A0A0A', `Manifest theme_color is defined: "${manifest.theme_color}"`);
        assert(Array.isArray(manifest.icons) && manifest.icons.length >= 8, `Manifest has ${manifest.icons.length} icon definitions`);
        
        const has192 = manifest.icons.some(i => i.sizes === '192x192' && i.purpose === 'any');
        const has192Maskable = manifest.icons.some(i => i.sizes === '192x192' && i.purpose === 'maskable');
        const has512 = manifest.icons.some(i => i.sizes === '512x512' && i.purpose === 'any');
        const has512Maskable = manifest.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable');

        assert(has192, "Manifest includes 192x192 standard icon");
        assert(has192Maskable, "Manifest includes 192x192 maskable icon");
        assert(has512, "Manifest includes 512x512 standard icon");
        assert(has512Maskable, "Manifest includes 512x512 maskable icon");
    }

    // 2. Service Worker File Verification
    console.log("\n[2/4] Verifying Service Worker (/sw.js)...");
    const swRes = await fetchUrl('/sw.js');
    assert(swRes.status === 200, "GET /sw.js returns 200 OK");
    assert(swRes.body.includes("CACHE_NAME = 'client-bunny-v1.0.0'"), "sw.js contains cache versioning");
    assert(swRes.body.includes("addEventListener('install'"), "sw.js contains install event listener");
    assert(swRes.body.includes("addEventListener('activate'"), "sw.js contains activate event listener");
    assert(swRes.body.includes("addEventListener('fetch'"), "sw.js contains fetch event listener");

    // 3. Icon HTTP Assets Verification
    console.log("\n[3/4] Verifying Icon Files on Server...");
    const iconFiles = [
        '/icons/icon-72.png',
        '/icons/icon-96.png',
        '/icons/icon-128.png',
        '/icons/icon-144.png',
        '/icons/icon-152.png',
        '/icons/apple-touch-icon.png',
        '/icons/icon-192.png',
        '/icons/icon-192-maskable.png',
        '/icons/icon-384.png',
        '/icons/icon-512.png',
        '/icons/icon-512-maskable.png',
        '/icons/icon.svg',
        '/icons/favicon-32.png',
        '/icons/favicon-16.png'
    ];

    for (const iconPath of iconFiles) {
        const iconRes = await fetchUrl(iconPath);
        assert(iconRes.status === 200, `Asset ${iconPath} is accessible (200 OK)`);
    }

    // 4. End-to-End Headless Browser Validation with Playwright
    console.log("\n[4/4] Executing Headless Browser PWA E2E Test...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });

    // Check DOM manifest link
    const manifestLink = await page.$('link[rel="manifest"]');
    assert(!!manifestLink, 'HTML head contains <link rel="manifest" href="/manifest.json">');

    // Check DOM theme-color meta
    const themeColor = await page.$('meta[name="theme-color"]');
    assert(!!themeColor, 'HTML head contains <meta name="theme-color">');

    // Check Apple Touch Icon
    const appleIcon = await page.$('link[rel="apple-touch-icon"]');
    assert(!!appleIcon, 'HTML head contains <link rel="apple-touch-icon">');

    // Wait for Service Worker registration
    const swRegistration = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return null;
        const reg = await navigator.serviceWorker.getRegistration();
        return reg ? { scope: reg.scope, active: !!reg.active } : null;
    });

    assert(!!swRegistration, "Service Worker registered in browser");
    if (swRegistration) {
        assert(swRegistration.scope === 'http://localhost:3000/', `SW scope matches origin: ${swRegistration.scope}`);
    }

    // Test Offline Mode simulation
    await page.evaluate(() => {
        window.dispatchEvent(new Event('offline'));
    });
    const offlineBadgeVisible = await page.$eval('#pwaOfflineBadge', el => el.style.display !== 'none');
    assert(offlineBadgeVisible, "Offline event triggers sleek 'Offline Mode' badge in header");

    await page.evaluate(() => {
        window.dispatchEvent(new Event('online'));
    });
    const offlineBadgeHidden = await page.$eval('#pwaOfflineBadge', el => el.style.display === 'none');
    assert(offlineBadgeHidden, "Online event automatically hides offline badge");

    // Test True Offline Navigation via Service Worker Cache
    console.log("\n[5/5] Testing Complete Offline Navigation via Cache...");
    await page.waitForTimeout(1000);
    await context.setOffline(true);

    try {
        await page.reload({ waitUntil: 'domcontentloaded' });
        const appTitle = await page.title();
        assert(appTitle.includes('Client Bunny'), `Page reloaded successfully in 100% offline mode: "${appTitle}"`);
    } catch (e) {
        assert(false, `Offline reload failed: ${e.message}`);
    } finally {
        await context.setOffline(false);
    }

    await browser.close();

    console.log("\n=================================================");
    console.log(`🏁 PWA TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runPwaTests().catch(err => {
    console.error("Test runner exception:", err);
    process.exit(1);
});
