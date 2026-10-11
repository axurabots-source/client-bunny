const { chromium } = require('playwright');
const { pool, LeadRepository } = require('../m1_storage/leadRepository');

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

function decodeSearchUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
        if (rawUrl.includes('/RU=')) {
            const match = rawUrl.match(/\/RU=([^/]+)\/RK=/);
            if (match) return decodeURIComponent(match[1]);
        }
        if (rawUrl.includes('u=a1')) {
            const match = rawUrl.match(/u=a1([a-zA-Z0-9_\-=]+)/);
            if (match) {
                let b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
                while (b64.length % 4 !== 0) b64 += '=';
                return Buffer.from(b64, 'base64').toString('utf-8');
            }
        }
    } catch (e) {}
    return rawUrl;
}

function cleanTitleText(raw) {
    if (!raw) return '';
    let t = raw;
    t = t.replace(/^.*[›»]\s*/g, '');
    t = t.replace(/^[a-z0-9_-]+(?=[A-Z])/g, '');
    t = t.replace(/\s*\|\s*LinkedIn.*$/i, '');
    t = t.replace(/\s*-\s*LinkedIn.*$/i, '');
    return t.trim();
}

function parseNameAndRole(title, companyName) {
    const clean = cleanTitleText(title);
    const parts = clean.split(/\s*[-–—|]\s*/);
    if (parts.length >= 2) {
        let name = parts[0].trim();
        let role = parts[1].trim();
        const normCompany = (companyName || '').toLowerCase().replace(/[^\w]/g, '');
        const normP1 = name.toLowerCase().replace(/[^\w]/g, '');
        if (normCompany && normP1.includes(normCompany) && parts[1]) {
            name = parts[1].trim();
            role = parts[2] ? parts[2].trim() : 'Executive / Owner';
        }
        return { name, role: role.length < 60 ? role : 'Executive / Owner' };
    }
    return { name: clean, role: 'Owner' };
}

async function searchEngine(page, searchUrl, itemSelector) {
    try {
        await page.goto(searchUrl, { waitUntil: 'load', timeout: 15000 });
        await page.waitForTimeout(1000);

        const consent = await page.$('button[name="agree"], button:has-text("Accept all"), button:has-text("I agree"), #bnp_btn_accept');
        if (consent) {
            await consent.click().catch(() => {});
            await page.waitForTimeout(1000);
        }

        return await page.$$eval(itemSelector, els => {
            return els.map(el => {
                const a = el.tagName === 'A' ? el : el.querySelector('h3 a, h2 a, a[href^="http"]');
                const title = a ? a.textContent.trim() : '';
                const href = a ? a.href : '';
                const p = el.querySelector('.compText, .b_caption p, .b_snippet, p');
                const snippet = p ? p.textContent.trim() : '';
                return (title && href) ? { title, href, snippet } : null;
            }).filter(Boolean);
        });
    } catch (e) {
        return [];
    }
}


/**
 * Execute Multi-Engine Dork Search (Yahoo + Bing) via Playwright
 */
async function resolveDorkContacts(businessTitle, city = 'Lahore', leadId = null) {
    console.log(`\n🕵️‍♂️ Running Targeted Search Dork for: "${businessTitle}" in ${city}`);
    const cleanTitle = (businessTitle || '').replace(/[^\w\s-]/g, '').trim();

    let browser = null;
    const discovered = {
        linkedinProfiles: [],
        facebookUrls: [],
        directEmails: [],
        snippets: []
    };

    try {
        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled'
            ]
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 800 }
        });

        const page = await context.newPage();

        // 1. Primary Engine: Yahoo Search for LinkedIn
        const q1 = `${cleanTitle} ${city} linkedin`;
        const yahooItems = await searchEngine(
            page,
            `https://search.yahoo.com/search?p=${encodeURIComponent(q1)}`,
            '#main .rel-search, #web ol li, li.first, li div h3 a, div.compTitle h3 a'
        );

        for (const item of yahooItems) {
            const url = decodeSearchUrl(item.href);
            if (url.includes('linkedin.com/in/') || url.includes('linkedin.com/company/')) {
                const parsed = parseNameAndRole(item.title, cleanTitle);
                if (!discovered.linkedinProfiles.some(p => p.url === url)) {
                    discovered.linkedinProfiles.push({
                        url,
                        name: parsed.name,
                        role: parsed.role,
                        snippet: item.snippet,
                        isPersonal: url.includes('linkedin.com/in/')
                    });
                }
            } else if (url.includes('facebook.com/') && !url.includes('sharer')) {
                if (!discovered.facebookUrls.includes(url)) discovered.facebookUrls.push(url);
            }

            // Extract emails from snippets
            const textToScan = `${item.title} ${item.snippet}`;
            let emailMatch;
            EMAIL_REGEX.lastIndex = 0;
            while ((emailMatch = EMAIL_REGEX.exec(textToScan)) !== null) {
                const email = emailMatch[0].toLowerCase().trim();
                if (!discovered.directEmails.includes(email) && !email.includes('sentry.io') && !email.includes('example.com')) {
                    discovered.directEmails.push(email);
                }
            }
        }

        // 2. Secondary Engine: Bing Search Fallback if no personal profile found
        const hasPersonalProfile = discovered.linkedinProfiles.some(p => p.isPersonal);
        if (!hasPersonalProfile) {
            const bingItems = await searchEngine(
                page,
                `https://www.bing.com/search?q=${encodeURIComponent(q1)}&setlang=en&setmkt=en-US`,
                'li.b_algo'
            );

            for (const item of bingItems) {
                const url = decodeSearchUrl(item.href);
                if (url.includes('linkedin.com/in/') || url.includes('linkedin.com/company/')) {
                    const parsed = parseNameAndRole(item.title, cleanTitle);
                    if (!discovered.linkedinProfiles.some(p => p.url === url)) {
                        discovered.linkedinProfiles.push({
                            url,
                            name: parsed.name,
                            role: parsed.role,
                            snippet: item.snippet,
                            isPersonal: url.includes('linkedin.com/in/')
                        });
                    }
                } else if (url.includes('facebook.com/') && !url.includes('sharer')) {
                    if (!discovered.facebookUrls.includes(url)) discovered.facebookUrls.push(url);
                }
            }
        }

        // 3. Search Facebook specifically if still missing
        if (discovered.facebookUrls.length === 0) {
            const qFb = `${cleanTitle} ${city} facebook`;
            const fbItems = await searchEngine(
                page,
                `https://search.yahoo.com/search?p=${encodeURIComponent(qFb)}`,
                '#main .rel-search, #web ol li, li.first, li div h3 a, div.compTitle h3 a'
            );

            for (const item of fbItems) {
                const url = decodeSearchUrl(item.href);
                if (url.includes('facebook.com/') && !url.includes('sharer') && !discovered.facebookUrls.includes(url)) {
                    discovered.facebookUrls.push(url);
                }
            }
        }

    } catch (err) {
        console.error("Dork search execution error:", err.message);
    } finally {
        if (browser) await browser.close();
    }

    // Sort LinkedIn profiles: personal profiles (/in/) first
    discovered.linkedinProfiles.sort((a, b) => (b.isPersonal ? 1 : 0) - (a.isPersonal ? 1 : 0));
    discovered.linkedinProfiles = discovered.linkedinProfiles.slice(0, 3);
    discovered.facebookUrls = discovered.facebookUrls.slice(0, 2);

    // Save Top Decision Maker to Supabase if leadId provided
    if (leadId) {
        const topProfile = discovered.linkedinProfiles[0] || null;
        const topEmail = discovered.directEmails[0] || null;
        const topFb = discovered.facebookUrls[0] || null;

        if (topProfile || topEmail || topFb) {
            const contactName = topProfile && topProfile.name ? topProfile.name : 'Business Owner';
            const role = topProfile && topProfile.role ? topProfile.role : 'Owner';

            await LeadRepository.addDecisionMaker(leadId, {
                full_name: contactName,
                title_role: role,
                email: topEmail,
                email_source: 'google_dork',
                linkedin_url: topProfile ? topProfile.url : null,
                facebook_url: topFb,
                confidence_score: topProfile ? (topProfile.isPersonal ? 85 : 70) : 60
            });

            await pool.query(`UPDATE leads SET status = 'enriched', updated_at = NOW() WHERE id = $1`, [leadId]);
        }
    }

    console.log(`✅ Dork complete for ${businessTitle}: ${discovered.linkedinProfiles.length} LinkedIn, ${discovered.facebookUrls.length} FB, ${discovered.directEmails.length} emails.`);
    return discovered;
}

module.exports = {
    resolveDorkContacts,
    decodeSearchUrl,
    parseNameAndRole
};
