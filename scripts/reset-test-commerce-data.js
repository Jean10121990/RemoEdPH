#!/usr/bin/env node
/**
 * Clear soft-launch TEST commerce data while keeping every account:
 *  - Student subscription, payment, credit and referral-attribution fields reset to a new free-plan student.
 *  - Referral commission rows (`referrals`) deleted.
 *  - Classroom SOS cases (`incidentreports`), their admin notifications, and booking SOS remarks cleared.
 *  - Admin fee payout rows (`admin_payouts`) deleted. Admin attendance and time logs stay.
 * Free-plan lesson progress, bookings, students, teachers, admins, lessons and curriculums are not deleted.
 * A JSON backup of every touched document is written before any change.
 *
 *   node scripts/reset-test-commerce-data.js           (dry run)
 *   node scripts/reset-test-commerce-data.js --apply
 */
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');

const APPLY = process.argv.includes('--apply');

const STUDENT_RESET = {
  $set: {
    subscriptionStatus: 'pending',
    paymentStatus: 'unpaid',
    paymentMethod: null,
    paymentReference: '',
    paymentPaidAt: null,
    isSubscribed: false,
    accountStatus: 'standard',
    creditBalance: 0,
    reservedCredits: 0,
    totalCreditsEarned: 0,
    totalLessonsPurchased: 0,
    usedCredits: 0,
    expiredCredits: 0,
    totalCredits: null,
    creditLots: [],
    creditHistory: [],
    creditTransactions: [],
    creditExpiryNotices: { d10: null, d5: null, d2: null, expired: null },
    learningJourneyPurchasedByLevel: {},
    referralCode: null,
    referredByTeacherId: null,
    referredByOwnerType: null,
    referredByOwnerId: null,
  },
  $unset: {
    subscriptionPlan: '',
    subscriptionStartDate: '',
    subscriptionEndDate: '',
    paymentDetails: '',
    pendingCheckout: '',
  },
};

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  if (db.databaseName !== 'test') throw new Error('Refusing: database is "' + db.databaseName + '", expected test.');

  const keepCounts = {};
  for (const c of ['students', 'teachers', 'admins', 'lessons', 'curriculums', 'bookings']) {
    keepCounts[c] = await db.collection(c).countDocuments();
  }

  const sosNotifQuery = { type: 'classroom-sos' };
  const sosBookingQuery = { scheduleRemark: { $nin: ['', null] } };
  const backup = {
    takenAt: new Date().toISOString(),
    database: db.databaseName,
    students: await db.collection('students').find({}).toArray(),
    referrals: await db.collection('referrals').find({}).toArray(),
    incidentreports: await db.collection('incidentreports').find({}).toArray(),
    sosNotifications: await db.collection('notifications').find(sosNotifQuery).toArray(),
    sosBookings: await db.collection('bookings').find(sosBookingQuery).toArray(),
    admin_payouts: await db.collection('admin_payouts').find({}).toArray(),
    qrpaymentclaims: await db.collection('qrpaymentclaims').find({}).toArray(),
    pendingregistrations: await db.collection('pendingregistrations').find({ status: 'paid' }).toArray(),
  };

  const amount = backup.students
    .flatMap((s) => s.creditHistory || [])
    .reduce((sum, h) => sum + (Number(h && h.amountPaid) || 0), 0);
  console.log('database test');
  console.log('students to reset: ' + backup.students.length + ' (purchase total ₱' + amount.toFixed(2) + ')');
  console.log('referrals to delete: ' + backup.referrals.length);
  console.log('Classroom SOS cases to delete: ' + backup.incidentreports.length);
  console.log('SOS admin notifications to delete: ' + backup.sosNotifications.length);
  console.log('bookings with SOS remark to clear: ' + backup.sosBookings.length);
  console.log('admin fee payouts to delete: ' + backup.admin_payouts.length);
  console.log('QR payment claims to delete: ' + backup.qrpaymentclaims.length);
  console.log('paid pending registrations to delete: ' + backup.pendingregistrations.length);

  if (!APPLY) {
    console.log('dry run; add --apply to back up and change data');
    await mongoose.disconnect();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(os.homedir(), 'Downloads', 'RemoEdPH-test-data-backup-' + stamp + '.json');
  fs.writeFileSync(file, JSON.stringify(backup, null, 2));
  console.log('backup written: ' + file);

  const r1 = await db.collection('students').updateMany({}, STUDENT_RESET);
  const r2 = await db.collection('referrals').deleteMany({});
  const r3 = await db.collection('incidentreports').deleteMany({});
  const r4 = await db.collection('notifications').deleteMany(sosNotifQuery);
  const r5 = await db.collection('bookings').updateMany(sosBookingQuery, { $set: { scheduleRemark: '' } });
  const r6 = await db.collection('admin_payouts').deleteMany({});
  const r7 = await db.collection('qrpaymentclaims').deleteMany({});
  const r8 = await db.collection('pendingregistrations').deleteMany({ status: 'paid' });
  console.log('students reset: ' + r1.modifiedCount);
  console.log('referrals deleted: ' + r2.deletedCount);
  console.log('SOS cases deleted: ' + r3.deletedCount);
  console.log('SOS notifications deleted: ' + r4.deletedCount);
  console.log('booking SOS remarks cleared: ' + r5.modifiedCount);
  console.log('admin payouts deleted: ' + r6.deletedCount);
  console.log('QR claims deleted: ' + r7.deletedCount);
  console.log('paid pending registrations deleted: ' + r8.deletedCount);

  for (const [c, n] of Object.entries(keepCounts)) {
    const now = await db.collection(c).countDocuments();
    console.log('kept ' + c + ': ' + now + (now === n ? '' : ' (WAS ' + n + ')'));
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
