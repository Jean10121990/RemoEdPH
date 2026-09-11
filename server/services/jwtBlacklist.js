const crypto = require('crypto');
const JwtBlacklistEntry = require('../models/JwtBlacklist');

/** In-process cache so hot-path checks stay sync. Mongo is the source of truth across instances. */
const blacklist = new Map();

function fingerprintToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

function rememberLocal(fp, expMs) {
  if (!fp || !expMs) return;
  blacklist.set(fp, expMs);
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
    const fp = fingerprintToken(token);
    rememberLocal(fp, expMs);
    JwtBlacklistEntry.updateOne(
      { fingerprint: fp },
      { $set: { fingerprint: fp, expiresAt: new Date(expMs) } },
      { upsert: true }
    ).catch(() => {});
  } catch {
    /* ignore malformed */
  }
}

async function isTokenBlacklisted(token) {
  const fp = fingerprintToken(token);
  const expMs = blacklist.get(fp);
  if (expMs != null) {
    if (Date.now() > expMs) {
      blacklist.delete(fp);
      return false;
    }
    return true;
  }
  try {
    const row = await JwtBlacklistEntry.findOne({ fingerprint: fp }).lean();
    if (!row || !row.expiresAt) return false;
    const until = new Date(row.expiresAt).getTime();
    if (until <= Date.now()) return false;
    rememberLocal(fp, until);
    return true;
  } catch {
    return false;
  }
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
