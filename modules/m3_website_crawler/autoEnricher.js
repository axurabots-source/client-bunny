const { pool, LeadRepository } = require('../m1_storage/leadRepository');
const { crawlWebsite } = require('./crawler');
const { resolveDorkContacts } = require('../m4_dork_resolver/dorkResolver');
const { verifyEmailSMTP, generateEmailPermutations } = require('./smtpVerifier');
const { parseBioWithAI, generateColdPitch } = require('../m6_ai_engine/aiIntelligence');
const { lookupUniversalRegistry } = require('./registryInvestigator');
const { extractDomain, lookupDomainRegistrant } = require('./whoisRdapInvestigator');
const { findOwnerPersonalSocials, isGenericGatekeeperEmail, isPersonalFacebookUrl } = require('./socialInvestigator');

/**
 * Detective Intelligence Auto-Enricher
 * Strict Compartmentalization:
 * - Company Compartment: Website, Gatekeeper Email (info@/sales@), Company Socials (Pages)
 * - Decision Maker Compartment: Legal/Verified Owner Name, Personal LinkedIn (/in/), Personal Direct Email, Direct WhatsApp
 */
async function autoEnrichLead(leadId) {
    console.log(`\n======================================================`);
    console.log(`⚡ Detective Auto-Enriching Lead ID: ${leadId}`);
    console.log(`======================================================`);

    const lead = await LeadRepository.getLeadById(leadId);
    if (!lead) return null;

    // --------------------------------------------------------
    // Company Compartment State
    // --------------------------------------------------------
    let companyEmail = lead.company_email || null;
    let companyFacebook = lead.company_facebook || null;
    let companyInstagram = lead.company_instagram || null;
    let companyLinkedin = lead.company_linkedin || null;
    let companyWhatsapp = lead.whatsapp_number || null;

    // --------------------------------------------------------
    // Decision Maker Personal State
    // --------------------------------------------------------
    let ownerName = null;
    let ownerRole = null;
    let ownerPersonalEmail = null;
    let ownerLinkedIn = null;
    let ownerFacebook = null;
    let ownerTwitter = null;
    let ownerPersonalWhatsapp = null;
    let confidenceScore = 60;
    let emailVerified = false;

    // --------------------------------------------------------
    // STEP 1: Website Deep Crawl & Bio Parsing
    // --------------------------------------------------------
    if (lead.website) {
        console.log(`🕸️ [Step 1] Crawling website: ${lead.website}`);
        try {
            const crawlRes = await crawlWebsite(lead.website, lead.id, lead.title);
            if (crawlRes) {
                // Separate company socials from website
                if (crawlRes.social_links) {
                    if (crawlRes.social_links.facebook && !companyFacebook) {
                        companyFacebook = crawlRes.social_links.facebook;
                    }
                    if (crawlRes.social_links.instagram && !companyInstagram) {
                        companyInstagram = crawlRes.social_links.instagram;
                    }
                    if (crawlRes.social_links.whatsapp && !companyWhatsapp) {
                        companyWhatsapp = crawlRes.social_links.whatsapp;
                    }
                    if (crawlRes.social_links.linkedin) {
                        const li = crawlRes.social_links.linkedin;
                        if (li.includes('/company/') && !companyLinkedin) {
                            companyLinkedin = li;
                        } else if (li.includes('/in/') && !ownerLinkedIn) {
                            ownerLinkedIn = li;
                        }
                    }
                }

                // Split emails into Gatekeeper vs Personal Candidate
                if (crawlRes.emails && crawlRes.emails.length > 0) {
                    for (const em of crawlRes.emails) {
                        if (isGenericGatekeeperEmail(em)) {
                            if (!companyEmail) companyEmail = em;
                        } else {
                            if (!ownerPersonalEmail) ownerPersonalEmail = em;
                        }
                    }
                }

                // Bio parsing with Groq AI
                if (crawlRes.aboutTextPreview) {
                    console.log(`🤖 [Step 1.b] Running Groq AI bio forensic parser on website text...`);
                    const aiBio = await parseBioWithAI(crawlRes.aboutTextPreview, lead.title);
                    if (aiBio) {
                        if (aiBio.owner_name && !ownerName) {
                            ownerName = aiBio.owner_name;
                            ownerRole = aiBio.owner_role || 'Founder / Principal';
                            confidenceScore = 80;
                        }
                        if (aiBio.direct_email && !ownerPersonalEmail) {
                            ownerPersonalEmail = aiBio.direct_email;
                        }
                        if (aiBio.whatsapp_number && !ownerPersonalWhatsapp) {
                            ownerPersonalWhatsapp = aiBio.whatsapp_number;
                        }
                    }
                }
            }
        } catch (crawlErr) {
            console.warn("Website crawl step note:", crawlErr.message);
        }
    }

    // --------------------------------------------------------
    // STEP 2: RDAP / WHOIS Domain Registrant Lookup
    // --------------------------------------------------------
    if (lead.website && (!ownerName || !ownerPersonalEmail)) {
        console.log(`🔍 [Step 2] Querying RDAP/WHOIS registrant registry for domain...`);
        try {
            const rdapRes = await lookupDomainRegistrant(lead.website);
            if (rdapRes) {
                if (rdapRes.registrant_name && !ownerName) {
                    console.log(`📋 RDAP Registrant Name Discovered: ${rdapRes.registrant_name}`);
                    ownerName = rdapRes.registrant_name;
                    ownerRole = 'Domain Registrant / Owner';
                    confidenceScore = 75;
                }
                if (rdapRes.registrant_email && !ownerPersonalEmail) {
                    console.log(`📨 RDAP Registrant Email Discovered: ${rdapRes.registrant_email}`);
                    if (!isGenericGatekeeperEmail(rdapRes.registrant_email)) {
                        ownerPersonalEmail = rdapRes.registrant_email;
                    } else if (!companyEmail) {
                        companyEmail = rdapRes.registrant_email;
                    }
                }
            }
        } catch (rdapErr) {
            console.warn("RDAP lookup note:", rdapErr.message);
        }
    }

    // --------------------------------------------------------
    // STEP 3: Official Corporate Registry (UK Companies House / US SOS)
    // --------------------------------------------------------
    if (!ownerName) {
        console.log(`🏛️ [Step 3] Checking Official Corporate Registries (UK Companies House / State SOS)...`);
        try {
            const regRes = await lookupUniversalRegistry(lead.title, lead.country || 'United Kingdom', lead.city || '', lead.state_province || '');
            if (regRes && regRes.primary_officer) {
                console.log(`✅ Legal Officer Discovered via ${regRes.source}: ${regRes.primary_officer}`);
                ownerName = regRes.primary_officer;
                ownerRole = regRes.role || 'Director / Officer';
                confidenceScore = 90;
            }
        } catch (regErr) {
            console.warn("Registry lookup note:", regErr.message);
        }
    }

    // --------------------------------------------------------
    // STEP 4: Targeted Personal Social Investigator
    // --------------------------------------------------------
    if (ownerName) {
        console.log(`🔎 [Step 4] Searching Personal Socials (strictly /in/) for ${ownerName}...`);
        try {
            const socials = await findOwnerPersonalSocials(ownerName, lead.title, lead.city);
            if (socials.personal_linkedin && !ownerLinkedIn) ownerLinkedIn = socials.personal_linkedin;
            if (socials.personal_facebook && !ownerFacebook) ownerFacebook = socials.personal_facebook;
            if (socials.personal_twitter && !ownerTwitter) ownerTwitter = socials.personal_twitter;
        } catch (socErr) {
            console.warn("Social investigator note:", socErr.message);
        }
    }

    // Fallback Dork search for LinkedIn if still missing
    if (!ownerLinkedIn) {
        console.log(`🕵️‍♂️ [Step 4.b] Running targeted dork fallback for ${lead.title}...`);
        try {
            const dorkRes = await resolveDorkContacts(lead.title, lead.city || lead.country || '', lead.id);
            if (dorkRes) {
                if (dorkRes.linkedinProfiles && dorkRes.linkedinProfiles.length > 0) {
                    const topLi = dorkRes.linkedinProfiles[0];
                    if (!ownerLinkedIn) ownerLinkedIn = topLi.url;
                    if (!ownerName) {
                        ownerName = topLi.name;
                        ownerRole = topLi.role || 'Executive';
                    }
                }
                if (dorkRes.facebookUrls && dorkRes.facebookUrls.length > 0) {
                    const fb = dorkRes.facebookUrls[0];
                    if (isPersonalFacebookUrl(fb, lead.title)) {
                        if (!ownerFacebook) ownerFacebook = fb;
                    } else {
                        if (!companyFacebook) companyFacebook = fb;
                    }
                }
                if (dorkRes.directEmails && dorkRes.directEmails.length > 0 && !ownerPersonalEmail) {
                    const em = dorkRes.directEmails[0];
                    if (!isGenericGatekeeperEmail(em)) {
                        ownerPersonalEmail = em;
                    } else if (!companyEmail) {
                        companyEmail = em;
                    }
                }
            }
        } catch (dorkErr) {
            console.warn("Dork step note:", dorkErr.message);
        }
    }

    // --------------------------------------------------------
    // STEP 5: Direct Personal Email Synthesis + SMTP 250 Check
    // --------------------------------------------------------
    if (ownerPersonalEmail) {
        console.log(`📨 Verifying direct personal email via SMTP: ${ownerPersonalEmail}...`);
        const check = await verifyEmailSMTP(ownerPersonalEmail);
        if (check.valid) {
            emailVerified = true;
            confidenceScore = 95;
            console.log(`✅ Direct personal email verified 250 OK: ${ownerPersonalEmail}`);
        } else {
            console.log(`⚠️ Email did not pass handshake (${check.reason}).`);
            // If it failed, don't keep as verified personal email
            ownerPersonalEmail = null;
        }
    }

    // If no direct email, synthesize from Owner Name + Company Domain
    if (!emailVerified && ownerName && lead.website) {
        const domain = extractDomain(lead.website);
        if (domain) {
            const perms = generateEmailPermutations(ownerName, domain);
            console.log(`🔀 Synthesizing ${perms.length} direct email permutations for ${ownerName}@${domain}...`);

            for (const pEmail of perms.slice(0, 4)) {
                const check = await verifyEmailSMTP(pEmail);
                if (check.valid && check.deliverable === 'yes') {
                    console.log(`🎯 Personal Permutation Verified 250 OK: ${pEmail}! Early Exit.`);
                    ownerPersonalEmail = pEmail;
                    emailVerified = true;
                    confidenceScore = 95;
                    break;
                }
            }
        }
    }

    // --------------------------------------------------------
    // STEP 6: Save Decision Maker & Company Info with Clean Separation
    // --------------------------------------------------------
    if (ownerName || ownerPersonalEmail || ownerLinkedIn) {
        const dmRecord = {
            full_name: ownerName || 'Business Owner',
            title_role: ownerRole || 'Owner / Director',
            email: ownerPersonalEmail,
            email_source: emailVerified ? 'smtp_verified' : 'detective_investigation',
            linkedin_url: ownerLinkedIn,
            facebook_url: ownerFacebook,
            instagram_url: null,
            twitter_url: ownerTwitter,
            whatsapp_number: ownerPersonalWhatsapp,
            confidence_score: confidenceScore
        };
        await LeadRepository.addDecisionMaker(lead.id, dmRecord);
    }

    // --------------------------------------------------------
    // STEP 7: Generate Tailored AI Cold Pitch (Groq)
    // --------------------------------------------------------
    console.log(`✍️ Generating Personalized B2B Cold Pitch via Groq AI...`);
    const dms = await LeadRepository.getDecisionMakers(lead.id);
    const topDecisionMaker = (dms && dms.length > 0) ? dms[0] : { full_name: ownerName || 'Owner', title_role: ownerRole || 'Founder' };

    const pitch = await generateColdPitch(lead, topDecisionMaker);

    // Update Company Compartment in leads table
    await pool.query(`
        UPDATE leads 
        SET company_email = $1,
            company_facebook = $2,
            company_instagram = $3,
            company_linkedin = $4,
            whatsapp_number = COALESCE($5, whatsapp_number),
            ai_pitch = $6,
            status = 'enriched',
            updated_at = NOW() 
        WHERE id = $7
    `, [companyEmail, companyFacebook, companyInstagram, companyLinkedin, companyWhatsapp, pitch, lead.id]);

    // Fetch complete updated lead
    const fullyEnrichedLead = await LeadRepository.getLeadById(lead.id);
    console.log(`✅ Fully enriched Lead ID ${lead.id} with strict Company vs Owner separation!`);
    return fullyEnrichedLead;
}

module.exports = {
    autoEnrichLead
};
