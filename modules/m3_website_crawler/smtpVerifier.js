const dns = require('dns').promises;
const net = require('net');

/**
 * Validate syntax and check domain MX records
 */
async function getMxHost(domain) {
    try {
        const mxRecords = await dns.resolveMx(domain);
        if (mxRecords && mxRecords.length > 0) {
            mxRecords.sort((a, b) => a.priority - b.priority);
            return mxRecords[0].exchange;
        }
    } catch (e) {}
    return null;
}

/**
 * Perform Direct SMTP Handshake (Check 250 OK)
 */
async function verifyEmailSMTP(email) {
    if (!email || !email.includes('@')) {
        return { valid: false, reason: 'invalid_syntax' };
    }

    const domain = email.split('@')[1].toLowerCase().trim();
    const mxHost = await getMxHost(domain);

    if (!mxHost) {
        return { valid: false, reason: 'no_mx_record' };
    }

    // Attempt Socket verification on port 25 (with 4-second strict timeout)
    return new Promise((resolve) => {
        let isResolved = false;
        const socket = net.createConnection(25, mxHost);
        socket.setTimeout(4000);

        let step = 0;
        let responseCode = 0;

        const finish = (result) => {
            if (!isResolved) {
                isResolved = true;
                try { socket.destroy(); } catch (e) {}
                resolve(result);
            }
        };

        socket.on('timeout', () => {
            // Port 25 may be filtered by ISP, fallback to MX existence
            finish({ valid: true, deliverable: 'probable', reason: 'mx_timeout_fallback', mxHost });
        });

        socket.on('error', (err) => {
            // Port 25 connection refused / blocked by firewall, fallback to valid MX domain
            finish({ valid: true, deliverable: 'probable', reason: 'mx_verified', mxHost });
        });

        socket.on('data', (chunk) => {
            const msg = chunk.toString();
            responseCode = parseInt(msg.substring(0, 3), 10) || 0;

            if (step === 0 && responseCode === 220) {
                step = 1;
                socket.write(`HELO hunter.local\r\n`);
            } else if (step === 1 && responseCode === 250) {
                step = 2;
                socket.write(`MAIL FROM:<check@hunter.local>\r\n`);
            } else if (step === 2 && responseCode === 250) {
                step = 3;
                socket.write(`RCPT TO:<${email}>\r\n`);
            } else if (step === 3) {
                if (responseCode === 250 || responseCode === 251) {
                    finish({ valid: true, deliverable: 'yes', code: responseCode, mxHost });
                } else if (responseCode >= 500 && responseCode < 600) {
                    finish({ valid: false, deliverable: 'no', code: responseCode, reason: 'mailbox_not_found' });
                } else {
                    finish({ valid: true, deliverable: 'probable', code: responseCode, mxHost });
                }
            }
        });
    });
}

/**
 * Generate standard business email permutations from Name and Domain
 */
function generateEmailPermutations(fullName, domain) {
    if (!fullName || !domain) return [];
    const cleanName = fullName.replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?|prof\.?)\s+/i, '').trim();
    const parts = cleanName.toLowerCase().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return [];

    const first = parts[0].replace(/[^\w]/g, '');
    const last = parts.length > 1 ? parts[parts.length - 1].replace(/[^\w]/g, '') : '';
    const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0].trim();

    const permutations = [];
    if (first && last) {
        permutations.push(`${first}.${last}@${cleanDomain}`);
        permutations.push(`${first}@${cleanDomain}`);
        permutations.push(`${first[0]}${last}@${cleanDomain}`);
        permutations.push(`${first}_${last}@${cleanDomain}`);
        permutations.push(`${last}.${first}@${cleanDomain}`);
    } else if (first) {
        permutations.push(`${first}@${cleanDomain}`);
        permutations.push(`contact@${cleanDomain}`);
        permutations.push(`info@${cleanDomain}`);
    }

    return Array.from(new Set(permutations));
}

module.exports = {
    getMxHost,
    verifyEmailSMTP,
    generateEmailPermutations
};
