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

function formatHonorificName(rawName) {
    if (!rawName || typeof rawName !== 'string') return '';
    const parts = rawName.trim().split(/\s+/);
    if (parts.length > 1 && ['dr.', 'dr', 'prof.', 'prof', 'engr.', 'engr'].includes(parts[0].toLowerCase())) {
        return `${parts[0]} ${parts[1]}`;
    }
    return parts[0];
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
    const rawFullName = (decisionMaker && decisionMaker.full_name) ? decisionMaker.full_name : (lead.gmb_owner_name || '');
    const ownerName = formatHonorificName(rawFullName);
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
 * 3. MODULE 6 EXTENSION: Smart Follow-Up Pitch Engine (Contextual to Opens & Age)
 * Follows the 3-Tier Outreach Cadence:
 * - Step 1 (Day 3): Gentle bump (different if opened vs unopened)
 * - Step 2 (Day 7): Case study & value proposition
 * - Step 3 (Day 14): Polite breakup email
 */
async function generateFollowUpPitch(lead, decisionMaker = null, { step = 1, daysElapsed = 3, openCount = 0, clickCount = 0, previousSubject = '' } = {}) {
    const businessTitle = lead.title || 'your practice';
    const city = lead.city || 'your area';
    const rawFullName = (decisionMaker && decisionMaker.full_name) ? decisionMaker.full_name : (lead.gmb_owner_name || '');
    const ownerName = formatHonorificName(rawFullName);
    const greeting = ownerName ? `Hi ${ownerName},` : `Hi there,`;

    let threadedSubject = previousSubject ? (previousSubject.startsWith('Re:') ? previousSubject : `Re: ${previousSubject}`) : `Re: quick question re: ${businessTitle}`;

    const hasOpened = openCount > 0;
    const hasClicked = clickCount > 0;

    const followUpSystemPrompt = `You are an elite B2B sales copywriter writing follow-up emails for agency outreach.
The follow-up must be conversational, short (under 75 words), and ultra-relevant.
NEVER sound passive-aggressive ("Just checking if you saw my email" is strictly forbidden).

Context:
- Target Business: ${businessTitle} in ${city}
- Owner Name: ${ownerName || 'Friend'}
- Days Elapsed Since First Contact: ${daysElapsed} days
- Follow-up Cadence Stage: Step ${step}
- Engagement: ${hasClicked ? 'Lead clicked links in prior email' : (hasOpened ? 'Lead opened prior email ' + openCount + ' times' : 'Lead has not opened prior email')}

Cadence Directives:
${step === 1 ? `Step 1 (Day 3-5 Bump):
- If Opened: Acknowledge they had a moment to look over your prior note. Offer a quick 2-minute Loom/walkthrough to save them time.
- If Unopened: Friendly 2-sentence bump asking if they are the best person to speak with regarding local search bookings.` : ''}

${step === 2 ? `Step 2 (Day 7-10 Value Add):
- Share a short 1-sentence proof/case study: "We helped a practice in ${city} add 14 new booked patients last month by capturing local searchers."
- Ask if Tuesday or Wednesday at 2 PM works for a brief look.` : ''}

${step >= 3 ? `Step 3 (Day 14+ Polite Breakup):
- State clearly and respectfully that you don't want to flood their inbox, so you'll assume this isn't a top priority right now and close their file.
- Leave the door open if things change down the road.` : ''}

Return ONLY a valid JSON object matching this schema:
{
  "subject_line": "${threadedSubject}",
  "email_body": "punchy 2-to-3 sentence follow-up body",
  "recommended_step": ${step}
}`;

    // 1. Try Gemini Flash if key is configured
    if (GEMINI_API_KEY && !GEMINI_API_KEY.startsWith('AQ.')) {
        try {
            const geminiRes = await axios.post(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
                contents: [{ parts: [{ text: followUpSystemPrompt }] }],
                generationConfig: {
                    responseMimeType: "application/json",
                    temperature: 0.35
                }
            }, { timeout: 8000 });

            const geminiText = geminiRes.data.candidates[0].content.parts[0].text;
            const parsed = JSON.parse(geminiText);
            if (parsed.email_body) {
                parsed.subject_line = threadedSubject;
                return parsed;
            }
        } catch (geminiErr) {
            console.warn("Gemini Flash follow-up note:", geminiErr.message);
        }
    }

    // 2. High-Converting Fallback Templates (Tuned to Opens & Cadence)
    let fallbackBody = '';
    if (step === 1) {
        if (hasOpened) {
            fallbackBody = `${greeting}\n\nSaw you had a chance to look over my note regarding ${businessTitle}'s online patient booking flow.\n\nI put together a quick 2-minute video breakdown showing exactly what we'd tweak to capture more high-intent local patients.\n\nShould I send the link over?`;
        } else {
            fallbackBody = `${greeting}\n\nWanted to float this back to the top of your inbox in case you missed my previous note about capturing unbooked patient searches for ${businessTitle}.\n\nDoes Thursday at 11 AM work for a quick 5-minute chat, or should I reach out to someone else on your team?`;
        }
    } else if (step === 2) {
        fallbackBody = `${greeting}\n\nQuick follow-up — we recently implemented this booking workflow for another healthcare provider in ${city} and saw a 32% increase in new appointment inquiries in the first 30 days.\n\nHappy to share the exact setup we used. Does Tuesday at 2 PM work for 10 minutes?`;
    } else {
        fallbackBody = `${greeting}\n\nSince I haven't heard back, I'm assuming capturing extra local search bookings isn't a priority for ${businessTitle} right now.\n\nI don't want to clutter your inbox, so I'll close out your file. If your schedule opens up down the road, feel free to reach back out.\n\nWishing you and the team continued success!`;
    }

    return {
        subject_line: threadedSubject,
        email_body: fallbackBody,
        recommended_step: step
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
    generateMultiChannelPitch,
    generateFollowUpPitch
};
