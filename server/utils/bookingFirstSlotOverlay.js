const { normalizeId } = require('./normalizeId');

function padSlotTime(t) {
  if (t == null || t === '') return '00:00';
  const parts = String(t).split(':');
  const h = parseInt(parts[0], 10);
  const m = parts[1] != null ? parseInt(parts[1], 10) : 0;
  const hh = Number.isFinite(h) ? h : 0;
  const mm = Number.isFinite(m) ? m : 0;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Class Configuration / teacher week grid: if a Booking exists for the same teacher + instant,
 * mark the slot as booked in the JSON even when TeacherSlot.available is still true.
 *
 * @param {Array<object>} slots - mutable slot objects (from .toObject() or JSON)
 * @param {Array<object>} bookings - lean Booking docs for the week
 * @param {string} canonicalTeacherId - normalized portal teacher id
 * @param {{ debugTime?: string }} [opts]
 */
function applyBookingFirstSlotOverlay(slots, bookings, canonicalTeacherId, opts = {}) {
  const tid = normalizeId(canonicalTeacherId);
  const bookedLocal = new Set();
  const bookedUtcMin = new Set();

  for (const b of bookings || []) {
    if (String(b.status || '').toLowerCase().startsWith('cancelled')) continue;
    if (normalizeId(b.teacherId) !== tid) continue;
    const d = String(b.date || '').slice(0, 10);
    const tm = padSlotTime(b.time);
    bookedLocal.add(`${d}|${tm}`);
    if (b.dateTimeUtc) {
      const inst = b.dateTimeUtc instanceof Date ? b.dateTimeUtc : new Date(b.dateTimeUtc);
      if (!Number.isNaN(inst.getTime())) {
        bookedUtcMin.add(Math.floor(inst.getTime() / 60000));
      }
    }
  }

  for (const slot of slots || []) {
    const d = String(slot.date || '').slice(0, 10);
    const tm = padSlotTime(slot.time);
    const lk = `${d}|${tm}`;
    let has = bookedLocal.has(lk);
    if (!has && slot.dateTimeUtc) {
      const st = slot.dateTimeUtc instanceof Date ? slot.dateTimeUtc : new Date(slot.dateTimeUtc);
      if (!Number.isNaN(st.getTime())) {
        has = bookedUtcMin.has(Math.floor(st.getTime() / 60000));
      }
    }
    if (!has) continue;
    slot.available = false;
    slot.status = 'booked';
    slot.slotStatus = 'Booked';
    const dbg = opts.debugTime && tm === opts.debugTime;
    if (dbg) {
      console.log(`Slot at ${opts.debugTime} status:`, slot.status, 'available:', slot.available, 'date:', d);
    }
  }
}

module.exports = { applyBookingFirstSlotOverlay, padSlotTime };
