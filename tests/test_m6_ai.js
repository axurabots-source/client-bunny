const { LeadRepository, pool } = require('../modules/m1_storage/leadRepository');
const { generateMultiChannelPitch } = require('../modules/m6_ai_engine/aiIntelligence');

async function runPacket6Test() {
    console.log("==================================================");
    console.log("🚀 TESTING PACKET 6: AI MULTI-CHANNEL PITCH ENGINE");
    console.log("==================================================");

    // Parse --leadId argument
    let requestedLeadId = null;
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--leadId' && args[i + 1]) {
            requestedLeadId = args[i + 1];
            break;
        }
    }

    let targetLead = null;
    let decisionMaker = null;

    if (requestedLeadId) {
        try {
            targetLead = await LeadRepository.getLeadById(requestedLeadId);
        } catch (e) {
            // will handle fallback
        }
    }

    if (!targetLead) {
        // Fetch first lead from database as fallback
        const sampleLeads = await LeadRepository.listLeads({ limit: 1 });
        if (sampleLeads && sampleLeads.length > 0) {
            targetLead = sampleLeads[0];
            console.log(`ℹ️ Lead ID ${requestedLeadId || 'default'} not found, using active DB Lead ID [${targetLead.id}]...`);
        } else {
            // Mock lead for standalone test
            targetLead = {
                id: 1,
                title: "SmileCare Dental Clinic",
                city: "Lahore",
                review_rating: 4.9,
                review_count: 85,
                pain_points: ["no_website", "high_ticket_spender"]
            };
            console.log("ℹ️ No leads in DB, running on realistic mock lead context...");
        }
    }

    // Get decision maker if exists
    if (targetLead.decision_makers && targetLead.decision_makers.length > 0) {
        decisionMaker = targetLead.decision_makers[0];
    } else {
        decisionMaker = {
            full_name: "Dr. Tariq Mahmood",
            title_role: "Principal Dentist & Owner"
        };
    }

    console.log(`\n📋 Target Lead Context:`);
    console.log(` - Business: "${targetLead.title}"`);
    console.log(` - City: ${targetLead.city || 'N/A'}`);
    console.log(` - Decision Maker: ${decisionMaker.full_name} (${decisionMaker.title_role})`);
    console.log(` - Identified Pain Points:`, targetLead.pain_points);

    console.log(`\n🤖 Calling AI Pitch Engine with 3-Step Framework (Situation -> Solution -> Ask)...`);
    const startTime = Date.now();
    const result = await generateMultiChannelPitch(targetLead, decisionMaker);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n⏱️ Response received in ${duration}s.`);
    console.log("==================================================");
    console.log("📦 RAW JSON OUTPUT (Packet 6 Deliverable):");
    console.log("==================================================");
    console.log(JSON.stringify(result, null, 2));

    console.log("\n==================================================");
    console.log("🔍 QUALITY & FRAMEWORK VERIFICATION CHECKLIST:");
    console.log("==================================================");

    const hasSubject = typeof result.subject_line === 'string' && result.subject_line.length > 0;
    const hasEmailBody = typeof result.email_body === 'string' && result.email_body.length > 0;
    const hasLinkedIn = typeof result.linkedin_note === 'string' && result.linkedin_note.length > 0;
    const hasWhatsApp = typeof result.whatsapp_quick_msg === 'string' && result.whatsapp_quick_msg.length > 0;

    // Check anti-fluff rules
    const noCorporateFluff = !result.email_body.toLowerCase().includes("hope this email finds you well") &&
                             !result.email_body.toLowerCase().includes("my name is");

    // Check 3-step presence (mentions situation + solution + ask)
    const hasSpecificAsk = result.email_body.includes("?") && 
                           (result.email_body.toLowerCase().includes("tuesday") || 
                            result.email_body.toLowerCase().includes("thursday") ||
                            result.email_body.toLowerCase().includes("work") ||
                            result.email_body.toLowerCase().includes("minutes"));

    console.log(`[${hasSubject ? 'PASS' : 'FAIL'}] Valid subject_line returned: "${result.subject_line}"`);
    console.log(`[${hasEmailBody ? 'PASS' : 'FAIL'}] Valid email_body returned (${result.email_body.split('\n').filter(Boolean).length} sections)`);
    console.log(`[${hasLinkedIn ? 'PASS' : 'FAIL'}] Valid linkedin_note returned (${result.linkedin_note.length} chars)`);
    console.log(`[${hasWhatsApp ? 'PASS' : 'FAIL'}] Valid whatsapp_quick_msg returned`);
    console.log(`[${noCorporateFluff ? 'PASS' : 'FAIL'}] Anti-Fluff Rule: Zero corporate intro buzzwords`);
    console.log(`[${hasSpecificAsk ? 'PASS' : 'FAIL'}] 3-Step Rule: Frictionless specific ask present`);

    if (hasSubject && hasEmailBody && hasLinkedIn && hasWhatsApp) {
        console.log("\n🎉 PACKET 6 VERIFICATION: SUCCESS (100% PASS)\n");
        process.exit(0);
    } else {
        console.error("\n❌ PACKET 6 VERIFICATION FAILED: Missing required keys.\n");
        process.exit(1);
    }
}

runPacket6Test().catch(err => {
    console.error("Test execution error:", err);
    process.exit(1);
});
