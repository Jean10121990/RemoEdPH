const { DateTime } = require('luxon');
const config = require('./garden.config');
const {
  MAX_TREE_CREDITS_PER_STUDENT_PER_MONTH,
  LESSON_ELIGIBILITY_RATIO,
  TIER_RANGES,
  TIERS,
} = require('./rewards.config');
const { GARDEN_BADGES } = require('./badges.config');

function lessonsRequired(target) {
  const n = Math.max(1, Math.floor(Number(target) || 1));
  return Math.ceil(LESSON_ELIGIBILITY_RATIO * n);
}

/**
 * @param {() => number} rngInt inclusive 1..100
 */
function rollWeighted(table, rngInt) {
  const ticket = rngInt();
  let cursor = 0;
  for (const row of table) {
    cursor += row.weight;
    if (ticket <= cursor) return row.credits;
  }
  return table[table.length - 1].credits;
}

function cryptoTicket() {
  const { randomInt } = require('crypto');
  return randomInt(1, 101);
}

function decideCredits({
  sequence = 1,
  lessonsDone = 0,
  monthlyTarget = 22,
  perfectMonth = false,
  alreadyGranted = 0,
  creditsEnabled = true,
  rngInt = cryptoTicket,
}) {
  const required = lessonsRequired(monthlyTarget);
  const base = {
    lessonsDone,
    lessonsRequired: required,
    tier: null,
    rolledCredits: 0,
    grantedCredits: 0,
    rangeLabel: null,
    message: '',
    reason: '',
  };
  if ((sequence || 1) !== 1) {
    return { ...base, reason: 'bonus_tree', message: 'A bonus tree earns badges, not free lessons.' };
  }
  if (lessonsDone < required) {
    return {
      ...base,
      reason: 'lessons_short',
      message: 'Complete at least ' + required + ' lessons this month to earn free lesson credits next time.',
    };
  }
  const tier = perfectMonth ? 2 : 1;
  const range = TIER_RANGES[tier];
  if (!creditsEnabled) {
    return {
      ...base,
      tier,
      rangeLabel: range.label,
      reason: 'credits_disabled',
      message: 'Free lesson rewards are paused.',
    };
  }
  const rolled = rollWeighted(TIERS[tier], rngInt);
  const room = Math.max(0, MAX_TREE_CREDITS_PER_STUDENT_PER_MONTH - Math.max(0, alreadyGranted));
  const granted = Math.min(rolled, room);
  return {
    ...base,
    tier,
    rolledCredits: rolled,
    grantedCredits: granted,
    rangeLabel: range.label,
    reason: granted < rolled ? 'monthly_cap' : 'ok',
    message: granted > 0 ? 'You won ' + granted + ' free lesson' + (granted === 1 ? '' : 's') + '.' : 'You already reached this month’s free-lesson cap.',
  };
}

function monthSerial(monthKey) {
  const [y, m] = String(monthKey || '').split('-').map((n) => Number(n));
  if (!y || !m) return null;
  return y * 12 + (m - 1);
}

/** Current streak ending at the newest completed month. A missing month breaks it. */
function completionStreak(monthKeys) {
  const serials = [...new Set((monthKeys || []).map(monthSerial).filter((n) => n != null))].sort((a, b) => a - b);
  if (!serials.length) return 0;
  let streak = 1;
  for (let i = serials.length - 1; i > 0; i -= 1) {
    if (serials[i] - serials[i - 1] !== 1) break;
    streak += 1;
  }
  return streak;
}

function dayOfMonth(date, timeZone = config.GARDEN_TIMEZONE) {
  const dt = DateTime.fromJSDate(date instanceof Date ? date : new Date(date), { zone: timeZone });
  return dt.isValid ? dt.day : 32;
}

function badgeMatches(def, state) {
  if (def.kind === 'trees') return state.completedCount >= def.count;
  if (def.kind === 'perfect') return !!state.perfect;
  if (def.kind === 'species') return state.speciesCount >= def.count;
  if (def.kind === 'early') return state.early;
  if (def.kind === 'streak') return state.streak >= def.count;
  return false;
}

/** Badges the student newly qualifies for. Caller skips keys they already own. */
function newlyEarnedBadges(state, ownedKeys, catalog = GARDEN_BADGES) {
  const owned = new Set(ownedKeys || []);
  return catalog.filter((def) => !owned.has(def.key) && badgeMatches(def, state));
}

function previewCopy({ sequence = 1, lessonsDone = 0, monthlyTarget = 22, perfectMonth = false }) {
  const required = lessonsRequired(monthlyTarget);
  if ((sequence || 1) !== 1) {
    return { eligible: false, rangeLabel: null, message: 'A bonus tree earns badges, not free lessons.' };
  }
  if (lessonsDone < required) {
    return {
      eligible: false,
      rangeLabel: null,
      message: 'Complete at least ' + required + ' lessons this month to earn free lesson credits next time.',
    };
  }
  const tier = perfectMonth ? 2 : 1;
  return {
    eligible: true,
    rangeLabel: TIER_RANGES[tier].label,
    message: 'Claim to win ' + TIER_RANGES[tier].label + ' free lessons.',
  };
}

module.exports = {
  lessonsRequired,
  rollWeighted,
  cryptoTicket,
  decideCredits,
  completionStreak,
  dayOfMonth,
  newlyEarnedBadges,
  previewCopy,
};
