const test = require('node:test');
const assert = require('node:assert/strict');
const { ruleReply } = require('../server/growth/aiAgent');

test('refund wording hands the chat to a person', () => {
  const out = ruleReply('I want a refund');
  assert.equal(out.handoff, true);
});

test('plan wording stays on the rules', () => {
  const out = ruleReply('how much is a plan');
  assert.equal(out.handoff, false);
  assert.match(out.reply, /RemoSpark/);
});
