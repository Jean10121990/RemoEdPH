/**
 * Sequential lesson unlock: students may book the next trail stop and any earlier
 * (completed) lesson for reschedule — not lessons ahead of progress.
 */
const Lesson = require('../models/Lesson');
const LessonProgress = require('../models/LessonProgress');
const Booking = require('../models/Booking');
const Curriculum = require('../models/Curriculum');
const { cancelledStatusValues } = require('../utils/bookingStatus');
const { normalizeCurriculumLevel } = require('../config/curriculumLevels');
const {
  parseBookingLessonRef,
  resolveLessonIdFromBooking,
} = require('../lessonResolveFromBooking');

const LESSONS_PER_BATCH = 22;
const LESSONS_PER_LEVEL = 220;

function isBookingLessonCompleted(b) {
  const st = String(b.status || '').toLowerCase();
  if (st === 'cancelled' || st === 'canceled' || st.indexOf('cancelled') === 0 || st === 'absent') {
    return false;
  }
  if (st === 'completed' || st === 'pending_feedback') return true;
  if (b.attendance && b.attendance.classCompleted) return true;
  if (b.sessionEndedAt || b.finishedAt) return true;
  return false;
}

function linearFromBatchLesson(batch, lessonNum) {
  return (Number(batch) - 1) * LESSONS_PER_BATCH + Number(lessonNum);
}

/**
 * First incomplete linear lesson (1–220) for a level; 220 if all done.
 * Bookable = any lessonNumber <= this value (go back OK; jump forward blocked).
 */
function maxBookableFromCompletedKeys(completedKeys, levelRaw) {
  const level = normalizeCurriculumLevel(levelRaw);
  if (!level) return 1;
  const set = completedKeys instanceof Set ? completedKeys : new Set(completedKeys || []);
  for (let linear = 1; linear <= LESSONS_PER_LEVEL; linear++) {
    const batch = Math.ceil(linear / LESSONS_PER_BATCH);
    const lessonNum = ((linear - 1) % LESSONS_PER_BATCH) + 1;
    if (!set.has(`${level}:${batch}:${lessonNum}`)) return linear;
  }
  return LESSONS_PER_LEVEL;
}

async function hydrateLessonMap(ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean).map(String))];
  if (!uniqueIds.length) return {};
  const lessons = await Lesson.find({ _id: { $in: uniqueIds } })
    .select('lessonNumber order curriculumId')
    .lean();
  const curIds = [...new Set(lessons.map((l) => l.curriculumId).filter(Boolean).map(String))];
  const curricula =
    curIds.length > 0 ? await Curriculum.find({ _id: { $in: curIds } }).select('level').lean() : [];
  const curById = Object.fromEntries(curricula.map((c) => [String(c._id), c]));
  return Object.fromEntries(
    lessons.map((l) => [String(l._id), { ...l, curriculum: curById[String(l.curriculumId)] }])
  );
}

/**
 * Build completedKeys set matching GET /api/student/lesson-progress.
 */
async function buildCompletedLessonKeys(uniqueIdentifiers) {
  const ids = [...new Set((uniqueIdentifiers || []).filter(Boolean).map(String))];
  const completedKeys = new Set();
  if (!ids.length) return completedKeys;

  const bookings = await Booking.find({
    studentId: { $in: ids },
    status: { $nin: cancelledStatusValues() },
  })
    .select('lesson studentLevel status attendance lessonId classroomId finishedAt sessionEndedAt')
    .lean();

  const completed = bookings.filter(isBookingLessonCompleted);
  const lessonProgressDocs = await LessonProgress.find({
    studentId: { $in: ids },
    status: 'completed',
  })
    .select('lessonId curriculumId completedAt status')
    .lean();

  let lessonMap = await hydrateLessonMap([
    ...completed.map((b) => b.lessonId),
    ...lessonProgressDocs.map((p) => p.lessonId),
  ]);

  function addKeyFromLessonId(lessonId, fallbackLevel) {
    if (!lessonId || !lessonMap[String(lessonId)]) return false;
    const l = lessonMap[String(lessonId)];
    let level = normalizeCurriculumLevel(l.curriculum && l.curriculum.level) || fallbackLevel;
    const num = Number(l.lessonNumber || l.order || 0);
    if (!level || !(num >= 1 && num <= LESSONS_PER_LEVEL)) return false;
    const batch = Math.ceil(num / LESSONS_PER_BATCH);
    const lessonNum = ((num - 1) % LESSONS_PER_BATCH) + 1;
    completedKeys.add(`${level}:${batch}:${lessonNum}`);
    return true;
  }

  const unresolved = [];
  for (const b of completed) {
    let level = normalizeCurriculumLevel(b.studentLevel);
    let batch = null;
    let lessonNum = null;

    if (b.lessonId && lessonMap[String(b.lessonId)]) {
      const l = lessonMap[String(b.lessonId)];
      const cLvl = normalizeCurriculumLevel(l.curriculum && l.curriculum.level);
      if (cLvl) level = cLvl;
      const num = Number(l.lessonNumber || l.order || 0);
      if (num >= 1 && num <= LESSONS_PER_LEVEL) {
        batch = Math.ceil(num / LESSONS_PER_BATCH);
        lessonNum = ((num - 1) % LESSONS_PER_BATCH) + 1;
      }
    }

    if (batch == null || lessonNum == null) {
      const parsed = parseBookingLessonRef(b.lesson);
      if (parsed && parsed.batch != null && parsed.lessonNum != null) {
        batch = parsed.batch;
        lessonNum = parsed.lessonNum;
        if (!level && parsed.level) level = normalizeCurriculumLevel(parsed.level);
      }
    }

    if (!level) {
      const parsed = parseBookingLessonRef(b.lesson);
      if (parsed && parsed.level) level = normalizeCurriculumLevel(parsed.level);
    }
    if (!level) level = normalizeCurriculumLevel(b.studentLevel);
    if (!level || batch == null || lessonNum == null) {
      unresolved.push(b);
      continue;
    }
    if (batch < 1 || batch > 10 || lessonNum < 1 || lessonNum > LESSONS_PER_BATCH) {
      unresolved.push(b);
      continue;
    }
    completedKeys.add(`${level}:${batch}:${lessonNum}`);
  }

  if (unresolved.length) {
    const extraIds = [];
    const resolvedPairs = [];
    for (const b of unresolved) {
      try {
        const lid = await resolveLessonIdFromBooking(b);
        if (lid) {
          extraIds.push(lid);
          resolvedPairs.push({ booking: b, lessonId: lid });
        }
      } catch (_e) {
        /* best-effort */
      }
    }
    if (extraIds.length) {
      const extraMap = await hydrateLessonMap(extraIds);
      lessonMap = { ...lessonMap, ...extraMap };
      for (const pair of resolvedPairs) {
        addKeyFromLessonId(pair.lessonId, normalizeCurriculumLevel(pair.booking.studentLevel));
      }
    }
  }

  for (const p of lessonProgressDocs) {
    addKeyFromLessonId(p.lessonId, null);
  }

  return completedKeys;
}

async function resolveLessonNumber(lessonId, lessonTitle) {
  let lessonNum = null;
  if (lessonId && require('mongoose').Types.ObjectId.isValid(String(lessonId))) {
    const lessonDoc = await Lesson.findById(String(lessonId)).select('lessonNumber order').lean();
    if (lessonDoc) lessonNum = Number(lessonDoc.lessonNumber || lessonDoc.order);
  }
  if (lessonNum == null || Number.isNaN(lessonNum)) {
    const parsed = parseBookingLessonRef(lessonTitle);
    if (parsed) {
      if (parsed.batch != null && parsed.lessonNum != null) {
        lessonNum = linearFromBatchLesson(parsed.batch, parsed.lessonNum);
      } else if (parsed.lessonNum != null && parsed.batch == null) {
        const n = Number(parsed.lessonNum);
        if (n >= 1 && n <= LESSONS_PER_LEVEL) lessonNum = n;
      }
    }
  }
  if (lessonNum == null || Number.isNaN(lessonNum)) {
    const m = String(lessonTitle || '').match(/lesson\s*(\d+)/i);
    if (m) lessonNum = parseInt(m[1], 10);
  }
  return lessonNum;
}

/**
 * @returns {{ ok: true, maxBookable: number, lessonNum: number } | { ok: false, status, body }}
 */
async function assertLessonNotAheadOfProgress({
  uniqueIdentifiers,
  studentLevel,
  lessonId,
  lesson,
}) {
  const lessonNum = await resolveLessonNumber(lessonId, lesson);
  if (lessonNum == null || Number.isNaN(lessonNum) || lessonNum < 1) {
    return { ok: true, maxBookable: null, lessonNum: null };
  }

  const level = normalizeCurriculumLevel(studentLevel);
  if (!level) {
    return { ok: true, maxBookable: null, lessonNum };
  }

  let ids = [...new Set((uniqueIdentifiers || []).filter(Boolean).map(String))];
  try {
    const studentBadgeService = require('./studentBadgeService');
    if (ids[0]) {
      const extra = await studentBadgeService.resolveStudentIdAliases(ids[0]);
      if (extra && extra.length) ids = [...new Set(ids.concat(extra))];
    }
  } catch (_e) {
    /* optional */
  }

  const completedKeys = await buildCompletedLessonKeys(ids);
  const maxBookable = maxBookableFromCompletedKeys(completedKeys, level);

  if (lessonNum > maxBookable) {
    return {
      ok: false,
      status: 400,
      body: {
        error: `You can book Lesson ${maxBookable} (your next stop) or any earlier lesson. Finish earlier lessons before jumping ahead.`,
        code: 'LESSON_AHEAD_OF_PROGRESS',
        maxBookable,
        requestedLesson: lessonNum,
      },
      maxBookable,
      lessonNum,
    };
  }

  return { ok: true, maxBookable, lessonNum };
}

module.exports = {
  LESSONS_PER_BATCH,
  LESSONS_PER_LEVEL,
  maxBookableFromCompletedKeys,
  buildCompletedLessonKeys,
  resolveLessonNumber,
  assertLessonNotAheadOfProgress,
};
