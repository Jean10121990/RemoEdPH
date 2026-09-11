/**
 * Single source for JWT_SECRET. Production must set a real value — the historic
 * 'your_jwt_secret' fallback would make every token forgeable.
 */
function isWeakJwtSecret(value) {
  const s = String(value == null ? '' : value).trim();
  if (!s) return true;
  const lower = s.toLowerCase();
  return (
    lower === 'your_jwt_secret' ||
    lower === 'replace-with-long-random-secret' ||
    /^replace-with/i.test(s) ||
    s.length < 16
  );
}

function getJwtSecret() {
  const s = String(process.env.JWT_SECRET || '').trim();
  if (isWeakJwtSecret(s)) {
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
      throw new Error(
        'JWT_SECRET must be set to a strong secret (16+ characters, not a placeholder) in production.'
      );
    }
    return s || 'your_jwt_secret';
  }
  return s;
}

function assertJwtSecretForBoot() {
  getJwtSecret();
}

module.exports = {
  getJwtSecret,
  isWeakJwtSecret,
  assertJwtSecretForBoot,
};
