const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isBookingLessonCompleted,
  applyFinishedClassToTrail,
  applyCheckpointGate,
  checkpointWallsFromKeys,
  maxBookableFromCompletedKeys,
  trailKey,
} = require('../server/services/studentLessonUnlock');
const { scoreAnswers, publicCheckpoint } = require('../server/services/lessonCheckpoint');

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

test('one finished class marks lesson 1 and leaves the next stop at lesson 2', () => {
  const keys = new Set();
  applyFinishedClassToTrail(keys, 'Little Seeds', {
    title: 'Lesson 2: Letter A is for Apple',
  });
  assert.equal(keys.has('Little Seeds:1:1'), true);
  assert.equal(keys.has('Little Seeds:1:2'), false);
  assert.equal(maxBookableFromCompletedKeys(keys, 'Little Seeds'), 2);
  applyFinishedClassToTrail(keys, 'Little Seeds', {
    title: 'How to Navigate the Student Portal',
  });
  assert.equal(keys.size, 1);
});

test('the next stop is the first lesson that is not actually finished', () => {
  const keys = new Set(['Little Seeds:1:2']);
  assert.equal(maxBookableFromCompletedKeys(keys, 'Little Seeds'), 1);
  keys.add('Little Seeds:1:1');
  assert.equal(maxBookableFromCompletedKeys(keys, 'Little Seeds'), 3);
});

function gate(completed, checkpoints, passed) {
  return applyCheckpointGate(completed, { checkpoints, passed });
}

test('a finished class plus a passing attempt opens the next lesson', () => {
  const completed = new Set(['Little Seeds:1:1']);
  const bookable = gate(completed, { 'Little Seeds': [1] }, { 'Little Seeds': [1] });
  assert.equal(bookable.has('Little Seeds:1:1'), true);
  assert.equal(maxBookableFromCompletedKeys(bookable, 'Little Seeds'), 2);
  assert.equal(checkpointWallsFromKeys(completed, bookable).length, 0);
});

test('a failed or missing attempt leaves the next lesson locked', () => {
  const completed = new Set(['Little Seeds:1:1']);
  const failed = gate(completed, { 'Little Seeds': [1] }, { 'Little Seeds': [] });
  assert.equal(failed.has('Little Seeds:1:1'), false);
  assert.equal(maxBookableFromCompletedKeys(failed, 'Little Seeds'), 1);
  assert.deepEqual(checkpointWallsFromKeys(completed, failed), [
    { level: 'Little Seeds', lessonNumber: 1 },
  ]);

  const missing = gate(completed, { 'Little Seeds': [1] }, {});
  assert.equal(missing.has('Little Seeds:1:1'), false);
  assert.equal(maxBookableFromCompletedKeys(missing, 'Little Seeds'), 1);
});

test('skipping the checkpoint does not open the next lesson', () => {
  const completed = new Set(['Little Seeds:1:1']);
  const bookable = gate(completed, { 'Little Seeds': [1] }, {});
  assert.equal(maxBookableFromCompletedKeys(bookable, 'Little Seeds'), 1);
  assert.equal(checkpointWallsFromKeys(completed, bookable).length, 1);
});

test('an absence does not raise the checkpoint wall', () => {
  assert.equal(
    isBookingLessonCompleted({ status: 'completed', absentType: 'student' }),
    false
  );
  const completed = new Set();
  const bookable = gate(completed, { 'Little Seeds': [1] }, {});
  assert.equal(checkpointWallsFromKeys(completed, bookable).length, 0);
  assert.equal(maxBookableFromCompletedKeys(bookable, 'Little Seeds'), 1);
});

test('a finished lesson with no checkpoint still opens the next lesson', () => {
  const completed = new Set(['Little Seeds:1:1', 'Little Seeds:1:2']);
  const bookable = gate(completed, { 'Little Seeds': [1] }, { 'Little Seeds': [1] });
  assert.equal(bookable.has('Little Seeds:1:2'), true);
  assert.equal(maxBookableFromCompletedKeys(bookable, 'Little Seeds'), 3);
});

test('lesson 22 passed opens lesson 23', () => {
  const completed = new Set();
  for (let n = 1; n <= 22; n++) completed.add(trailKey('Little Seeds', n));
  const bookable = gate(completed, { 'Little Seeds': [1, 22] }, { 'Little Seeds': [1, 22] });
  assert.equal(maxBookableFromCompletedKeys(bookable, 'Little Seeds'), 23);
  assert.equal(bookable.has(trailKey('Little Seeds', 22)), true);
});

test('four of five correct answers pass and three do not', () => {
  const pack = publicCheckpoint('Little Seeds', 1);
  assert.ok(pack);
  assert.equal(pack.questions.some((q) => Object.prototype.hasOwnProperty.call(q, 'answer')), false);
  const ids = pack.questions.map((q) => q.id);
  const pass = scoreAnswers(
    'Little Seeds',
    1,
    ids.map((id, i) => ({ id, choice: i < 4 ? 0 : 1 }))
  );
  assert.equal(pass.passed, true);
  assert.equal(pass.scorePercent, 80);
  const fail = scoreAnswers(
    'Little Seeds',
    1,
    ids.map((id, i) => ({ id, choice: i < 3 ? 0 : 1 }))
  );
  assert.equal(fail.passed, false);
  assert.equal(fail.scorePercent, 60);
});
