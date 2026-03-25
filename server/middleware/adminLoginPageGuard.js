/**
 * Optional IP allowlist for GET of the obfuscated admin login page only.
 * ADMIN_IP_WHITELIST=127.0.0.1,203.0.113.10 (comma-separated; supports IPv4).
 * Set TRUST_PROXY=1 when behind a reverse proxy so x-forwarded-for is honored.
 */

const fs = require('fs');
const path = require('path');

function normalizeIp(ip) {
  if (!ip) return '';
  return String(ip).replace(/^::ffff:/i, '').trim();
}

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) {
    return normalizeIp(xf.split(',')[0].trim());
  }
  if (Array.isArray(xf) && xf[0]) {
    return normalizeIp(String(xf[0]).split(',')[0].trim());
  }
  // ngrok / older express: fall back to socket / connection remoteAddress
  return normalizeIp(
    req.ip ||
      req.socket?.remoteAddress ||
      req.connection?.remoteAddress ||
      ''
  );
}

let cached403Template = null;
function render403Page(userIp) {
  if (cached403Template == null) {
    const p = path.join(__dirname, '../../public/403.html');
    cached403Template = fs.readFileSync(p, 'utf8');
  }
  return cached403Template.replace(/\{\{USER_IP\}\}/g, userIp || '(unknown)');
}

function adminIpWhitelistForLoginPage(req, res, next) {
  const raw = process.env.ADMIN_IP_WHITELIST;
  const allowed = String(raw || '')
    .split(',')
    .map((s) => normalizeIp(s))
    .filter(Boolean);

  const candidate = getClientIp(req);

  // Default-deny: if whitelist is blank, block everyone.
  if (!allowed.length) {
    console.warn(`⚠️ Admin Access Attempt: ${candidate || '(unknown)'} - Status: REJECTED`);
    return res
      .status(403)
      .type('html')
      .send(render403Page(candidate));
  }

  const ok = allowed.some((a) => candidate === a);
  if (!ok) {
    console.warn(`⚠️ Admin Access Attempt: ${candidate || '(unknown)'} - Status: REJECTED`);
    return res
      .status(403)
      .type('html')
      .send(render403Page(candidate));
  }
  console.log(`⚠️ Admin Access Attempt: ${candidate || '(unknown)'} - Status: ALLOWED`);
  next();
}

module.exports = { adminIpWhitelistForLoginPage };
