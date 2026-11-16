/**
 * Client Bunny — Sub-Niche Intelligent Query Engine & Relevance Scorer
 * 
 * Features:
 * 1. Query Normalization & Redundant Location Stripping
 * 2. Multi-Anchor Semantic Expansion (Synonyms / Sister Terms)
 * 3. 0-100% Relevance Scoring against Target Sub-Niche
 * 4. Spam / Irrelevant Ad Filter
 */

// Common stopwords to exclude from semantic token matching
const STOP_WORDS = new Set([
    'in', 'at', 'near', 'by', 'of', 'and', 'or', 'the', 'a', 'an', 'for', 'to', 'with',
    'best', 'top', 'local', 'good', 'affordable', 'cheap', 'private', 'uk', 'usa', 'england'
]);

// High-confidence sub-niche synonym & sister variant mapping
const SUB_NICHE_MAP = {
    'cardiac surgeon': ['cardiologist', 'heart specialist', 'cardiac clinic', 'cardiology'],
    'cardiac surgeons': ['cardiologists', 'heart specialists', 'cardiac surgery clinic', 'cardiology'],
    'cardiologist': ['cardiac surgeon', 'heart specialist', 'cardiology clinic'],
    'cardiologists': ['cardiac surgeons', 'heart specialists', 'cardiology clinic'],
    'implant periodontist': ['dental implants', 'periodontist', 'periodontal clinic'],
    'implant periodontists': ['dental implants', 'periodontists', 'periodontal clinic'],
    'cosmetic dentist': ['aesthetic dentistry', 'dental clinic', 'teeth whitening'],
    'cosmetic dentists': ['aesthetic dentistry', 'dental clinic', 'teeth whitening'],
    'pediatric dentist': ['children dentist', 'pediatric dental clinic'],
    'pediatric dentists': ['children dentists', 'pediatric dental clinic'],
    'orthopedic surgeon': ['orthopedics', 'joint specialist', 'orthopedic clinic'],
    'orthopedic surgeons': ['orthopedics', 'joint specialists', 'orthopedic clinic'],
    'dermatologist': ['skin specialist', 'dermatology clinic', 'skin doctor'],
    'dermatologists': ['skin specialists', 'dermatology clinic', 'skin doctors'],
    'commercial real estate lawyer': ['commercial property solicitor', 'real estate attorney'],
    'commercial real estate lawyers': ['commercial property solicitors', 'real estate attorneys'],
    'personal injury lawyer': ['accident claim solicitor', 'personal injury attorney'],
    'personal injury lawyers': ['accident claim solicitors', 'personal injury attorneys'],
    'roof repair': ['roofing contractor', 'roofing services', 'roof replacement'],
    'hvac contractor': ['heating and cooling', 'air conditioning repair', 'hvac services']
};

/**
 * 1. Sanitize & Normalize Niche Query
 * Removes accidental location suffixes from user input (e.g. "cardiac surgeons in Manchester England")
 */
function sanitizeNicheQuery(rawNiche, { area = '', city = '', state = '', country = '' } = {}) {
    if (!rawNiche || typeof rawNiche !== 'string') {
        return { cleanNiche: 'Businesses', targetLocation: `${city}, ${country}`.trim(), fullQuery: `Businesses in ${city}, ${country}`.trim() };
    }

    let clean = rawNiche.trim();

    // Strip leading/trailing quotes
    clean = clean.replace(/^["']|["']$/g, '');

    // List of location tokens to strip if user typed them into niche input
    const locationTokens = [
        area, city, state, country,
        'england', 'scotland', 'wales', 'united kingdom', 'uk', 'usa', 'united states', 'canada', 'australia', 'pakistan', 'uae', 'dubai'
    ].filter(Boolean).map(t => t.toLowerCase().trim());

    // Remove "in <location>", "near <location>", "at <location>"
    const prepositionPattern = /\s+(?:in|near|around|at|within)\s+([^,]+)(?:,\s*.*)?$/i;
    const prepMatch = clean.match(prepositionPattern);
    if (prepMatch) {
        const potentialLoc = prepMatch[1].toLowerCase().trim();
        const matchesLocation = locationTokens.some(loc => loc.length > 2 && (potentialLoc.includes(loc) || loc.includes(potentialLoc)));
        if (matchesLocation || prepMatch[0].length < 25) {
            clean = clean.replace(prepositionPattern, '').trim();
        }
    }

    // Direct token strip at end of string
    for (const loc of locationTokens) {
        if (!loc || loc.length < 3) continue;
        const endRegex = new RegExp(`[\\s,]+${escapeRegex(loc)}$`, 'i');
        clean = clean.replace(endRegex, '').trim();
    }

    // Clean any stray punctuation
    clean = clean.replace(/[,\s]+$/, '').trim();
    if (!clean) clean = rawNiche.trim();

    // Capitalize first letter of words for clean presentation
    const titleCaseNiche = clean.split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

    const locationParts = [area, city, country].filter(Boolean);
    const targetLocation = locationParts.join(', ');
    const fullQuery = targetLocation ? `${titleCaseNiche} in ${targetLocation}` : titleCaseNiche;

    return {
        cleanNiche: titleCaseNiche,
        targetLocation,
        fullQuery
    };
}

/**
 * 2. Multi-Anchor Semantic Expansion Variants
 */
function getSubNicheVariants(cleanNiche) {
    const lower = cleanNiche.toLowerCase().trim();
    if (SUB_NICHE_MAP[lower]) {
        return SUB_NICHE_MAP[lower];
    }

    // Generic fallback variant generator
    const variants = [];
    if (lower.endsWith('s')) {
        variants.push(lower.slice(0, -1)); // singular
        variants.push(`${lower.slice(0, -1)} clinic`);
        variants.push(`${lower.slice(0, -1)} specialist`);
    } else {
        variants.push(`${lower}s`); // plural
        variants.push(`${lower} clinic`);
        variants.push(`${lower} specialist`);
    }
    return variants.slice(0, 3);
}

/**
 * 3. Extract Core Semantic Tokens from Niche
 */
function getSemanticTokens(cleanNiche) {
    const rawTokens = cleanNiche.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2 && !STOP_WORDS.has(t));

    const tokenSet = new Set(rawTokens);

    // Add root stems and known medical/business cross-tokens
    for (const t of rawTokens) {
        if (t.includes('cardio') || t.includes('heart') || t.includes('cardiac')) {
            tokenSet.add('cardiac');
            tokenSet.add('heart');
            tokenSet.add('cardiology');
            tokenSet.add('cardiologist');
            tokenSet.add('cardiovascular');
        }
        if (t.includes('surgeon') || t.includes('surgery')) {
            tokenSet.add('surgeon');
            tokenSet.add('surgery');
            tokenSet.add('surgical');
            tokenSet.add('consultant');
        }
        if (t.includes('dent') || t.includes('tooth') || t.includes('teeth')) {
            tokenSet.add('dental');
            tokenSet.add('dentist');
            tokenSet.add('dentistry');
        }
        if (t.includes('implant')) {
            tokenSet.add('implant');
            tokenSet.add('implants');
            tokenSet.add('periodontist');
        }
        if (t.includes('lawyer') || t.includes('attorney') || t.includes('solicitor')) {
            tokenSet.add('lawyer');
            tokenSet.add('solicitor');
            tokenSet.add('attorney');
            tokenSet.add('law');
            tokenSet.add('legal');
        }
        if (t.includes('roof')) {
            tokenSet.add('roof');
            tokenSet.add('roofing');
            tokenSet.add('roofer');
        }
    }

    return Array.from(tokenSet);
}

/**
 * 4. Relevance Scorer (0 to 100%)
 * Evaluates listing Title, Snippet, Category, Address against Sub-Niche Tokens
 */
function calculateLeadRelevance(listing, cleanNiche, semanticTokens = null) {
    const tokens = semanticTokens || getSemanticTokens(cleanNiche);
    if (tokens.length === 0) {
        return { score: 90, isRelevant: true, matchedTerms: ['direct_search'] };
    }

    const titleText = (listing.title || '').toLowerCase();
    const snippetText = (listing.snippet || '').toLowerCase();
    const addressText = (listing.addressLine || '').toLowerCase();
    const fullText = `${titleText} ${snippetText} ${addressText}`;

    const matchedTerms = [];
    let matchPoints = 0;

    for (const token of tokens) {
        if (titleText.includes(token)) {
            matchedTerms.push(token);
            matchPoints += 40; // Title match has highest weight
        } else if (snippetText.includes(token)) {
            matchedTerms.push(token);
            matchPoints += 25; // Snippet / Category match
        } else if (fullText.includes(token)) {
            matchedTerms.push(token);
            matchPoints += 15;
        }
    }

    // Generic health / hospital / professional clinic bonus if niche is medical
    const isMedicalNiche = tokens.some(t => ['cardiac', 'cardiologist', 'surgeon', 'doctor', 'clinic', 'dentist', 'dermatologist'].includes(t));
    if (isMedicalNiche) {
        if (fullText.includes('hospital') || fullText.includes('clinic') || fullText.includes('healthcare') || fullText.includes('nhs') || fullText.includes('centre') || fullText.includes('dr ')) {
            matchPoints += 15;
        }
    }

    // Cap score at 100
    const finalScore = Math.min(Math.max(matchPoints, 10), 100);

    // Negative filtering: if totally unrelated commercial categories appear
    const unrelatedKeywords = ['supermarket', 'convenience store', 'gas station', 'pet store', 'clothing store', 'florist'];
    const hasUnrelated = unrelatedKeywords.some(u => fullText.includes(u));
    
    if (hasUnrelated && matchPoints < 35) {
        return { score: 15, isRelevant: false, matchedTerms: [] };
    }

    // Consider relevant if score >= 35 or if at least one core token matched
    const isRelevant = finalScore >= 35 || matchedTerms.length > 0;

    return {
        score: finalScore,
        isRelevant,
        matchedTerms
    };
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    sanitizeNicheQuery,
    getSubNicheVariants,
    getSemanticTokens,
    calculateLeadRelevance
};
