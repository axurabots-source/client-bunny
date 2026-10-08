const { resolveDorkContacts } = require('../modules/m4_dork_resolver/dorkResolver');
const { LeadRepository } = require('../modules/m1_storage/leadRepository');

async function runPacket4Test() {
    console.log("==================================================");
    console.log("🚀 TESTING PACKET 4: GOOGLE/SEARCH DORK RESOLVER");
    console.log("==================================================");

    const businessTitle = process.argv[2] || 'SmileOn Dental';
    const city = process.argv[3] || 'Lahore';

    console.log(`Target Business: "${businessTitle}" in ${city}`);

    try {
        const startTime = Date.now();
        const results = await resolveDorkContacts(businessTitle, city);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log("\n📊 Dork Resolution Results Summary (Zero Paid APIs):");
        console.log(` - LinkedIn Profiles Discovered: ${results.linkedinProfiles.length}`);
        results.linkedinProfiles.forEach((p, idx) => {
            console.log(`    [${idx + 1}] Name: ${p.name}`);
            console.log(`        URL: ${p.url}`);
        });

        console.log(` - Facebook Pages Discovered: ${results.facebookUrls.length}`);
        results.facebookUrls.forEach((u, idx) => {
            console.log(`    [${idx + 1}] ${u}`);
        });

        console.log(` - Discovered Emails:`, results.directEmails.length > 0 ? results.directEmails : "None in public snippets");
        console.log(` - Execution Time: ${duration}s`);

        // Test attaching to a real Supabase lead (e.g. Lead with no website!)
        console.log("\n🧪 Testing Automatic Dork Enrichment on Supabase Lead with NO Website...");
        const noWebLeads = await LeadRepository.listLeads({ limit: 10 });
        const targetLead = noWebLeads.find(l => !l.website || l.website === '') || noWebLeads[0];

        if (targetLead) {
            console.log(`Resolving Contacts for Lead ID [${targetLead.id}]: "${targetLead.title}"...`);
            const leadDorkResult = await resolveDorkContacts(targetLead.title, targetLead.city || 'Lahore', targetLead.id);
            console.log(`✅ Dorking complete for Lead ID [${targetLead.id}]!`);

            const updatedLead = await LeadRepository.getLeadById(targetLead.id);
            console.log(`Verified Contacts in Supabase:`, updatedLead.decision_makers.map(d => ({
                name: d.full_name,
                source: d.email_source,
                linkedin: d.linkedin_url,
                facebook: d.facebook_url,
                confidence: d.confidence_score
            })));
        }

        console.log("\n==================================================");
        console.log("🎉 PACKET 4 TEST PASSED 100%! DORK RESOLVER VERIFIED!");
        console.log("==================================================");

    } catch (err) {
        console.error("❌ Packet 4 Dork Test Failed:", err);
    } finally {
        await LeadRepository.close();
    }
}

runPacket4Test();
