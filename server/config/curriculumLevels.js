/**
 * Canonical RemoEd curriculum / student growth levels (display = storage).
 */
const CURRICULUM_LEVELS = [
  'Little Seeds (Age 3)',
  'Sprouts (Age 4)',
  'Saplings (Age 5)',
  'Young Stewards (Age 6)',
];

const DEFAULT_CURRICULUM_LEVEL = CURRICULUM_LEVELS[0];

const LEVEL_ORDER = {
  'Little Seeds (Age 3)': 1,
  'Sprouts (Age 4)': 2,
  'Saplings (Age 5)': 3,
  'Young Stewards (Age 6)': 4,
};

/** Short names for admin / parent-facing labels (Level N - Name). */
const LEVEL_SHORT_NAME = {
  'Little Seeds (Age 3)': 'Little Seeds',
  'Sprouts (Age 4)': 'Sprouts',
  'Saplings (Age 5)': 'Saplings',
  'Young Stewards (Age 6)': 'Young Stewards',
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
    s === 'little seeds (age 3)' ||
    s.includes('little seeds') ||
    s === 'nursery' ||
    s.includes('age 3') ||
    s === 'level 1'
  ) {
    return 'Little Seeds (Age 3)';
  }
  if (
    s === 'sprouts (age 4)' ||
    s.includes('sprouts') ||
    s === 'kinder' ||
    s.includes('kindergarten') ||
    s.includes('age 4') ||
    s === 'level 2'
  ) {
    return 'Sprouts (Age 4)';
  }
  if (
    s === 'saplings (age 5)' ||
    s.includes('saplings') ||
    s === 'prep' ||
    s.includes('preparatory') ||
    s.includes('age 5') ||
    s === 'level 3'
  ) {
    return 'Saplings (Age 5)';
  }
  if (
    s === 'young stewards (age 6)' ||
    s.includes('young stewards') ||
    s.includes('steward') ||
    s.includes('age 6') ||
    s === 'level 4'
  ) {
    return 'Young Stewards (Age 6)';
  }

  // Exact match against canonical list (case-insensitive)
  const exact = CURRICULUM_LEVELS.find((l) => l.toLowerCase() === s);
  return exact || null;
}

function isValidCurriculumLevel(level) {
  return CURRICULUM_LEVELS.includes(level);
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

module.exports = {
  CURRICULUM_LEVELS,
  DEFAULT_CURRICULUM_LEVEL,
  LEVEL_ORDER,
  LEVEL_SHORT_NAME,
  normalizeCurriculumLevel,
  isValidCurriculumLevel,
  formatCurriculumLevelDisplay,
  resolveStudentCurriculumLevel,
};
