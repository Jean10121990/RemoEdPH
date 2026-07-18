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

/**
 * Map legacy slugs / labels and new display strings to a canonical level.
 */
function normalizeCurriculumLevel(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (!s) return null;

  if (s === 'little seeds (age 3)' || s.includes('little seeds') || s === 'nursery' || s.includes('age 3')) {
    return 'Little Seeds (Age 3)';
  }
  if (s === 'sprouts (age 4)' || s.includes('sprouts') || s === 'kinder' || s.includes('kindergarten') || s.includes('age 4')) {
    return 'Sprouts (Age 4)';
  }
  if (
    s === 'saplings (age 5)' ||
    s.includes('saplings') ||
    s === 'prep' ||
    s.includes('preparatory') ||
    s.includes('age 5')
  ) {
    return 'Saplings (Age 5)';
  }
  if (
    s === 'young stewards (age 6)' ||
    s.includes('young stewards') ||
    s.includes('steward') ||
    s.includes('age 6')
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

module.exports = {
  CURRICULUM_LEVELS,
  DEFAULT_CURRICULUM_LEVEL,
  LEVEL_ORDER,
  normalizeCurriculumLevel,
  isValidCurriculumLevel,
};
