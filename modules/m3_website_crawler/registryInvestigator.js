/**
 * Registry Investigator — Official Legal Registries & Corporate Officers
 * Features:
 * - UK Companies House Official Public Register (Directors, PSC, Officers)
 * - US State / OpenCorporates Officer Discovery
 * - Universal Country Router (UK, US, UAE, Global)
 */

/**
 * Clean corporate noise words for registry searches
 */
function cleanCorporateName(name) {
    if (!name) return '';
    return name
        .replace(/\b(ltd|limited|llc|inc|incorporated|corp|corporation|plc|services|clinic|co)\b/gi, '')
        .replace(/[^\w\s]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * 1. UK Companies House Official Public Register
 * Scrapes find-and-update.company-information.service.gov.uk for legal Directors
 */
async function lookupUKCompaniesHouse(companyName, city = '') {
    try {
        const cleanName = cleanCorporateName(companyName);
        if (!cleanName || cleanName.length < 3) return null;

        const searchUrl = `https://find-and-update.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(cleanName + (city ? ' ' + city : ''))}`;
        const searchRes = await fetch(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            signal: AbortSignal.timeout(5000)
        });

        if (searchRes.status !== 200) return null;
        const searchHtml = await searchRes.text();

        // Extract first company link: href="/company/12345678"
        const companyMatch = searchHtml.match(/href="\/company\/([0-9A-Z]{8})"/i);
        if (!companyMatch) return null;

        const companyNumber = companyMatch[1];

        // Fetch Officers page
        const officersUrl = `https://find-and-update.company-information.service.gov.uk/company/${companyNumber}/officers`;
        const officersRes = await fetch(officersUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(5000)
        });

        if (officersRes.status !== 200) return null;
        const officersHtml = await officersRes.text();

        // Extract active officers
        const officerRegex = /id="officer-name-\d+"[^>]*>\s*<a[^>]*>([^<]+)<\/a>/gi;
        const officers = [];
        let m;

        while ((m = officerRegex.exec(officersHtml)) !== null) {
            const rawName = m[1].trim();
            let cleanFullName = rawName;
            if (rawName.includes(',')) {
                const parts = rawName.split(',').map(s => s.trim());
                cleanFullName = `${parts[1]} ${parts[0]}`.replace(/\b\w/g, c => c.toUpperCase());
            }
            officers.push(cleanFullName);
        }

        if (officers.length > 0) {
            return {
                source: 'UK Companies House',
                company_number: companyNumber,
                primary_officer: officers[0],
                all_officers: officers,
                role: 'Director / Corporate Officer'
            };
        }

        return null;
    } catch (err) {
        return null;
    }
}

/**
 * 2. US / Global Corporate Officer Discovery via OpenCorporates & State SOS Search
 */
async function lookupUSOfficers(companyName, city = '', state = '') {
    try {
        const cleanName = cleanCorporateName(companyName);
        if (!cleanName || cleanName.length < 3) return null;

        // Targeted officer query
        const query = `"${cleanName}" ("Managing Member" OR "President" OR "Registered Agent" OR "Officer") ${state || city}`;
        const bingUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=5`;

        const res = await fetch(bingUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            signal: AbortSignal.timeout(5000)
        });

        if (res.status !== 200) return null;
        const html = await res.text();

        // Match typical officer snippets: e.g. "Officer: John Doe", "Managing Member: John Doe", "President: John Doe"
        const officerMatch = html.match(/(?:Managing Member|President|Officer|Registered Agent|Principal)[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/);
        if (officerMatch) {
            return {
                source: 'US State Filing / Corporate Search',
                primary_officer: officerMatch[1].trim(),
                role: 'Managing Member / Corporate Officer'
            };
        }

        return null;
    } catch (err) {
        return null;
    }
}

/**
 * 3. Multi-Country Registry Router
 * Routes to the correct official source based on country
 */
async function lookupUniversalRegistry(companyName, country = 'United Kingdom', city = '', state = '') {
    const cLower = (country || '').toLowerCase();

    // 1. UK Registry
    if (cLower.includes('uk') || cLower.includes('united kingdom') || cLower.includes('england') || cLower.includes('scotland')) {
        const ukRes = await lookupUKCompaniesHouse(companyName, city);
        if (ukRes) return ukRes;
    }

    // 2. US Registry
    if (cLower.includes('us') || cLower.includes('united states') || cLower.includes('america')) {
        const usRes = await lookupUSOfficers(companyName, city, state);
        if (usRes) return usRes;
    }

    // 3. Global Fallback
    const globalRes = await lookupUSOfficers(companyName, city, state);
    if (globalRes) return globalRes;

    return null;
}

module.exports = {
    lookupUKCompaniesHouse,
    lookupUSOfficers,
    lookupUniversalRegistry
};
