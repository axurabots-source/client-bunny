const { chromium } = require('playwright');
const { generateDorkQueries } = require('./dorkGenerator');
const { LeadRepository } = require('../m1_storage/leadRepository');

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

function decodeBingUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
        const match = rawUrl.match(/u=a1([a-zA-Z0-9_\-=]+)/);
        if (match) {
            let b64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
            while (b64.length % 4 !== 0) b64 += '=';
            return Buffer.from(b64, 'base64').toString('utf-8');
        }
    } catch (e) {}
    return rawUrl;
}

function nameFromLinkedInUrl(linkedinUrl) {
    if (!linkedinUrl) return null;
    try {
        const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
        if (match) {
            let slug = match[1].replace(/-[a-f0-9]{6,}$/i, '').replace(/-\d+$/, '');
            let words = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1));
            return words.join(' ');
        }
    } catch (e) {}
    return null;
}

/**
 * Execute Dork Search via Playwright
 */
async function resolveDorkContacts(businessTitle, city = 'Lahore', leadId = null) {
    console.log(`\n🕵️‍♂️ Running Zero-Cost Dork Resolver for: "${businessTitle}" in ${city}`);
    const queries = generateDorkQueries(businessTitle, city);

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
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport: { width: 1280, height: 720 }
        });

        const page = await context.newPage();

        // Target Dork 1: LinkedIn profiles
        const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(queries.linkedinOwner)}`;
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
        await page.waitForTimeout(2000);

        const rawResults = await page.evaluate(() => {
            const list = [];
            document.querySelectorAll('li.b_algo, .b_algo').forEach(el => {
                const a = el.querySelector('h2 a, a[href^="http"]');
                const p = el.querySelector('.b_caption p, p');
                if (a) {
                    list.push({
                        href: a.href,
                        title: a.innerText || '',
                        snippet: p ? p.innerText : ''
                    });
                }
            });
            return list;
        });

        rawResults.forEach(r => {
            const decodedUrl = decodeBingUrl(r.href);
            if (decodedUrl.includes('linkedin.com/in/')) {
                const detectedName = nameFromLinkedInUrl(decodedUrl) || r.title.split('-')[0].trim();
                discovered.linkedinProfiles.push({
                    url: decodedUrl,
                    name: detectedName,
                    snippet: r.snippet
                });
            } else if (decodedUrl.includes('facebook.com/')) {
                discovered.facebookUrls.push(decodedUrl);
            }

            // Extract emails from snippets
            const textToScan = `${r.title} ${r.snippet}`;
            let emailMatch;
            EMAIL_REGEX.lastIndex = 0;
            while ((emailMatch = EMAIL_REGEX.exec(textToScan)) !== null) {
                const email = emailMatch[0].toLowerCase().trim();
                if (!discovered.directEmails.includes(email)) {
                    discovered.directEmails.push(email);
                }
            }
        });

        // Target Dork 2: Facebook & Email check if no LinkedIn profile found
        if (discovered.linkedinProfiles.length === 0) {
            const fbSearchUrl = `https://www.bing.com/search?q=${encodeURIComponent(queries.facebookContact)}`;
            await page.goto(fbSearchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
            await page.waitForTimeout(2000);

            const fbResults = await page.evaluate(() => {
                const list = [];
                document.querySelectorAll('li.b_algo, .b_algo').forEach(el => {
                    const a = el.querySelector('h2 a, a[href^="http"]');
                    const p = el.querySelector('.b_caption p, p');
                    if (a) {
                        list.push({ href: a.href, title: a.innerText || '', snippet: p ? p.innerText : '' });
                    }
                });
                return list;
            });

            fbResults.forEach(r => {
                const decodedUrl = decodeBingUrl(r.href);
                if (decodedUrl.includes('facebook.com/') && !discovered.facebookUrls.includes(decodedUrl)) {
                    discovered.facebookUrls.push(decodedUrl);
                }
            });
        }

    } catch (err) {
        console.error("Dork search execution error:", err.message);
    } finally {
        if (browser) await browser.close();
    }

    // De-duplicate
    discovered.linkedinProfiles = discovered.linkedinProfiles.slice(0, 3);
    discovered.facebookUrls = discovered.facebookUrls.slice(0, 2);

    // Save to Supabase if leadId provided
    if (leadId) {
        const topProfile = discovered.linkedinProfiles[0];
        const topEmail = discovered.directEmails[0] || null;
        const topFb = discovered.facebookUrls[0] || null;

        if (topProfile || topEmail || topFb) {
            const contactName = topProfile ? topProfile.name : 'Business Owner / Doctor';

            await LeadRepository.addDecisionMaker(leadId, {
                full_name: contactName,
                title_role: contactName.toLowerCase().includes('dr') ? 'Doctor / Founder' : 'Owner',
                email: topEmail,
                email_source: 'google_dork',
                linkedin_url: topProfile ? topProfile.url : null,
                facebook_url: topFb,
                confidence_score: 65
            });

            // Mark lead status as enriched
            const { pool } = require('../m1_storage/leadRepository');
            await pool.query(`UPDATE leads SET status = 'enriched', updated_at = NOW() WHERE id = $1`, [leadId]);
        }
    }

    return discovered;
}

module.exports = {
    resolveDorkContacts,
    decodeBingUrl,
    nameFromLinkedInUrl
};
