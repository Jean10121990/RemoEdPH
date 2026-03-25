const LOCK_MAX_ATTEMPTS = Math.max(
  1,
  Number(process.env.LOGIN_LOCK_MAX_ATTEMPTS || 5) || 5
);
const LOCK_DURATION_MS = Math.max(
  60 * 1000,
  Number(process.env.LOGIN_LOCK_DURATION_MS || 15 * 60 * 1000) || 15 * 60 * 1000
);

function isAccountLocked(doc) {
  if (!doc || !doc.lockUntil) return false;
  return new Date(doc.lockUntil) > new Date();
}

function lockoutMessage() {
  return 'Too many failed attempts. Try again later or contact support.';
}

async function applyFailedLogin(doc) {
  if (!doc) return;
  const attempts = Math.max(0, Number(doc.loginAttempts) || 0) + 1;
  doc.loginAttempts = attempts;
  if (attempts >= LOCK_MAX_ATTEMPTS) {
    doc.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
  }
  await doc.save().catch(() => {});
}

async function resetLoginAttempts(doc) {
  if (!doc) return;
  if (doc.loginAttempts || doc.lockUntil) {
    doc.loginAttempts = 0;
    doc.lockUntil = null;
    await doc.save().catch(() => {});
  }
}

module.exports = {
  LOCK_MAX_ATTEMPTS,
  LOCK_DURATION_MS,
  isAccountLocked,
  lockoutMessage,
  applyFailedLogin,
  resetLoginAttempts,
};
