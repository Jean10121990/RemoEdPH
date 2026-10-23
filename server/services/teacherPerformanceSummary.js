/**
 * Teacher profile Performance tab. Identity is the signed-in teacher document.
 * Ratings come from student_to_teacher Feedback. Rank and punctuality come
 * from this month's MonthlyTeacherScore (same month key as the leaderboard).
 */

const { DateTime } = require('luxon');
const Booking = require('../models/Booking');
const Feedback = require('../models/Feedback');
const MonthlyTeacherScore = require('../models/MonthlyTeacherScore');
const { currentMonthKey } = require('./leaderboardService');
const { evaluateTeacherBadges } = require('./badgeRulesEngine');

const PH_ZONE = 'Asia/Manila';
const REVIEW_LIMIT = 40;

function teacherKeys(teacher) {
  const keys = [];
  const add = (value) => {
    const s = value == null ? '' : String(value).trim();
    if (s && !keys.includes(s)) keys.push(s);
  };
  if (!teacher) return keys;
  add(teacher.teacherId);
  add(teacher.username);
  add(teacher.email);
  return keys;
}

function qualityFromSignals({ ratingCount, averageRating, positivePercent, punctuality }) {
  if (!ratingCount) return { score: 0, band: 'Getting started' };
  const raw =
    (Number(averageRating) / 5) * 50 +
    Number(positivePercent) * 0.3 +
    Number(punctuality) * 0.2;
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  let band = 'Getting started';
  if (score >= 90) band = 'Excellent';
  else if (score >= 75) band = 'Strong';
  else if (score >= 50) band = 'Building';
  return { score, band };
}

function rankCopy(rank) {
  const n = Number(rank);
  if (!Number.isInteger(n) || n < 1) {
    return {
      rank: null,
      standing: 'Not on the board yet',
      topTen: false,
      banner: 'Complete lessons this month to join the RemoEd Teacher Leaderboard.',
    };
  }
  const standing = `Rank #${n}`;
  if (n <= 3) {
    return {
      rank: n,
      standing,
      topTen: true,
      banner: `You are Rank #${n} in the Top 3 on the RemoEd Teacher Leaderboard this month.`,
    };
  }
  if (n <= 10) {
    return {
      rank: n,
      standing,
      topTen: true,
      banner: `You are Rank #${n} on the RemoEd Teacher Leaderboard. Keep going toward the Top 3.`,
    };
  }
  return {
    rank: n,
    standing,
    topTen: false,
    banner: `You are Rank #${n} on the RemoEd Teacher Leaderboard this month.`,
  };
}

function fiveStarStreak(dates) {
  const days = [];
  const seen = new Set();
  for (const raw of dates) {
    if (!raw) continue;
    const day = DateTime.fromJSDate(new Date(raw), { zone: PH_ZONE }).startOf('day');
    if (!day.isValid) continue;
    const key = day.toISODate();
    if (seen.has(key)) continue;
    seen.add(key);
    days.push(key);
  }
  days.sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of days) {
    const cur = DateTime.fromISO(key, { zone: PH_ZONE });
    if (prev && cur.diff(prev, 'days').days === 1) run += 1;
    else run = 1;
    if (run > best) best = run;
    prev = cur;
  }
  return best;
}

function milestoneBadge({ id, name, icon, description, earned, currentValue, targetValue, unit }) {
  return {
    id,
    name,
    icon,
    description,
    status: earned ? 'earned' : 'locked',
    earned: !!earned,
    progress: earned ? 100 : targetValue > 0 ? Math.max(0, Math.min(100, Math.round((currentValue / targetValue) * 100))) : 0,
    currentValue,
    targetValue,
    unit,
  };
}

function lockedAward(id, name, icon, description) {
  return {
    id,
    name,
    icon,
    description,
    status: 'locked',
    earned: false,
    progress: 0,
    currentValue: 0,
    targetValue: 0,
    unit: '',
  };
}

async function buildTeacherPerformanceSummary(teacher) {
  const keys = teacherKeys(teacher);
  const month = currentMonthKey();
  const emptyRank = rankCopy(null);

  if (!keys.length) {
    return {
      month,
      quality: { score: 0, band: 'Getting started' },
      kpis: {
        averageRating: 0,
        ratingCount: 0,
        completedLessons: 0,
        positivePercent: 0,
        standing: emptyRank.standing,
      },
      rank: emptyRank,
      punctuality: 0,
      badges: [],
      reviews: [],
    };
  }

  const feedbackMatch = {
    teacherId: { $in: keys },
    feedbackRole: 'student_to_teacher',
    rating: { $gte: 1, $lte: 5 },
  };

  const [completedLessons, ratingAgg, fiveStarRows, monthly, reviews, badgeResult] = await Promise.all([
    Booking.countDocuments({ teacherId: { $in: keys }, status: 'completed' }),
    Feedback.aggregate([
      { $match: feedbackMatch },
      {
        $group: {
          _id: null,
          ratingCount: { $sum: 1 },
          ratingSum: { $sum: '$rating' },
          positive: { $sum: { $cond: [{ $gte: ['$rating', 4] }, 1, 0] } },
        },
      },
    ]),
    Feedback.find({ ...feedbackMatch, rating: 5 }).select('lessonDate submittedAt').lean(),
    MonthlyTeacherScore.find({ month, teacherId: { $in: keys } }).sort({ rank: 1 }).lean(),
    Feedback.find(feedbackMatch)
      .select('rating comment submittedAt')
      .sort({ submittedAt: -1 })
      .limit(REVIEW_LIMIT)
      .lean(),
    evaluateTeacherBadges(teacher.teacherId || teacher.username).catch(() => null),
  ]);

  const ratingCount = ratingAgg[0] ? ratingAgg[0].ratingCount : 0;
  const averageRating = ratingCount
    ? Math.round((ratingAgg[0].ratingSum / ratingCount) * 100) / 100
    : 0;
  const positivePercent = ratingCount
    ? Math.round((ratingAgg[0].positive / ratingCount) * 1000) / 10
    : 0;

  const scoreRow = monthly.find((row) => Number(row.rank) >= 1) || monthly[0] || null;
  const punctuality = scoreRow && Number(scoreRow.punctualityScore) >= 100 ? 100 : 0;
  const lessonsThisMonth = scoreRow ? Number(scoreRow.lessonsCompletedCount) || 0 : 0;
  const rank = rankCopy(scoreRow && scoreRow.rank);
  const quality = qualityFromSignals({
    ratingCount,
    averageRating,
    positivePercent,
    punctuality,
  });

  const streak = fiveStarStreak(
    fiveStarRows.map((row) => row.lessonDate || row.submittedAt)
  );

  const engineBadges = badgeResult && Array.isArray(badgeResult.badges) ? badgeResult.badges : [];
  const badges = engineBadges.concat([
    milestoneBadge({
      id: 'lessons-500',
      name: '500+ Lessons Club',
      icon: '📚',
      description: '500 completed lessons',
      earned: completedLessons >= 500,
      currentValue: completedLessons,
      targetValue: 500,
      unit: 'lessons',
    }),
    milestoneBadge({
      id: 'five-star-streak',
      name: '5-Star Streak',
      icon: '🔥',
      description: '30 consecutive days that each include a 5-star review',
      earned: streak >= 30,
      currentValue: streak,
      targetValue: 30,
      unit: 'days',
    }),
    milestoneBadge({
      id: 'parent-favorite',
      name: 'Parent Favorite',
      icon: '💛',
      description: 'At least 10 reviews, with 98% or more at 4–5 stars',
      earned: ratingCount >= 10 && positivePercent >= 98,
      currentValue: ratingCount,
      targetValue: 10,
      unit: 'reviews',
    }),
    milestoneBadge({
      id: 'punctuality-master',
      name: 'Punctuality Master',
      icon: '⏰',
      description: '100% punctuality this month, with completed lessons',
      earned: punctuality >= 100 && lessonsThisMonth > 0,
      currentValue: punctuality,
      targetValue: 100,
      unit: '%',
    }),
    lockedAward(
      'eco-stewardship',
      'Eco-Stewardship Champion',
      '🌿',
      'Stays locked until RemoEd records this award.'
    ),
    lockedAward(
      'christian-values',
      'Christian Values Exemplar',
      '✝️',
      'Stays locked until RemoEd records this award.'
    ),
  ]);

  return {
    month,
    quality,
    kpis: {
      averageRating,
      ratingCount,
      completedLessons,
      positivePercent,
      standing: rank.standing,
    },
    rank,
    punctuality,
    badges,
    reviews: reviews.map((row) => ({
      name: 'Parent',
      rating: Number(row.rating) || 0,
      comment: String(row.comment || '').trim().slice(0, 1000),
      submittedAt: row.submittedAt ? new Date(row.submittedAt).toISOString() : null,
    })),
  };
}

module.exports = {
  buildTeacherPerformanceSummary,
  qualityFromSignals,
  rankCopy,
  fiveStarStreak,
};
