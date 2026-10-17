const axios = require('axios');
require('dotenv').config();

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

/**
 * 1. Parse Messy Bio & Contact Text using Groq (Fast & Precise)
 */
async function parseBioWithAI(rawText, businessTitle = '') {
    if (!rawText || rawText.trim().length < 30) {
        return null;
    }

    const cleanInput = rawText.replace(/\s+/g, ' ').substring(0, 3000);

    const prompt = `Analyze this business website text for "${businessTitle}". Extract key leadership and contact data.
Return ONLY a valid JSON object with these exact keys:
{
  "owner_name": string or null,
  "owner_role": string or null,
  "whatsapp_number": string or null,
  "direct_email": string or null,
  "is_doctor_or_founder": boolean
}

Text:
"""${cleanInput}"""`;

    try {
        if (GROQ_API_KEY) {
            const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: 'qwen/qwen3.8-27b',
                messages: [
                    { role: 'system', content: 'You are an expert data extraction bot. You only respond with valid raw JSON without markdown code blocks.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                response_format: { type: "json_object" }
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 8000
            });

            const content = res.data.choices[0].message.content.trim();
            const parsed = JSON.parse(content);
            return parsed;
        }
    } catch (err) {
        console.warn("Groq bio parsing note:", err.message);
    }

    return null;
}

/**
 * 2. MODULE 6: Multi-Channel Outreach Pitch Engine (Gemini Flash + Groq Qwen)
 * Implements the strict 3-step high-converting framework:
 * - Step 1: Situation (No self-intro, focus 100% on their situation & pain point)
 * - Step 2: Solution (1 clear sentence: "This is what I fix")
 * - Step 3: Specific Ask ("Does Tuesday at 2 PM work for 10 minutes? Easy yes / easy no")
 */
async function generateMultiChannelPitch(lead, decisionMaker = null) {
    const businessTitle = lead.title || 'your practice';
    const city = lead.city || 'your area';
    const ownerName = (decisionMaker && decisionMaker.full_name) 
        ? decisionMaker.full_name.split(' ')[0] 
        : (lead.gmb_owner_name ? lead.gmb_owner_name.split(' ')[0] : '');
    const greeting = ownerName ? `Hi ${ownerName},` : `Hi there,`;
    const rating = lead.review_rating || '4.8';
    const reviews = lead.review_count || 15;

    // Format pain points
    let painPointDesc = 'missing website losing high-intent patients to local competitors';
    if (Array.isArray(lead.pain_points) && lead.pain_points.length > 0) {
        if (lead.pain_points.includes('no_website')) {
            painPointDesc = 'no dedicated website, leaving your high-intent local search traffic uncaptured';
        } else if (lead.pain_points.includes('reputation_risk')) {
            painPointDesc = 'unanswered critical reviews pulling down your conversion from Google Maps searches';
        } else if (lead.pain_points.includes('high_ticket_spender')) {
            painPointDesc = 'missing automated digital booking flow despite your high patient volume';
        }
    }

    const systemPrompt = `You are an expert client acquisition copywriter for digital agencies.
You write cold outreach copy that NEVER sounds like generic marketing spam.
Follow this strict 3-step copywriting framework:

Structure:
- Step 1 (Situation): Stop introducing yourself. Start directly with their situation and problem. You cannot hook attention talking about yourself. Make it 100% about them.
- Step 2 (Solution): State what you solve in ONE clear sentence. Don't ramble about features and benefits. One sentence: "This is what I fix."
- Step 3 (Ask): Make the ask specific and frictionless. Do NOT say "Let me know your thoughts" or "Hope to hear from you". Say something like "Does Tuesday at 2 PM work for 10 minutes?" or "Does Thursday at 11 AM work for 5 minutes?" (Easy yes or easy no).

Rules:
- NO corporate fluff ("I hope this email finds you well" or "My name is X and I work at Y" is STRICTLY FORBIDDEN).
- Keep the email body to 3 punchy sentences following the 3-step framework (Situation, Solution, Ask).
- Be humble, professional, and peer-to-peer.

Return ONLY a valid JSON object matching this schema:
{
  "subject_line": "short, curiosity-driven subject line (under 6 words, lowercase preferred)",
  "email_body": "3-sentence email body following: (1) Situation -> (2) Solution -> (3) Specific Ask",
  "linkedin_note": "under 250 characters connection note using the same 3-step formula",
  "whatsapp_quick_msg": "short 2-sentence conversational WhatsApp message with specific ask"
}`;

    const userPrompt = `Target Business Context:
- Business: ${businessTitle}
- City: ${city}
- Owner Name: ${ownerName || 'Unknown (address warmly)'}
- Google Reputation: ${rating}★ across ${reviews} reviews
- Primary Problem Identified: ${painPointDesc}

Generate high-converting outreach copy adhering strictly to the 3-step framework. Return JSON only.`;

    // 1. Try Gemini Flash if key is present
    if (GEMINI_API_KEY && !GEMINI_API_KEY.startsWith('AQ.')) {
        try {
            const geminiRes = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                contents: [{ parts: [{ text: systemPrompt + '\n\n' + userPrompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.4
                }
            }, { timeout: 8000 });

            const geminiText = geminiRes.data.candidates[0].content.parts[0].text;
            const parsed = JSON.parse(geminiText);
            if (parsed.email_body) return parsed;
        } catch (geminiErr) {
            console.warn("Gemini Flash pitch note:", geminiErr.message);
        }
    }

    // 2. Try Groq (qwen/qwen3.8-27b) with JSON mode
    if (GROQ_API_KEY) {
        try {
            const groqRes = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: 'qwen/qwen3.8-27b',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.4,
                response_format: { type: "json_object" }
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 8000
            });

            const content = groqRes.data.choices[0].message.content.trim();
            const parsed = JSON.parse(content);
            if (parsed.email_body) return parsed;
        } catch (groqErr) {
            console.warn("Groq pitch note:", groqErr.message);
        }
    }

    // 3. High-Converting 3-Step Fallback Template (Guaranteed Deliverability)
    return {
        subject_line: `quick question re: ${businessTitle}`,
        email_body: `${greeting}\n\nI noticed ${businessTitle} holds a strong ${rating}★ reputation in ${city}, but patients searching online currently run into ${painPointDesc}.\n\nWe build streamlined client-acquisition booking setups that turn local searchers into confirmed appointments on autopilot.\n\nDoes Tuesday at 2 PM work for 10 minutes to see how this works?`,
        linkedin_note: `${greeting} Noticed ${businessTitle}'s ${rating}★ standing in ${city}. We help local leaders fix ${painPointDesc.slice(0, 50)} to convert more bookings. Does Thursday at 2 PM work for a 5-min chat?`,
        whatsapp_quick_msg: `Hi ${ownerName || 'there'} - saw ${businessTitle}'s ${rating}★ reviews in ${city}. We help local businesses capture lost search traffic. Does tomorrow at 2 PM work for a quick 5-min intro?`
    };
}

/**
 * Backward compatibility helper
 */
async function generateColdPitch(lead, decisionMaker = null) {
    const multi = await generateMultiChannelPitch(lead, decisionMaker);
    return multi.email_body || multi;
}

module.exports = {
    parseBioWithAI,
    generateColdPitch,
    generateMultiChannelPitch
};
