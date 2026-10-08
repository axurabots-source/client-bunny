const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const { LeadRepository } = require('../m1_storage/leadRepository');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const httpsAgent = new https.Agent({
    rejectUnauthorized: false // Don't crash on self-signed / expired clinic certs
});

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

const EXCLUDED_EMAIL_DOMAINS = [
    'sentry.io', 'wixpress.com', 'example.com', 'domain.com', 
    'schema.org', 'w3.org', 'wordpress.org', 'cloudflare.com',
    'googleapis.com', 'gstatic.com'
];

const EXCLUDED_EMAIL_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'];

function cleanUrl(rawUrl) {
    if (!rawUrl) return null;
    let url = rawUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    return url.replace(/\/+$/, '');
}

async function fetchPage(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            },
            timeout: 7000,
            httpsAgent: httpsAgent,
            maxRedirects: 5
        });
        return { success: true, html: response.data, finalUrl: response.request.res.responseUrl || url };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

function extractEmails(text, html) {
    const rawEmails = new Set();
    const combined = `${text} ${html}`;
    let match;

    // Reset regex
    EMAIL_REGEX.lastIndex = 0;
    while ((match = EMAIL_REGEX.exec(combined)) !== null) {
        const email = match[0].toLowerCase().trim();

        // Check exclusions
        const hasExcludedExt = EXCLUDED_EMAIL_EXTENSIONS.some(ext => email.endsWith(ext));
        const hasExcludedDomain = EXCLUDED_EMAIL_DOMAINS.some(dom => email.includes(dom));

        if (!hasExcludedExt && !hasExcludedDomain && email.length < 50) {
            rawEmails.add(email);
        }
    }

    return Array.from(rawEmails);
}

function extractSocialLinks($) {
    const socials = {
        linkedin: null,
        facebook: null,
        instagram: null
    };

    $('a[href]').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (!socials.linkedin && href.includes('linkedin.com/')) {
            socials.linkedin = href.trim();
        }
        if (!socials.facebook && href.includes('facebook.com/') && !href.includes('sharer')) {
            socials.facebook = href.trim();
        }
        if (!socials.instagram && href.includes('instagram.com/')) {
            socials.instagram = href.trim();
        }
    });

    return socials;
}

function extractDoctorNames($) {
    const names = new Set();

    // Look for headings and strong tags with Doctor / Founder
    $('h1, h2, h3, h4, h5, strong, b, .doctor-name, .team-name').each((_, el) => {
        const text = $(el).text().replace(/\s+/g, ' ').trim();
        
        // Match patterns like "Dr. John Doe" or "Prof. Dr. ..."
        const drMatch = text.match(/(?:Prof\.\s*)?Dr\.?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/);
        if (drMatch) {
            const clean = drMatch[0].trim();
            if (clean.length < 40 && !clean.toLowerCase().includes('clinic') && !clean.toLowerCase().includes('hospital')) {
                names.add(clean);
            }
        }
    });

    return Array.from(names);
}

/**
 * Deep Crawl a target website
 */
async function crawlWebsite(targetUrl, leadId = null) {
    const root = cleanUrl(targetUrl);
    if (!root) {
        return { success: false, error: 'Invalid URL provided' };
    }

    console.log(`\n🕸️ Crawling Website: ${root}`);

    const visited = new Set();
    const collectedEmails = new Set();
    const collectedDoctors = new Set();
    let collectedSocials = { linkedin: null, facebook: null, instagram: null };

    // 1. Fetch Root Page
    visited.add(root);
    const rootRes = await fetchPage(root);

    let candidateSubpages = [
        `${root}/about`,
        `${root}/about-us`,
        `${root}/contact`,
        `${root}/contact-us`,
        `${root}/our-team`,
        `${root}/doctors`
    ];

    if (rootRes.success) {
        const $ = cheerio.load(rootRes.html);
        const text = $('body').text();

        // Extract from Homepage
        extractEmails(text, rootRes.html).forEach(e => collectedEmails.add(e));
        extractDoctorNames($).forEach(d => collectedDoctors.add(d));
        const socials = extractSocialLinks($);
        if (socials.linkedin) collectedSocials.linkedin = socials.linkedin;
        if (socials.facebook) collectedSocials.facebook = socials.facebook;
        if (socials.instagram) collectedSocials.instagram = socials.instagram;

        // Discover internal about/contact links
        $('a[href]').each((_, el) => {
            const href = $(el).attr('href') || '';
            const lower = href.toLowerCase();
            if (lower.includes('about') || lower.includes('contact') || lower.includes('team') || lower.includes('doctor')) {
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

    // De-duplicate candidate subpages and crawl up to 2 high-value subpages
    const uniqueSubpages = Array.from(new Set(candidateSubpages)).slice(0, 3);

    for (const subUrl of uniqueSubpages) {
        if (visited.has(subUrl)) continue;
        visited.add(subUrl);

        console.log(` ↳ Checking: ${subUrl}`);
        const subRes = await fetchPage(subUrl);
        if (subRes.success) {
            const $sub = cheerio.load(subRes.html);
            const subText = $sub('body').text();

            extractEmails(subText, subRes.html).forEach(e => collectedEmails.add(e));
            extractDoctorNames($sub).forEach(d => collectedDoctors.add(d));
            const subSocials = extractSocialLinks($sub);
            if (!collectedSocials.linkedin && subSocials.linkedin) collectedSocials.linkedin = subSocials.linkedin;
            if (!collectedSocials.facebook && subSocials.facebook) collectedSocials.facebook = subSocials.facebook;
            if (!collectedSocials.instagram && subSocials.instagram) collectedSocials.instagram = subSocials.instagram;
        }
    }

    const result = {
        success: true,
        url: root,
        pages_checked: visited.size,
        emails: Array.from(collectedEmails),
        doctor_names: Array.from(collectedDoctors),
        social_links: collectedSocials
    };

    // If leadId provided, save directly to Supabase decision_makers table
    if (leadId) {
        // Save primary doctor or generic decision maker
        const primaryName = result.doctor_names[0] || 'Clinic Management / Owner';
        const primaryEmail = result.emails[0] || null;

        if (primaryEmail || result.doctor_names.length > 0 || collectedSocials.linkedin) {
            await LeadRepository.addDecisionMaker(leadId, {
                full_name: primaryName,
                title_role: primaryName.startsWith('Dr') ? 'Principal Dentist / Owner' : 'Business Owner',
                email: primaryEmail,
                email_source: 'website_crawl',
                linkedin_url: collectedSocials.linkedin,
                facebook_url: collectedSocials.facebook,
                instagram_url: collectedSocials.instagram,
                confidence_score: 75
            });

            // Mark lead status as enriched
            const { pool } = require('../m1_storage/leadRepository');
            await pool.query(`UPDATE leads SET status = 'enriched', updated_at = NOW() WHERE id = $1`, [leadId]);
        }
    }

    return result;
}

module.exports = {
    crawlWebsite,
    extractEmails,
    extractDoctorNames,
    cleanUrl
};
