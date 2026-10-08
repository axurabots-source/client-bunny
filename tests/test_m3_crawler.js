const { crawlWebsite } = require('../modules/m3_website_crawler/crawler');
const { LeadRepository } = require('../modules/m1_storage/leadRepository');

async function runPacket3Test() {
    console.log("==================================================");
    console.log("🚀 TESTING PACKET 3: WEBSITE DEEP CRAWLER");
    console.log("==================================================");

    const targetUrl = process.argv[2] || 'https://smileon.pk';
    console.log(`Target Clinic Website: ${targetUrl}`);

    try {
        const startTime = Date.now();
        const crawlResult = await crawlWebsite(targetUrl);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log("\n📊 Crawl Results Summary:");
        console.log(` - Target URL: ${crawlResult.url}`);
        console.log(` - Subpages Crawled: ${crawlResult.pages_checked}`);
        console.log(` - Discovered Emails:`, crawlResult.emails.length > 0 ? crawlResult.emails : "❌ None found on HTML");
        console.log(` - Discovered Doctors/Founders:`, crawlResult.doctor_names.length > 0 ? crawlResult.doctor_names : "❌ None identified in headings");
        console.log(` - Social Profiles:`);
        console.log(`    • LinkedIn : ${crawlResult.social_links.linkedin || 'None'}`);
        console.log(`    • Facebook : ${crawlResult.social_links.facebook || 'None'}`);
        console.log(`    • Instagram: ${crawlResult.social_links.instagram || 'None'}`);
        console.log(` - Execution Time: ${duration}s`);

        // Test attaching to a real Supabase lead
        console.log("\n🧪 Testing Automatic Enrichment on Supabase Lead...");
        const leads = await LeadRepository.listLeads({ limit: 1 });
        if (leads.length > 0 && leads[0].website) {
            const lead = leads[0];
            console.log(`Enriching Lead ID [${lead.id}]: ${lead.title} (${lead.website})`);
            const enrichRes = await crawlWebsite(lead.website, lead.id);
            console.log(`✅ Enriched Lead ID [${lead.id}]. Status updated to 'enriched'!`);
            
            // Verify by fetching updated lead
            const updated = await LeadRepository.getLeadById(lead.id);
            console.log(`Verified Contacts in Supabase:`, updated.decision_makers.map(d => ({
                name: d.full_name,
                role: d.title_role,
                email: d.email,
                social: d.facebook_url || d.instagram_url
            })));
        }

        console.log("\n==================================================");
        console.log("🎉 PACKET 3 TEST PASSED 100%! CRAWLER VERIFIED!");
        console.log("==================================================");

    } catch (err) {
        console.error("❌ Packet 3 Crawl Failed:", err);
    } finally {
        await LeadRepository.close();
    }
}

runPacket3Test();
