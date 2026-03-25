const crypto = require('crypto');

const PREFIX = 'enc1:';

/**
 * Optional AES-256-GCM field encryption for phone/contact-style PII.
 * When PII_ENCRYPTION_KEY is unset, values are stored as plain text (backward compatible).
 *
 * Key: 64-char hex, or base64 decoding to 32 bytes, else SHA-256 of the string.
 */
function getKeyBuffer() {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (raw == null || String(raw).trim() === '') return null;
  const t = String(raw).trim();
  if (/^[0-9a-fA-F]{64}$/.test(t)) {
    return Buffer.from(t, 'hex');
  }
  try {
    const b = Buffer.from(t, 'base64');
    if (b.length === 32) return b;
  } catch {
    /* ignore */
  }
  return crypto.createHash('sha256').update(t, 'utf8').digest();
}

function isPiiEncryptionEnabled() {
  return getKeyBuffer() !== null;
}

function encryptPiiString(plain) {
  if (plain === undefined || plain === null) return '';
  const key = getKeyBuffer();
  const s = String(plain);
  if (!key) return s;
  const trimmed = s.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith(PREFIX)) return trimmed;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(trimmed, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, enc]);
  return PREFIX + payload.toString('base64');
}

function decryptPiiString(stored) {
  if (stored === undefined || stored === null) return '';
  const key = getKeyBuffer();
  const s = String(stored);
  if (!key || !s.startsWith(PREFIX)) return s;

  try {
    const payload = Buffer.from(s.slice(PREFIX.length), 'base64');
    if (payload.length < 12 + 16) return s;
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const data = payload.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return s;
  }
}

module.exports = {
  PREFIX,
  isPiiEncryptionEnabled,
  encryptPiiString,
  decryptPiiString,
};
