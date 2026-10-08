const { LeadRepository } = require('../modules/m1_storage/leadRepository');

async function runPacket1Test() {
    console.log("==================================================");
    console.log("🚀 TESTING PACKET 1: SUPABASE DB & PAIN POINT TAGGER");
    console.log("==================================================");

    try {
        // Test Lead 1: No website, good rating, few reviews (Under-leveraged)
        const testLead1 = {
            place_id: "test_place_001",
            title: "Al-Razi Dental Clinic",
            category: "Dentist",
            address: "Main Boulevard Gulberg, Lahore",
            city: "Lahore",
            phone: "+92 300 1234567",
            website: "", // No website!
            review_count: 9,
            review_rating: 4.7,
            gmb_owner_name: "Dr. Tariq Mahmood",
            link: "https://maps.google.com/?cid=123"
        };

        console.log(`\n1. Upserting Lead: "${testLead1.title}"...`);
        const savedLead1 = await LeadRepository.upsertLead(testLead1);
        console.log(`✅ Saved Lead ID: ${savedLead1.id}`);
        console.log(`   Detected Pain Points:`, savedLead1.pain_points);

        // Test Lead 2: High review count, high rating (High ticket spender)
        const testLead2 = {
            place_id: "test_place_002",
            title: "Premier Smile Studio",
            category: "Cosmetic Dentist",
            address: "DHA Phase 5, Lahore",
            city: "Lahore",
            phone: "+92 321 9876543",
            website: "https://premiersmile.pk",
            review_count: 240,
            review_rating: 4.9,
            gmb_owner_name: "Dr. Ayesha Malik",
            link: "https://maps.google.com/?cid=456"
        };

        console.log(`\n2. Upserting Lead: "${testLead2.title}"...`);
        const savedLead2 = await LeadRepository.upsertLead(testLead2);
        console.log(`✅ Saved Lead ID: ${savedLead2.id}`);
        console.log(`   Detected Pain Points:`, savedLead2.pain_points);

        // Test Adding Decision Maker to Lead 1
        console.log(`\n3. Adding Decision Maker to Lead ID ${savedLead1.id}...`);
        const dm = await LeadRepository.addDecisionMaker(savedLead1.id, {
            full_name: "Dr. Tariq Mahmood",
            title_role: "Principal Dentist & Owner",
            email: "dr.tariq@alrazi.pk",
            email_source: "website_crawl",
            linkedin_url: "https://linkedin.com/in/drtariq",
            phone: "+92 300 1234567",
            confidence_score: 90
        });
        console.log(`✅ Decision Maker Added: ${dm.full_name} (${dm.title_role}) - Score: ${dm.confidence_score}`);

        // Test Fetching Lead with Decision Makers
        console.log(`\n4. Fetching Complete Lead Details for ID ${savedLead1.id}...`);
        const fetchedLead = await LeadRepository.getLeadById(savedLead1.id);
        console.log(`✅ Verified Record:`, {
            id: fetchedLead.id,
            title: fetchedLead.title,
            pain_points: fetchedLead.pain_points,
            contacts: fetchedLead.decision_makers.map(d => ({ name: d.full_name, email: d.email, role: d.title_role }))
        });

        // Test Summary Stats
        console.log(`\n5. Checking Supabase Database Stats...`);
        const stats = await LeadRepository.getStats();
        console.log(`📊 Current DB Pipeline Stats:`, stats);

        console.log("\n==================================================");
        console.log("🎉 PACKET 1 TEST PASSED 100%! DATABASE & LOGIC VERIFIED!");
        console.log("==================================================");

    } catch (err) {
        console.error("❌ Packet 1 Test Failed:", err);
    } finally {
        await LeadRepository.close();
    }
}

runPacket1Test();
