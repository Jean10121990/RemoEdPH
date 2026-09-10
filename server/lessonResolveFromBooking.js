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

/** Same rules as student lesson-progress: Batch/Lesson in title or linear 1–220. */
function parseBatchLessonFromTitle(lessonTitle) {
  const t = String(lessonTitle || '');
  let batch = null;
  let lessonNum = null;
  const bMatch = t.match(/batch\s*(\d+)/i);
  const lMatch = t.match(/lesson\s*(\d+)/i);
  if (bMatch) batch = parseInt(bMatch[1], 10);
  if (lMatch) lessonNum = parseInt(lMatch[1], 10);
  if (batch != null && lessonNum != null && batch >= 1 && batch <= 10 && lessonNum >= 1 && lessonNum <= 22) {
    return { batch, lessonNum };
  }
  if (lMatch && batch == null) {
    const n = parseInt(lMatch[1], 10);
    if (n >= 1 && n <= 220) {
      return { batch: Math.ceil(n / 22), lessonNum: ((n - 1) % 22) + 1 };
    }
  }
  return null;
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
  normalizeCurriculumLevelFromStudentLevel,
};
