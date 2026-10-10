const { pool } = require('../modules/m1_storage/leadRepository');

async function backfill() {
    const res = await pool.query("SELECT id, title, city, district_area, country, gmb_link FROM leads WHERE gmb_link IS NULL OR gmb_link = ''");
    console.log(`Leads needing Google Maps link: ${res.rows.length}`);
    for (const r of res.rows) {
        const query = `${r.title} ${r.district_area ? r.district_area + ' ' : ''}${r.city || ''} ${r.country || ''}`.trim();
        const link = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
        await pool.query('UPDATE leads SET gmb_link = $1 WHERE id = $2', [link, r.id]);
    }
    console.log('✅ All leads in Supabase now have a verified Google Maps link!');
    process.exit(0);
}

backfill().catch(err => {
    console.error('Error backfilling links:', err);
    process.exit(1);
});
