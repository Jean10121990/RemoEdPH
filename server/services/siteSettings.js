/**
 * Site settings cache. One Node process (PM2 fork, remoed-api).
 * Reads come from memory. A save writes Mongo, audits, then replaces the snapshot.
 * A snapshot older than 5 minutes reloads before the next read.
 * Checkout, booking, payouts, and garden read this memory. A missing row uses the catalog constant.
 */
const SiteSetting = require('../models/SiteSetting');

const TTL_MS = 5 * 60 * 1000;

/** Today's code constants. The October audit's 40-minute class and 10/5/2 notices are stale. */
const CATALOG = [
  { key: 'creditsPerMonth', group: 'pricing', type: 'number', value: 22, label: 'Credits per month', confirm: true },
  { key: 'usdPerClass', group: 'pricing', type: 'number', value: 7, label: 'USD per class', confirm: true },
  { key: 'founderDiscountPerMonth', group: 'pricing', type: 'number', value: 21, label: 'Founder discount per month (USD)', confirm: true },
  { key: 'sparkFounderDiscount', group: 'pricing', type: 'number', value: 0, label: 'Spark founder discount (USD)', confirm: true },
  { key: 'adminFeePercent', group: 'pricing', type: 'number', value: 2, label: 'Admin fee percent', confirm: true },
  { key: 'referralRewardCredits', group: 'pricing', type: 'number', value: 3, label: 'Referral reward credits' },
  { key: 'commissionSpark', group: 'pricing', type: 'number', value: 1000, label: 'Unique Link commission, Spark (PHP)', confirm: true },
  { key: 'commissionSteady', group: 'pricing', type: 'number', value: 1500, label: 'Unique Link commission, Steady (PHP)', confirm: true },
  { key: 'commissionScholar', group: 'pricing', type: 'number', value: 2000, label: 'Unique Link commission, Scholar (PHP)', confirm: true },
  { key: 'commissionSummit', group: 'pricing', type: 'number', value: 2500, label: 'Unique Link commission, Summit (PHP)', confirm: true },
  { key: 'payoutPaidHourly', group: 'pricing', type: 'json', value: [180, 230, 280, 330], label: 'Paid tier hourly rates (PHP). Not the fallback global rate.', confirm: true },
  { key: 'payoutCredentialAddon', group: 'pricing', type: 'number', value: 10, label: 'Credential add-on (PHP per hour)', confirm: true },
  { key: 'payoutTrialRate', group: 'pricing', type: 'number', value: 45, label: 'Free-trial class rate (PHP, flat)', confirm: true },
  { key: 'emergencyCancelMinutes', group: 'booking', type: 'number', value: 30, label: 'Emergency cancel window (minutes)' },
  { key: 'earlyEntryMinutes', group: 'booking', type: 'number', value: 10, label: 'Early join (minutes)' },
  { key: 'classMaxMinutes', group: 'booking', type: 'number', value: 30, label: 'Class hard stop (minutes)' },
  { key: 'classLengthMinutes', group: 'booking', type: 'number', value: 25, label: 'Scheduled class length (minutes)' },
  { key: 'creditNoticeDays', group: 'booking', type: 'json', value: [14, 7], label: 'Credit expiry notice days (14 and 7)' },
  { key: 'freePlanLessonCount', group: 'booking', type: 'number', value: 3, label: 'Free-plan lesson count' },
  { key: 'gardenMonthlyTarget', group: 'garden', type: 'number', value: 22, label: 'Garden monthly target' },
  { key: 'gardenTimezone', group: 'garden', type: 'string', value: 'Asia/Manila', label: 'Garden timezone' },
  { key: 'treeCreditCap', group: 'garden', type: 'number', value: 4, label: 'Tree credit cap per student per month' },
  { key: 'treeCreditExpiryDays', group: 'garden', type: 'number', value: 60, label: 'Tree credit expiry (days)' },
  { key: 'treeReminderDays', group: 'garden', type: 'number', value: 7, label: 'Tree credit reminder (days)' },
  { key: 'treeEligibilityRatio', group: 'garden', type: 'number', value: 0.8, label: 'Tree eligibility ratio' },
  { key: 'gardenCreditsEnabled', group: 'flags', type: 'boolean', value: true, label: 'Garden lesson credits (off pauses rewards)' },
  { key: 'minShareAge', group: 'garden', type: 'number', value: 13, label: 'Minimum share age' },
  { key: 'loginFacebookEnabled', group: 'flags', type: 'boolean', value: false, label: 'Facebook on the login page' },
  { key: 'privacyConsentVersion', group: 'legal', type: 'string', value: '2026-10-01', label: 'Privacy consent version', confirm: true },
  { key: 'supportEmail', group: 'brand', type: 'string', value: 'support@remoedph.com', label: 'Support email' },
  { key: 'facebookUrl', group: 'brand', type: 'string', value: 'https://www.facebook.com/remoed', label: 'Facebook page URL' },
];

const BY_KEY = Object.fromEntries(CATALOG.map((row) => [row.key, row]));

let snapshot = null;
let loadedAt = 0;

function sameValue(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isIanaZone(name) {
  try {
    Intl.DateTimeFormat('en', { timeZone: String(name) });
    return true;
  } catch (_e) {
    return false;
  }
}

function validateValue(key, raw) {
  const spec = BY_KEY[key];
  if (!spec) return { ok: false, error: 'Unknown setting.' };
  if (spec.type === 'boolean') {
    if (typeof raw !== 'boolean') return { ok: false, error: 'Expected true or false.' };
    return { ok: true, value: raw };
  }
  if (spec.type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n)) return { ok: false, error: 'Expected a number.' };
    if (key === 'adminFeePercent' && (n < 0 || n > 100)) return { ok: false, error: 'Percent must be from 0 to 100.' };
    if (key === 'treeEligibilityRatio' && (n <= 0 || n > 1)) return { ok: false, error: 'Ratio must be greater than 0 and at most 1.' };
    if (key === 'sparkFounderDiscount' && n < 0) return { ok: false, error: 'Discount cannot be negative.' };
    if (key === 'referralRewardCredits' && (!Number.isInteger(n) || n < 1 || n > 5)) {
      return { ok: false, error: 'Referral credits must be a whole number from 1 to 5.' };
    }
    if (key !== 'sparkFounderDiscount' && key !== 'adminFeePercent' && n <= 0) {
      return { ok: false, error: 'Value must be greater than 0.' };
    }
    return { ok: true, value: n };
  }
  if (spec.type === 'string') {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return { ok: false, error: 'Value is required.' };
    if (key === 'supportEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
      return { ok: false, error: 'Enter a valid email address.' };
    }
    if (key === 'privacyConsentVersion' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return { ok: false, error: 'Consent version must be YYYY-MM-DD.' };
    }
    if (key === 'gardenTimezone' && !isIanaZone(s)) return { ok: false, error: 'Timezone must be an IANA name.' };
    if (key === 'facebookUrl' && !/^https:\/\/(www\.)?facebook\.com\/[A-Za-z0-9.\-_/]+$/.test(s)) {
      return { ok: false, error: 'Use an https://facebook.com/ page address.' };
    }
    return { ok: true, value: s.slice(0, 320) };
  }
  if (spec.type === 'json') {
    const list = Array.isArray(raw)
      ? raw
      : String(raw || '')
          .split(',')
          .map((part) => Number(String(part).trim()))
          .filter((n) => Number.isFinite(n));
    if (key === 'payoutPaidHourly') {
      const tiers = list.filter((n) => Number.isInteger(n) && n > 0);
      if (!tiers.includes(180) || tiers.length < 4) {
        return { ok: false, error: 'Keep 180 and three other whole hourly rates, separated by commas.' };
      }
      return { ok: true, value: tiers };
    }
    if (!list.length || list.some((n) => !Number.isInteger(n) || n <= 0)) {
      return { ok: false, error: 'Enter whole days greater than 0, separated by commas.' };
    }
    return { ok: true, value: list };
  }
  return { ok: false, error: 'Unsupported type.' };
}

function publicRow(row) {
  const spec = BY_KEY[row.key] || {};
  return {
    key: row.key,
    group: row.group,
    type: row.type,
    label: spec.label || row.label || row.key,
    value: row.value,
    defaultValue: row.defaultValue,
    confirm: !!spec.confirm,
    updatedBy: row.updatedBy || '',
    updatedAt: row.updatedAt || null,
  };
}

async function seedSiteSettings() {
  const existing = await SiteSetting.find({}, { key: 1 }).lean();
  const have = new Set(existing.map((row) => row.key));
  const missing = CATALOG.filter((row) => !have.has(row.key));
  if (!missing.length) return 0;
  await SiteSetting.insertMany(
    missing.map((row) => ({
      key: row.key,
      group: row.group,
      type: row.type,
      value: row.value,
      defaultValue: row.value,
      label: row.label,
      updatedBy: '',
    }))
  );
  return missing.length;
}

async function loadSnapshot() {
  const rows = await SiteSetting.find({}).lean();
  const next = {};
  rows.forEach((row) => {
    next[row.key] = row;
  });
  snapshot = next;
  loadedAt = Date.now();
  return snapshot;
}

async function ensureFresh() {
  if (!snapshot || Date.now() - loadedAt > TTL_MS) await loadSnapshot();
  return snapshot;
}

async function listSettings() {
  const snap = await ensureFresh();
  return CATALOG.map((spec) => publicRow(snap[spec.key] || {
    key: spec.key,
    group: spec.group,
    type: spec.type,
    label: spec.label,
    value: spec.value,
    defaultValue: spec.value,
  }));
}

async function getSetting(key) {
  const spec = BY_KEY[key];
  if (!spec) return undefined;
  const snap = await ensureFresh();
  const row = snap[key];
  return row ? row.value : spec.value;
}

/** Sync read for checkout and booking. Missing or unloaded cache uses the catalog constant. */
function readSetting(key) {
  const spec = BY_KEY[key];
  if (!spec) return undefined;
  if (snapshot && Date.now() - loadedAt > TTL_MS) {
    loadSnapshot().catch(() => {});
  }
  const row = snapshot && snapshot[key];
  if (!row || row.value == null || row.value === '') return spec.value;
  return row.value;
}

function needsConfirm(key) {
  return !!(BY_KEY[key] && BY_KEY[key].confirm);
}

async function writeValue(key, raw, username, action) {
  const spec = BY_KEY[key];
  if (!spec) return { ok: false, status: 400, error: 'Unknown setting.' };
  const checked = validateValue(key, raw);
  if (!checked.ok) return { ok: false, status: 400, error: checked.error };
  const current = await SiteSetting.findOne({ key });
  if (!current) return { ok: false, status: 404, error: 'Setting is not seeded yet.' };
  const from = current.value;
  if (sameValue(from, checked.value)) {
    return { ok: true, row: publicRow(current), unchanged: true };
  }
  current.value = checked.value;
  current.updatedBy = String(username || '').slice(0, 120);
  await current.save();
  if (!snapshot) snapshot = {};
  snapshot[key] = current.toObject();
  loadedAt = Date.now();
  return { ok: true, row: publicRow(snapshot[key]), from, to: checked.value, action };
}

async function restoreDefault(key, username) {
  const spec = BY_KEY[key];
  if (!spec) return { ok: false, status: 400, error: 'Unknown setting.' };
  const current = await SiteSetting.findOne({ key });
  if (!current) return { ok: false, status: 404, error: 'Setting is not seeded yet.' };
  return writeValue(key, current.defaultValue, username, 'setting.restore');
}

module.exports = {
  CATALOG,
  seedSiteSettings,
  loadSnapshot,
  ensureFresh,
  listSettings,
  getSetting,
  readSetting,
  needsConfirm,
  writeValue,
  restoreDefault,
  validateValue,
};
