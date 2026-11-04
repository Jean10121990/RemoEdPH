const test = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const { monthlySplit } = require('../server/growth/moneySplit');
const { formatStudentClassWhen } = require('../server/services/classReminderService');

test('a 3:00 PM Manila slot is 4:00 PM in Seoul', () => {
  const start = new Date('2026-11-04T07:00:00.000Z');
  const label = formatStudentClassWhen({ studentLocalZone: 'Asia/Seoul' }, start, false);
  assert.equal(label, '4:00 PM (Asia/Seoul)');
  assert.equal(DateTime.fromJSDate(start, { zone: 'utc' }).setZone('Asia/Manila').toFormat('h:mm a'), '3:00 PM');
});

test('monthly split matches a hand count', () => {
  const split = monthlySplit({ grossPhp: 100000, teachersPhp: 40000, affiliatesPhp: 3000 });
  assert.equal(split.partners, 2000);
  assert.equal(split.growth, 5000);
  assert.equal(split.charity, 5000);
  assert.equal(split.buffer, 5000);
  assert.equal(split.ops, 6400);
  assert.equal(split.profit, 33600);
});
