/**
 * Set a student's creditBalance and/or migrate reservedCredits back into creditBalance.
 *
 * Usage:
 *   node server/scripts/set-student-credit-balance.js plflores3302 29
 *   node server/scripts/set-student-credit-balance.js --migrate-reserved
 *   node server/scripts/set-student-credit-balance.js --migrate-reserved plflores3302 29
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('../models/Student');

async function migrateReservedCredits() {
  const withReserved = await Student.find({ reservedCredits: { $gt: 0 } }).select(
    '_id username reservedCredits creditBalance'
  );
  let migrated = 0;
  for (const s of withReserved) {
    const reserved = Math.max(0, Number(s.reservedCredits) || 0);
    if (reserved <= 0) continue;
    await Student.updateOne(
      { _id: s._id, reservedCredits: { $gte: 1 } },
      {
        $inc: { creditBalance: reserved },
        $set: { reservedCredits: 0 },
      }
    );
    migrated += 1;
    console.log(
      `  migrated ${s.username || s._id}: reserved ${reserved} -> creditBalance`
    );
  }
  console.log(`Reserved migration done. Updated ${migrated} student(s).`);
}

async function setBalance(usernameOrEmail, balance) {
  const q = {
    $or: [
      { username: usernameOrEmail },
      { email: new RegExp(`^${String(usernameOrEmail).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    ],
  };
  const before = await Student.findOne(q)
    .select('username email creditBalance reservedCredits totalCredits usedCredits totalCreditsEarned')
    .lean();
  if (!before) {
    console.error(`Student not found: ${usernameOrEmail}`);
    process.exit(1);
  }
  console.log('Before:', before);

  const setDoc = {
    creditBalance: balance,
    reservedCredits: 0,
  };
  // Clear optional totalCredits override so creditBalance is the live balance.
  setDoc.totalCredits = null;

  await Student.updateOne({ _id: before._id }, { $set: setDoc });

  const after = await Student.findById(before._id)
    .select('username email creditBalance reservedCredits totalCredits usedCredits totalCreditsEarned')
    .lean();
  console.log('After:', after);
}

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const migrate = args.includes('--migrate-reserved');
  const positional = args.filter((a) => a !== '--migrate-reserved');

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/remoed';
  await mongoose.connect(uri);
  console.log('Connected.');

  if (migrate) {
    await migrateReservedCredits();
  }

  if (positional.length >= 2) {
    const username = positional[0];
    const balance = Number(positional[1]);
    if (!Number.isFinite(balance) || balance < 0) {
      console.error('Balance must be a non-negative number.');
      process.exit(1);
    }
    await setBalance(username, balance);
  } else if (!migrate) {
    console.error(
      'Usage: node server/scripts/set-student-credit-balance.js [--migrate-reserved] [username balance]'
    );
    process.exit(1);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
