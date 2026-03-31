// Shared timezone utilities using Luxon (client-side).
// Requires the Luxon global build: window.luxon (see HTML script order).

'use strict';

if (typeof window !== 'undefined' && !window.luxon) {
  console.error(
    '[RemoEd timezone-utils] window.luxon is missing. Load the Luxon global script before timezone-utils.js ' +
      '(e.g. https://cdn.jsdelivr.net/npm/luxon@3.5.0/build/global/luxon.min.js). ' +
      'If you see this after a deploy, the CDN may be blocked or the script order is wrong.'
  );
}

const DateTime = typeof window !== 'undefined' && window.luxon ? window.luxon.DateTime : undefined;
const IANAZone = typeof window !== 'undefined' && window.luxon ? window.luxon.IANAZone : undefined;

function getDetectedZone() {
  if (!IANAZone) return 'UTC';
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && IANAZone.isValidZone(tz)) return tz;
  } catch (e) {
    console.warn('Timezone detection failed:', e);
  }
  return 'UTC';
}

function listTimezones() {
  // Minimal list: return all IANA zones known to Luxon
  // Luxon does not expose all zones directly, but IANAZone.isValidZone can validate.
  // Provide a curated subset to avoid huge lists; fallback to common zones.
  return [
    'UTC',
    'Asia/Manila',
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Los_Angeles',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Paris',
    'Asia/Tokyo',
    'Asia/Seoul',
    'Asia/Shanghai',
    'Asia/Singapore',
    'Australia/Sydney',
    'Pacific/Auckland'
  ];
}

function toUtcIso(dateStr, timeStr, zone) {
  if (!DateTime || !IANAZone) {
    throw new Error('Luxon is not loaded; cannot convert to UTC ISO.');
  }
  const z = zone && IANAZone.isValidZone(zone) ? zone : 'UTC';
  const dt = DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: z });
  if (!dt.isValid) throw new Error(`Invalid date/time for zone ${z}`);
  return dt.toUTC().toISO();
}

function utcToLocalParts(utcIso, zone) {
  if (!DateTime || !IANAZone) {
    throw new Error('Luxon is not loaded; cannot convert UTC to local parts.');
  }
  const z = zone && IANAZone.isValidZone(zone) ? zone : 'UTC';
  const dt = DateTime.fromISO(utcIso, { zone: 'UTC' }).setZone(z);
  if (!dt.isValid) throw new Error(`Invalid UTC datetime ${utcIso}`);
  return {
    date: dt.toFormat('yyyy-LL-dd'),
    time: dt.toFormat('HH:mm'),
    label: dt.toFormat('ccc, LLL dd, yyyy HH:mm'),
    zone: z
  };
}

function nowUtcIso() {
  if (!DateTime) return new Date().toISOString();
  return DateTime.utc().toISO();
}

function isPastUtc(utcIso) {
  if (!DateTime) {
    const now = Date.now();
    const t = new Date(utcIso).getTime();
    return Number.isFinite(t) && t < now;
  }
  const now = DateTime.utc();
  const dt = DateTime.fromISO(utcIso, { zone: 'UTC' });
  return dt < now;
}

/** Philippine anchor; schedules use the same local clock window in any aligned zone */
const REMOED_ANCHOR_ZONE = 'Asia/Manila';
/** Student-facing labels and clocks: Philippine Standard Time (same offset as other UTC+8 zones without DST drift vs Manila). */
const REMOED_DISPLAY_ZONE = REMOED_ANCHOR_ZONE;

function remoedToDate(value) {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function formatInPhilippines(dateInput, options) {
  const d = remoedToDate(dateInput);
  if (!d) return '';
  try {
    return new Intl.DateTimeFormat('en-PH', Object.assign({ timeZone: REMOED_DISPLAY_ZONE }, options || {})).format(d);
  } catch (e) {
    return '';
  }
}

function formatDateLongPhilippines(dateInput) {
  return formatInPhilippines(dateInput, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateShortPhilippines(dateInput) {
  return formatInPhilippines(dateInput, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTimePhilippines(dateInput) {
  return formatInPhilippines(dateInput, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function formatTime12hPhilippines(dateInput) {
  return formatInPhilippines(dateInput, { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Calendar YYYY-MM-DD as seen in Asia/Manila for this instant. */
function formatYmdPhilippines(dateInput) {
  const d = remoedToDate(dateInput);
  if (!d) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: REMOED_DISPLAY_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(d);
    const m = {};
    parts.forEach(function (p) {
      m[p.type] = p.value;
    });
    return `${m.year}-${m.month}-${m.day}`;
  } catch (e) {
    return '';
  }
}

/** Long weekday date for a stored calendar day (YYYY-MM-DD) interpreted as Philippine local day. */
function formatYmdAsPhilippinesLongDate(ymd) {
  if (!ymd || typeof ymd !== 'string') return '';
  return formatDateLongPhilippines(new Date(ymd + 'T12:00:00+08:00'));
}

/** Add calendar days in Philippine (+08) space starting from YYYY-MM-DD. */
function addDaysYmdPhilippines(ymd, deltaDays) {
  if (!ymd || typeof ymd !== 'string') return '';
  const d = new Date(ymd + 'T12:00:00+08:00');
  if (isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + (Number(deltaDays) || 0));
  return formatYmdPhilippines(d);
}
/** First row: 06:00 local. Last row start: 23:30 local (end of day before midnight). */
const REMOED_OPERATING_START_HOUR = 6;
const REMOED_OPERATING_END_HOUR_EXCLUSIVE = 24;

const REMOED_REGION_CANDIDATES = [
  'Asia/Manila',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Kuala_Lumpur',
  'Asia/Kuching',
  'Asia/Brunei',
  'Asia/Jakarta',
  'Asia/Pontianak',
  'Asia/Makassar',
  'Asia/Jayapura',
  'Asia/Bangkok',
  'Asia/Ho_Chi_Minh',
  'Asia/Phnom_Penh',
  'Asia/Vientiane',
  'Asia/Yangon',
  'Asia/Dhaka',
  'Asia/Kolkata',
  'Asia/Colombo',
  'Asia/Kathmandu',
  'Asia/Thimphu',
  'Asia/Shanghai',
  'Asia/Taipei',
  'Asia/Macau',
  'Asia/Urumqi',
  'Asia/Seoul',
  'Asia/Tokyo',
  'Asia/Pyongyang',
  'Asia/Ulaanbaatar',
  'Asia/Hovd',
  'Asia/Choibalsan',
  'Asia/Dili',
  'Australia/Perth',
  'Australia/Eucla',
  'Australia/Darwin',
  'Australia/Adelaide',
  'Australia/Brisbane',
  'Australia/Broken_Hill',
  'Australia/Sydney',
  'Australia/Lord_Howe',
  'Pacific/Port_Moresby',
  'Pacific/Guam',
  'Pacific/Chuuk',
  'Pacific/Palau'
];

function absOffsetHoursFromManila(zone) {
  try {
    if (!DateTime || !IANAZone || !IANAZone.isValidZone(zone) || !IANAZone.isValidZone(REMOED_ANCHOR_ZONE)) {
      return 99;
    }
    const ref = DateTime.utc();
    const phOff = ref.setZone(REMOED_ANCHOR_ZONE).offset;
    const zOff = ref.setZone(zone).offset;
    return Math.abs(zOff - phOff) / 60;
  } catch (e) {
    return 99;
  }
}

function isRemoedAlignedTimezone(zone, maxHoursDiff) {
  const maxH = maxHoursDiff == null ? 3 : maxHoursDiff;
  return absOffsetHoursFromManila(zone) <= maxH + 0.01;
}

function normalizeRemoedTimezone(zone) {
  const fallback = REMOED_ANCHOR_ZONE;
  if (!zone || !IANAZone || !IANAZone.isValidZone(zone)) return fallback;
  if (isRemoedAlignedTimezone(zone)) return zone;
  return fallback;
}

function listRemoedRegionTimezones() {
  if (!IANAZone || !DateTime) return [REMOED_ANCHOR_ZONE];
  const seen = new Set();
  const out = [];
  REMOED_REGION_CANDIDATES.forEach(function (z) {
    if (!IANAZone.isValidZone(z) || seen.has(z)) return;
    if (!isRemoedAlignedTimezone(z)) return;
    seen.add(z);
    out.push(z);
  });
  out.sort();
  const ix = out.indexOf(REMOED_ANCHOR_ZONE);
  if (ix > 0) {
    out.splice(ix, 1);
    out.unshift(REMOED_ANCHOR_ZONE);
  } else if (ix === -1) {
    out.unshift(REMOED_ANCHOR_ZONE);
  }
  return out;
}

// Export to window
window.TimezoneUtils = {
  getDetectedZone,
  listTimezones,
  toUtcIso,
  utcToLocalParts,
  nowUtcIso,
  isPastUtc,
  REMOED_ANCHOR_ZONE,
  REMOED_DISPLAY_ZONE,
  REMOED_OPERATING_START_HOUR,
  REMOED_OPERATING_END_HOUR_EXCLUSIVE,
  absOffsetHoursFromManila,
  isRemoedAlignedTimezone,
  normalizeRemoedTimezone,
  listRemoedRegionTimezones,
  formatInPhilippines,
  formatDateLongPhilippines,
  formatDateShortPhilippines,
  formatDateTimePhilippines,
  formatTime12hPhilippines,
  formatYmdPhilippines,
  formatYmdAsPhilippinesLongDate,
  addDaysYmdPhilippines
};
