/**
 * Obfuscated admin login URL segment (no leading slash).
 * Set ADMIN_LOGIN_PATH in .env to a long random string, e.g. k9mPx2vqL4nR8wJh
 */

const RESERVED_PATHS = new Set(
  [
    'admin-login',
    'admin-login.html',
    'teacher-login',
    'student-login',
    'api',
    'app',
    'assets',
    'uploads',
    'vendor',
    'startup',
    'teachers',
    'application-form',
    'teacher-signup',
    'index.html',
  ].map((s) => s.toLowerCase())
);

function sanitizeAdminLoginPathSegment(raw) {
  const s = String(raw || '')
    .trim()
    .replace(/^\/+/g, '')
    .replace(/\.html?$/i, '');
  if (!s || /[/\\]/.test(s)) return null;
  if (!/^[a-zA-Z0-9_-]{8,128}$/.test(s)) return null;
  if (RESERVED_PATHS.has(s.toLowerCase())) return null;
  return s;
}

function getAdminLoginPathSegment() {
  const fromEnv = sanitizeAdminLoginPathSegment(process.env.ADMIN_LOGIN_PATH);
  if (fromEnv) return fromEnv;
  return 'remo-dev-admin-login';
}

module.exports = {
  sanitizeAdminLoginPathSegment,
  getAdminLoginPathSegment,
  RESERVED_PATHS,
};
