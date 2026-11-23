/**
 * One free lesson when a student finishes the 10th class of a curriculum level.
 * The garden shows that credit as a flower or fruit. At most 5 rewards per student.
 */
const Booking = require('../models/Booking');
const Student = require('../models/Student');
const { buildCreditLot } = require('./creditLots');
const {
  CURRICULUM_LEVELS,
  CANONICAL_TO_LEGACY,
  normalizeCurriculumLevel,
} = require('../config/curriculumLevels');

const LEVEL_LESSON_REWARD_AT = 10;
const LEVEL_LESSON_REWARD_CAP = 5;
const LEVEL_LESSON_REWARD_CREDITS = 1;

function shouldGrantLevelReward({ level, completed, alreadyGranted, totalGranted }) {
  if (!level || !CURRICULUM_LEVELS.includes(level)) return false;
  if (alreadyGranted) return false;
  if (Number(totalGranted) >= LEVEL_LESSON_REWARD_CAP) return false;
  return Number(completed) >= LEVEL_LESSON_REWARD_AT;
}

function levelKeys(level) {
  const legacy = CANONICAL_TO_LEGACY[level];
  return legacy ? [level, legacy] : [level];
}

async function maybeGrantLevelLessonReward(booking) {
  const level = normalizeCurriculumLevel(booking && booking.studentLevel);
  const studentKey = String((booking && booking.studentId) || '').trim();
  if (!level || !studentKey) return null;

  const student = await Student.findOne({ username: studentKey });
  if (!student) return null;
  const rewards = Array.isArray(student.levelLessonRewards) ? student.levelLessonRewards : [];
  const completed = await Booking.countDocuments({
    studentId: studentKey,
    status: 'completed',
    studentLevel: { $in: levelKeys(level) },
  });
  if (!shouldGrantLevelReward({
    level,
    completed,
    alreadyGranted: rewards.some((row) => row && row.level === level),
    totalGranted: rewards.length,
  })) {
    return null;
  }

  const paymentId = 'level10:' + String(student._id) + ':' + level;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 60);
  const lot = buildCreditLot({
    planId: 'level_lesson',
    planLabel: level + ' lesson 10 reward',
    credits: LEVEL_LESSON_REWARD_CREDITS,
    purchasedAt: new Date(),
    expiresAt,
    paymentId,
  });
  const balanceAfter = Number(student.creditBalance || 0) + LEVEL_LESSON_REWARD_CREDITS;
  const updated = await Student.updateOne(
    {
      _id: student._id,
      processedPaymentIds: { $ne: paymentId },
      'levelLessonRewards.level': { $ne: level },
      $expr: { $lt: [{ $size: { $ifNull: ['$levelLessonRewards', []] } }, LEVEL_LESSON_REWARD_CAP] },
    },
    {
      $inc: { creditBalance: LEVEL_LESSON_REWARD_CREDITS },
      $push: {
        processedPaymentIds: paymentId,
        levelLessonRewards: { level, credits: LEVEL_LESSON_REWARD_CREDITS, grantedAt: new Date() },
        creditLots: lot,
        creditHistory: {
          date: new Date(),
          plan: lot.planLabel,
          credits: LEVEL_LESSON_REWARD_CREDITS,
          amountPaid: 0,
          paymentId,
          entryType: 'adjustment',
          balanceAfter,
        },
      },
    }
  );
  if (!updated.modifiedCount) return null;

  const emails = [student.email, student.parentEmail]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(emails)];
  if (unique.length) {
    try {
      const { sendRawEmail } = require('../emailService');
      const name = String(student.firstName || 'there').replace(/[<>&]/g, '');
      const safeLevel = String(level).replace(/[<>&]/g, '');
      const subject = 'A free lesson is waiting in your RemoEd garden';
      const text = 'Hi ' + name + ', finishing lesson 10 of ' + safeLevel
        + ' grew a flower on your garden tree. That flower is 1 free lesson credit. It lasts 60 days.';
      const html = '<p>Hi ' + name + ',</p><p>Finishing lesson 10 of <strong>' + safeLevel
        + '</strong> grew a flower on your garden tree. That flower is <strong>1 free lesson</strong>. It lasts 60 days.</p>';
      for (const to of unique) {
        sendRawEmail(to, subject, html, text).catch((err) => {
          console.warn('level lesson reward email:', err && err.message);
        });
      }
    } catch (err) {
      console.warn('level lesson reward email:', err && err.message);
    }
  }
  return { level, credits: LEVEL_LESSON_REWARD_CREDITS };
}

module.exports = {
  LEVEL_LESSON_REWARD_AT,
  LEVEL_LESSON_REWARD_CAP,
  LEVEL_LESSON_REWARD_CREDITS,
  shouldGrantLevelReward,
  maybeGrantLevelLessonReward,
};
