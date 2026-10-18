/**
 * Security & Encryption Vault
 * Military-grade AES-256-GCM encryption for stored inbox credentials at rest,
 * and HMAC-SHA256 signature verification for Meta/WhatsApp webhooks.
 */

const crypto = require('crypto');

// Derive 32-byte master key from environment secret
function getMasterKey() {
    const rawSecret = process.env.INBOX_MASTER_KEY || 
                      process.env.SUPABASE_SERVICE_ROLE_KEY || 
                      process.env.DATABASE_URL || 
                      'client-bunny-enterprise-secure-vault-key-2026';
    return crypto.createHash('sha256').update(rawSecret).digest();
}

/**
 * Encrypt sensitive text (e.g. SMTP/IMAP App Password) using AES-256-GCM
 */
function encryptSecret(plainText) {
    if (!plainText || typeof plainText !== 'string') return '';
    try {
        const key = getMasterKey();
        const iv = crypto.randomBytes(12); // 96-bit IV recommended for GCM
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        let encrypted = cipher.update(plainText, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag().toString('hex');
        // Format: iv:authTag:encrypted
        return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (err) {
        console.error('Encryption failed:', err);
        return plainText;
    }
}

/**
 * Decrypt sensitive text from AES-256-GCM format
 */
function decryptSecret(cipherText) {
    if (!cipherText || typeof cipherText !== 'string') return '';
    if (!cipherText.includes(':')) return cipherText; // Return as-is if unencrypted legacy

    try {
        const parts = cipherText.split(':');
        if (parts.length !== 3) return cipherText;

        const [ivHex, authTagHex, encryptedData] = parts;
        const key = getMasterKey();
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        console.error('Decryption failed (bad key or altered data):', err.message);
        return '';
    }
}

/**
 * Verify Meta (Facebook / Instagram) Webhook HMAC-SHA256 Signature
 */
function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
    if (!signatureHeader) return false;
    const secret = appSecret || process.env.META_APP_SECRET || 'client_bunny_meta_secret';
    try {
        const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
        return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
    } catch (e) {
        return false;
    }
}

/**
 * Verify WhatsApp Webhook Secret Header (Timing Safe)
 */
function verifyWebhookSecret(incomingHeader, configuredSecret) {
    if (!incomingHeader || !configuredSecret) return false;
    try {
        const bufA = Buffer.from(incomingHeader);
        const bufB = Buffer.from(configuredSecret);
        if (bufA.length !== bufB.length) return false;
        return crypto.timingSafeEqual(bufA, bufB);
    } catch (e) {
        return false;
    }
}

module.exports = {
    encryptSecret,
    decryptSecret,
    verifyMetaSignature,
    verifyWebhookSecret
};
