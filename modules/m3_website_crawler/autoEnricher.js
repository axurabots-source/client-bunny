const { pool, LeadRepository } = require('../m1_storage/leadRepository');
const { crawlWebsite } = require('./crawler');
const { resolveDorkContacts } = require('../m4_dork_resolver/dorkResolver');
const { verifyEmailSMTP, generateEmailPermutations } = require('./smtpVerifier');
const { parseBioWithAI, generateColdPitch } = require('../m6_ai_engine/aiIntelligence');
const { lookupUniversalRegistry } = require('./registryInvestigator');
const { extractDomain, lookupDomainRegistrant } = require('./whoisRdapInvestigator');
const { findOwnerPersonalSocials, isGenericGatekeeperEmail, isPersonalFacebookUrl, dorkOwnerSocialEmail } = require('./socialInvestigator');

/**
 * Detective Intelligence Auto-Enricher with 4-Tier Waterfall Pipeline:
 * Strict Compartmentalization:
 * - Company Compartment: Website, Gatekeeper Email (info@/sales@), Company Socials (Pages)
 * - Decision Maker Compartment: Legal/Verified Owner Name, Personal LinkedIn (/in/), Personal Direct Email, Direct WhatsApp
 *
 * Waterfall Hierarchy for Owner Email:
 * Tier 1: Owner Personal LinkedIn Profile Footprint
 * Tier 2: Owner Personal Facebook / Social Media Direct Footprint
 * Tier 3: Website Deep Source Code & Legal Pages (Cloudflare unmasking, JSON-LD, team pages)
 * Tier 4: Predictive Permutations + SMTP MX Handshake Verification (250 OK)
 */
async function autoEnrichLead(leadId) {
    console.log('\n======================================================');
    console.log(`🔍 Detective Auto-Enriching Lead ID: ${leadId}`);
    console.log('======================================================');

    const lead = await LeadRepository.getLeadById(leadId);
    if (!lead) return null;

    // Company Compartment State
    let companyEmail = lead.company_email || null;
    let companyFacebook = lead.company_facebook || null;
    let companyInstagram = lead.company_instagram || null;
    let companyLinkedin = lead.company_linkedin || null;
    let companyWhatsapp = lead.whatsapp_number || null;

    // Decision Maker Personal State
    let ownerName = lead.gmb_owner_name || null;
    let ownerRole = lead.gmb_owner_name ? 'Business Owner' : null;
    let ownerPersonalEmail = null;
    let ownerLinkedIn = null;
    let ownerFacebook = null;
    let ownerTwitter = null;
    let ownerPersonalWhatsapp = null;
    let confidenceScore = 60;
    let emailVerified = false;
    let emailResolutionMethod = null;

    // --------------------------------------------------------
    // STEP 1: Website Deep Crawl & Bio Parsing
    // --------------------------------------------------------
    if (lead.website) {
        console.log(`🌐 [Step 1] Crawling website: ${lead.website}`);
        try {
            const crawlRes = await crawlWebsite(lead.website, lead.id, lead.title);
            if (crawlRes) {
                // Separate company socials
                if (crawlRes.social_links) {
                    if (crawlRes.social_links.facebook && !companyFacebook) companyFacebook = crawlRes.social_links.facebook;
                    if (crawlRes.social_links.instagram && !companyInstagram) companyInstagram = crawlRes.social_links.instagram;
                    if (crawlRes.social_links.whatsapp && !companyWhatsapp) companyWhatsapp = crawlRes.social_links.whatsapp;
                    if (crawlRes.social_links.linkedin) {
                        const li = crawlRes.social_links.linkedin;
                        if (li.includes('/company/') && !companyLinkedin) companyLinkedin = li;
                        else if (li.includes('/in/') && !ownerLinkedIn) ownerLinkedIn = li;
                    }
                }

                // Split emails into Gatekeeper vs Personal Candidate
                if (crawlRes.emails && crawlRes.emails.length > 0) {
                    for (const em of crawlRes.emails) {
                        if (isGenericGatekeeperEmail(em)) {
                            if (!companyEmail) companyEmail = em;
                        } else {
                            if (!ownerPersonalEmail) {
                                ownerPersonalEmail = em;
                                emailResolutionMethod = 'Tier 3: Website Source Code';
                            }
                        }
                    }
                }

                // Bio parsing with Groq AI
                if (crawlRes.aboutTextPreview) {
                    console.log('🧠 [Step 1.b] Running Groq AI bio parser on website text...');
                    const aiBio = await parseBioWithAI(crawlRes.aboutTextPreview, lead.title);
                    if (aiBio) {
                        if (aiBio.owner_name && !ownerName) {
                            ownerName = aiBio.owner_name;
                            ownerRole = aiBio.owner_role || 'Founder / Principal';
                            confidenceScore = 80;
                        }
                        if (aiBio.direct_email && !ownerPersonalEmail) {
                            ownerPersonalEmail = aiBio.direct_email;
                            emailResolutionMethod = 'Tier 3: Website Bio Parsing';
                        }
                        if (aiBio.whatsapp_number && !ownerPersonalWhatsapp) {
                            ownerPersonalWhatsapp = aiBio.whatsapp_number;
                        }
                    }
                }
            }
        } catch (crawlErr) {
            console.warn('Website crawl note:', crawlErr.message);
        }
    }

    // --------------------------------------------------------
    // STEP 2: Official Corporate Registry (UK Companies House / State SOS)
    // --------------------------------------------------------
    if (!ownerName) {
        console.log('🏛️ [Step 2] Checking Official Corporate Registries (UK Companies House / State SOS)...');
        try {
            const regRes = await lookupUniversalRegistry(lead.title, lead.country || 'United Kingdom', lead.city || '', lead.state_province || '');
            if (regRes && regRes.primary_officer) {
                console.log(`✅ Legal Officer Discovered via ${regRes.source}: ${regRes.primary_officer}`);
                ownerName = regRes.primary_officer;
                ownerRole = regRes.role || 'Director / Officer';
                confidenceScore = 90;
            }
        } catch (regErr) {
            console.warn('Registry lookup note:', regErr.message);
        }
    }

    // --------------------------------------------------------
    // STEP 3: RDAP / WHOIS Domain Registrant Lookup (Fallback)
    // --------------------------------------------------------
    if (lead.website && (!ownerName || !ownerPersonalEmail)) {
        console.log('📜 [Step 3] Querying RDAP/WHOIS registrant registry for domain...');
        try {
            const rdapRes = await lookupDomainRegistrant(lead.website);
            if (rdapRes) {
                if (rdapRes.registrant_name && !ownerName) {
                    console.log(`✅ RDAP Registrant Discovered: ${rdapRes.registrant_name}`);
                    ownerName = rdapRes.registrant_name;
                    ownerRole = 'Domain Registrant / Owner';
                    confidenceScore = 75;
                }
                if (rdapRes.registrant_email && !ownerPersonalEmail) {
                    if (!isGenericGatekeeperEmail(rdapRes.registrant_email)) {
                        ownerPersonalEmail = rdapRes.registrant_email;
                        emailResolutionMethod = 'WHOIS Registrant Direct';
                    } else if (!companyEmail) {
                        companyEmail = rdapRes.registrant_email;
                    }
                }
            }
        } catch (rdapErr) {
            console.warn('RDAP lookup note:', rdapErr.message);
        }
    }

    // --------------------------------------------------------
    // STEP 4: WATERFALL TIER 1 & TIER 2 - Owner Personal Socials & Social Footprints
    // --------------------------------------------------------
    if (ownerName) {
        console.log(`🔎 [Step 4: Social Waterfall] Investigating Personal Socials for ${ownerName}...`);
        try {
            const socials = await findOwnerPersonalSocials(ownerName, lead.title, lead.city);
            if ((socials.personalLinkedIn || socials.personal_linkedin) && !ownerLinkedIn) {
                ownerLinkedIn = socials.personalLinkedIn || socials.personal_linkedin;
            }
            if ((socials.personalFacebook || socials.personal_facebook) && !ownerFacebook) {
                ownerFacebook = socials.personalFacebook || socials.personal_facebook;
            }
            if ((socials.personalTwitter || socials.personal_twitter) && !ownerTwitter) {
                ownerTwitter = socials.personalTwitter || socials.personal_twitter;
            }

            // TIER 1 & 2 Dork for Social Email Footprint
            if (!ownerPersonalEmail) {
                const domain = lead.website ? extractDomain(lead.website) : '';
                const socialDorkEmail = await dorkOwnerSocialEmail(ownerName, lead.title, domain);
                if (socialDorkEmail) {
                    console.log(`🎯 Owner Personal Email Unmasked via Social Footprint: ${socialDorkEmail}`);
                    ownerPersonalEmail = socialDorkEmail;
                    emailVerified = true;
                    emailResolutionMethod = 'Tier 2: Personal Social Footprint';
                    confidenceScore = 90;
                }
            }
        } catch (socErr) {
            console.warn('Social investigator note:', socErr.message);
        }
    }

    // Fallback Dork search for LinkedIn if still missing
    if (!ownerLinkedIn) {
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
                if (dorkRes.directEmails && dorkRes.directEmails.length > 0 && !ownerPersonalEmail) {
                    const em = dorkRes.directEmails[0];
                    if (!isGenericGatekeeperEmail(em)) {
                        ownerPersonalEmail = em;
                        emailResolutionMethod = 'Dorking Direct Email';
                    } else if (!companyEmail) {
                        companyEmail = em;
                    }
                }
            }
        } catch (dorkErr) {
            console.warn('Dork fallback note:', dorkErr.message);
        }
    }

    // --------------------------------------------------------
    // STEP 5: Verify Existing Personal Email or Synthesize (WATERFALL TIER 4)
    // --------------------------------------------------------
    if (ownerPersonalEmail && !emailVerified) {
        console.log(`📧 Verifying direct personal email via SMTP: ${ownerPersonalEmail}...`);
        const check = await verifyEmailSMTP(ownerPersonalEmail);
        if (check.valid) {
            emailVerified = true;
            confidenceScore = 95;
            console.log(`✅ Direct personal email verified 250 OK: ${ownerPersonalEmail}`);
        } else {
            console.log(`⚠️ Candidate email did not pass handshake (${check.reason}). Attempting permutations...`);
            ownerPersonalEmail = null;
        }
    }

    // TIER 4: Predictive Permutations + SMTP MX Handshake (Last Resort)
    if (!emailVerified && ownerName && lead.website) {
        const domain = extractDomain(lead.website);
        if (domain) {
            const perms = generateEmailPermutations(ownerName, domain);
            console.log(`🎯 [Tier 4] Synthesizing ${perms.length} direct email permutations for ${ownerName}@${domain}...`);

            for (const pEmail of perms.slice(0, 4)) {
                console.log(`   -> Testing MX handshake for: ${pEmail}...`);
                const check = await verifyEmailSMTP(pEmail);
                if (check.valid && (check.deliverable === 'yes' || check.deliverable === 'probable')) {
                    console.log(`🎉 Personal Permutation Verified 250 OK: ${pEmail}!`);
                    ownerPersonalEmail = pEmail;
                    emailVerified = true;
                    emailResolutionMethod = 'Tier 4: Predictive Permutation (250 OK)';
                    confidenceScore = 95;
                    break;
                }
            }
        }
    }

    // --------------------------------------------------------
    // STEP 6: Save Decision Maker Record
    // --------------------------------------------------------
    if (ownerName || ownerPersonalEmail || ownerLinkedIn) {
        const dmRecord = {
            full_name: ownerName || 'Business Owner',
            title_role: ownerRole || 'Owner / Director',
            email: ownerPersonalEmail,
            email_source: emailResolutionMethod || (emailVerified ? 'smtp_verified' : 'detective_investigation'),
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
    // STEP 7: Token Saver Mode (AI Pitch is generated on-demand)
    // --------------------------------------------------------
    // NOTE: AI Pitch generation moved to on-demand endpoint POST /api/leads/:id/generate-pitch
    // to prevent burning Groq / Gemini tokens during bulk scraping & enrichment.

    // Update Company Compartment in leads table
    await pool.query(`
        UPDATE leads 
        SET company_email = $1,
            company_facebook = $2,
            company_instagram = $3,
            company_linkedin = $4,
            whatsapp_number = COALESCE($5, whatsapp_number),
            status = 'enriched',
            updated_at = NOW() 
        WHERE id = $6
    `, [companyEmail, companyFacebook, companyInstagram, companyLinkedin, companyWhatsapp, lead.id]);

    const fullyEnrichedLead = await LeadRepository.getLeadById(lead.id);
    console.log(`🎉 Fully enriched Lead ID ${lead.id} with strict Company vs Owner separation!\n`);
    return fullyEnrichedLead;
}

module.exports = {
    autoEnrichLead
};
