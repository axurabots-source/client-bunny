/**
 * RDAP / WHOIS Registrant Investigator
 * Features:
 * - Direct ICANN / Verisign RDAP querying
 * - Direct socket Port 43 WHOIS fallback
 * - Privacy protection detection (filters out "WhoisGuard" / "Domains By Proxy")
 * - Extracts real Registrant Name & direct Registrant Email
 */

const net = require('net');

/**
 * Clean domain from arbitrary URL
 */
function extractDomain(url) {
    if (!url) return null;
    try {
        let clean = url.trim();
        if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
            clean = 'https://' + clean;
        }
        const parsed = new URL(clean);
        return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch {
        return null;
    }
}

/**
 * Socket WHOIS client for port 43
 */
function queryWhoisSocket(domain, server = 'whois.verisign-grs.com', timeoutMs = 4000) {
    return new Promise((resolve) => {
        let port = 43;
        const socket = net.createConnection(port, server, () => {
            socket.write(domain + '\r\n');
        });

        socket.setTimeout(timeoutMs);
        let data = '';

        socket.on('data', chunk => {
            data += chunk.toString();
        });

        socket.on('end', () => resolve(data));
        socket.on('error', () => resolve(null));
        socket.on('timeout', () => {
            socket.destroy();
            resolve(null);
        });
    });
}

/**
 * Known privacy protection keywords to avoid false owner detection
 */
const PRIVACY_INDICATORS = [
    'privacy', 'proxy', 'redacted', 'withheld', 'whoisguard',
    'contact privacy', 'domains by proxy', 'identity protect',
    'super privacy', 'private registration', 'data protected'
];

function isPrivacyProtected(str) {
    if (!str) return false;
    const lower = str.toLowerCase();
    return PRIVACY_INDICATORS.some(ind => lower.includes(ind));
}

/**
 * Query RDAP / WHOIS for a website domain
 */
async function lookupDomainRegistrant(websiteUrl) {
    const domain = extractDomain(websiteUrl);
    if (!domain) return null;

    try {
        let registrantName = null;
        let registrantEmail = null;
        let registrantOrg = null;

        // 1. Verisign RDAP for .com / .net
        if (domain.endsWith('.com') || domain.endsWith('.net')) {
            try {
                const rdapUrl = `https://rdap.verisign.com/com/v1/domain/${domain}`;
                const res = await fetch(rdapUrl, {
                    headers: { 'Accept': 'application/rdap+json, application/json', 'User-Agent': 'Mozilla/5.0' },
                    signal: AbortSignal.timeout(4000)
                });

                if (res.status === 200) {
                    const data = await res.json();
                    const entities = data.entities || [];
                    for (const ent of entities) {
                        const roles = ent.roles || [];
                        // STRICT CHECK: Only examine entities explicitly designated as registrant or administrative / owner
                        // Ignore registrar, technical, or abuse contacts
                        if (roles.includes('registrar') || roles.includes('abuse') || roles.includes('technical')) {
                            continue;
                        }
                        if (!roles.includes('registrant') && !roles.includes('administrative')) {
                            continue;
                        }

                        const vcards = ent.vcardArray?.[1] || [];
                        for (const item of vcards) {
                            if (item[0] === 'fn' && item[3]) {
                                const fn = item[3].trim();
                                if (!isPrivacyProtected(fn) && !registrantName && fn.length > 2) {
                                    registrantName = fn;
                                }
                            }
                            if (item[0] === 'email' && item[3]) {
                                const em = item[3].trim();
                                if (!isPrivacyProtected(em) && !registrantEmail && !em.includes('redacted') && !em.toLowerCase().includes('abuse')) {
                                    registrantEmail = em;
                                }
                            }
                            if (item[0] === 'org' && item[3]) {
                                const org = item[3].trim();
                                if (!isPrivacyProtected(org) && !registrantOrg) {
                                    registrantOrg = org;
                                }
                            }
                        }
                    }
                }
            } catch {}
        }

        // 2. Nominet RDAP for .uk / .co.uk / .org.uk
        if (!registrantName && (domain.endsWith('.uk') || domain.endsWith('.co.uk') || domain.endsWith('.org.uk'))) {
            try {
                const ukRdapUrl = `https://rdap.nominet.uk/uk/domain/${domain}`;
                const res = await fetch(ukRdapUrl, {
                    headers: { 'Accept': 'application/rdap+json, application/json', 'User-Agent': 'Mozilla/5.0' },
                    signal: AbortSignal.timeout(4000)
                });
                if (res.status === 200) {
                    const data = await res.json();
                    const entities = data.entities || [];
                    for (const ent of entities) {
                        const roles = ent.roles || [];
                        if (!roles.includes('registrant') && !roles.includes('administrative')) continue;
                        const vcards = ent.vcardArray?.[1] || [];
                        for (const item of vcards) {
                            if (item[0] === 'fn' && item[3]) {
                                const fn = item[3].trim();
                                if (!isPrivacyProtected(fn) && !registrantName && fn.length > 2) registrantName = fn;
                            }
                            if (item[0] === 'email' && item[3]) {
                                const em = item[3].trim();
                                if (!isPrivacyProtected(em) && !registrantEmail && !em.includes('redacted') && !em.toLowerCase().includes('abuse')) {
                                    registrantEmail = em;
                                }
                            }
                        }
                    }
                }
            } catch {}
        }

        // 3. Direct WHOIS socket lookup (fallback for other TLDs)
        if (!registrantName) {
            let whoisServer = 'whois.verisign-grs.com';
            if (domain.endsWith('.co.uk') || domain.endsWith('.uk') || domain.endsWith('.org.uk')) {
                whoisServer = 'whois.nic.uk';
            } else if (domain.endsWith('.org')) {
                whoisServer = 'whois.pir.org';
            } else if (domain.endsWith('.ae')) {
                whoisServer = 'whois.aeda.net.ae';
            }

            const rawWhois = await queryWhoisSocket(domain, whoisServer, 3500);
            if (rawWhois) {
                // Match "Registrant: John Doe" or "Registrant Name: John Doe"
                const regMatch = rawWhois.match(/(?:Registrant|Registrant Name|Registrant Contact Name)[\s:]+([^\r\n]+)/i);
                if (regMatch) {
                    const val = regMatch[1].trim();
                    if (!isPrivacyProtected(val) && val.length > 2) {
                        registrantName = val;
                    }
                }

                // Match "Registrant Email: admin@..." (STRICT: Never match registrar abuse email)
                const emailMatch = rawWhois.match(/(?:^|\n)\s*(?:Registrant Email|Registrant Contact Email)[\s:]+([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
                if (emailMatch) {
                    const em = emailMatch[1].trim();
                    if (!isPrivacyProtected(em) && !em.toLowerCase().includes('abuse') && !em.includes('redacted')) {
                        registrantEmail = em;
                    }
                }
            }
        }

        if (registrantName || registrantEmail) {
            return {
                source: 'RDAP / WHOIS',
                domain,
                registrant_name: registrantName,
                registrant_email: registrantEmail,
                registrant_org: registrantOrg
            };
        }

        return null;
    } catch (err) {
        return null;
    }
}

module.exports = {
    extractDomain,
    lookupDomainRegistrant
};
