const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../server/services/classroomSosPolicy');

test('technical failure is tier 1 and cannot observe or end the class', () => {
  assert.equal(policy.tierForCategory('technical_failure'), 1);
  assert.equal(policy.actionAllowed(1, 'observe').ok, false);
  assert.equal(policy.actionAllowed(1, 'terminate').ok, false);
  assert.equal(policy.actionAllowed(1, 'note').ok, true);
});

test('tier 2 and tier 3 can observe, and parent contact is not for tier 1', () => {
  assert.equal(policy.actionAllowed(2, 'observe').ok, true);
  assert.equal(policy.actionAllowed(3, 'terminate').ok, true);
  assert.equal(policy.actionAllowed(1, 'parent_contact').ok, false);
  assert.equal(policy.actionAllowed(2, 'parent_contact').ok, true);
});

test('escalation only moves to a higher tier', () => {
  assert.equal(policy.canEscalate(1, 2), true);
  assert.equal(policy.canEscalate(1, 3), true);
  assert.equal(policy.canEscalate(2, 3), true);
  assert.equal(policy.canEscalate(3, 2), false);
  assert.equal(policy.canEscalate(2, 2), false);
  assert.equal(policy.canEscalate(3, 1), false);
});
