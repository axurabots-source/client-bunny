const fs = require('fs');
const { parse } = require('csv-parse');
const { LeadRepository } = require('../m1_storage/leadRepository');

/**
 * Clean Owner string from GMB
 * Example: '{"id":"...","name":"Dr. Farooq Yameen (Owner)"}' -> 'Dr. Farooq Yameen'
 */
function extractOwnerName(ownerRaw) {
    if (!ownerRaw || typeof ownerRaw !== 'string') return null;

    let rawName = ownerRaw.trim();

    // Check if it's JSON
    if (rawName.startsWith('{') && rawName.endsWith('}')) {
        try {
            const parsed = JSON.parse(rawName);
            rawName = parsed.name || '';
        } catch (e) {
            // fallback
        }
    }

    // Strip "(Owner)" or similar suffixes
    rawName = rawName.replace(/\s*\([Oo]wner\)/gi, '').trim();

    return rawName.length > 0 ? rawName : null;
}

/**
 * Check if the owner name is an actual person (e.g. "Dr. ...") vs just the business name
 */
function isPersonName(name, businessTitle) {
    if (!name) return false;
    const cleanName = name.toLowerCase().trim();
    const cleanTitle = (businessTitle || '').toLowerCase().trim();

    if (cleanName === cleanTitle) return false;
    if (cleanName.startsWith('dr.') || cleanName.startsWith('doctor') || cleanName.startsWith('dr ')) return true;

    // Check words
    const words = name.split(/\s+/);
    return words.length >= 2 && words.length <= 4;
}

/**
 * Ingest GMB CSV file into Supabase
 */
async function ingestGmbCsv(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        let totalRows = 0;

        fs.createReadStream(filePath)
            .pipe(parse({
                columns: true,
                skip_empty_lines: true,
                relax_column_count: true,
                relax_quotes: true
            }))
            .on('data', (row) => {
                totalRows++;
                results.push(row);
            })
            .on('error', (err) => {
                reject(err);
            })
            .on('end', async () => {
                try {
                    console.log(`📥 Read ${results.length} rows from CSV. Ingesting into Supabase...`);

                    let stats = {
                        total_processed: 0,
                        upserted: 0,
                        has_website: 0,
                        no_website: 0,
                        decision_makers_extracted: 0,
                        pain_point_breakdown: {}
                    };

                    for (const row of results) {
                        const title = (row.title || '').trim();
                        if (!title) continue;

                        const website = (row.website || '').trim();
                        const placeId = row.place_id || row.cid || row.data_id || `gmb_${title.replace(/\s+/g, '_')}`;
                        const ownerClean = extractOwnerName(row.owner);

                        // Parse city from complete_address or address
                        let city = 'Lahore';
                        if (row.complete_address) {
                            try {
                                const parsedAddr = JSON.parse(row.complete_address);
                                if (parsedAddr.city) city = parsedAddr.city;
                            } catch (e) {}
                        } else if (row.address && row.address.includes('Lahore')) {
                            city = 'Lahore';
                        }

                        const leadPayload = {
                            place_id: placeId,
                            title: title,
                            category: row.category || 'Dentist',
                            address: row.address || row.complete_address || '',
                            city: city,
                            phone: row.phone || '',
                            website: website,
                            review_count: parseInt(row.review_count, 10) || 0,
                            review_rating: parseFloat(row.review_rating) || 0.0,
                            gmb_owner_name: ownerClean,
                            link: row.link || row.reviews_link || '',
                            user_reviews: row.user_reviews || null,
                            raw_data: {
                                plus_code: row.plus_code,
                                open_hours: row.open_hours,
                                price_range: row.price_range
                            }
                        };

                        const savedLead = await LeadRepository.upsertLead(leadPayload);
                        stats.total_processed++;
                        stats.upserted++;

                        if (website && website !== '' && website !== 'null') {
                            stats.has_website++;
                        } else {
                            stats.no_website++;
                        }

                        // Track pain points
                        if (savedLead.pain_points) {
                            const pts = Array.isArray(savedLead.pain_points) 
                                ? savedLead.pain_points 
                                : JSON.parse(savedLead.pain_points || '[]');

                            pts.forEach(p => {
                                stats.pain_point_breakdown[p] = (stats.pain_point_breakdown[p] || 0) + 1;
                            });
                        }

                        // If owner looks like a real person, attach to decision_makers table
                        if (ownerClean && isPersonName(ownerClean, title)) {
                            await LeadRepository.addDecisionMaker(savedLead.id, {
                                full_name: ownerClean,
                                title_role: ownerClean.toLowerCase().includes('dr') ? 'Doctor / Owner' : 'Owner',
                                email_source: 'gmb_owner_field',
                                phone: row.phone || null,
                                confidence_score: 85
                            });
                            stats.decision_makers_extracted++;
                        }
                    }

                    resolve(stats);
                } catch (err) {
                    reject(err);
                }
            });
    });
}

module.exports = {
    ingestGmbCsv,
    extractOwnerName,
    isPersonName
};
