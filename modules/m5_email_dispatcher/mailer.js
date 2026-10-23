const nodemailer = require('nodemailer');
const { pool } = require('../m1_storage/leadRepository');

/**
 * Creates a reusable nodemailer transporter from user-provided configuration
 */
function createTransporter(config) {
    if (!config || !config.user || !config.pass) {
        throw new Error("Missing SMTP credentials (User / Password required).");
    }

    const port = parseInt(config.port, 10) || 465;
    const isSecure = config.secure !== undefined ? Boolean(config.secure) : (port === 465);

    return nodemailer.createTransport({
        host: (config.host || 'smtp.gmail.com').trim(),
        port: port,
        secure: isSecure,
        auth: {
            user: config.user.trim(),
            pass: config.pass.trim()
        },
        tls: {
            rejectUnauthorized: false
        }
    });
}

/**
 * Verify SMTP connection handshake
 */
async function verifySmtp(config) {
    const transporter = createTransporter(config);
    return await transporter.verify();
}

/**
 * Send an outreach cold email and record it into Supabase outreach_logs
 */
async function sendOutreachEmail(config, { leadId, decisionMakerId = null, to, subject, bodyText, bodyHtml }) {
    if (!to || !to.includes('@')) {
        throw new Error("Invalid recipient email address.");
    }
    if (!subject || !subject.trim()) {
        throw new Error("Subject line is required.");
    }
    if (!bodyText && !bodyHtml) {
        throw new Error("Email body content cannot be empty.");
    }

    const transporter = createTransporter(config);
    const senderName = config.senderName ? config.senderName.trim() : '';
    const fromAddress = senderName ? `"${senderName}" <${config.user.trim()}>` : config.user.trim();

    // Plain text + light HTML wrapper for optimal deliverability (inbox-focused, anti-spam)
    const textContent = bodyText || bodyHtml.replace(/<[^>]*>/g, '');
    const htmlContent = bodyHtml || `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #111827; white-space: pre-wrap;">${textContent}</div>`;

    const mailOptions = {
        from: fromAddress,
        to: to.trim(),
        subject: subject.trim(),
        text: textContent,
        html: htmlContent
    };

    try {
        console.log(`📤 Dispatching cold email to ${to} via ${config.host || 'smtp.gmail.com'}...`);
        const info = await transporter.sendMail(mailOptions);
        console.log(`✅ Email delivered successfully! Message ID: ${info.messageId}`);

        // 1. Record into outreach_logs in Supabase
        let logRecord = null;
        if (leadId) {
            try {
                const logRes = await pool.query(`
                    INSERT INTO outreach_logs (lead_id, decision_maker_id, channel, recipient_email, subject, body_content, status, sent_at)
                    VALUES ($1, $2, 'email', $3, $4, $5, 'sent', NOW())
                    RETURNING *;
                `, [leadId, decisionMakerId || null, to.trim(), subject.trim(), textContent]);
                logRecord = logRes.rows[0];

                // 2. Update lead status in leads table
                await pool.query(`
                    UPDATE leads 
                    SET status = 'emailed', updated_at = NOW() 
                    WHERE id = $1;
                `, [leadId]);
            } catch (dbErr) {
                console.warn("Outreach log recording note:", dbErr.message);
            }
        }

        return {
            success: true,
            messageId: info.messageId,
            recipient: to.trim(),
            log: logRecord
        };

    } catch (sendErr) {
        console.error("❌ Failed to send outreach email:", sendErr.message);

        // Record failure in outreach_logs if leadId provided
        if (leadId) {
            try {
                await pool.query(`
                    INSERT INTO outreach_logs (lead_id, decision_maker_id, channel, recipient_email, subject, body_content, status, error_message, sent_at)
                    VALUES ($1, $2, 'email', $3, $4, $5, 'failed', $6, NOW());
                `, [leadId, decisionMakerId || null, to.trim(), subject.trim(), textContent, sendErr.message]);
            } catch (dbErr) {
                // Ignore secondary log error
            }
        }

        throw new Error(sendErr.message || "Failed to dispatch email.");
    }
}

/**
 * Resolve SMTP configuration: uses explicit user input if provided,
 * or retrieves decrypted credentials from the unified Inbox channel_settings in Supabase.
 */
async function resolveSmtpConfig(explicitConfig = null) {
    if (explicitConfig && explicitConfig.user && explicitConfig.pass) {
        return {
            user: explicitConfig.user.trim(),
            pass: explicitConfig.pass.trim(),
            host: (explicitConfig.host || 'smtp.gmail.com').trim(),
            port: parseInt(explicitConfig.port, 10) || 465,
            secure: explicitConfig.secure !== undefined ? Boolean(explicitConfig.secure) : ((parseInt(explicitConfig.port, 10) || 465) === 465),
            senderName: explicitConfig.senderName ? explicitConfig.senderName.trim() : ''
        };
    }

    try {
        const { InboxRepository } = require('../inbox/inboxRepository');
        const emailConf = await InboxRepository.getChannelConfig('email');
        if (emailConf && emailConf.config) {
            const c = emailConf.config;
            const user = (c.user || c.email || '').trim();
            const pass = (c.decryptedPassword || '').trim();

            if (user && pass) {
                let host = (c.smtpHost || c.smtp_host || '').trim();
                let port = parseInt(c.smtpPort || c.smtp_port, 10);

                if (!host) {
                    const imapHost = (c.imapHost || c.imap_host || 'imap.gmail.com').toLowerCase();
                    if (imapHost.includes('gmail')) {
                        host = 'smtp.gmail.com';
                        port = port || 465;
                    } else if (imapHost.includes('zoho')) {
                        host = 'smtp.zoho.com';
                        port = port || 465;
                    } else if (imapHost.includes('outlook') || imapHost.includes('office365')) {
                        host = 'smtp.office365.com';
                        port = port || 587;
                    } else {
                        host = imapHost.replace(/^imap\./i, 'smtp.');
                        port = port || 465;
                    }
                }

                return {
                    user,
                    pass,
                    host: host || 'smtp.gmail.com',
                    port: port || 465,
                    secure: port === 465,
                    senderName: c.senderName || ''
                };
            }
        }
    } catch (err) {
        console.warn('[Mailer] Could not resolve unified SMTP config:', err.message);
    }

    return null;
}

module.exports = {
    createTransporter,
    verifySmtp,
    sendOutreachEmail,
    dispatchColdEmail: sendOutreachEmail,
    resolveSmtpConfig
};
