// One-time migration: ensure legacy admins have 2FA fields.
// Usage: node scripts/migrate-2fa-fields.js

require('dotenv').config();
const mongoose = require('mongoose');

const Admin = require('../server/models/Admin');
const { connectDB } = require('../server/db');

async function migrate() {
  const ok = await connectDB();
  if (!ok) {
    console.error('❌ Could not connect to MongoDB. Aborting migration.');
    process.exitCode = 1;
    return;
  }

  try {
    const filter = { isTwoFactorEnabled: { $exists: false } };
    const update = {
      $set: {
        isTwoFactorEnabled: false,
        twoFactorSecret: '',
      },
    };

    const before = await Admin.countDocuments(filter);
    const res = await Admin.updateMany(filter, update);
    const modified = res.modifiedCount != null ? res.modifiedCount : res.nModified;

    console.log('✅ 2FA fields migration complete.');
    console.log('Matched legacy admins:', before);
    console.log('Modified admins:', modified);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
}

migrate();

