const axios = require('axios');
const cheerio = require('cheerio');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function searchDuckDuckGo(query) {
    try {
        const response = await axios.post('https://html.duckduckgo.com/html/', `q=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 8000
        });

        const $ = cheerio.load(response.data);
        const results = [];

        $('.result').each((i, el) => {
            if (results.length >= 4) return;
            const title = $(el).find('.result__title a').text().trim();
            const rawUrl = $(el).find('.result__url').text().trim();
            const href = $(el).find('.result__title a').attr('href') || '';
            const snippet = $(el).find('.result__snippet').text().trim();

            if (title && snippet) {
                // Decode DDG redirect url if needed
                let finalUrl = href;
                if (href.includes('uddg=')) {
                    try {
                        const match = href.match(/uddg=([^&]+)/);
                        if (match) finalUrl = decodeURIComponent(match[1]);
                    } catch (e) {}
                }

                results.push({
                    title,
                    url: finalUrl || rawUrl,
                    snippet
                });
            }
        });

        return { success: true, results, engine: 'duckduckgo' };
    } catch (err) {
        return { success: false, error: err.message, results: [] };
    }
}

async function searchGoogle(query) {
    try {
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&num=5`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 8000
        });

        const $ = cheerio.load(response.data);
        const results = [];

        // Google organic result blocks
        $('div.g, div.MjjYud').each((i, el) => {
            if (results.length >= 4) return;
            const title = $(el).find('h3').first().text().trim();
            const link = $(el).find('a[href^="http"]').first().attr('href') || '';
            const snippet = $(el).find('div[style*="-webkit-line-clamp"], div.VwiC3b').text().trim();

            if (title && link && !link.includes('google.com')) {
                results.push({
                    title,
                    url: link,
                    snippet: snippet || title
                });
            }
        });

        return { success: true, results, engine: 'google' };
    } catch (err) {
        return { success: false, error: err.message, results: [] };
    }
}

/**
 * Universal Search with Fallback
 */
async function searchDork(query) {
    // 1. Try DuckDuckGo first (Zero rate limit, reliable)
    let res = await searchDuckDuckGo(query);
    if (res.success && res.results.length > 0) {
        return res;
    }

    // 2. Fallback to Google
    res = await searchGoogle(query);
    return res;
}

module.exports = {
    searchDork,
    searchDuckDuckGo,
    searchGoogle
};
