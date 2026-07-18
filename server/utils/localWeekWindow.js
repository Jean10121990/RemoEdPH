/**
 * Resolve a client-local week (Mon 00:00 → next Mon 00:00) to a UTC Instant window
 * for booking/slot queries. Prefer IANA `tz`; else `timezoneOffset` (JS getTimezoneOffset minutes).
 */
const { DateTime, FixedOffsetZone } = require('luxon');

function resolveClientZone({ tz, timezoneOffset } = {}) {
  if (tz && typeof tz === 'string') {
    const candidate = String(tz).trim();
    if (candidate && DateTime.now().setZone(candidate).isValid) return candidate;
  }
  if (timezoneOffset != null && timezoneOffset !== '') {
    const n = Number(timezoneOffset);
    if (Number.isFinite(n)) {
      // JS: minutes to add to local to get UTC. Luxon FixedOffset: minutes east of UTC.
      return FixedOffsetZone.instance(-n);
    }
  }
  return null;
}

/**
 * @param {string} weekMonday YYYY-MM-DD local Monday as sent by the client
 * @param {{ tz?: string, timezoneOffset?: number|string }} [opts]
 * @returns {{ startUtc: Date, endUtc: Date, zoneLabel: string, startLocal: import('luxon').DateTime, endLocal: import('luxon').DateTime }}
 */
function resolveLocalWeekUtcWindow(weekMonday, opts = {}) {
  const week = String(weekMonday || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week)) {
    throw new Error('Invalid week parameter (expected YYYY-MM-DD)');
  }

  const zone = resolveClientZone(opts) || 'utc';
  const startLocal = DateTime.fromISO(`${week}T00:00:00`, { zone });
  if (!startLocal.isValid) {
    throw new Error(`Invalid week start: ${week}`);
  }
  const endLocal = startLocal.plus({ days: 7 });
  const zoneLabel =
    typeof zone === 'string' ? zone : zone.name || zone.fixed || 'UTC';

  return {
    startUtc: startLocal.toUTC().toJSDate(),
    endUtc: endLocal.toUTC().toJSDate(),
    zoneLabel,
    startLocal,
    endLocal: endLocal.minus({ milliseconds: 1 }),
  };
}

/** Legacy string date fallback end (next Monday exclusive) as YYYY-MM-DD in the resolved zone. */
function localWeekEndDateString(weekMonday, opts = {}) {
  const { startLocal } = resolveLocalWeekUtcWindow(weekMonday, opts);
  return startLocal.plus({ days: 7 }).toFormat('yyyy-LL-dd');
}

module.exports = {
  resolveClientZone,
  resolveLocalWeekUtcWindow,
  localWeekEndDateString,
};
