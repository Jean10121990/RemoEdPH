/**
 * Canonical RemoEd curriculum / student growth levels (display = storage).
 * Ages removed from labels; legacy "(Age N)" values still normalize correctly.
 */
const CURRICULUM_LEVELS = [
  'Little Seeds',
  'Sprouts',
  'Saplings',
  'Young Stewards',
];

/** Older stored values still present in Mongo / enums. */
const LEGACY_CURRICULUM_LEVELS = [
  'Little Seeds (Age 3)',
  'Sprouts (Age 4)',
  'Saplings (Age 5)',
  'Young Stewards (Age 6)',
];

const DEFAULT_CURRICULUM_LEVEL = CURRICULUM_LEVELS[0];

const LEVEL_ORDER = {
  'Little Seeds': 1,
  'Sprouts': 2,
  'Saplings': 3,
  'Young Stewards': 4,
};

/** Short names for admin / parent-facing labels (Level N - Name). */
const LEVEL_SHORT_NAME = {
  'Little Seeds': 'Little Seeds',
  'Sprouts': 'Sprouts',
  'Saplings': 'Saplings',
  'Young Stewards': 'Young Stewards',
};

/** Map canonical → legacy Mongo key (learningJourneyPurchasedByLevel, etc.). */
const CANONICAL_TO_LEGACY = {
  'Little Seeds': 'Little Seeds (Age 3)',
  'Sprouts': 'Sprouts (Age 4)',
  'Saplings': 'Saplings (Age 5)',
  'Young Stewards': 'Young Stewards (Age 6)',
};

/**
 * Map legacy slugs / labels and new display strings to a canonical level.
 */
function normalizeCurriculumLevel(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (!s) return null;

  // Legacy CEFR / adult ESL labels are not RemoEdKids curriculum levels
  if (
    /^(beginner|intermediate|advanced|a1|a2|b1|b2|c1|c2)$/i.test(s) ||
    s.includes('cefr')
  ) {
    return null;
  }

  if (
    s === 'little seeds' ||
    s === 'little seeds (age 3)' ||
    s.includes('little seeds') ||
    s === 'nursery' ||
    s.includes('age 3') ||
    s === 'level 1'
  ) {
    return 'Little Seeds';
  }
  if (
    s === 'sprouts' ||
    s === 'sprouts (age 4)' ||
    s.includes('sprouts') ||
    s === 'kinder' ||
    s.includes('kindergarten') ||
    s.includes('age 4') ||
    s === 'level 2'
  ) {
    return 'Sprouts';
  }
  if (
    s === 'saplings' ||
    s === 'saplings (age 5)' ||
    s.includes('saplings') ||
    s === 'prep' ||
    s.includes('preparatory') ||
    s.includes('age 5') ||
    s === 'level 3'
  ) {
    return 'Saplings';
  }
  if (
    s === 'young stewards' ||
    s === 'young stewards (age 6)' ||
    s.includes('young stewards') ||
    s.includes('steward') ||
    s.includes('age 6') ||
    s === 'level 4'
  ) {
    return 'Young Stewards';
  }

  // Exact match against canonical list (case-insensitive)
  const exact = CURRICULUM_LEVELS.find((l) => l.toLowerCase() === s);
  return exact || null;
}

function isValidCurriculumLevel(level) {
  if (CURRICULUM_LEVELS.includes(level)) return true;
  return normalizeCurriculumLevel(level) != null;
}

/**
 * Admin / parent label: "Level 1 - Little Seeds"
 * @param {string|null|undefined} raw
 * @param {{ fallbackDefault?: boolean }} [opts]
 */
function formatCurriculumLevelDisplay(raw, opts = {}) {
  let canonical = normalizeCurriculumLevel(raw);
  if (!canonical && opts.fallbackDefault) {
    canonical = DEFAULT_CURRICULUM_LEVEL;
  }
  if (!canonical) return null;
  const n = LEVEL_ORDER[canonical];
  const shortName = LEVEL_SHORT_NAME[canonical] || canonical;
  return `Level ${n} - ${shortName}`;
}

/**
 * Resolve RemoEdKids level from a student-like object (education → leveling → level).
 */
function resolveStudentCurriculumLevel(student) {
  if (!student) return null;
  const candidates = [];
  if (Array.isArray(student.education)) {
    for (const edu of student.education) {
      if (edu && edu.level) candidates.push(edu.level);
    }
  }
  if (student.leveling) candidates.push(student.leveling);
  if (student.level) candidates.push(student.level);
  for (const c of candidates) {
    const n = normalizeCurriculumLevel(c);
    if (n) return n;
  }
  return null;
}

/** All accepted enum values (canonical + legacy age labels). */
const CURRICULUM_LEVEL_ENUM = CURRICULUM_LEVELS.concat(LEGACY_CURRICULUM_LEVELS);

module.exports = {
  CURRICULUM_LEVELS,
  LEGACY_CURRICULUM_LEVELS,
  CURRICULUM_LEVEL_ENUM,
  DEFAULT_CURRICULUM_LEVEL,
  LEVEL_ORDER,
  LEVEL_SHORT_NAME,
  CANONICAL_TO_LEGACY,
  normalizeCurriculumLevel,
  isValidCurriculumLevel,
  formatCurriculumLevelDisplay,
  resolveStudentCurriculumLevel,
  /** Values to use in Mongo `$in` queries for a level (canonical + legacy age label). */
  curriculumLevelQueryValues(raw) {
    const c = normalizeCurriculumLevel(raw);
    if (!c) return [];
    const legacy = CANONICAL_TO_LEGACY[c];
    return legacy ? [c, legacy] : [c];
  },
};
