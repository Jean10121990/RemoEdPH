/**
 * Same-start classroom ceiling. This is not a per-student daily cap.
 * MAX_CONCURRENT_ROOMS=0 turns the guard off.
 */
const { DateTime } = require('luxon');

const CANCELLED_BOOKING_STATUSES = ['cancelled', 'cancelled_by_student_emergency'];

function parseIntSetting(raw, fallback) {
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function readClassCapacity(env = process.env) {
  const maxRooms = parseIntSetting(env.MAX_CONCURRENT_ROOMS, 48);
  const matchMs = parseIntSetting(env.CLASS_SLOT_MATCH_MS, 2000);
  const rawMinutes =
    env.CLASS_STAGGER_MINUTES == null || String(env.CLASS_STAGGER_MINUTES).trim() === ''
      ? '5,10'
      : String(env.CLASS_STAGGER_MINUTES);
  const staggerMinutes = rawMinutes
    .split(',')
    .map((part) => Number(String(part).trim()))
    .filter((n) => Number.isFinite(n) && n !== 0);
  const safeMax = maxRooms < 0 ? 48 : maxRooms;
  return {
    maxRooms: safeMax,
    matchMs: matchMs > 0 ? matchMs : 2000,
    staggerMinutes: staggerMinutes.length ? staggerMinutes : [5, 10],
    enabled: safeMax > 0,
  };
}

function instantMs(value) {
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function inSameWindow(a, b, matchMs) {
  const left = instantMs(a);
  const right = instantMs(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= matchMs;
}

function countBookingsAt(bookings, instant, matchMs) {
  let count = 0;
  for (const row of bookings || []) {
    if (row && row.cancelled) continue;
    if (inSameWindow(row.dateTimeUtc, instant, matchMs)) count += 1;
  }
  return count;
}

/**
 * When `instant` already has maxRooms bookings, return open slots at the
 * configured minute offsets whose own windows are still under the ceiling.
 */
function evaluateClassStart({ instant, bookings, openSlots, config }) {
  const cfg = config || readClassCapacity();
  if (!cfg.enabled) return { full: false, count: 0, suggestions: [] };
  const count = countBookingsAt(bookings, instant, cfg.matchMs);
  if (count < cfg.maxRooms) return { full: false, count, suggestions: [] };
  const suggestions = [];
  const seen = new Set();
  for (const minutes of cfg.staggerMinutes) {
    const atMs = instantMs(instant) + minutes * 60000;
    if (!Number.isFinite(atMs)) continue;
    const at = new Date(atMs).toISOString();
    if (countBookingsAt(bookings, at, cfg.matchMs) >= cfg.maxRooms) continue;
    for (const slot of openSlots || []) {
      if (!slot || !inSameWindow(slot.dateTimeUtc, at, cfg.matchMs)) continue;
      const slotId = slot.slotId != null ? String(slot.slotId) : slot._id != null ? String(slot._id) : '';
      const key = slotId || `${slot.teacherId || ''}|${atMs}`;
      if (seen.has(key)) continue;
      seen.add(key);
      suggestions.push({
        dateTimeUtc: new Date(slot.dateTimeUtc).toISOString(),
        offsetMinutes: minutes,
        slotId,
        teacherId: slot.teacherId != null ? String(slot.teacherId) : '',
      });
    }
  }
  return { full: true, count, code: 'CLASS_START_FULL', suggestions };
}

function suggestionLabel(slot, zone) {
  const z = zone && DateTime.now().setZone(zone).isValid ? zone : 'Asia/Manila';
  const local = DateTime.fromJSDate(new Date(slot.dateTimeUtc), { zone: 'utc' }).setZone(z);
  return local.isValid ? local.toFormat('h:mm a') : '';
}

function fullStartMessage(suggestions, zone) {
  const labels = [];
  const seen = new Set();
  for (const slot of suggestions || []) {
    const label = suggestionLabel(slot, zone);
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
    if (labels.length >= 4) break;
  }
  if (!labels.length) {
    return 'This start time is full. Please choose another open time a few minutes later.';
  }
  return `This start time is full. These open times still have room: ${labels.join(', ')}.`;
}

function searchSpanMs(config) {
  const farthest = config.staggerMinutes.reduce((max, minutes) => Math.max(max, Math.abs(minutes) * 60000), 0);
  return farthest + config.matchMs;
}

async function loadNearbyBookings(Booking, instant, config) {
  const t = instantMs(instant);
  const span = searchSpanMs(config);
  const rows = await Booking.find({
    dateTimeUtc: { $gte: new Date(t - span), $lte: new Date(t + span) },
    status: { $nin: CANCELLED_BOOKING_STATUSES },
  })
    .select('dateTimeUtc')
    .lean();
  return rows || [];
}

async function loadOffsetOpenSlots(findOpenSlots, instant, config) {
  const slots = [];
  const t = instantMs(instant);
  for (const minutes of config.staggerMinutes) {
    const at = new Date(t + minutes * 60000).toISOString();
    const found = await findOpenSlots(at);
    for (const slot of found || []) {
      slots.push({
        dateTimeUtc: slot.dateTimeUtc,
        slotId: slot._id != null ? String(slot._id) : slot.slotId != null ? String(slot.slotId) : '',
        teacherId: slot.teacherId != null ? String(slot.teacherId) : '',
      });
    }
  }
  return slots;
}

/**
 * Returns an Error with statusCode 409 when the start window is full, otherwise null.
 * Does not create slots and does not refuse a class that is already booked.
 */
async function guardClassStart({ instant, zone, Booking, findOpenSlots, config }) {
  const cfg = config || readClassCapacity();
  if (!cfg.enabled) return null;
  const bookings = await loadNearbyBookings(Booking, instant, cfg);
  const openSlots = await loadOffsetOpenSlots(findOpenSlots, instant, cfg);
  const verdict = evaluateClassStart({ instant, bookings, openSlots, config: cfg });
  if (!verdict.full) return null;
  const err = new Error(fullStartMessage(verdict.suggestions, zone));
  err.statusCode = 409;
  err.code = 'CLASS_START_FULL';
  err.alternatives = verdict.suggestions;
  return err;
}

module.exports = {
  CANCELLED_BOOKING_STATUSES,
  readClassCapacity,
  evaluateClassStart,
  fullStartMessage,
  guardClassStart,
};
