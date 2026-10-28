const ReferralLinkClick = require('../models/ReferralLinkClick');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Admin = require('../models/Admin');

function normalizeCode(raw) {
  return String(raw || '').trim().slice(0, 64);
}

/**
 * Resolve which portal owns this share/referral code.
 * Students use `shareCode`; teachers and admins use `referralCode`.
 */
async function resolveReferralCodeOwner(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return null;

  const student = await Student.findOne({ shareCode: code }).select('_id').lean();
  if (student) {
    return { referralCode: code, ownerType: 'student', ownerId: String(student._id) };
  }

  const teacher = await Teacher.findOne({ referralCode: code }).select('teacherId').lean();
  if (teacher) {
    return { referralCode: code, ownerType: 'teacher', ownerId: String(teacher.teacherId) };
  }

  const admin = await Admin.findOne({ referralCode: code }).select('username').lean();
  if (admin) {
    return { referralCode: code, ownerType: 'admin', ownerId: String(admin.username) };
  }

  return null;
}

async function recordReferralClick(rawCode) {
  const owner = await resolveReferralCodeOwner(rawCode);
  if (!owner) {
    return { ok: false, reason: 'unknown_code' };
  }

  const updated = await ReferralLinkClick.findOneAndUpdate(
    { referralCode: owner.referralCode },
    {
      $inc: { clickCount: 1 },
      $set: {
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        lastClickAt: new Date(),
      },
      $setOnInsert: { referralCode: owner.referralCode },
    },
    { upsert: true, new: true }
  ).lean();

  return {
    ok: true,
    referralCode: owner.referralCode,
    clickCount: Number(updated && updated.clickCount) || 0,
  };
}

async function getReferralClickCount(rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return 0;
  const row = await ReferralLinkClick.findOne({ referralCode: code }).select('clickCount').lean();
  return Number(row && row.clickCount) || 0;
}

module.exports = {
  normalizeCode,
  resolveReferralCodeOwner,
  recordReferralClick,
  getReferralClickCount,
};
