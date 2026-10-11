const { pool, LeadRepository } = require('../m1_storage/leadRepository');
const { crawlWebsite } = require('./crawler');
const { resolveDorkContacts } = require('../m4_dork_resolver/dorkResolver');
const { verifyEmailSMTP, generateEmailPermutations } = require('./smtpVerifier');
const { parseBioWithAI, generateColdPitch } = require('../m6_ai_engine/aiIntelligence');

/**
 * 2-Tier Waterfall Auto-Enricher
 * Tier 1: Company Profile (Website, Phones, Official Emails, Socials, WhatsApp)
 * Tier 2: Decision Maker / Owner (Name, Role, Personal LinkedIn, Verified Email, AI Pitch)
 */
async function autoEnrichLead(leadId) {
    console.log(`\n======================================================`);
    console.log(`⚡ Auto-Enriching Lead ID: ${leadId}`);
    console.log(`======================================================`);

    const lead = await LeadRepository.getLeadById(leadId);
    if (!lead) return null;

    let discoveredWhatsapp = lead.whatsapp_number || null;
    let discoveredOwnerName = null;
    let discoveredOwnerRole = null;
    let discoveredOwnerEmail = null;
    let discoveredLinkedIn = null;
    let discoveredFacebook = null;
    let discoveredInstagram = null;
    let discoveredTwitter = null;

    // --------------------------------------------------------
    // TIER 1: Website Deep Crawl & Bio Analysis
    // --------------------------------------------------------
    if (lead.website) {
        console.log(`🕸️ Step 1: Crawling website: ${lead.website}`);
        try {
            const crawlRes = await crawlWebsite(lead.website, lead.id, lead.title);
            if (crawlRes) {
                // Check socials
                if (crawlRes.social_links) {
                    discoveredLinkedIn = crawlRes.social_links.linkedin || null;
                    discoveredFacebook = crawlRes.social_links.facebook || null;
                    discoveredInstagram = crawlRes.social_links.instagram || null;
                    discoveredTwitter = crawlRes.social_links.twitter || null;
                    if (crawlRes.social_links.whatsapp) {
                        discoveredWhatsapp = crawlRes.social_links.whatsapp;
                    }
                }

                // Check discovered contacts from crawler
                if (crawlRes.contacts && crawlRes.contacts.length > 0) {
                    discoveredOwnerName = crawlRes.contacts[0].name;
                    discoveredOwnerRole = crawlRes.contacts[0].role || 'Owner';
                }

                // If about text exists, run Groq Bio AI Extraction
                if (crawlRes.aboutTextPreview) {
                    console.log(`🤖 Running Groq Bio AI extraction on website text...`);
                    const aiBio = await parseBioWithAI(crawlRes.aboutTextPreview, lead.title);
                    if (aiBio) {
                        if (aiBio.owner_name && !discoveredOwnerName) {
                            discoveredOwnerName = aiBio.owner_name;
                            discoveredOwnerRole = aiBio.owner_role || 'Founder / Executive';
                        }
                        if (aiBio.whatsapp_number && !discoveredWhatsapp) {
                            discoveredWhatsapp = aiBio.whatsapp_number;
                        }
                        if (aiBio.direct_email && !discoveredOwnerEmail) {
                            discoveredOwnerEmail = aiBio.direct_email;
                        }
                    }
                }

                // If website crawl found an email, set as candidate
                if (!discoveredOwnerEmail && crawlRes.emails && crawlRes.emails.length > 0) {
                    discoveredOwnerEmail = crawlRes.emails[0];
                }
            }
        } catch (crawlErr) {
            console.warn("Website crawl step note:", crawlErr.message);
        }
    }

    // --------------------------------------------------------
    // TIER 2: Decision Maker Verification & Waterfall Dorking
    // --------------------------------------------------------
    let emailVerified = false;

    // Check Candidate Email via SMTP Handshake
    if (discoveredOwnerEmail) {
        console.log(`📨 Verifying discovered email via SMTP Handshake: ${discoveredOwnerEmail}...`);
        const smtpCheck = await verifyEmailSMTP(discoveredOwnerEmail);
        if (smtpCheck.valid) {
            console.log(`✅ Email VERIFIED via SMTP 250: ${discoveredOwnerEmail}`);
            emailVerified = true;
        } else {
            console.log(`⚠️ Email did not pass SMTP check (${smtpCheck.reason}). Trying permutations...`);
            discoveredOwnerEmail = null;
        }
    }

    // If no verified email, try Permutations + SMTP Ping
    if (!emailVerified && discoveredOwnerName && lead.website) {
        const domain = lead.website.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
        const permutations = generateEmailPermutations(discoveredOwnerName, domain);
        console.log(`🔀 Testing ${permutations.length} email permutations for ${discoveredOwnerName}@${domain}...`);

        for (const pEmail of permutations.slice(0, 4)) {
            const check = await verifyEmailSMTP(pEmail);
            if (check.valid && check.deliverable === 'yes') {
                console.log(`🎯 Permutation Verified 250 OK: ${pEmail}! Early Exit.`);
                discoveredOwnerEmail = pEmail;
                emailVerified = true;
                break;
            }
        }
    }

    // Dork Search for Personal LinkedIn, FB, and Direct Email
    console.log(`🕵️‍♂️ Running Targeted Multi-Engine Dork Search for: "${lead.title}" in ${lead.city}...`);
    try {
        const dorkRes = await resolveDorkContacts(lead.title, lead.city || lead.country || '', lead.id);
        if (dorkRes) {
            if (dorkRes.linkedinProfiles && dorkRes.linkedinProfiles.length > 0) {
                const topP = dorkRes.linkedinProfiles[0];
                if (!discoveredLinkedIn) discoveredLinkedIn = topP.url;
                if (!discoveredOwnerName || discoveredOwnerName.includes('Business Leadership')) {
                    discoveredOwnerName = topP.name;
                    discoveredOwnerRole = topP.role || 'Executive';
                }
            }
            if (dorkRes.facebookUrls && dorkRes.facebookUrls.length > 0 && !discoveredFacebook) {
                discoveredFacebook = dorkRes.facebookUrls[0];
            }
            if (dorkRes.directEmails && dorkRes.directEmails.length > 0 && !discoveredOwnerEmail) {
                discoveredOwnerEmail = dorkRes.directEmails[0];
                emailVerified = true;
            }
        }
    } catch (dorkErr) {
        console.warn("Dork step note:", dorkErr.message);
    }

    // Update WhatsApp in leads table if discovered
    if (discoveredWhatsapp) {
        await pool.query(`UPDATE leads SET whatsapp_number = $1 WHERE id = $2`, [discoveredWhatsapp, lead.id]);
        lead.whatsapp_number = discoveredWhatsapp;
    }

    // Upsert Verified Decision Maker
    if (discoveredOwnerName || discoveredOwnerEmail || discoveredLinkedIn) {
        const dmRecord = {
            full_name: discoveredOwnerName || 'Business Owner / Executive',
            title_role: discoveredOwnerRole || 'Owner',
            email: discoveredOwnerEmail,
            email_source: emailVerified ? 'smtp_verified' : (discoveredOwnerEmail ? 'website_crawl' : null),
            linkedin_url: discoveredLinkedIn,
            facebook_url: discoveredFacebook,
            instagram_url: discoveredInstagram,
            twitter_url: discoveredTwitter,
            whatsapp_number: discoveredWhatsapp,
            confidence_score: discoveredOwnerName && discoveredLinkedIn ? 90 : (emailVerified ? 85 : 70)
        };
        await LeadRepository.addDecisionMaker(lead.id, dmRecord);
    }

    // --------------------------------------------------------
    // TIER 3: Generate Tailored AI Cold Pitch
    // --------------------------------------------------------
    console.log(`✍️ Generating Personalized B2B Cold Pitch via AI...`);
    const dms = await LeadRepository.getDecisionMakers(lead.id);
    const topDecisionMaker = dms[0] || { full_name: discoveredOwnerName || 'Owner', title_role: discoveredOwnerRole || 'Founder' };

    const pitch = await generateColdPitch(lead, topDecisionMaker);
    await pool.query(`UPDATE leads SET ai_pitch = $1, status = 'enriched', updated_at = NOW() WHERE id = $2`, [pitch, lead.id]);
    
    // Fetch complete updated lead
    const fullyEnrichedLead = await LeadRepository.getLeadById(lead.id);
    console.log(`✅ Fully enriched Lead ID ${lead.id} with all profiles and AI pitch!`);
    return fullyEnrichedLead;
}

module.exports = {
    autoEnrichLead
};
