// Shared timezone utilities using Luxon (client-side)
// Assumes luxon is loaded globally as 'luxon' (via script tag).

const { DateTime, IANAZone } = luxon || {};

function getDetectedZone() {
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
  const z = zone && IANAZone.isValidZone(zone) ? zone : 'UTC';
  const dt = DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: z });
  if (!dt.isValid) throw new Error(`Invalid date/time for zone ${z}`);
  return dt.toUTC().toISO();
}

function utcToLocalParts(utcIso, zone) {
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
  return DateTime.utc().toISO();
}

function isPastUtc(utcIso) {
  const now = DateTime.utc();
  const dt = DateTime.fromISO(utcIso, { zone: 'UTC' });
  return dt < now;
}

// Export to window
window.TimezoneUtils = {
  getDetectedZone,
  listTimezones,
  toUtcIso,
  utcToLocalParts,
  nowUtcIso,
  isPastUtc
};
