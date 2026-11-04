const test = require('node:test');
const assert = require('node:assert/strict');
const { STAGE_RANK } = require('../server/growth/leadService');

test('paid plan outranks assessment done', () => {
  assert.ok(STAGE_RANK['Paid plan'] > STAGE_RANK['Assessment done']);
  assert.ok(STAGE_RANK.Registered > STAGE_RANK['Assessment done']);
});
