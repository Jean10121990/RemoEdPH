/**
 * One-time / maintenance: remove duplicate PayMongo credit rows from all students.
 * Usage: node server/scripts/repair-all-credit-ledgers.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('../models/Student');
const { repairStudentLedgerDoc, studentLedgerNeedsRepair } = require('../creditLedgerRepair');

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/remoed';
  await mongoose.connect(uri);
  console.log('Connected. Scanning students...');

  const cursor = Student.find({}).cursor();
  let fixed = 0;
  let scanned = 0;

  for await (const doc of cursor) {
    scanned += 1;
    if (!studentLedgerNeedsRepair(doc)) continue;
    repairStudentLedgerDoc(doc);
    await doc.save();
    fixed += 1;
    if (fixed % 50 === 0) console.log(`  repaired ${fixed} so far...`);
  }

  console.log(`Done. Scanned ${scanned}, repaired ${fixed}.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
