const crypto = require('crypto');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000
});

pool.on('error', (err) => {
    console.warn('[Tracking Pool] Idle client dropped:', err.message);
});

// 1x1 Transparent Single-Pixel GIF Buffer (43 bytes)
const TRANSPARENT_GIF = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
);

class OutreachTracker {
    /**
     * Generate a secure random 24-char hex token
     */
    static generateToken() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Hash IP for privacy-friendly bot and duplicate tracking
     */
    static hashIp(ip) {
        if (!ip) return null;
        return crypto.createHash('sha256').update(ip + (process.env.SESSION_SECRET || 'client-bunny-salt')).digest('hex').substring(0, 16);
    }

    /**
     * Detect automated security scanner bots vs real users
     */
    static isSuspiciousBot(userAgent, sentAt) {
        if (!userAgent) return false;
        const ua = userAgent.toLowerCase();

        // Common security pre-fetch engines and headless browsers
        const botKeywords = [
            'barracuda', 'proofpoint', 'trendmicro', 'safelinks',
            'virustotal', 'crawler', 'spider', 'headlesschrome',
            'ahrefs', 'semrush', 'python-requests', 'curl', 'wget'
        ];

        for (const kw of botKeywords) {
            if (ua.includes(kw)) return true;
        }

        // If open occurs within 2 seconds of sending, it's typically an automated server-side prefetcher
        if (sentAt) {
            const timeDiffMs = Date.now() - new Date(sentAt).getTime();
            if (timeDiffMs > 0 && timeDiffMs < 2500) {
                return true;
            }
        }

        return false;
    }

    /**
     * Inject open tracking pixel and wrap hyperlinks in HTML email body
     */
    static prepareOutreachContent({ bodyHtml, bodyText, token, baseUrl }) {
        if (!token) {
            token = this.generateToken();
        }

        const cleanBaseUrl = (baseUrl || 'http://localhost:3000').replace(/\/+$/, '');
        const pixelUrl = `${cleanBaseUrl}/api/track/open/${token}`;

        // Build HTML wrapper if bodyHtml not provided
        let html = bodyHtml;
        if (!html) {
            const textContent = bodyText || '';
            html = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #111827; white-space: pre-wrap;">${textContent}</div>`;
        }

        // Wrap hyperlinks in HTML for click tracking: <a href="http..."> -> <a href="baseUrl/api/track/click/token?url=...">
        // Excludes mailto:, tel:, and internal anchor links (#)
        html = html.replace(/<a\s+(?:[^>]*?\s+)?href=["'](https?:\/\/[^"']+)["']([^>]*)>/gi, (match, url, rest) => {
            // Skip tracking links that already point to our own tracker
            if (url.includes('/api/track/')) {
                return match;
            }
            const trackedUrl = `${cleanBaseUrl}/api/track/click/${token}?url=${encodeURIComponent(url)}`;
            return `<a href="${trackedUrl}"${rest}>`;
        });

        // Inject 1x1 tracking pixel at the end of the email body
        const pixelTag = `<img src="${pixelUrl}" width="1" height="1" style="display:none!important;width:1px!important;height:1px!important;border:0!important;outline:none!important;visibility:hidden!important;" alt="" />`;
        
        if (html.includes('</body>')) {
            html = html.replace('</body>', `${pixelTag}</body>`);
        } else {
            html = `${html}\n${pixelTag}`;
        }

        return {
            token,
            html,
            text: bodyText || bodyHtml.replace(/<[^>]*>/g, '')
        };
    }

    /**
     * Handle incoming Open Tracking Pixel request
     */
    static async recordOpen(token, { userAgent = '', ip = '' } = {}) {
        if (!token || typeof token !== 'string') return false;

        try {
            // Find outreach log
            const logRes = await pool.query(
                `SELECT id, lead_id, sent_at, status, open_count FROM outreach_logs WHERE tracking_token = $1 LIMIT 1`,
                [token.trim()]
            );

            if (logRes.rows.length === 0) {
                return false;
            }

            const log = logRes.rows[0];
            const isBot = this.isSuspiciousBot(userAgent, log.sent_at);
            const hashedIp = this.hashIp(ip);

            // 1. Update outreach_logs
            await pool.query(`
                UPDATE outreach_logs
                SET 
                    status = CASE WHEN status = 'replied' THEN 'replied' ELSE 'opened' END,
                    opened_at = COALESCE(opened_at, NOW()),
                    last_opened_at = NOW(),
                    open_count = COALESCE(open_count, 0) + 1,
                    user_agent = COALESCE($1, user_agent),
                    ip_hash = COALESCE($2, ip_hash),
                    is_bot_scan = $3
                WHERE id = $4
            `, [userAgent ? userAgent.substring(0, 500) : null, hashedIp, isBot, log.id]);

            // 2. Update parent lead record if not a bot scan
            if (log.lead_id && !isBot) {
                await pool.query(`
                    UPDATE leads
                    SET 
                        status = CASE WHEN status = 'replied' THEN 'replied' ELSE 'opened' END,
                        last_opened_at = NOW(),
                        open_count = COALESCE(open_count, 0) + 1,
                        updated_at = NOW()
                    WHERE id = $1
                `, [log.lead_id]);
                console.log(`👁️ [Tracker] Genuine Lead Open recorded for Lead #${log.lead_id} (Token: ${token.substring(0, 8)}..., Total opens: ${(log.open_count || 0) + 1})`);
            } else if (isBot) {
                console.log(`🤖 [Tracker] Automated bot/pre-fetch scan logged for Lead #${log.lead_id} (Token: ${token.substring(0, 8)}...)`);
            }

            return true;
        } catch (err) {
            console.error('[Tracker] Error recording open:', err.message);
            return false;
        }
    }

    /**
     * Handle incoming Click Tracking request and return destination URL
     */
    static async recordClick(token, targetUrl, { userAgent = '', ip = '' } = {}) {
        if (!targetUrl) return '/';
        let safeUrl = targetUrl;
        try {
            const parsed = new URL(targetUrl);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                safeUrl = '/';
            }
        } catch {
            safeUrl = '/';
        }

        if (!token) return safeUrl;

        try {
            const logRes = await pool.query(
                `SELECT id, lead_id FROM outreach_logs WHERE tracking_token = $1 LIMIT 1`,
                [token.trim()]
            );

            if (logRes.rows.length > 0) {
                const log = logRes.rows[0];
                const hashedIp = this.hashIp(ip);

                // Update outreach_logs
                await pool.query(`
                    UPDATE outreach_logs
                    SET 
                        clicked_at = COALESCE(clicked_at, NOW()),
                        last_clicked_at = NOW(),
                        click_count = COALESCE(click_count, 0) + 1,
                        ip_hash = COALESCE($1, ip_hash)
                    WHERE id = $2
                `, [hashedIp, log.id]);

                // Update lead
                if (log.lead_id) {
                    await pool.query(`
                        UPDATE leads
                        SET 
                            click_count = COALESCE(click_count, 0) + 1,
                            updated_at = NOW()
                        WHERE id = $1
                    `, [log.lead_id]);
                    console.log(`🔗 [Tracker] Link Click recorded for Lead #${log.lead_id} -> ${safeUrl}`);
                }
            }
        } catch (err) {
            console.error('[Tracker] Error recording click:', err.message);
        }

        return safeUrl;
    }

    /**
     * Calculate Follow-Up Cadence & Days Elapsed for any lead
     * Follow-up sequence:
     * - Day 0: Initial Pitch Sent
     * - Day 3: Follow-Up 1 Due (Gentle Nudge)
     * - Day 7: Follow-Up 2 Due (Value Proposition / Case Study)
     * - Day 14: Follow-Up 3 Due (Breakup Email)
     */
    static calculateCadence(lead) {
        if (!lead) return null;

        const status = (lead.status || 'new').toLowerCase();
        const lastContact = lead.last_contacted_at ? new Date(lead.last_contacted_at) : null;
        const now = new Date();

        if (status === 'replied') {
            return {
                cadenceState: 'replied',
                badgeLabel: 'Replied',
                badgeClass: 'badge-replied',
                isActionRequired: false,
                daysElapsed: lastContact ? Math.floor((now - lastContact) / (1000 * 60 * 60 * 24)) : 0,
                recommendedStep: 'close_deal',
                tooltip: 'Prospect replied! Automated follow-up halted.'
            };
        }

        if (!lastContact) {
            return {
                cadenceState: 'not_contacted',
                badgeLabel: 'New Lead',
                badgeClass: 'badge-new',
                isActionRequired: true,
                daysElapsed: 0,
                recommendedStep: 'pitch_day_0',
                tooltip: 'Never contacted. Ready for initial cold pitch.'
            };
        }

        const daysElapsed = Math.floor((now - lastContact) / (1000 * 60 * 60 * 24));
        const hoursElapsed = Math.floor((now - lastContact) / (1000 * 60 * 60));
        const openCount = parseInt(lead.open_count, 10) || 0;
        const clickCount = parseInt(lead.click_count, 10) || 0;
        const currentStep = parseInt(lead.followup_step, 10) || 0;

        // Engagement signals
        let engagementLabel = '';
        if (clickCount > 0) {
            engagementLabel = `Clicked ${clickCount}x`;
        } else if (openCount > 0) {
            engagementLabel = `Opened ${openCount}x`;
        } else {
            engagementLabel = 'Unopened';
        }

        // Cadence rules
        if (daysElapsed < 3) {
            const timeStr = daysElapsed === 0 ? `${hoursElapsed}h ago` : `${daysElapsed}d ago`;
            return {
                cadenceState: 'waiting',
                badgeLabel: `Sent ${timeStr} • ${engagementLabel}`,
                badgeClass: openCount > 0 ? 'badge-waiting-opened' : 'badge-waiting',
                isActionRequired: false,
                daysElapsed,
                currentStep,
                recommendedStep: null,
                tooltip: `Initial email sent ${timeStr}. Follow-Up 1 scheduled for Day 3.`
            };
        }

        if (daysElapsed >= 3 && daysElapsed < 7) {
            return {
                cadenceState: 'due_step_1',
                badgeLabel: `Follow-Up 1 Due (${daysElapsed}d) • ${engagementLabel}`,
                badgeClass: openCount > 0 ? 'badge-due-hot' : 'badge-due',
                isActionRequired: true,
                daysElapsed,
                currentStep: 1,
                recommendedStep: 'nudge_day_3',
                tooltip: `3+ days since contact without reply. Send a quick gentle bump now.`
            };
        }

        if (daysElapsed >= 7 && daysElapsed < 14) {
            return {
                cadenceState: 'due_step_2',
                badgeLabel: `Follow-Up 2 Due (${daysElapsed}d) • ${engagementLabel}`,
                badgeClass: 'badge-due-warning',
                isActionRequired: true,
                daysElapsed,
                currentStep: 2,
                recommendedStep: 'value_day_7',
                tooltip: `7+ days without reply. Send value add / audit case study.`
            };
        }

        return {
            cadenceState: 'overdue_breakup',
            badgeLabel: `Final Breakup Due (${daysElapsed}d)`,
            badgeClass: 'badge-overdue',
            isActionRequired: true,
            daysElapsed,
            currentStep: 3,
            recommendedStep: 'breakup_day_14',
            tooltip: `14+ days. Send final polite breakup email before archiving.`
        };
    }

    /**
     * Compute aggregated outreach and tracking KPI metrics
     */
    static async getTrackingOverview() {
        const statsQuery = `
            SELECT 
                COUNT(*)::int AS total_sent,
                COUNT(*) FILTER (WHERE opened_at IS NOT NULL OR open_count > 0)::int AS total_opened,
                COUNT(*) FILTER (WHERE clicked_at IS NOT NULL OR click_count > 0)::int AS total_clicked,
                COUNT(*) FILTER (WHERE status = 'replied')::int AS total_replied,
                COALESCE(SUM(open_count), 0)::int AS aggregate_opens,
                COALESCE(SUM(click_count), 0)::int AS aggregate_clicks
            FROM outreach_logs;
        `;
        const res = await pool.query(statsQuery);
        const stats = res.rows[0] || {};

        // Follow up due count from leads
        const leadsRes = await pool.query(`
            SELECT id, title, status, last_contacted_at, open_count, click_count, followup_step
            FROM leads 
            WHERE last_contacted_at IS NOT NULL AND status != 'replied';
        `);

        let followupDueCount = 0;
        leadsRes.rows.forEach(l => {
            const cad = this.calculateCadence(l);
            if (cad && cad.isActionRequired) {
                followupDueCount++;
            }
        });

        const totalSent = stats.total_sent || 0;
        const totalOpened = stats.total_opened || 0;
        const totalClicked = stats.total_clicked || 0;
        const totalReplied = stats.total_replied || 0;

        return {
            total_sent: totalSent,
            total_opened: totalOpened,
            total_clicked: totalClicked,
            total_replied: totalReplied,
            aggregate_opens: stats.aggregate_opens || 0,
            aggregate_clicks: stats.aggregate_clicks || 0,
            followup_due: followupDueCount,
            open_rate_pct: totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0,
            click_rate_pct: totalOpened > 0 ? Math.round((totalClicked / totalOpened) * 100) : 0,
            reply_rate_pct: totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0
        };
    }

    /**
     * Fetch list of all tracked outreaches with lead profile info & cadence
     */
    static async getTrackedLogs({ limit = 100, offset = 0, filter = 'all' } = {}) {
        let whereClause = '';
        if (filter === 'followup_due') {
            whereClause = "WHERE l.last_contacted_at IS NOT NULL AND l.status != 'replied'";
        } else if (filter === 'opened') {
            whereClause = "WHERE (ol.opened_at IS NOT NULL OR ol.open_count > 0)";
        } else if (filter === 'clicked') {
            whereClause = "WHERE (ol.clicked_at IS NOT NULL OR ol.click_count > 0)";
        } else if (filter === 'replied') {
            whereClause = "WHERE (ol.status = 'replied' OR l.status = 'replied')";
        }

        const query = `
            SELECT 
                ol.id AS log_id,
                ol.lead_id,
                ol.channel,
                ol.recipient_email AS recipient,
                ol.subject,
                ol.status AS outreach_status,
                ol.tracking_token,
                ol.sent_at,
                ol.opened_at,
                ol.last_opened_at,
                ol.open_count,
                ol.clicked_at,
                ol.last_clicked_at,
                ol.click_count,
                ol.is_bot_scan,
                l.title AS business_name,
                l.city,
                l.country,
                l.category,
                l.phone,
                l.whatsapp_number,
                l.status AS lead_status,
                l.last_contacted_at,
                l.followup_step
            FROM outreach_logs ol
            JOIN leads l ON l.id = ol.lead_id
            ${whereClause}
            ORDER BY ol.sent_at DESC
            LIMIT $1 OFFSET $2;
        `;

        const res = await pool.query(query, [limit, offset]);
        return res.rows.map(row => {
            const leadSim = {
                id: row.lead_id,
                title: row.business_name,
                status: row.lead_status,
                last_contacted_at: row.last_contacted_at,
                open_count: row.open_count,
                click_count: row.click_count,
                followup_step: row.followup_step
            };
            row.cadence = this.calculateCadence(leadSim);
            return row;
        });
    }

    /**
     * Instant pre-send email spam risk analyzer
     */
    static analyzeSpamRisk({ subject = '', body = '' } = {}) {
        const triggers = [
            { phrase: '100% free', penalty: 15, msg: 'Use of "100% free" triggers aggressive Gmail spam filters.' },
            { phrase: 'free', penalty: 5, msg: '"Free" can trigger commercial/promotions filtering.' },
            { phrase: 'guarantee', penalty: 10, msg: '"Guarantee" or "Guaranteed" is flagged by business firewalls.' },
            { phrase: 'act now', penalty: 15, msg: 'Urgency words like "Act now" indicate high spam likelihood.' },
            { phrase: 'urgent', penalty: 10, msg: '"Urgent" in cold outbound increases spam scores.' },
            { phrase: 'risk free', penalty: 12, msg: '"Risk free" is a classic telemarketing spam trigger.' },
            { phrase: 'congratulations', penalty: 15, msg: '"Congratulations" triggers sweepstake spam filters.' },
            { phrase: 'winner', penalty: 15, msg: '"Winner" triggers high spam risk.' },
            { phrase: 'click here', penalty: 10, msg: 'Avoid "Click here"; use descriptive anchor text or plain links.' },
            { phrase: 'make money', penalty: 15, msg: '"Make money" triggers commercial spam filters.' },
            { phrase: 'special promotion', penalty: 10, msg: '"Special promotion" triggers Promotions tab.' },
            { phrase: 'no cost', penalty: 8, msg: '"No cost" is frequently flagged in cold emails.' }
        ];

        let score = 100;
        const flags = [];
        const combined = `${subject} ${body}`.toLowerCase();

        for (const trig of triggers) {
            if (combined.includes(trig.phrase)) {
                score -= trig.penalty;
                flags.push(trig.msg);
            }
        }

        // Check exclamation marks or dollar signs in subject
        if (/[!$?]{2,}/.test(subject)) {
            score -= 15;
            flags.push('Excessive exclamation/symbols in subject line (e.g. "!!", "$$").');
        }

        // Check ALL CAPS words in subject
        const allCapsWords = (subject.match(/[A-Z]{4,}/g) || []).filter(w => !['HTML', 'SaaS', 'JSON', 'REST', 'GMB', 'SMTP', 'IMAP'].includes(w));
        if (allCapsWords.length > 0) {
            score -= 10;
            flags.push(`ALL CAPS word in subject line: "${allCapsWords.join(', ')}".`);
        }

        // Check link count in body
        const linkMatches = (body.match(/https?:\/\//gi) || []).length;
        if (linkMatches > 2) {
            score -= 12;
            flags.push(`Email has ${linkMatches} links. For cold emails, keep 1 link max to protect deliverability.`);
        }

        score = Math.max(0, Math.min(100, score));

        let grade = 'A+';
        let status = 'Excellent (Primary Inbox Placement)';
        let statusColor = '#10B981';

        if (score < 60) {
            grade = 'F';
            status = 'High Spam Risk (Likely Spam Folder)';
            statusColor = '#EF4444';
        } else if (score < 75) {
            grade = 'C';
            status = 'Moderate Spam Risk (May hit Promotions/Junk)';
            statusColor = '#F59E0B';
        } else if (score < 90) {
            grade = 'B';
            status = 'Good Deliverability';
            statusColor = '#3B82F6';
        }

        return {
            score,
            grade,
            status,
            statusColor,
            flags: flags.length > 0 ? flags : ['No critical spam triggers found. Text is clean, personalized and conversational!'],
            wordCount: body.trim().split(/\s+/).filter(Boolean).length,
            linkCount: linkMatches
        };
    }
}

module.exports = {
    OutreachTracker,
    TRANSPARENT_GIF
};
