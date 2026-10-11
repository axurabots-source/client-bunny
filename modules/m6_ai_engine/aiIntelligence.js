const axios = require('axios');

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
        console.warn("Groq bio parsing error:", err.message);
    }

    return null;
}

/**
 * 2. Generate Hyper-Personalized Cold Pitch via AI
 */
async function generateColdPitch(lead, decisionMaker = null) {
    const businessName = lead.title || 'your business';
    const ownerName = decisionMaker && decisionMaker.full_name ? decisionMaker.full_name : 'Team';
    const role = decisionMaker && decisionMaker.title_role ? decisionMaker.title_role : 'Owner';
    const city = lead.city || '';
    const rating = lead.review_rating || '4.5';
    const reviews = lead.review_count || 10;
    const painPoints = Array.isArray(lead.pain_points) ? lead.pain_points.join(', ') : 'digital optimization';

    const prompt = `Write an irresistible, highly professional 3-sentence cold email pitch to a business owner.
Recipient: ${ownerName} (${role})
Business: ${businessName} in ${city}
Google Rating: ${rating} (${reviews} reviews)
Identified Pain Point: ${painPoints}
Goal: Offer a targeted solution (modern web presence / lead conversion / automated bookings) and ask for a 5-minute brief chat.
Tone: Concise, value-driven, authentic, respectful, NOT pushy. Do not include subject lines or sign-offs, just the 3 sentences body.`;

    // Try Groq First
    if (GROQ_API_KEY) {
        try {
            const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
                model: 'qwen/qwen3.8-27b',
                messages: [
                    { role: 'system', content: 'You are an elite B2B sales copywriter specializing in ultra-personalized cold outreach.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.5,
                max_tokens: 250
            }, {
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 8000
            });

            return res.data.choices[0].message.content.trim();
        } catch (err) {
            console.warn("Groq pitch generation fallback:", err.message);
        }
    }

    // Dynamic High-Converting Fallback Template if AI offline
    return `Hi ${ownerName}, I came across ${businessName}'s impressive ${rating}★ reputation in ${city} and noticed your online presence has key opportunities around ${painPoints}. We specialize in helping established local leaders convert more high-intent searches into booked clients. Would you be open to a quick 5-minute walkthrough this week to see the exact adjustments we recommend?`;
}

module.exports = {
    parseBioWithAI,
    generateColdPitch
};
