/**
 * Monthly Badge Rules Engine for the RemoEd teacher portal.
 * Evaluates automated performance badges for the previous full calendar month (Asia/Manila).
 */

const { DateTime } = require('luxon');
const Booking = require('../models/Booking');
const TeacherSlot = require('../models/TeacherSlot');
const Feedback = require('../models/Feedback');
const { normalizeId } = require('../utils/normalizeId');

const PH_ZONE = 'Asia/Manila';
const MIN_MONTHLY_BOOKINGS = 10;
const SLOT_MINUTES = 25;
const WEEKEND_WARRIOR_HOURS = 7;

const BADGE_DEFS = [
  {
    id: 'completion-master',
    name: 'Completion Master',
    icon: '✅',
    description: 'Completed 98%+ of bookings',
    qualitative: false,
  },
  {
    id: 'no-cancellation',
    name: 'Reliable Teacher',
    icon: '🎯',
    description: 'No cancellations (20-class progress target)',
    qualitative: false,
  },
  {
    id: 'no-absent',
    name: 'Perfect Attendance',
    icon: '🌟',
    description: 'No teacher absences',
    qualitative: false,
  },
  {
    id: 'rising-star',
    name: 'Rising Star',
    icon: '⭐',
    description: 'Complete 20+ classes in the month',
    qualitative: false,
  },
  {
    id: 'super-teacher',
    name: 'Super Teacher',
    icon: '🔥',
    description: 'Complete 160+ classes in the month',
    qualitative: false,
  },
  {
    id: 'elite-educator',
    name: 'Elite Educator',
    icon: '💎',
    description: 'Complete 240+ classes in the month',
    qualitative: false,
  },
  {
    id: 'weekend-warrior',
    name: 'Weekend Warrior',
    icon: '🏋️',
    description: 'Open 7+ hours of Sat/Sun slots (PH time)',
    qualitative: false,
  },
  {
    id: 'five-star-master',
    name: 'Five Star Master',
    icon: '⭐⭐⭐⭐⭐',
    description: 'All 5-star ratings (10+ student reviews)',
    qualitative: false,
  },
  {
    id: 'pronunciation-pro',
    name: 'Pronunciation Pro',
    icon: '🗣️',
    description: 'Excellent pronunciation',
    qualitative: true,
  },
  {
    id: 'grammar-expert',
    name: 'Grammar Expert',
    icon: '📚',
    description: 'Strong grammar skills',
    qualitative: true,
  },
  {
    id: 'energetic',
    name: 'Energetic Teacher',
    icon: '⚡',
    description: 'Always energetic in class',
    qualitative: true,
  },
  {
    id: 'smiling-face',
    name: 'Smiling Face',
    icon: '😊',
    description: 'Positive and cheerful',
    qualitative: true,
  },
  {
    id: 'knowledgeable',
    name: 'Knowledgeable',
    icon: '🧠',
    description: 'Deep subject knowledge',
    qualitative: true,
  },
];

function getPreviousCalendarMonthRange(zone = PH_ZONE) {
  const now = DateTime.now().setZone(zone);
  const prev = now.minus({ months: 1 });
  const start = prev.startOf('month');
  const end = prev.endOf('month');
  return {
    periodStart: start.toJSDate(),
    periodEnd: end.toJSDate(),
    startDateStr: start.toFormat('yyyy-MM-dd'),
    endDateStr: end.toFormat('yyyy-MM-dd'),
    label: start.toFormat('LLLL yyyy'),
    zone,
  };
}

function clampProgress(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

function buildBadgeResult(def, opts) {
  const {
    earned = false,
    locked = false,
    currentValue = 0,
    targetValue = 0,
    unit = '',
    progressMode = 'numeric',
  } = opts;

  let status = 'in_progress';
  if (def.qualitative || locked) status = 'locked';
  else if (earned) status = 'earned';

  let progress = 0;
  if (progressMode === 'feedback') {
    progress = 0;
  } else if (earned) {
    progress = 100;
  } else if (targetValue > 0) {
    progress = clampProgress((Number(currentValue) / Number(targetValue)) * 100);
  }

  return {
    id: def.id,
    name: def.name,
    icon: def.icon,
    description: def.description,
    status,
    earned: !!earned && !locked && !def.qualitative,
    progress,
    currentValue,
    targetValue,
    unit,
    progressMode,
  };
}

function classifyBooking(booking) {
  if (booking.status === 'cancelled') return 'cancelled';
  if (booking.status === 'completed') return 'completed';
  if (booking.status === 'absent') {
    const teacherEntered = !!(booking.attendance && booking.attendance.teacherEntered);
    if (booking.absentType === 'teacher' || !teacherEntered) return 'teacher_absent';
    return 'student_absent';
  }
  return 'other';
}

/**
 * Sum opened weekend slot duration in Asia/Manila (Sat/Sun).
 * Each available slot contributes SLOT_MINUTES (25).
 */
function computeWeekendHours(slots, zone = PH_ZONE) {
  let minutes = 0;
  for (const slot of slots) {
    if (!slot || slot.available === false) continue;

    let dt = null;
    if (slot.dateTimeUtc) {
      dt = DateTime.fromJSDate(new Date(slot.dateTimeUtc), { zone: 'utc' }).setZone(zone);
    } else if (slot.date && slot.time) {
      const z = slot.teacherLocalZone && DateTime.now().setZone(slot.teacherLocalZone).isValid
        ? slot.teacherLocalZone
        : zone;
      dt = DateTime.fromISO(`${slot.date}T${slot.time}`, { zone: z }).setZone(zone);
    }
    if (!dt || !dt.isValid) continue;

    const dow = dt.weekday; // Luxon: 1=Mon … 7=Sun
    if (dow === 6 || dow === 7) {
      minutes += SLOT_MINUTES;
    }
  }
  return Math.round((minutes / 60) * 100) / 100;
}

async function aggregateTeacherMonthMetrics(teacherId, range) {
  const tid = normalizeId(String(teacherId || ''));
  const bookings = await Booking.find({
    teacherId: tid,
    date: { $gte: range.startDateStr, $lte: range.endDateStr },
  })
    .select('status attendance absentType date time')
    .lean();

  let monthlyCompleted = 0;
  let cancellations = 0;
  let teacherAbsences = 0;
  let totalScheduled = bookings.length;

  for (const b of bookings) {
    const kind = classifyBooking(b);
    if (kind === 'completed') monthlyCompleted += 1;
    else if (kind === 'cancelled') cancellations += 1;
    else if (kind === 'teacher_absent') teacherAbsences += 1;
  }

  const completionRate =
    totalScheduled > 0 ? monthlyCompleted / totalScheduled : 0;

  const slots = await TeacherSlot.find({
    teacherId: tid,
    available: true,
    date: { $gte: range.startDateStr, $lte: range.endDateStr },
  })
    .select('date time dateTimeUtc teacherLocalZone available')
    .lean();

  const weekendHours = computeWeekendHours(slots, range.zone);

  const feedbacks = await Feedback.find({
    teacherId: tid,
    feedbackRole: 'student_to_teacher',
    $or: [
      { lessonDate: { $gte: range.periodStart, $lte: range.periodEnd } },
      {
        submittedAt: { $gte: range.periodStart, $lte: range.periodEnd },
        lessonDate: { $exists: false },
      },
    ],
  })
    .select('rating')
    .lean();

  const ratings = feedbacks.map((f) => Number(f.rating) || 0).filter((r) => r > 0);
  const totalRatings = ratings.length;
  const averageRating =
    totalRatings > 0 ? ratings.reduce((a, b) => a + b, 0) / totalRatings : 0;
  const allFiveStars = totalRatings > 0 && ratings.every((r) => r === 5);

  return {
    monthlyCompleted,
    cancellations,
    teacherAbsences,
    totalScheduled,
    completionRate,
    weekendHours,
    averageRating,
    totalRatings,
    allFiveStars,
  };
}

function evaluateBadges(metrics) {
  const {
    monthlyCompleted,
    cancellations,
    teacherAbsences,
    completionRate,
    weekendHours,
    averageRating,
    totalRatings,
    allFiveStars,
  } = metrics;

  const meetsBaseline = monthlyCompleted >= MIN_MONTHLY_BOOKINGS;
  const badges = [];

  for (const def of BADGE_DEFS) {
    if (def.qualitative) {
      badges.push(
        buildBadgeResult(def, {
          earned: false,
          locked: true,
          currentValue: 0,
          targetValue: 0,
          unit: '',
          progressMode: 'feedback',
        })
      );
      continue;
    }

    const locked = !meetsBaseline;
    let earned = false;
    let currentValue = 0;
    let targetValue = 1;
    let unit = '';

    switch (def.id) {
      case 'completion-master': {
        currentValue = Math.round(completionRate * 1000) / 10;
        targetValue = 98;
        unit = '%';
        earned = meetsBaseline && completionRate >= 0.98;
        break;
      }
      case 'no-cancellation': {
        currentValue = monthlyCompleted;
        targetValue = 20;
        unit = 'classes';
        earned = meetsBaseline && cancellations === 0;
        break;
      }
      case 'no-absent': {
        currentValue = monthlyCompleted;
        targetValue = MIN_MONTHLY_BOOKINGS;
        unit = 'classes';
        earned = meetsBaseline && teacherAbsences === 0;
        break;
      }
      case 'rising-star': {
        currentValue = monthlyCompleted;
        targetValue = 20;
        unit = 'classes';
        earned = meetsBaseline && monthlyCompleted >= 20;
        break;
      }
      case 'super-teacher': {
        currentValue = monthlyCompleted;
        targetValue = 160;
        unit = 'classes';
        earned = meetsBaseline && monthlyCompleted >= 160;
        break;
      }
      case 'elite-educator': {
        currentValue = monthlyCompleted;
        targetValue = 240;
        unit = 'classes';
        earned = meetsBaseline && monthlyCompleted >= 240;
        break;
      }
      case 'weekend-warrior': {
        currentValue = weekendHours;
        targetValue = WEEKEND_WARRIOR_HOURS;
        unit = 'hrs';
        earned = meetsBaseline && weekendHours >= WEEKEND_WARRIOR_HOURS;
        break;
      }
      case 'five-star-master': {
        currentValue = totalRatings;
        targetValue = MIN_MONTHLY_BOOKINGS;
        unit = 'ratings';
        earned =
          meetsBaseline &&
          allFiveStars &&
          averageRating === 5 &&
          totalRatings >= MIN_MONTHLY_BOOKINGS;
        break;
      }
      default:
        break;
    }

    badges.push(
      buildBadgeResult(def, {
        earned,
        locked,
        currentValue,
        targetValue,
        unit,
        progressMode: 'numeric',
      })
    );
  }

  return badges;
}

/**
 * Evaluate all badges for a teacher for the previous PH calendar month.
 */
async function evaluateTeacherBadges(teacherId) {
  const range = getPreviousCalendarMonthRange(PH_ZONE);
  const metrics = await aggregateTeacherMonthMetrics(teacherId, range);
  const badges = evaluateBadges(metrics);

  return {
    period: {
      label: range.label,
      startDate: range.startDateStr,
      endDate: range.endDateStr,
      zone: range.zone,
    },
    metrics: {
      monthlyCompleted: metrics.monthlyCompleted,
      totalScheduled: metrics.totalScheduled,
      cancellations: metrics.cancellations,
      teacherAbsences: metrics.teacherAbsences,
      completionRate: Math.round(metrics.completionRate * 1000) / 10,
      weekendHours: metrics.weekendHours,
      averageRating: Math.round(metrics.averageRating * 100) / 100,
      totalRatings: metrics.totalRatings,
      minMonthlyBookings: MIN_MONTHLY_BOOKINGS,
      meetsBaseline: metrics.monthlyCompleted >= MIN_MONTHLY_BOOKINGS,
    },
    badges,
  };
}

module.exports = {
  MIN_MONTHLY_BOOKINGS,
  SLOT_MINUTES,
  WEEKEND_WARRIOR_HOURS,
  PH_ZONE,
  BADGE_DEFS,
  getPreviousCalendarMonthRange,
  computeWeekendHours,
  evaluateTeacherBadges,
  evaluateBadges,
};
