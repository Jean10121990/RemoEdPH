const test = require('node:test');
const assert = require('node:assert/strict');
const { STAGE_RANK } = require('../server/growth/leadService');
const { letters, PLANS } = require('../server/growth/parentSequence');

test('paid plan outranks assessment done', () => {
  assert.ok(STAGE_RANK['Paid plan'] > STAGE_RANK['Assessment done']);
  assert.ok(STAGE_RANK.Registered > STAGE_RANK['Assessment done']);
  assert.ok(STAGE_RANK.Trial > STAGE_RANK['Assessment done']);
});

test('parent sequence letters keep the free trial and the paid plans apart', () => {
  const pack = letters('Mina');
  assert.match(pack.onboard.text, /ages 3 to 6/);
  assert.match(pack.onboard.text, /RemoEd App/);
  assert.match(pack.onboard.text, /not a live 25-minute class/);
  assert.equal(pack.onboard.text.includes('6 to 12'), false);
  assert.match(pack.value.text, /RemoSpark/);
  assert.match(pack.value.text, /₱350/);
  assert.match(PLANS, /₱320/);
  assert.match(pack.checkin.text, /not a push/);
  assert.equal(pack.value.subject.includes('6 to 12'), false);
});
