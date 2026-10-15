/**
 * Virtual Garden domain rules. Pure: no database, network, or clock reads.
 */
const { DateTime } = require('luxon');
const config = require('./garden.config');

const MONTH_KEY_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

function isValidMonthKey(value) {
  return typeof value === 'string' && MONTH_KEY_RE.test(value);
}

function monthKeyOf(date, timeZone = config.GARDEN_TIMEZONE) {
  const dt = DateTime.fromJSDate(date instanceof Date ? date : new Date(date), { zone: timeZone });
  if (!dt.isValid) throw new Error('Invalid date for monthKey');
  return dt.toFormat('yyyy-MM');
}

/** UTC instants bounding the month in the garden timezone: [start, end). */
function monthRange(monthKey, timeZone = config.GARDEN_TIMEZONE) {
  if (!isValidMonthKey(monthKey)) throw new Error('Invalid monthKey');
  const start = DateTime.fromFormat(monthKey, 'yyyy-MM', { zone: timeZone }).startOf('month');
  return { start: start.toJSDate(), end: start.plus({ months: 1 }).toJSDate() };
}

function monthLabel(monthKey) {
  if (!isValidMonthKey(monthKey)) return '';
  return DateTime.fromFormat(monthKey, 'yyyy-MM', { zone: 'UTC' }).setLocale('en').toFormat('LLLL yyyy');
}

function compareMonthKeys(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function clampTarget(target) {
  const n = Math.floor(Number(target));
  return Number.isFinite(n) && n >= 1 ? n : config.DEFAULT_MONTHLY_TARGET;
}

/** Whole-number percent of the month target, clamped to 0–100. */
function progressPercent(monthEcoDrops, monthlyTarget) {
  const drops = Math.max(0, Math.floor(Number(monthEcoDrops) || 0));
  const target = clampTarget(monthlyTarget);
  return Math.min(100, Math.floor((drops * 100) / target));
}

/** Index into STAGES. Integer math so 20% of a target is exact at the boundary. */
function stageIndexFor(monthEcoDrops, monthlyTarget, stages = config.STAGES) {
  const drops = Math.max(0, Math.floor(Number(monthEcoDrops) || 0));
  const target = clampTarget(monthlyTarget);
  let index = 0;
  for (let i = 0; i < stages.length; i++) {
    if (drops * 100 >= stages[i].minPercent * target) index = i;
  }
  return index;
}

function stageFor(monthEcoDrops, monthlyTarget, stages = config.STAGES) {
  const index = stageIndexFor(monthEcoDrops, monthlyTarget, stages);
  const s = stages[index];
  return { index, key: s.key, name: s.name, minPercent: s.minPercent, asset: s.asset };
}

/** Drops still needed for the next stage, or null when fully grown. */
function nextStageInfo(monthEcoDrops, monthlyTarget, stages = config.STAGES) {
  const index = stageIndexFor(monthEcoDrops, monthlyTarget, stages);
  if (index >= stages.length - 1) return null;
  const next = stages[index + 1];
  const target = clampTarget(monthlyTarget);
  const drops = Math.max(0, Math.floor(Number(monthEcoDrops) || 0));
  const needed = Math.ceil((next.minPercent * target) / 100) - drops;
  return { index: index + 1, key: next.key, name: next.name, dropsNeeded: Math.max(1, needed) };
}

/**
 * Monthly target = lessons + tasks (+ games) available that month. Falls back to
 * DEFAULT_MONTHLY_TARGET when the student has no lessons scheduled yet.
 */
function computeMonthlyTarget({ lessons = 0, tasks = 0, games = 0 } = {}) {
  const l = Math.max(0, Math.floor(Number(lessons) || 0));
  const t = Math.max(0, Math.floor(Number(tasks) || 0));
  const g = Math.max(0, Math.floor(Number(games) || 0));
  if (l === 0) return config.DEFAULT_MONTHLY_TARGET;
  return l + t + g;
}

/**
 * A new schedule may change the target mid-month. Accept it only if the tree keeps
 * at least its current stage, so booking more classes never shrinks a tree.
 */
function reconcileTarget(storedTarget, computedTarget, monthEcoDrops, stages = config.STAGES) {
  const stored = clampTarget(storedTarget);
  const next = clampTarget(computedTarget);
  if (next === stored) return stored;
  const before = stageIndexFor(monthEcoDrops, stored, stages);
  const after = stageIndexFor(monthEcoDrops, next, stages);
  return after >= before ? next : stored;
}

function hashString(value) {
  let h = 2166136261;
  const s = String(value || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Species is assigned once at create. No randomness and no mutable counts.
 * If last month has a known species, take the next in the list (consecutive months differ).
 * Otherwise hash (studentId|monthKey) so the same month always gets the same first pick.
 */
function pickSpecies({ studentId, monthKey = '', previousSpecies = null }, list = config.SPECIES) {
  if (!list.length) return 'Tree';
  const prevIndex = previousSpecies ? list.indexOf(previousSpecies) : -1;
  if (prevIndex !== -1) return list[(prevIndex + 1) % list.length];
  return list[hashString(String(studentId || '') + '|' + String(monthKey || '')) % list.length];
}

/** Ledger sourceId for a source, honouring GAME_REWARD_MODE for games. */
function ledgerSourceId({ sourceType, sourceId, playId = '' }, mode = config.GAME_REWARD_MODE) {
  const id = String(sourceId || '').trim();
  if (sourceType === 'game' && mode === 'every-play') {
    const play = String(playId || '').trim();
    return play ? `${id}#${play}` : '';
  }
  return id;
}

/** Sources that may only pay once for the account, whatever month it is. */
function paysOnceEver(sourceType, mode = config.GAME_REWARD_MODE) {
  if (sourceType === 'lesson' || sourceType === 'task') return true;
  return sourceType === 'game' && mode === 'once-ever';
}

module.exports = {
  isValidMonthKey,
  monthKeyOf,
  monthRange,
  monthLabel,
  compareMonthKeys,
  progressPercent,
  stageIndexFor,
  stageFor,
  nextStageInfo,
  computeMonthlyTarget,
  reconcileTarget,
  pickSpecies,
  ledgerSourceId,
  paysOnceEver,
  hashString,
};
