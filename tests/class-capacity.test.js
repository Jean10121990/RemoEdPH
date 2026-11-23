const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateClassStart, readClassCapacity } = require('../server/config/classCapacity');

const INSTANT = '2026-11-22T02:00:00.000Z';
const PLUS_FIVE = '2026-11-22T02:05:00.000Z';

function fullConfig() {
  return { enabled: true, maxRooms: 48, matchMs: 2000, staggerMinutes: [5, 10] };
}

test('48 bookings at one UTC instant yield CLASS_START_FULL and a +5 minute open slot', () => {
  const bookings = Array.from({ length: 48 }, () => ({ dateTimeUtc: INSTANT }));
  const verdict = evaluateClassStart({
    instant: INSTANT,
    bookings,
    openSlots: [{ dateTimeUtc: PLUS_FIVE, slotId: 'slot-plus-5', teacherId: 'teacher-1' }],
    config: fullConfig(),
  });
  assert.equal(verdict.full, true);
  assert.equal(verdict.code, 'CLASS_START_FULL');
  assert.equal(verdict.count, 48);
  assert.equal(verdict.suggestions.length, 1);
  assert.equal(verdict.suggestions[0].offsetMinutes, 5);
  assert.equal(verdict.suggestions[0].slotId, 'slot-plus-5');
  assert.equal(verdict.suggestions[0].dateTimeUtc, PLUS_FIVE);
});

test('a full offset is skipped and a later open slot is kept', () => {
  const bookings = [
    ...Array.from({ length: 48 }, () => ({ dateTimeUtc: INSTANT })),
    ...Array.from({ length: 48 }, () => ({ dateTimeUtc: PLUS_FIVE })),
  ];
  const plusTen = '2026-11-22T02:10:00.000Z';
  const verdict = evaluateClassStart({
    instant: INSTANT,
    bookings,
    openSlots: [
      { dateTimeUtc: PLUS_FIVE, slotId: 'full-slot', teacherId: 'teacher-1' },
      { dateTimeUtc: plusTen, slotId: 'open-slot', teacherId: 'teacher-2' },
    ],
    config: fullConfig(),
  });
  assert.deepEqual(
    verdict.suggestions.map((slot) => slot.slotId),
    ['open-slot']
  );
});

test('MAX_CONCURRENT_ROOMS=0 turns the guard off', () => {
  const previous = process.env.MAX_CONCURRENT_ROOMS;
  process.env.MAX_CONCURRENT_ROOMS = '0';
  try {
    const config = readClassCapacity();
    assert.equal(config.enabled, false);
    const verdict = evaluateClassStart({
      instant: INSTANT,
      bookings: Array.from({ length: 48 }, () => ({ dateTimeUtc: INSTANT })),
      openSlots: [],
      config,
    });
    assert.equal(verdict.full, false);
  } finally {
    if (previous == null) delete process.env.MAX_CONCURRENT_ROOMS;
    else process.env.MAX_CONCURRENT_ROOMS = previous;
  }
});
