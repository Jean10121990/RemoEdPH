const crypto = require('crypto');

const ALG = 'aes-256-gcm';
const IV_LEN = 16;
const AUTH_TAG_LEN = 16;

function deriveKey() {
  const raw = process.env.TOTP_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-only-totp-key';
  return crypto.createHash('sha256').update(String(raw), 'utf8').digest();
}

/**
 * Encrypt TOTP secret for storage (AES-256-GCM). IV + authTag + ciphertext → base64.
 */
function encryptTotpSecret(plain) {
  if (plain == null || plain === '') return '';
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv, { authTagLength: AUTH_TAG_LEN });
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/**
 * Decrypt stored TOTP secret; returns null on failure or empty input.
 */
function decryptTotpSecret(stored) {
  if (!stored || typeof stored !== 'string') return null;
  try {
    const buf = Buffer.from(stored, 'base64');
    if (buf.length < IV_LEN + AUTH_TAG_LEN + 1) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
    const enc = buf.subarray(IV_LEN + AUTH_TAG_LEN);
    const key = deriveKey();
    const decipher = crypto.createDecipheriv(ALG, key, iv, { authTagLength: AUTH_TAG_LEN });
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(enc), decipher.final()]);
    return out.toString('utf8');
  } catch (_e) {
    return null;
  }
}

module.exports = { encryptTotpSecret, decryptTotpSecret };
