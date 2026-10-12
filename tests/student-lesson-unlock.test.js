const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isBookingLessonCompleted,
  maxBookableFromCompletedKeys,
} = require('../server/services/studentLessonUnlock');

test('a completed class with a student absence does not finish the lesson', () => {
  assert.equal(
    isBookingLessonCompleted({
      status: 'completed',
      absentType: 'student',
      finishedAt: new Date(),
      attendance: { classCompleted: true },
    }),
    false
  );
  assert.equal(
    isBookingLessonCompleted({
      status: 'completed',
      absentType: 'teacher',
    }),
    false
  );
  assert.equal(
    isBookingLessonCompleted({
      status: 'completed',
      absentMarkedAt: new Date(),
    }),
    false
  );
});

test('only a completed class with no absence finishes the lesson', () => {
  assert.equal(isBookingLessonCompleted({ status: 'completed' }), true);
  assert.equal(
    isBookingLessonCompleted({ status: 'pending_feedback', finishedAt: new Date() }),
    false
  );
  assert.equal(isBookingLessonCompleted({ status: 'absent', absentType: 'student' }), false);
  assert.equal(isBookingLessonCompleted({ status: 'Booked' }), false);
});

test('the next stop is the first lesson that is not actually finished', () => {
  const keys = new Set(['Little Seeds:1:2']);
  assert.equal(maxBookableFromCompletedKeys(keys, 'Little Seeds'), 1);
  keys.add('Little Seeds:1:1');
  assert.equal(maxBookableFromCompletedKeys(keys, 'Little Seeds'), 3);
});
