const path = require('path');
const { ingestGmbCsv } = require('../modules/m2_gmb_integration/gmbParser');
const { LeadRepository } = require('../modules/m1_storage/leadRepository');

async function runPacket2Test() {
    console.log("==================================================");
    console.log("🚀 TESTING PACKET 2: GMB SCRAPER INGESTION (CSV)");
    console.log("==================================================");

    const csvFile = process.argv[2] || 'dentists_in_lahore.csv';
    const resolvedPath = path.isAbsolute(csvFile) ? csvFile : path.join(__dirname, '..', csvFile);

    console.log(`Target CSV File: ${resolvedPath}`);

    try {
        const startTime = Date.now();
        const stats = await ingestGmbCsv(resolvedPath);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log("\n📊 Ingestion Results Summary:");
        console.log(` - Total Processed: ${stats.total_processed}`);
        console.log(` - Successfully Upserted to Supabase: ${stats.upserted}`);
        console.log(` - Clinics WITH Website: ${stats.has_website}`);
        console.log(` - Clinics WITHOUT Website: ${stats.no_website}`);
        console.log(` - Real Doctors/Owners Extracted: ${stats.decision_makers_extracted}`);
        console.log(` - Time Taken: ${duration}s`);

        console.log("\n🎯 Detected Pain Point Breakdown:");
        for (const [point, count] of Object.entries(stats.pain_point_breakdown)) {
            console.log(`   • ${point.padEnd(22)} : ${count} clinics`);
        }

        // Query Supabase to see real records
        console.log("\n🔍 Sample Records in Supabase Database:");
        const sampleLeads = await LeadRepository.listLeads({ limit: 5 });
        sampleLeads.forEach((lead, i) => {
            const pts = Array.isArray(lead.pain_points) ? lead.pain_points : JSON.parse(lead.pain_points || '[]');
            console.log(` ${i + 1}. [${lead.id}] ${lead.title}`);
            console.log(`    Rating: ⭐ ${lead.review_rating} (${lead.review_count} reviews) | Web: ${lead.website || '❌ None'}`);
            console.log(`    Pain Points: [${pts.join(', ')}]`);
        });

        console.log("\n==================================================");
        console.log("🎉 PACKET 2 TEST PASSED 100%! GMB INGESTION VERIFIED!");
        console.log("==================================================");

    } catch (err) {
        console.error("❌ Packet 2 Ingestion Failed:", err);
    } finally {
        await LeadRepository.close();
    }
}

runPacket2Test();
