/**
 * Social Investigator — Strict Personal Profile vs Company Page Separation
 * Features:
 * - Finds strictly PERSONAL LinkedIn (/in/) for the discovered owner
 * - Finds strictly PERSONAL Facebook profile (filters out business pages & groups)
 * - Finds strictly PERSONAL X/Twitter profile
 * - Distinguishes Company Socials from Owner Personal Socials
 */

/**
 * Check if a Facebook URL is a company page/group or personal profile
 */
function isPersonalFacebookUrl(url, companyName = '') {
    if (!url) return false;
    const lower = url.toLowerCase();
    
    // Ignore business pages, groups, events, sharing
    if (lower.includes('/pages/') || lower.includes('/groups/') || lower.includes('/events/') || lower.includes('/sharer/')) {
        return false;
    }
    
    // If URL path matches company name or company words, it's a company page!
    if (companyName) {
        const cleanCo = companyName.toLowerCase().replace(/\b(ltd|limited|llc|inc|corp|co|services|service)\b/g, '').replace(/[^a-z0-9]/g, '');
        const urlSlug = lower.replace(/https?:\/\/(www\.)?facebook\.com\//, '').replace(/[^a-z0-9]/g, '');
        if (cleanCo.length > 3 && (urlSlug.includes(cleanCo) || cleanCo.includes(urlSlug))) {
            return false;
        }
    }

    // Must be a personal profile pattern
    if (lower.includes('facebook.com/profile.php')) {
        return true;
    }

    const path = lower.replace(/https?:\/\/(www\.)?facebook\.com\//, '').replace(/\/$/, '');
    if (path.length >= 3 && !path.includes('/')) {
        return true;
    }

    return false;
}

/**
 * Check if a LinkedIn URL is strictly a personal profile
 */
function isPersonalLinkedInUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes('/in/') && !lower.includes('/company/') && !lower.includes('/school/');
}

/**
 * Search personal social accounts for a confirmed owner name
 */
async function findOwnerPersonalSocials(ownerName, companyName = '', city = '') {
    if (!ownerName || ownerName.length < 3) return {};

    const cleanOwner = ownerName.trim();
    let personalLinkedIn = null;
    let personalFacebook = null;
    let personalTwitter = null;

    try {
        // 1. Personal LinkedIn search
        const liQuery = `site:linkedin.com/in "${cleanOwner}" "${companyName || city}"`;
        const liUrl = `https://www.bing.com/search?q=${encodeURIComponent(liQuery)}&count=4`;
        
        const liRes = await fetch(liUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(4500)
        });

        if (liRes.status === 200) {
            const html = await liRes.text();
            const liMatches = html.match(/https:\/\/[a-z]{2,3}\.linkedin\.com\/in\/[a-zA-Z0-9\-_%]+/gi) || [];
            for (const m of liMatches) {
                if (isPersonalLinkedInUrl(m)) {
                    personalLinkedIn = m;
                    break;
                }
            }
        }
    } catch {}

    try {
        // 2. Personal Facebook search (targeted by name + city/company)
        const fbQuery = `site:facebook.com "${cleanOwner}" "${city || companyName}"`;
        const fbUrl = `https://www.bing.com/search?q=${encodeURIComponent(fbQuery)}&count=4`;

        const fbRes = await fetch(fbUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(4500)
        });

        if (fbRes.status === 200) {
            const html = await fbRes.text();
            const fbMatches = html.match(/https:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9.]{4,}/gi) || [];
            for (const m of fbMatches) {
                if (isPersonalFacebookUrl(m, companyName)) {
                    personalFacebook = m;
                    break;
                }
            }
        }
    } catch {}

    try {
        // 3. Personal X/Twitter search
        const twQuery = `(site:x.com OR site:twitter.com) "${cleanOwner}" "${companyName || city}"`;
        const twUrl = `https://www.bing.com/search?q=${encodeURIComponent(twQuery)}&count=4`;

        const twRes = await fetch(twUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(4500)
        });

        if (twRes.status === 200) {
            const html = await twRes.text();
            const twMatches = html.match(/https:\/\/(?:x|twitter)\.com\/([a-zA-Z0-9_]{3,20})/gi) || [];
            for (const m of twMatches) {
                const lower = m.toLowerCase();
                if (!lower.includes('/status/') && !lower.includes('/intent/') && !lower.includes('/search')) {
                    personalTwitter = m;
                    break;
                }
            }
        }
    } catch {}

    return {
        personal_linkedin: personalLinkedIn,
        personal_facebook: personalFacebook,
        personal_twitter: personalTwitter
    };
}

/**
 * Filter generic gatekeeper emails vs personal emails
 */
const GENERIC_EMAIL_PREFIXES = new Set([
    'info', 'sales', 'reception', 'contact', 'admin', 'office',
    'support', 'hello', 'enquiries', 'team', 'service', 'help',
    'booking', 'bookings', 'marketing', 'frontdesk', 'mail', 'general'
]);

function isGenericGatekeeperEmail(email) {
    if (!email || !email.includes('@')) return false;
    const user = email.split('@')[0].toLowerCase().replace(/[^a-z]/g, '');
    return GENERIC_EMAIL_PREFIXES.has(user);
}

module.exports = {
    isPersonalLinkedInUrl,
    isPersonalFacebookUrl,
    findOwnerPersonalSocials,
    isGenericGatekeeperEmail
};
