require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../db');
const Teacher = require('../models/Teacher');

function fmtId(t) {
  return t && (t.teacherId || t.username || String(t._id));
}

async function main() {
  await connectDB();

  const issues = [];

  // 1) Required date: professionalCertifications.issueDate
  const missingIssueDate = await Teacher.find({
    professionalCertifications: { $exists: true, $ne: [] },
    $or: [
      { 'professionalCertifications.issueDate': { $exists: false } },
      { 'professionalCertifications.issueDate': null },
    ],
  })
    .select('teacherId username professionalCertifications.issueDate')
    .lean()
    .limit(2000);

  missingIssueDate.forEach((t) => {
    issues.push({
      teacher: fmtId(t),
      field: 'professionalCertifications.issueDate',
      reason: 'missing/null (required Date)',
    });
  });

  // 2) Type sanity: any issueDate stored as non-date (string/object) can break casting in queries
  // Mongo $type: 9=date. We flag everything else except null (handled above).
  const nonDateIssueDate = await Teacher.find({
    professionalCertifications: { $exists: true, $ne: [] },
    'professionalCertifications.issueDate': { $ne: null, $exists: true, $not: { $type: 9 } },
  })
    .select('teacherId username professionalCertifications.issueDate')
    .lean()
    .limit(2000);

  nonDateIssueDate.forEach((t) => {
    issues.push({
      teacher: fmtId(t),
      field: 'professionalCertifications.issueDate',
      reason: 'not stored as BSON Date',
    });
  });

  const summary = issues.reduce((acc, x) => {
    acc[x.field] = (acc[x.field] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({ ok: true, counts: summary, sample: issues.slice(0, 50) }, null, 2));

  await mongoose.connection.close();
}

main().catch((e) => {
  console.error(e);
  try {
    mongoose.connection.close();
  } catch (_e2) {}
  process.exit(1);
});

