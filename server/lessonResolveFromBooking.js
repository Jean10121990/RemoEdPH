const Curriculum = require('./models/Curriculum');
const Lesson = require('./models/Lesson');
const {
  normalizeCurriculumLevel,
  curriculumLevelQueryValues,
} = require('./config/curriculumLevels');
const { isMongoObjectId } = require('./utils/mongoObjectId');

function normalizeCurriculumLevelFromStudentLevel(raw) {
  return normalizeCurriculumLevel(raw);
}

const LEVEL_BY_L_CODE = {
  1: 'Little Seeds',
  2: 'Sprouts',
  3: 'Saplings',
  4: 'Young Stewards',
};

/**
 * Parse booking lesson titles such as "RemoEd L1M1 Lesson 3", "L2 M1 - Lesson 1",
 * "Batch 2 Lesson 5", or a linear "Lesson 40" (1–220).
 */
function parseBookingLessonRef(lessonTitle) {
  const t = String(lessonTitle || '');
  if (!t.trim()) return null;

  let level = null;
  const lm = t.match(/\bL\s*([1-4])(?:\s*M\s*([1-9]|10))?\b/i);
  if (lm) {
    level = LEVEL_BY_L_CODE[parseInt(lm[1], 10)] || null;
  }

  let batch = null;
  let lessonNum = null;
  const bMatch = t.match(/batch\s*(\d+)/i);
  const lMatch = t.match(/lesson\s*(\d+)/i);
  if (bMatch) batch = parseInt(bMatch[1], 10);
  else if (lm && lm[2]) batch = parseInt(lm[2], 10);
  else {
    const moduleOnly = t.match(/\bM\s*([1-9]|10)\b/i);
    if (moduleOnly) batch = parseInt(moduleOnly[1], 10);
  }
  if (lMatch) lessonNum = parseInt(lMatch[1], 10);

  if (batch != null && lessonNum != null && batch >= 1 && batch <= 10 && lessonNum >= 1 && lessonNum <= 22) {
    return { batch, lessonNum, level };
  }
  if (lMatch && batch == null) {
    const n = parseInt(lMatch[1], 10);
    if (n >= 1 && n <= 220) {
      return {
        batch: Math.ceil(n / 22),
        lessonNum: ((n - 1) % 22) + 1,
        level,
      };
    }
  }
  return level ? { batch: null, lessonNum: null, level } : null;
}

/** Same rules as student lesson-progress: Batch/Lesson in title or linear 1–220. */
function parseBatchLessonFromTitle(lessonTitle) {
  const parsed = parseBookingLessonRef(lessonTitle);
  if (!parsed || parsed.batch == null || parsed.lessonNum == null) return null;
  return { batch: parsed.batch, lessonNum: parsed.lessonNum };
}

/**
 * Map a booking (level + lesson title + optional lessonId) to a Lesson _id for library files.
 */
async function resolveLessonIdFromBooking(booking) {
  if (!booking) return null;

  const lidRaw = booking.lessonId;
  if (lidRaw) {
    const idStr = lidRaw._id ? String(lidRaw._id) : String(lidRaw);
    if (isMongoObjectId(idStr)) {
      try {
        const exists = await Lesson.findById(idStr).select('_id').lean();
        if (exists) return exists._id;
      } catch (err) {
        console.warn('resolveLessonIdFromBooking findById skipped:', err && err.message);
      }
    } else {
      console.warn(
        'resolveLessonIdFromBooking: ignoring non-ObjectId lessonId:',
        idStr.slice(0, 48)
      );
    }
  }

  const level = normalizeCurriculumLevelFromStudentLevel(booking.studentLevel);
  if (!level) return null;

  const levelValues = curriculumLevelQueryValues(level);
  const curricula = await Curriculum.find({
    level: levelValues.length ? { $in: levelValues } : level,
    isActive: true,
  })
    .select('_id')
    .lean();
  if (!curricula.length) return null;
  const curIds = curricula.map((c) => c._id);

  const parsed = parseBatchLessonFromTitle(booking.lesson);
  if (parsed) {
    const linear = (parsed.batch - 1) * 22 + parsed.lessonNum;
    const lesson = await Lesson.findOne({
      curriculumId: { $in: curIds },
      lessonNumber: linear,
      isActive: { $ne: false },
    })
      .select('_id')
      .lean();
    if (lesson) return lesson._id;
  }

  const trimmed = String(booking.lesson || '').trim();
  if (trimmed) {
    const byTitle = await Lesson.findOne({
      curriculumId: { $in: curIds },
      title: trimmed,
      isActive: { $ne: false },
    })
      .select('_id')
      .lean();
    if (byTitle) return byTitle._id;
  }

  return null;
}

module.exports = {
  resolveLessonIdFromBooking,
  parseBatchLessonFromTitle,
  parseBookingLessonRef,
  normalizeCurriculumLevelFromStudentLevel,
};
