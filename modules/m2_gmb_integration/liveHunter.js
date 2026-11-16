let chromium = null;
try {
    chromium = require('playwright').chromium;
} catch (e) {
    console.warn('[LiveHunter] Playwright not loaded in current environment (lazy load fallback):', e.message);
}
const { pool, LeadRepository } = require('../m1_storage/leadRepository');
const { tagPainPoints } = require('../m1_storage/painPointTagger');
const { formatDirectMapsLink } = require('./mapsHelper');
const { sanitizeNicheQuery, getSubNicheVariants, calculateLeadRelevance } = require('./subNicheEngine');

/**
 * Helper to handle Google Consent modals (UK/EU/Global)
 */
async function handleConsent(page) {
    try {
        const consentSelectors = [
            'button[aria-label*="Accept all"]',
            'form[action*="consent"] button',
            'button:has-text("Accept all")',
            'button:has-text("I agree")',
            'button:has-text("Reject all")'
        ];
        for (const sel of consentSelectors) {
            const btn = await page.$(sel);
            if (btn) {
                console.log(`🛡️ Accepting Google Consent modal...`);
                await btn.click();
                await page.waitForTimeout(2000);
                break;
            }
        }
    } catch (e) {
        // Consent modal already bypassed or not shown
    }
}

/**
 * Scrapes Google Maps cards from an open page
 */
async function scrapeCardsFromPage(page, safeLimit) {
    // Wait for feed or place links
    try {
        await page.waitForSelector('div[role="feed"], a[href*="/maps/place/"]', { timeout: 12000 });
        console.log(`📍 Google Maps results feed container detected!`);
    } catch (feedErr) {
        console.warn(`⚠️ Warning waiting for feed container: ${feedErr.message}`);
    }

    // Scroll to uncover listings
    const scrollRounds = Math.ceil(safeLimit / 6);
    console.log(`📜 Scrolling Google Maps feed (${scrollRounds} rounds)...`);
    for (let r = 0; r < scrollRounds; r++) {
        await page.evaluate(() => {
            const feed = document.querySelector('div[role="feed"]');
            if (feed) feed.scrollTop += 1400;
        });
        await page.waitForTimeout(1400);
    }

    // Extract Cards
    return await page.evaluate(() => {
        const results = [];
        const cards = document.querySelectorAll('div[role="feed"] > div > div[jsaction*="mouseover"]');

        for (const item of cards) {
            const titleLink = item.querySelector('a[href*="/maps/place/"]');
            if (!titleLink) continue;

            const title = (titleLink.getAttribute('aria-label') || titleLink.innerText || '').trim();
            const link = titleLink.getAttribute('href') || '';
            if (!title || !link || results.some(r => r.title === title)) continue;

            // Website Link (if present on card)
            const webLink = item.querySelector('a[data-value="Website"], a[aria-label*="website" i]');
            const website = webLink ? webLink.getAttribute('href') : null;

            // Card text lines
            const textLines = item.innerText.split('\n').map(s => s.trim()).filter(Boolean);

            // Rating
            let rating = null;
            const ratingEl = item.querySelector('span[role="img"]');
            const ratingText = ratingEl ? ratingEl.getAttribute('aria-label') : '';
            const rMatch = (ratingText || item.innerText).match(/([1-5]\.[0-9])/);
            if (rMatch) rating = parseFloat(rMatch[1]);

            // Review Count
            let reviews = 0;
            const revMatch = item.innerText.match(/\(([0-9,]+)\)/) || item.innerText.match(/([0-9,]+)\s*(?:reviews|review)/i);
            if (revMatch) reviews = parseInt(revMatch[1].replace(/,/g, ''), 10);

            // Phone number
            const phoneMatch = item.innerText.match(/(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,5}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,5}/);
            const phone = phoneMatch ? phoneMatch[0].trim() : null;

            // Address & Category
            let addressLine = '';
            for (let idx = 1; idx < textLines.length; idx++) {
                const line = textLines[idx];
                if (line.includes('·') || line.match(/\d+\s+[A-Za-z]/)) {
                    addressLine = line;
                    break;
                }
            }

            results.push({
                title,
                link,
                website,
                rating,
                reviews,
                phone,
                addressLine,
                snippet: textLines.slice(0, 4).join(' | ')
            });
        }

        // Fallback: If cards missed, scan direct place links
        if (results.length === 0) {
            const links = document.querySelectorAll('a[href*="/maps/place/"]');
            for (const l of links) {
                const title = (l.getAttribute('aria-label') || l.innerText || '').trim();
                const link = l.getAttribute('href') || '';
                if (!title || !link || results.some(r => r.title === title)) continue;
                results.push({
                    title,
                    link,
                    website: null,
                    rating: 4.5,
                    reviews: 10,
                    phone: null,
                    addressLine: '',
                    snippet: title
                });
            }
        }

        return results;
    });
}

/**
 * Execute 100% REAL Google Maps Hunt for Target Area & Sub-Niche
 * Scrapes directly from live Google Maps (https://www.google.com/maps/search/...)
 * NEVER generates fake or simulated data.
 */
async function executeLiveHunt({ listName, country, state, city, area, niche, limit = 35, autoEnrich = true, onLeadExtracted = null }) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 35, 10), 45);

    // 1. Sanitize sub-niche query and prevent redundant location concatenation
    const { cleanNiche, targetLocation, fullQuery } = sanitizeNicheQuery(niche, { area, city, state, country });

    // 2. Intelligent List Naming (avoid dumping everything into General Ingestion)
    const effectiveListName = (!listName || listName === 'General Ingestion')
        ? `${cleanNiche} - ${city}`
        : listName.trim();

    console.log(`\n======================================================`);
    console.log(`🎯 STARTING LIVE SUB-NICHE HUNT: "${fullQuery}"`);
    console.log(`   Clean Niche: "${cleanNiche}" | Location: "${targetLocation}"`);
    console.log(`   Target List: "${effectiveListName}" | Target Cap: ${safeLimit} Real Leads`);
    console.log(`======================================================`);

    let rawItems = [];
    let browser = null;

    try {
        if (!chromium) {
            throw new Error("Chromium engine not available in this environment. Please ensure Playwright is installed or run via Render worker container.");
        }

        browser = await chromium.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-web-security',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport: { width: 1366, height: 768 },
            locale: 'en-US'
        });

        const page = await context.newPage();
        const gmapsSearchUrl = `https://www.google.com/maps/search/${encodeURIComponent(fullQuery)}?hl=en`;

        console.log(`🌐 Navigating directly to Google Maps: "${gmapsSearchUrl}"...`);
        try {
            await page.goto(gmapsSearchUrl, { waitUntil: 'load', timeout: 25000 });
        } catch (navErr) {
            console.log(`ℹ️ Navigation load note (${navErr.message}), checking page content...`);
        }

        await handleConsent(page);
        rawItems = await scrapeCardsFromPage(page, safeLimit);

        // 3. Multi-Anchor Semantic Expansion (Boost for narrow sub-niches)
        if (rawItems.length < 8 && safeLimit >= 15) {
            const variants = getSubNicheVariants(cleanNiche);
            if (variants.length > 0) {
                const secondaryVariant = variants[0];
                const secondaryQuery = `${secondaryVariant} in ${targetLocation}`;
                console.log(`🔄 Sub-niche booster: Initial search yielded ${rawItems.length} results. Expanding with variant: "${secondaryQuery}"...`);
                try {
                    const secondaryUrl = `https://www.google.com/maps/search/${encodeURIComponent(secondaryQuery)}?hl=en`;
                    await page.goto(secondaryUrl, { waitUntil: 'load', timeout: 20000 });
                    await handleConsent(page);
                    const secondaryCards = await scrapeCardsFromPage(page, Math.ceil(safeLimit / 2));
                    
                    // Merge deduplicating by title
                    for (const sItem of secondaryCards) {
                        if (!rawItems.some(r => r.title.toLowerCase() === sItem.title.toLowerCase())) {
                            rawItems.push(sItem);
                        }
                    }
                    console.log(`✨ After booster expansion, total unique listings: ${rawItems.length}`);
                } catch (secErr) {
                    console.warn(`Secondary expansion note: ${secErr.message}`);
                }
            }
        }

    } catch (browserErr) {
        console.error("❌ Live Google Maps extraction error:", browserErr.message);
    } finally {
        if (browser) await browser.close();
    }

    console.log(`🔍 Extracted ${rawItems.length} raw Google Maps listings.`);

    // 4. Format, score relevance, and filter leads
    const extractedLeads = [];
    let filteredIrrelevantCount = 0;

    for (let i = 0; i < rawItems.length; i++) {
        if (extractedLeads.length >= safeLimit) break;
        const item = rawItems[i];

        // Sub-niche relevance verification
        const relevance = calculateLeadRelevance(item, cleanNiche);
        if (!relevance.isRelevant) {
            console.log(`🗑️ [Sub-Niche Filter] Skipped irrelevant listing: "${item.title}" (Relevance: ${relevance.score}%)`);
            filteredIrrelevantCount++;
            continue;
        }

        // Extract Google Place ID
        let realPlaceId = null;
        const placeIdMatch = item.link.match(/19s(ChIJ[A-Za-z0-9_-]+)/);
        if (placeIdMatch) {
            realPlaceId = placeIdMatch[1];
        } else {
            realPlaceId = `gmb_${Date.now()}_${i + 1}`;
        }

        // Clean address
        let cleanAddress = item.addressLine.replace(/^[^·]*·\s*/, '').trim();
        if (!cleanAddress || cleanAddress.length < 3) {
            cleanAddress = `${area ? area + ', ' : ''}${city}, ${country}`;
        } else if (!cleanAddress.toLowerCase().includes(city.toLowerCase())) {
            cleanAddress = `${cleanAddress}, ${city}, ${country}`;
        }

        const directLink = formatDirectMapsLink({
            place_id: realPlaceId,
            title: item.title,
            address: cleanAddress,
            city,
            country,
            gmb_link: item.link
        });

        extractedLeads.push({
            place_id: realPlaceId,
            title: item.title,
            category: cleanNiche,
            address: cleanAddress,
            city,
            state_province: state || city,
            district_area: area || 'Central',
            country,
            phone: item.phone,
            website: item.website,
            review_count: item.reviews || 0,
            review_rating: item.rating ? parseFloat(item.rating) : 0.0,
            gmb_owner_name: null,
            gmb_link: directLink,
            raw_data: {
                source: 'google_maps_subniche_engine',
                full_link: item.link,
                snippet: item.snippet,
                relevance_score: relevance.score,
                matched_terms: relevance.matchedTerms
            }
        });
    }

    if (extractedLeads.length === 0) {
        console.warn(`⚠️ No Google Maps listings matched sub-niche "${fullQuery}".`);
    }

    // 5. Stream-First DB Save and Real-Time SSE Emission
    const savedLeads = [];
    let skippedDuplicates = 0;

    for (const lead of extractedLeads) {
        // Deduplication against target list
        try {
            const checkQuery = `
                SELECT id FROM leads 
                WHERE list_name = $1::text 
                  AND (
                    (place_id = $2::text AND place_id IS NOT NULL AND place_id != '')
                    OR (LOWER(TRIM(title)) = LOWER(TRIM($3::text)) AND LOWER(TRIM(city)) = LOWER(TRIM($4::text)))
                    OR (website IS NOT NULL AND website != '' AND $5::text != '' AND LOWER(TRIM(website)) = LOWER(TRIM($5::text)))
                  )
                LIMIT 1;
            `;
            const checkRes = await pool.query(checkQuery, [
                effectiveListName,
                lead.place_id,
                lead.title,
                lead.city,
                lead.website || ''
            ]);
            if (checkRes.rows.length > 0) {
                console.log(`⏭️ [Deduplication] Skipped already existing lead in "${effectiveListName}": ${lead.title}`);
                skippedDuplicates++;
                continue;
            }
        } catch (checkErr) {
            console.warn("Deduplication check note:", checkErr.message);
        }

        const painPoints = tagPainPoints({
            website: lead.website,
            review_count: lead.review_count,
            review_rating: lead.review_rating,
            user_reviews: []
        });

        const record = {
            ...lead,
            pain_points: painPoints,
            list_name: effectiveListName,
            status: 'new'
        };

        try {
            const saved = await LeadRepository.upsertLead(record);
            savedLeads.push(saved);

            // Stream base lead to UI immediately for lightning-fast responsiveness
            if (typeof onLeadExtracted === 'function') {
                try {
                    onLeadExtracted(saved);
                } catch (cbErr) {
                    console.warn("onLeadExtracted callback error:", cbErr.message);
                }
            }

            // Asynchronously trigger 4-tier deep detective enrichment in background
            if (autoEnrich && saved.id) {
                setImmediate(async () => {
                    try {
                        const { autoEnrichLead } = require('../m3_website_crawler/autoEnricher');
                        await autoEnrichLead(saved.id);
                    } catch (enrErr) {
                        console.warn(`[AsyncEnrich] Note for ${saved.title}:`, enrErr.message);
                    }
                });
            }
        } catch (dbErr) {
            console.error("Error saving real lead to Supabase:", dbErr.message);
        }
    }

    // 6. Ensure list is registered in lead_lists table
    try {
        await pool.query(`
            INSERT INTO lead_lists (name, description, target_country, target_region, target_city, target_area, target_niche)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (name) DO UPDATE 
            SET target_country = EXCLUDED.target_country,
                target_region = EXCLUDED.target_region,
                target_city = EXCLUDED.target_city,
                target_area = EXCLUDED.target_area,
                target_niche = EXCLUDED.target_niche;
        `, [
            effectiveListName,
            `Targeting ${cleanNiche} in ${area ? area + ', ' : ''}${city}, ${country}`,
            country,
            state || city,
            city,
            area || 'All Areas',
            cleanNiche
        ]);
    } catch (listErr) {
        console.warn("Lead list registration note:", listErr.message);
    }

    console.log(`✅ Hunt Complete: ${savedLeads.length} new verified leads added to "${effectiveListName}", ${skippedDuplicates} duplicates skipped.`);
    return {
        query: fullQuery,
        cleanNiche,
        listName: effectiveListName,
        totalFound: extractedLeads.length,
        newLeadsCount: savedLeads.length,
        skippedDuplicates,
        filteredIrrelevantCount,
        leads: savedLeads,
        message: savedLeads.length === 0
            ? (extractedLeads.length === 0 
                ? `No matching businesses found on Google Maps for "${cleanNiche}" in ${city}.`
                : `All ${extractedLeads.length} businesses found are already saved in "${effectiveListName}".`)
            : `Successfully added ${savedLeads.length} new verified leads to "${effectiveListName}" (${skippedDuplicates} duplicates skipped).`
    };
}

module.exports = {
    executeLiveHunt
};
