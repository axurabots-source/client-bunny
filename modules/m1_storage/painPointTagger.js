/**
 * Automated Pain Point Tagger for Local Businesses
 * Analyzes GMB metrics, website availability, and review sentiment.
 */

function analyzePainPoints(leadData) {
    const painPoints = [];

    const website = (leadData.website || "").trim();
    const rating = parseFloat(leadData.review_rating) || 0.0;
    const reviewCount = parseInt(leadData.review_count, 10) || 0;

    // 1. Missing Website
    if (!website || website === "" || website.toLowerCase() === "null") {
        painPoints.push("no_website");
    }

    // 2. Low Rating / Reputation Problem
    if (rating > 0 && rating < 3.8 && reviewCount >= 5) {
        painPoints.push("low_rating");
    }

    // 3. Under-leveraged (Great quality clinic, but nearly invisible on Google)
    if (reviewCount < 15 && rating >= 4.5) {
        painPoints.push("under_leveraged");
    }

    // 4. High-ticket Spender (Established, lots of patient flow, high ability to pay agency retainer)
    if (reviewCount >= 150 && rating >= 4.5) {
        painPoints.push("high_ticket_spender");
    }

    // 5. Reputation Risk (Check user reviews if present)
    if (leadData.user_reviews) {
        try {
            let reviews = leadData.user_reviews;
            if (typeof reviews === 'string') {
                reviews = JSON.parse(reviews);
            }
            if (Array.isArray(reviews)) {
                const hasRecent1Star = reviews.some(r => (r.Rating === 1 || r.rating_float === 1));
                if (hasRecent1Star && !painPoints.includes("reputation_risk")) {
                    painPoints.push("reputation_risk");
                }
            }
        } catch (e) {
            // ignore json parse error on reviews
        }
    }

    return painPoints;
}

module.exports = {
    analyzePainPoints,
    tagPainPoints: analyzePainPoints
};
