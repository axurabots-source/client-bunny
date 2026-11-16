const { sanitizeNicheQuery, calculateLeadRelevance, getSubNicheVariants } = require('../modules/m2_gmb_integration/subNicheEngine');
const { executeLiveHunt } = require('../modules/m2_gmb_integration/liveHunter');
const { pool } = require('../modules/m1_storage/leadRepository');

async function runSubNicheVerification() {
    console.log('========================================================');
    console.log('🧪 VERIFYING CLIENT BUNNY SUB-NICHE ENGINE & STREAM-FIRST');
    console.log('========================================================\n');

    // TEST 1: Query Sanitization
    console.log('--- TEST 1: Query Sanitization ---');
    const q1 = sanitizeNicheQuery('cardiac surgeons in Manchester England', {
        city: 'Manchester',
        country: 'United Kingdom'
    });
    console.log('Result 1:', q1);
    if (q1.cleanNiche !== 'Cardiac Surgeons' || q1.fullQuery !== 'Cardiac Surgeons in Manchester, United Kingdom') {
        throw new Error(`Sanitization failed! Got: ${JSON.stringify(q1)}`);
    }
    console.log('✅ TEST 1 PASSED: Query sanitized cleanly without location stutter.\n');

    // TEST 2: Relevance Scoring
    console.log('--- TEST 2: Relevance Scoring ---');
    const cardiacLead = {
        title: 'North West Heart Centre',
        snippet: 'Cardiologist · Southmoor Rd, Wythenshawe, Manchester',
        addressLine: 'Southmoor Rd, Wythenshawe, Manchester'
    };
    const rel1 = calculateLeadRelevance(cardiacLead, 'Cardiac Surgeons');
    console.log('Heart Centre Relevance:', rel1);
    if (!rel1.isRelevant || rel1.score < 50) {
        throw new Error('Relevance scoring failed for Heart Centre!');
    }

    const groceryLead = {
        title: 'Tesco Express Manchester',
        snippet: 'Supermarket · Market St, Manchester',
        addressLine: 'Market St, Manchester'
    };
    const rel2 = calculateLeadRelevance(groceryLead, 'Cardiac Surgeons');
    console.log('Tesco Express Relevance:', rel2);
    if (rel2.isRelevant) {
        throw new Error('Relevance filter failed to drop irrelevant business!');
    }
    console.log('✅ TEST 2 PASSED: Semantic relevance filter verified.\n');

    // TEST 3: Multi-Anchor Expansion
    console.log('--- TEST 3: Multi-Anchor Semantic Expansion ---');
    const variants = getSubNicheVariants('cardiac surgeons');
    console.log('Variants for "cardiac surgeons":', variants);
    if (!variants.includes('cardiologists') && !variants.includes('cardiology')) {
        throw new Error('Variants generation missing cardiologists/cardiology!');
    }
    console.log('✅ TEST 3 PASSED: Multi-anchor booster variants verified.\n');

    // TEST 4: Live Sub-Niche Hunt Execution with Immediate Streaming
    console.log('--- TEST 4: Live Sub-Niche Hunt Execution (Streaming Test) ---');
    const streamedLeads = [];
    const targetListName = `Test Cardiac Surgeons ${Date.now()}`;

    const huntResult = await executeLiveHunt({
        listName: targetListName,
        country: 'United Kingdom',
        city: 'Manchester',
        niche: 'cardiac surgeons in Manchester England',
        limit: 15,
        autoEnrich: true,
        onLeadExtracted: (lead) => {
            streamedLeads.push(lead);
            console.log(`   ⚡ [Stream Event Received] #${streamedLeads.length}: ${lead.title} (${lead.city})`);
        }
    });

    console.log('\nHunt Result Summary:', {
        query: huntResult.query,
        listName: huntResult.listName,
        totalFound: huntResult.totalFound,
        newLeadsCount: huntResult.newLeadsCount,
        streamedCount: streamedLeads.length
    });

    if (streamedLeads.length === 0) {
        throw new Error('Live hunt yielded 0 streamed leads!');
    }

    // Verify in database
    const dbCheck = await pool.query(`SELECT id, title, category, city FROM leads WHERE list_name = $1;`, [targetListName]);
    console.log(`\n📊 DB Check: Found ${dbCheck.rows.length} leads in Supabase under "${targetListName}".`);

    // Clean up test list leads
    await pool.query(`DELETE FROM leads WHERE list_name = $1;`, [targetListName]);
    await pool.query(`DELETE FROM lead_lists WHERE name = $1;`, [targetListName]);
    console.log(`🧹 Test artifacts cleaned from database.\n`);

    console.log('========================================================');
    console.log('🎉 ALL SUB-NICHE TESTS PASSED SUCCESSFULLY (100% VERIFIED)!');
    console.log('========================================================');
    process.exit(0);
}

runSubNicheVerification().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
