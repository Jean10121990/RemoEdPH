/**
 * Optional IP allowlist for GET of the obfuscated admin login page only.
 * ADMIN_IP_WHITELIST=127.0.0.1,203.0.113.10 (comma-separated; supports IPv4).
 * Set TRUST_PROXY=1 when behind a reverse proxy so x-forwarded-for is honored.
 */

function normalizeIp(ip) {
  if (!ip) return '';
  return String(ip).replace(/^::ffff:/i, '').trim();
}

function adminIpWhitelistForLoginPage(req, res, next) {
  const raw = process.env.ADMIN_IP_WHITELIST || '';
  const allowed = raw
    .split(',')
    .map((s) => normalizeIp(s))
    .filter(Boolean);
  if (!allowed.length) return next();

  const xf = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const candidate = normalizeIp(xf || req.ip || req.socket.remoteAddress || '');
  const ok = allowed.some((a) => candidate === a || req.ip === a);
  if (!ok) {
    console.warn('[admin-login] Blocked IP for login page:', candidate || req.ip);
    return res
      .status(403)
      .type('html')
      .send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Forbidden</title></head><body><p>Forbidden</p></body></html>');
  }
  next();
}

module.exports = { adminIpWhitelistForLoginPage };
