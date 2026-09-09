/**
 * Teacher/admin referral attribution + commission.
 * Pending row on signup; ₱1000 commission when the student pays for a plan.
 */
const Teacher = require('../models/Teacher');
const Admin = require('../models/Admin');
const Referral = require('../models/Referral');
const { encryptPiiString } = require('../utils/piiCrypto');

async function resolveReferralOwner(referralCode) {
  const code = String(referralCode || '').trim();
  if (!code) return null;
  const teacher = await Teacher.findOne({ referralCode: code }).lean();
  if (teacher) {
    return {
      referralCode: code,
      ownerType: 'teacher',
      ownerId: String(teacher.teacherId),
    };
  }
  const admin = await Admin.findOne({ referralCode: code }).lean();
  if (admin) {
    return {
      referralCode: code,
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

/**
 * Create/keep a pending referral when a student registers via a teacher/admin link.
 */
async function recordReferralSignup(student) {
  if (!student || !student._id) return { ok: false, reason: 'no_student' };
  const code = String(student.referralCode || '').trim();
  const ownerType = student.referredByOwnerType || (student.referredByTeacherId ? 'teacher' : null);
  const ownerId = student.referredByOwnerId || student.referredByTeacherId || null;
  if (!code || !ownerType || !ownerId) return { ok: false, reason: 'no_referral' };

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
  let ownerType = student.referredByOwnerType || (student.referredByTeacherId ? 'teacher' : null);
  let ownerId = student.referredByOwnerId || student.referredByTeacherId || null;

  if ((!code || !ownerType || !ownerId) && code) {
    const owner = await resolveReferralOwner(code);
    if (owner) {
      ownerType = owner.ownerType;
      ownerId = owner.ownerId;
      code = owner.referralCode;
    }
  }

  if (!code || !ownerType || !ownerId) return { ok: false, reason: 'no_referral' };

  let refOk = false;
  if (ownerType === 'teacher') {
    const teacher = await Teacher.findOne({ teacherId: ownerId, referralCode: code }).lean();
    refOk = !!teacher;
  } else if (ownerType === 'admin') {
    const admin = await Admin.findOne({ username: ownerId, referralCode: code }).lean();
    refOk = !!admin;
  }
  if (!refOk) return { ok: false, reason: 'owner_mismatch' };

  const paid = Number(amountPaid || 0) || 0;
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
  return { ok: true, status: 'successful', commissionAmount: 1000 };
}

module.exports = {
  resolveReferralOwner,
  applyReferralFields,
  recordReferralSignup,
  awardReferralCommissionOnPayment,
};
