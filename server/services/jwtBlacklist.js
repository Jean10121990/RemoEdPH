const crypto = require('crypto');

/** fingerprint -> expiry time (ms since epoch) */
const blacklist = new Map();

function fingerprintToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

/**
 * Blacklist a JWT until its natural exp (decoded, not verified — caller should verify first).
 */
function blacklistToken(token) {
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(String(token), { complete: false });
    if (!decoded || typeof decoded.exp !== 'number') return;
    const expMs = decoded.exp * 1000;
    if (expMs <= Date.now()) return;
    blacklist.set(fingerprintToken(token), expMs);
  } catch {
    /* ignore malformed */
  }
}

function isTokenBlacklisted(token) {
  const fp = fingerprintToken(token);
  const expMs = blacklist.get(fp);
  if (expMs == null) return false;
  if (Date.now() > expMs) {
    blacklist.delete(fp);
    return false;
  }
  return true;
}

/** Best-effort prune (called periodically from hot path) */
function pruneExpired() {
  const now = Date.now();
  if (blacklist.size < 1) return;
  for (const [fp, expMs] of blacklist) {
    if (now > expMs) blacklist.delete(fp);
  }
}

setInterval(pruneExpired, 5 * 60 * 1000).unref?.();

module.exports = {
  blacklistToken,
  isTokenBlacklisted,
};
