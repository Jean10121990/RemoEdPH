const test = require('node:test');
const assert = require('node:assert/strict');
const { DAILY_CAP } = require('../server/growth/brevo');

test('Brevo queue stays at or under 300 a day', () => {
  assert.equal(DAILY_CAP, 300);
});
