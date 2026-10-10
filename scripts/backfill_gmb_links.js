const { pool } = require('../modules/m1_storage/leadRepository');
const { formatDirectMapsLink } = require('../modules/m2_gmb_integration/mapsHelper');

async function backfill() {
    console.log("🔍 Checking leads for Google Maps link standardization...");
    const res = await pool.query(`
        SELECT id, place_id, title, city, district_area, country, gmb_link, raw_data 
        FROM leads
    `);
    
    console.log(`Total leads in database: ${res.rows.length}`);
    let updatedCount = 0;

    for (const r of res.rows) {
        const isSearchLink = r.gmb_link && r.gmb_link.includes('/maps/search/');
        const isMissing = !r.gmb_link || r.gmb_link.trim() === '';

        if (isMissing || isSearchLink) {
            const directLink = formatDirectMapsLink(r);
            await pool.query('UPDATE leads SET gmb_link = $1 WHERE id = $2', [directLink, r.id]);
            updatedCount++;
        }
    }

    console.log(`✅ Successfully updated ${updatedCount} leads to direct Google Maps place profile links!`);
    process.exit(0);
}

backfill().catch(err => {
    console.error('Error backfilling links:', err);
    process.exit(1);
});
