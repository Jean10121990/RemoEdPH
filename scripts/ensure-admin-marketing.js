/**
 * Create or update adminmktg@remoedph.com as admin_marketing (setup-token path).
 * Usage: node scripts/ensure-admin-marketing.js
 */
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Admin = require('../server/models/Admin');
  const username = 'adminmktg@remoedph.com';
  let admin = await Admin.findOne({
    $or: [{ username }, { email: username }],
  });

  const setupTokenPlain = crypto.randomBytes(32).toString('hex');
  const tokenHash = await bcrypt.hash(setupTokenPlain, 10);
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  if (!admin) {
    admin = new Admin({
      username,
      email: null,
      adminRole: 'admin_marketing',
      mustSetPassword: true,
      passwordSetupTokenHash: tokenHash,
      passwordSetupExpires: expires,
    });
    await admin.save();
    console.log('CREATED admin_marketing:', username);
  } else {
    admin.adminRole = 'admin_marketing';
    admin.mustSetPassword = true;
    admin.passwordSetupTokenHash = tokenHash;
    admin.passwordSetupExpires = expires;
    await admin.save();
    console.log('UPDATED to admin_marketing:', username, '(prior role reset with new setup token)');
  }

  console.log('adminRole=', admin.adminRole);
  console.log('setupToken=', setupTokenPlain);
  console.log('(valid 7 days — use Profile / first-time password setup)');
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
