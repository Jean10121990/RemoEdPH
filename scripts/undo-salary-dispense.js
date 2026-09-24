/**
 * Undo salary disbursement for a pay-period duration so Accounting can re-dispense
 * and teachers can test MariBank Withdraw (needs fresh DISBURSED after re-dispense).
 *
 * Usage: node scripts/undo-salary-dispense.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

const DURATIONS = [
  '2026-09-16 - 2026-09-30', // current calendar cutoff (Sep 16–30)
  '2026-10-01 - 2026-10-15', // dispensed today during testing
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Teacher = require('../server/models/Teacher');

  const before = await Teacher.find({
    'paymentHistory.duration': { $in: DURATIONS },
  })
    .select('username teacherId paymentHistory')
    .lean();

  console.log('Before:');
  for (const t of before) {
    const rows = (t.paymentHistory || []).filter((p) =>
      DURATIONS.includes(String(p.duration || ''))
    );
    rows.forEach((p) =>
      console.log(
        `  ${t.username}: ${p.duration} status=${p.status} amount=${p.amount} id=${p._id}`
      )
    );
  }

  const result = await Teacher.updateMany(
    { 'paymentHistory.duration': { $in: DURATIONS } },
    {
      $pull: {
        paymentHistory: {
          duration: { $in: DURATIONS },
          status: {
            $in: [
              'DISBURSED',
              'WITHDRAWAL_REQUESTED',
              'COMPLETED',
              'Success',
              'paid',
              'Disbursed',
            ],
          },
        },
      },
    }
  );

  console.log(
    'updateMany matched=',
    result.matchedCount,
    'modified=',
    result.modifiedCount
  );

  const after = await Teacher.find({
    'paymentHistory.duration': { $in: DURATIONS },
  })
    .select('username paymentHistory')
    .lean();

  console.log('After (remaining rows for those durations):');
  if (!after.length) console.log('  (none)');
  for (const t of after) {
    const rows = (t.paymentHistory || []).filter((p) =>
      DURATIONS.includes(String(p.duration || ''))
    );
    rows.forEach((p) =>
      console.log(`  ${t.username}: ${p.duration} status=${p.status}`)
    );
  }

  await mongoose.disconnect();
  console.log('Done. Re-Dispense in Accounting Hub, then test Withdraw on Teaching Fee.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
