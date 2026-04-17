/**
 * Subscription-based batch unlocks for My Learning Journey (22 lessons per batch).
 */

const LESSONS_PER_BATCH = 22;
const DEFAULT_MAX_BATCH = 10;

const LEVEL_KEYS = ['nursery', 'kinder', 'prep'];

function normalizeLevelKey(level) {
  const k = String(level || 'nursery').toLowerCase().trim();
  return LEVEL_KEYS.includes(k) ? k : 'nursery';
}

/**
 * Effective lifetime purchased lessons for journey unlocks (field + legacy totalCreditsEarned).
 */
function getEffectiveTotalLessonsPurchased(student) {
  if (!student) return 0;
  const tp = Math.max(0, Number(student.totalLessonsPurchased) || 0);
  const te = Math.max(0, Number(student.totalCreditsEarned) || 0);
  return Math.max(tp, te);
}

/**
 * Total used for a tab: explicit per-level counter if set, else effective global (migration / legacy).
 */
function getTotalForLearningJourneyLevel(student, levelKey) {
  const g = getEffectiveTotalLessonsPurchased(student);
  const m = student.learningJourneyPurchasedByLevel;
  if (!m) return g;
  const raw = m[levelKey];
  const lv = Math.max(0, Number(raw) || 0);
  if (lv > 0) return Math.max(lv, g);
  return g;
}

function computeBatchUnlockState(totalPurchased, maxBatch = DEFAULT_MAX_BATCH) {
  const total = Math.max(0, Number(totalPurchased) || 0);
  const batches = [];
  for (let n = 1; n <= maxBatch; n += 1) {
    const threshold = n * LESSONS_PER_BATCH;
    batches.push({
      batch: n,
      threshold,
      locked: total < threshold,
      unlocked: total >= threshold,
    });
  }
  return {
    lessonsPerBatch: LESSONS_PER_BATCH,
    batches,
  };
}

module.exports = {
  LESSONS_PER_BATCH,
  DEFAULT_MAX_BATCH,
  LEVEL_KEYS,
  normalizeLevelKey,
  getEffectiveTotalLessonsPurchased,
  getTotalForLearningJourneyLevel,
  computeBatchUnlockState,
};
