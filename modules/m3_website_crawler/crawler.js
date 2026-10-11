const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const { chromium } = require('playwright');
const { pool, LeadRepository } = require('../m1_storage/leadRepository');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const httpsAgent = new https.Agent({
    rejectUnauthorized: false
});

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

const EXCLUDED_EMAIL_DOMAINS = [
    'sentry.io', 'wixpress.com', 'example.com', 'domain.com', 
    'schema.org', 'w3.org', 'wordpress.org', 'cloudflare.com',
    'googleapis.com', 'gstatic.com', 'yourdomain.com', 'email.com'
];

const EXCLUDED_EMAIL_USERNAMES = [
    'you', 'user', 'name', 'test', 'admin', 'username', 'sample'
];

const EXCLUDED_EMAIL_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'];

const NAME_BLACKLIST = [
    'clinic', 'hospital', 'company', 'service', 'center', 'studio', 'shop',
    'print', 'dental', 'healthcare', 'team', 'office', 'store', 'board', 'group',
    'services', 'printing', 'management', 'support', 'contact', 'about', 'home',
    'quick quote', 'recent work', 'online', 'terms', 'privacy', 'policy', 'review'
];

function cleanUrl(rawUrl) {
    if (!rawUrl) return null;
    let url = rawUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    return url.replace(/\/+$/, '');
}

function decodeCloudflareEmail(encoded) {
    try {
        let email = "";
        let k = parseInt(encoded.substr(0, 2), 16);
        for (let i = 2; i < encoded.length; i += 2) {
            email += String.fromCharCode(parseInt(encoded.substr(i, 2), 16) ^ k);
        }
        return email;
    } catch (e) {
        return null;
    }
}

async function fetchPageWithPlaywright(url) {
    let browser = null;
    try {
        browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
        });
        const context = await browser.newContext({
            userAgent: USER_AGENT,
            viewport: { width: 1280, height: 800 }
        });
        const page = await context.newPage();
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
        const html = await page.content();
        const finalUrl = page.url();
        await browser.close();
        return { success: true, html, finalUrl };
    } catch (err) {
        if (browser) await browser.close();
        return { success: false, error: err.message };
    }
}

async function fetchPage(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 8000,
            httpsAgent: httpsAgent,
            maxRedirects: 5
        });
        return { success: true, html: response.data, finalUrl: response.request.res.responseUrl || url };
    } catch (err) {
        // If blocked by Cloudflare (403/503) or network error, fallback to headless browser
        const status = err.response ? err.response.status : null;
        if (status === 403 || status === 503 || err.code === 'ECONNRESET') {
            return await fetchPageWithPlaywright(url);
        }
        return { success: false, error: err.message };
    }
}


function extractEmails($, html) {
    const rawEmails = new Set();

    // 1. Decode Cloudflare Obfuscated Emails
    $('[data-cfemail]').each((_, el) => {
        const cf = $(el).attr('data-cfemail');
        const decoded = decodeCloudflareEmail(cf);
        if (decoded) rawEmails.add(decoded.toLowerCase());
    });

    // 2. Mailto links
    $('a[href^="mailto:"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const clean = href.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
        if (clean) rawEmails.add(clean);
    });

    // 3. Regex on body text
    const clean$ = cheerio.load(html);
    clean$('script, style, noscript, svg').remove();
    const bodyText = clean$('body').text();

    EMAIL_REGEX.lastIndex = 0;
    let match;
    while ((match = EMAIL_REGEX.exec(bodyText)) !== null) {
        rawEmails.add(match[0].toLowerCase().trim());
    }

    // Filter exclusions
    const validEmails = new Set();
    for (let email of rawEmails) {
        email = email.replace(/^%20/g, '').replace(/(telephone|phone|tel|email|contact|opening)$/i, '').trim();
        const parts = email.split('@');
        if (parts.length !== 2) continue;
        const [username, domain] = parts;

        const hasExcludedExt = EXCLUDED_EMAIL_EXTENSIONS.some(ext => email.endsWith(ext));
        const hasExcludedDomain = EXCLUDED_EMAIL_DOMAINS.some(dom => domain.includes(dom));
        const hasExcludedUser = EXCLUDED_EMAIL_USERNAMES.includes(username);

        if (!hasExcludedExt && !hasExcludedDomain && !hasExcludedUser && email.length < 50 && domain.includes('.')) {
            validEmails.add(email);
        }
    }

    return Array.from(validEmails);
}

function extractPhones($) {
    const phones = new Set();

    $('a[href^="tel:"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const clean = href.replace(/^tel:/i, '').trim();
        if (clean.length >= 7) phones.add(clean);
    });

    $('script, style, noscript, svg').remove();
    const text = $('body').text();
    const phoneRegex = /(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,5}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,5}/g;
    let pMatch;
    while ((pMatch = phoneRegex.exec(text)) !== null) {
        const p = pMatch[0].trim();
        if (p.length >= 9 && p.length <= 18 && !p.startsWith('19') && !p.startsWith('20')) {
            phones.add(p);
        }
    }

    return Array.from(phones);
}

function extractSocialLinks($) {
    const socials = {
        linkedin: null,
        facebook: null,
        instagram: null,
        twitter: null,
        whatsapp: null
    };

    $('a[href]').each((_, el) => {
        const href = ($(el).attr('href') || '').trim();
        if (!socials.whatsapp && (href.includes('wa.me/') || href.includes('whatsapp.com') || href.startsWith('whatsapp:'))) {
            const waMatch = href.match(/(?:wa\.me\/|phone=)([0-9+]+)/);
            socials.whatsapp = waMatch ? waMatch[1] : href;
        }
        if (!socials.linkedin && href.includes('linkedin.com/')) {
            socials.linkedin = href;
        }
        if (!socials.facebook && href.includes('facebook.com/') && !href.includes('sharer') && !href.includes('tr?id=')) {
            socials.facebook = href;
        }
        if (!socials.instagram && href.includes('instagram.com/')) {
            socials.instagram = href;
        }
        if (!socials.twitter && (href.includes('twitter.com/') || href.includes('x.com/'))) {
            socials.twitter = href;
        }
    });

    return socials;
}


function isValidPersonName(name) {
    if (!name || typeof name !== 'string') return false;
    const clean = name.trim();
    if (clean.length < 3 || clean.length > 35) return false;
    if (clean.toLowerCase().startsWith('the ')) return false;

    // Check blacklist
    const lower = clean.toLowerCase();
    for (const b of NAME_BLACKLIST) {
        if (lower.includes(b)) return false;
    }

    // Must consist of 2 to 4 words starting with capital letters
    const words = clean.split(/\s+/);
    if (words.length < 2 || words.length > 4) return false;

    return words.every(w => /^[A-Z][a-zA-Z.'-]*$/.test(w));
}

function extractLeadershipNames($) {
    const contacts = [];

    // 1. Schema.org JSON-LD structured data
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const data = JSON.parse($(el).html());
            const traverse = (obj) => {
                if (!obj || typeof obj !== 'object') return;
                if ((obj['@type'] === 'Person' || obj['@type'] === 'Dentist') && obj.name) {
                    if (isValidPersonName(obj.name)) {
                        contacts.push({
                            name: obj.name.trim(),
                            role: obj.jobTitle || 'Founder / Executive',
                            source: 'schema_jsonld'
                        });
                    }
                }
                if (obj.founder && obj.founder.name && isValidPersonName(obj.founder.name)) {
                    contacts.push({
                        name: obj.founder.name.trim(),
                        role: 'Founder',
                        source: 'schema_jsonld'
                    });
                }
                for (const k in obj) traverse(obj[k]);
            };
            traverse(data);
        } catch (e) {}
    });

    // 2. Meta authors
    const metaAuthor = $('meta[name="author"]').attr('content') || $('meta[name="creator"]').attr('content');
    if (metaAuthor && isValidPersonName(metaAuthor)) {
        contacts.push({ name: metaAuthor.trim(), role: 'Owner / Author', source: 'meta_tag' });
    }

    // 3. Team Member / Doctor HTML Cards
    const cardSelectors = [
        '.team-member', '.team-item', '.person', '.doctor', '.bio', 
        '.staff-member', '.member', '[class*="team"]', '[class*="staff"]', 
        '[class*="doctor"]', '[class*="leadership"]'
    ];
    $(cardSelectors.join(', ')).each((_, el) => {
        const h = $(el).find('h2, h3, h4, h5, strong, b').first().text().trim();
        const role = $(el).find('span, p, .role, .title, .position').text().trim();
        if (isValidPersonName(h)) {
            contacts.push({
                name: h,
                role: role || (h.startsWith('Dr') ? 'Doctor / Principal' : 'Team Leader'),
                source: 'team_card'
            });
        }
    });

    // 4. Text Pattern Matching
    const clean$ = cheerio.load($.html());
    clean$('script, style, noscript, svg').remove();
    const text = clean$('body').text().replace(/\s+/g, ' ');

    const leadershipPatterns = [
        // "Dr. John Doe"
        { regex: /(?:Prof\.\s*)?Dr\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/g, role: 'Doctor / Specialist' },
        // "Founder: John Doe" or "Managing Director - Jane Smith"
        { regex: /(?:Founder|Co-Founder|Owner|Director|Managing Director|General Manager|Principal|Proprietor|President|CEO)[\s:–—\-]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/gi, role: 'Owner / Director' },
        // "John Doe, Founder"
        { regex: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})[\s,–—\-]+(?:Founder|Co-Founder|Owner|Director|Managing Director|Principal|Proprietor|CEO)/g, role: 'Founder / Owner' },
        // "John Doe & Chris Leuty founded / in 2011"
        { regex: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:&|and)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:in\s+\d{4}|founded|established|started)/g, role: 'Co-Founder' },
        // "founded by John Doe"
        { regex: /(?:founded|established|started|owned|managed|directed|run)\s+(?:by\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/gi, role: 'Founder / Owner' }
    ];

    for (const item of leadershipPatterns) {
        let m;
        while ((m = item.regex.exec(text)) !== null) {
            if (m[1] && isValidPersonName(m[1])) {
                contacts.push({ name: m[1].trim(), role: item.role, source: 'text_pattern' });
            }
            if (m[2] && isValidPersonName(m[2])) {
                contacts.push({ name: m[2].trim(), role: item.role, source: 'text_pattern' });
            }
        }
    }

    // De-duplicate contacts by name
    const unique = [];
    const seenNames = new Set();
    for (const c of contacts) {
        const key = c.name.toLowerCase();
        if (!seenNames.has(key)) {
            seenNames.add(key);
            unique.push(c);
        }
    }

    return unique;
}

/**
 * Deep Crawl a target website across root and high-value subpages
 */
async function crawlWebsite(targetUrl, leadId = null) {
    const root = cleanUrl(targetUrl);
    if (!root) {
        return { success: false, error: 'Invalid URL provided' };
    }

    console.log(`\n🕸️ Crawling Website: ${root}`);

    const visited = new Set();
    const collectedEmails = new Set();
    const collectedPhones = new Set();
    const collectedContacts = [];
    let collectedSocials = { linkedin: null, facebook: null, instagram: null, twitter: null, whatsapp: null };
    let aboutTextPreview = '';

    // 1. Fetch Root Page
    visited.add(root);
    const rootRes = await fetchPage(root);


    let candidateSubpages = [
        `${root}/about`,
        `${root}/about-us`,
        `${root}/contact`,
        `${root}/contact-us`,
        `${root}/our-team`,
        `${root}/team`,
        `${root}/doctors`,
        `${root}/meet-the-team`
    ];

    if (rootRes.success) {
        const $ = cheerio.load(rootRes.html);

        extractEmails($, rootRes.html).forEach(e => collectedEmails.add(e));
        extractPhones($).forEach(p => collectedPhones.add(p));
        extractLeadershipNames($).forEach(c => collectedContacts.push(c));
        const socials = extractSocialLinks($);
        if (socials.linkedin) collectedSocials.linkedin = socials.linkedin;
        if (socials.facebook) collectedSocials.facebook = socials.facebook;
        if (socials.instagram) collectedSocials.instagram = socials.instagram;
        if (socials.twitter) collectedSocials.twitter = socials.twitter;

        // Dynamically discover candidate links matching about, contact, team, leadership, founder
        $('a[href]').each((_, el) => {
            const href = ($(el).attr('href') || '').trim();
            const lower = href.toLowerCase();
            if (lower.match(/(?:about|contact|team|meet|people|leadership|founder|who-we-are|story|management|staff|doctors|dentists)/)) {
                let fullUrl = href;
                if (href.startsWith('/')) {
                    fullUrl = root + href;
                } else if (!href.startsWith('http')) {
                    fullUrl = `${root}/${href}`;
                }
                if (fullUrl.startsWith(root) && !visited.has(fullUrl)) {
                    candidateSubpages.unshift(fullUrl);
                }
            }
        });
    }

    // Crawl up to 3 candidate subpages
    const uniqueSubpages = Array.from(new Set(candidateSubpages)).slice(0, 3);

    for (const subUrl of uniqueSubpages) {
        if (visited.has(subUrl)) continue;
        visited.add(subUrl);

        console.log(` ↳ Crawling Subpage: ${subUrl}`);
        const subRes = await fetchPage(subUrl);
        if (subRes.success) {
            const $sub = cheerio.load(subRes.html);

            extractEmails($sub, subRes.html).forEach(e => collectedEmails.add(e));
            extractPhones($sub).forEach(p => collectedPhones.add(p));
            extractLeadershipNames($sub).forEach(c => collectedContacts.push(c));
            const subSocials = extractSocialLinks($sub);
            if (!collectedSocials.linkedin && subSocials.linkedin) collectedSocials.linkedin = subSocials.linkedin;
            if (!collectedSocials.facebook && subSocials.facebook) collectedSocials.facebook = subSocials.facebook;
            if (!collectedSocials.instagram && subSocials.instagram) collectedSocials.instagram = subSocials.instagram;
            if (!collectedSocials.twitter && subSocials.twitter) collectedSocials.twitter = subSocials.twitter;
            if (!collectedSocials.whatsapp && subSocials.whatsapp) collectedSocials.whatsapp = subSocials.whatsapp;

            if (subUrl.includes('about') || subUrl.includes('team') || subUrl.includes('leadership') || subUrl.includes('founder') || subUrl.includes('contact')) {
                const textClone = cheerio.load(subRes.html);
                textClone('script, style, noscript, svg, nav, footer').remove();
                aboutTextPreview += ' ' + textClone('body').text().replace(/\s+/g, ' ').substring(0, 1500);
            }
        }
    }

    // De-duplicate contacts
    const finalContacts = [];
    const seenContacts = new Set();
    for (const c of collectedContacts) {
        const k = c.name.toLowerCase();
        if (!seenContacts.has(k)) {
            seenContacts.add(k);
            finalContacts.push(c);
        }
    }

    const emailList = Array.from(collectedEmails);
    const phoneList = Array.from(collectedPhones);

    const result = {
        success: true,
        url: root,
        pages_checked: visited.size,
        emails: emailList,
        phones: phoneList,
        contacts: finalContacts,
        doctor_names: finalContacts.filter(c => c.name.startsWith('Dr')).map(c => c.name),
        social_links: collectedSocials,
        aboutTextPreview: aboutTextPreview.trim()
    };


    // If leadId provided, save directly to Supabase decision_makers table
    if (leadId) {
        const primaryEmail = emailList[0] || null;
        const primaryPhone = phoneList[0] || null;

        if (finalContacts.length > 0) {
            // Save each discovered leader (up to 3)
            for (let i = 0; i < Math.min(finalContacts.length, 3); i++) {
                const leader = finalContacts[i];
                await LeadRepository.addDecisionMaker(leadId, {
                    full_name: leader.name,
                    title_role: leader.role || 'Business Owner',
                    email: i === 0 ? primaryEmail : (emailList[i] || null),
                    phone: i === 0 ? primaryPhone : (phoneList[i] || null),
                    email_source: 'website_crawl',
                    linkedin_url: collectedSocials.linkedin,
                    facebook_url: collectedSocials.facebook,
                    instagram_url: collectedSocials.instagram,
                    confidence_score: leader.name.startsWith('Dr') ? 85 : 80
                });
            }
        } else if (primaryEmail || primaryPhone || collectedSocials.linkedin || collectedSocials.facebook) {
            // If no individual name found, save as primary business management with discovered contact methods
            await LeadRepository.addDecisionMaker(leadId, {
                full_name: 'Business Leadership / Owner',
                title_role: 'Owner / Management',
                email: primaryEmail,
                phone: primaryPhone,
                email_source: 'website_crawl',
                linkedin_url: collectedSocials.linkedin,
                facebook_url: collectedSocials.facebook,
                instagram_url: collectedSocials.instagram,
                confidence_score: primaryEmail ? 75 : 65
            });
        }

        // Update lead status to enriched
        await pool.query(`UPDATE leads SET status = 'enriched', updated_at = NOW() WHERE id = $1`, [leadId]);
    }

    console.log(`✅ Crawl finished for ${root}: ${emailList.length} emails, ${finalContacts.length} leadership contacts.`);
    return result;
}

module.exports = {
    crawlWebsite,
    extractEmails,
    extractPhones,
    extractSocialLinks,
    extractLeadershipNames,
    cleanUrl
};
