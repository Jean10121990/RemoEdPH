const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canRequestEmergencyCancellation,
  canAssignSubstitute,
  pickSubstituteTeacher,
} = require('../server/services/emergencySubstituteService');

const now = new Date('2026-11-05T02:00:00.000Z');

test('emergency cancellation is allowed 10 minutes before the class', () => {
  const start = new Date(now.getTime() + 10 * 60 * 1000);
  assert.equal(canRequestEmergencyCancellation(start, now), true);
});

test('emergency cancellation is refused inside the last 10 minutes', () => {
  const start = new Date(now.getTime() + 9 * 60 * 1000);
  assert.equal(canRequestEmergencyCancellation(start, now), false);
});

test('an approved class can be assigned 5 minutes before the start', () => {
  const start = new Date(now.getTime() + 5 * 60 * 1000);
  assert.equal(canAssignSubstitute(start, now), true);
});

test('an approved class cannot be assigned when fewer than 5 minutes remain', () => {
  const start = new Date(now.getTime() + 4 * 60 * 1000);
  assert.equal(canAssignSubstitute(start, now), false);
});

test('the substitute is the first open teacher who is not blocked', () => {
  const picked = pickSubstituteTeacher(['mindy@remoedph.com', 'grace@remoedph.com'], ['mindy@remoedph.com']);
  assert.equal(picked, 'grace@remoedph.com');
});

test('no substitute when every open teacher is blocked', () => {
  assert.equal(pickSubstituteTeacher(['mindy@remoedph.com'], ['Mindy@remoedph.com']), null);
});
