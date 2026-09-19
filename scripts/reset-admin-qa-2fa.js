/**
 * Reset an admin's password and clear TOTP so next login shows first-time QR enroll.
 *
 * Usage:
 *   node scripts/reset-admin-qa-2fa.js <username> <newPassword>
 * Example:
 *   node scripts/reset-admin-qa-2fa.js adminqa@remoedph.com "YourPasswordHere"
 *
 * Optional: FORCE_ROLE=admin_qa (default admin_qa for this helper)
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const USERNAME = String(process.argv[2] || '').trim();
const NEW_PASSWORD = String(process.argv[3] || '');
const FORCE_ROLE = String(process.env.FORCE_ROLE || 'admin_qa').trim();

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI missing');
  if (!USERNAME || !NEW_PASSWORD) {
    console.error('Usage: node scripts/reset-admin-qa-2fa.js <username> <newPassword>');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const Admin = require('../server/models/Admin');

  const admin = await Admin.findOne({
    $or: [{ username: USERNAME }, { email: USERNAME }],
  });
  if (!admin) throw new Error('Admin not found: ' + USERNAME);

  const before = {
    username: admin.username,
    email: admin.email,
    adminRole: admin.adminRole,
    isTwoFactorEnabled: admin.isTwoFactorEnabled,
    hasSecret: !!admin.twoFactorSecret,
    sessionVersion: admin.sessionVersion,
  };

  if (FORCE_ROLE) admin.adminRole = FORCE_ROLE;
  admin.status = 'active';
  admin.passwordHash = await bcrypt.hash(NEW_PASSWORD, 12);
  admin.password = undefined;
  admin.mustSetPassword = false;
  admin.passwordSetupTokenHash = null;
  admin.passwordSetupExpires = null;
  admin.twoFactorSecret = undefined;
  admin.isTwoFactorEnabled = false;
  admin.twoFactorEnabledAt = null;
  admin.sessionVersion = Number(admin.sessionVersion || 0) + 1;
  admin.loginAttempts = 0;
  admin.lockUntil = null;

  await admin.save();

  console.log('BEFORE:', JSON.stringify(before, null, 2));
  console.log('AFTER:', JSON.stringify({
    username: admin.username,
    email: admin.email,
    adminRole: admin.adminRole,
    isTwoFactorEnabled: admin.isTwoFactorEnabled,
    hasSecret: !!admin.twoFactorSecret,
    sessionVersion: admin.sessionVersion,
    status: admin.status,
  }, null, 2));
  console.log('Done. Next login should return require2FASetup + QR (password not printed).');
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
