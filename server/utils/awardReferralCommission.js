/**
 * Teacher/admin referral attribution + commission.
 * Pending row on signup; ₱1000 commission when the student pays for a plan.
 */
const Teacher = require('../models/Teacher');
const Admin = require('../models/Admin');
const Student = require('../models/Student');
const Referral = require('../models/Referral');
const PendingRegistration = require('../models/PendingRegistration');
const { encryptPiiString } = require('../utils/piiCrypto');

async function resolveReferralOwner(referralCode) {
  const code = String(referralCode || '').trim();
  if (!code) return null;
  // Case-insensitive match — links may vary in casing after copy/paste.
  const codeRe = new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const teacher = await Teacher.findOne({ referralCode: codeRe }).lean();
  if (teacher) {
    return {
      referralCode: String(teacher.referralCode || code),
      ownerType: 'teacher',
      ownerId: String(teacher.teacherId),
    };
  }
  const admin = await Admin.findOne({ referralCode: codeRe }).lean();
  if (admin) {
    return {
      referralCode: String(admin.referralCode || code),
      ownerType: 'admin',
      ownerId: String(admin.username),
    };
  }
  return null;
}

/**
 * Apply referral fields onto a student document (not yet saved) or plain object.
 */
function applyReferralFields(studentLike, owner) {
  if (!studentLike || !owner) return studentLike;
  studentLike.referralCode = owner.referralCode;
  studentLike.referredByOwnerType = owner.ownerType;
  studentLike.referredByOwnerId = owner.ownerId;
  if (owner.ownerType === 'teacher') {
    studentLike.referredByTeacherId = owner.ownerId;
  }
  return studentLike;
}

function studentDisplayName(student) {
  return (
    [student.firstName, student.lastName].filter(Boolean).join(' ').trim() ||
    student.username ||
    ''
  );
}

function studentLooksPaid(student) {
  if (!student) return false;
  return (
    student.isSubscribed === true ||
    String(student.paymentStatus || '').toLowerCase() === 'paid' ||
    String(student.subscriptionStatus || '').toLowerCase() === 'active' ||
    String(student.accountStatus || '').toLowerCase() === 'active_subscriber'
  );
}

function inferAmountPaid(student, fallback = 0) {
  const hist = Array.isArray(student.creditHistory) ? student.creditHistory : [];
  for (let i = hist.length - 1; i >= 0; i--) {
    const row = hist[i];
    const amt = Number(row && row.amountPaid);
    if (amt > 0 && String(row.entryType || row.plan || '').toLowerCase() !== 'welcome') {
      const planLabel = String(row.plan || '').toLowerCase();
      if (planLabel.includes('welcome') || planLabel.includes('trial')) continue;
      return amt;
    }
  }
  return Number(fallback || 0) || 0;
}

/**
 * Create/keep a pending referral when a student registers via a teacher/admin link.
 */
async function recordReferralSignup(student) {
  if (!student || !student._id) return { ok: false, reason: 'no_student' };
  let code = String(student.referralCode || '').trim();
  let ownerType = student.referredByOwnerType || (student.referredByTeacherId ? 'teacher' : null);
  let ownerId = student.referredByOwnerId || student.referredByTeacherId || null;

  if (code && (!ownerType || !ownerId)) {
    const owner = await resolveReferralOwner(code);
    if (owner) {
      ownerType = owner.ownerType;
      ownerId = owner.ownerId;
      code = owner.referralCode;
    }
  }
  if (!code || !ownerType || !ownerId) return { ok: false, reason: 'no_referral' };

  // Already paid → write successful instead of leaving a stale pending row.
  if (studentLooksPaid(student)) {
    return awardReferralCommissionOnPayment(student, {
      amountPaid: inferAmountPaid(student),
      plan: student.subscriptionPlan || '',
    });
  }

  await Referral.updateOne(
    { ownerType, ownerId: String(ownerId), studentId: String(student._id) },
    {
      $setOnInsert: {
        referralCode: code,
        ownerType,
        ownerId: String(ownerId),
        teacherId: String(ownerId),
        studentId: String(student._id),
        studentName: studentDisplayName(student),
        studentEmail: student.email || '',
        studentContact: encryptPiiString(student.contact || ''),
        subscriptionPlan: '',
        amountPaid: 0,
        commissionAmount: 0,
        status: 'pending',
      },
    },
    { upsert: true }
  );
  return { ok: true, status: 'pending' };
}

/**
 * Mark referral successful and award ₱1000 after paid subscription.
 */
async function awardReferralCommissionOnPayment(student, { amountPaid = 0, plan = '' } = {}) {
  if (!student || !student._id) return { ok: false, reason: 'no_student' };

  let code = String(student.referralCode || '').trim();
  if (!code) return { ok: false, reason: 'no_referral' };

  // Always resolve from live teacher/admin code so legacy ownerId mismatches still credit.
  const owner = await resolveReferralOwner(code);
  if (!owner) return { ok: false, reason: 'owner_not_found' };

  const ownerType = owner.ownerType;
  const ownerId = owner.ownerId;
  code = owner.referralCode;

  const paid = Number(amountPaid || 0) || inferAmountPaid(student, 0);
  await Referral.updateOne(
    { ownerType, ownerId: String(ownerId), studentId: String(student._id) },
    {
      $set: {
        referralCode: code,
        ownerType,
        ownerId: String(ownerId),
        teacherId: String(ownerId),
        studentId: String(student._id),
        studentName: studentDisplayName(student),
        studentEmail: student.email || '',
        studentContact: encryptPiiString(student.contact || ''),
        subscriptionPlan: plan || student.subscriptionPlan || '',
        amountPaid: paid,
        commissionAmount: 1000,
        status: 'successful',
      },
      $setOnInsert: {
        createdAt: new Date(),
      },
    },
    { upsert: true }
  );

  // Keep student attribution fields in sync for future look-ups.
  try {
    if (
      student.referralCode !== code ||
      student.referredByOwnerType !== ownerType ||
      String(student.referredByOwnerId || '') !== String(ownerId)
    ) {
      await Student.updateOne(
        { _id: student._id },
        {
          $set: {
            referralCode: code,
            referredByOwnerType: ownerType,
            referredByOwnerId: String(ownerId),
            ...(ownerType === 'teacher' ? { referredByTeacherId: String(ownerId) } : {}),
          },
        }
      );
    }
  } catch (_e) {
    /* non-fatal */
  }

  return { ok: true, status: 'successful', commissionAmount: 1000 };
}

/**
 * Backfill Referral rows for a teacher/admin from Students + paid PendingRegistrations.
 * Fixes historical pay/signup paths that never wrote Referral documents.
 */
async function reconcileReferralsForOwner({ ownerType, ownerId, referralCode } = {}) {
  const code = String(referralCode || '').trim();
  const oid = String(ownerId || '').trim();
  if (!ownerType || !oid || !code) {
    return { ok: false, reason: 'missing_owner', created: 0, updated: 0 };
  }

  const owner = { referralCode: code, ownerType, ownerId: oid };
  let createdOrUpdated = 0;

  const studentFilter = {
    $or: [
      { referralCode: code },
      { referralCode: new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      { referredByOwnerType: ownerType, referredByOwnerId: oid },
    ],
  };
  if (ownerType === 'teacher') {
    studentFilter.$or.push({ referredByTeacherId: oid });
  }

  const students = await Student.find(studentFilter).limit(500);
  for (const student of students) {
    try {
      if (!student.referralCode) {
        applyReferralFields(student, owner);
        await student.save();
      }
      const result = studentLooksPaid(student)
        ? await awardReferralCommissionOnPayment(student, {
            amountPaid: inferAmountPaid(student),
            plan: student.subscriptionPlan || '',
          })
        : await recordReferralSignup(student);
      if (result && result.ok) createdOrUpdated += 1;
    } catch (e) {
      console.warn('[referral reconcile] student failed:', student._id, e.message);
    }
  }

  // Paid checkouts that stored referral on PendingRegistration but never on Student/Referral.
  const pendings = await PendingRegistration.find({
    status: 'paid',
    referralCode: { $regex: new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
  })
    .sort({ updatedAt: -1 })
    .limit(300)
    .lean();

  for (const pending of pendings) {
    try {
      const student = await Student.findOne({
        $or: [{ email: pending.email }, { username: pending.username }],
      });
      if (!student) continue;
      if (!student.referralCode) {
        applyReferralFields(student, owner);
        await student.save();
      }
      const result = await awardReferralCommissionOnPayment(student, {
        amountPaid: Number(pending.amount || 0) || inferAmountPaid(student),
        plan: pending.plan || student.subscriptionPlan || '',
      });
      if (result && result.ok) createdOrUpdated += 1;
    } catch (e) {
      console.warn('[referral reconcile] pending failed:', pending.registrationId, e.message);
    }
  }

  return { ok: true, touched: createdOrUpdated };
}

module.exports = {
  resolveReferralOwner,
  applyReferralFields,
  recordReferralSignup,
  awardReferralCommissionOnPayment,
  reconcileReferralsForOwner,
  studentLooksPaid,
};
