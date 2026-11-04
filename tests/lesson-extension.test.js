const test = require('node:test');
const assert = require('node:assert/strict');
const { extensionDecision } = require('../server/services/lessonExtension');

const end = new Date('2026-12-01T00:00:00+08:00');

test('extension is closed more than 30 days before the plan ends', () => {
  const now = new Date('2026-10-01T00:00:00+08:00');
  const result = extensionDecision({ end, now, creditsRemaining: 10, extension: null });
  assert.equal(result.ok, false);
});

test('extension is open in the last 30 days when lessons remain', () => {
  const now = new Date('2026-11-10T00:00:00+08:00');
  const result = extensionDecision({ end, now, creditsRemaining: 4, extension: { status: 'none' } });
  assert.equal(result.ok, true);
});

test('a granted extension is not stacked on the same end date', () => {
  const now = new Date('2026-11-20T00:00:00+08:00');
  const result = extensionDecision({
    end,
    now,
    creditsRemaining: 4,
    extension: { status: 'granted', newEnd: end },
  });
  assert.equal(result.ok, false);
});

test('finished lessons cannot be extended', () => {
  const now = new Date('2026-11-20T00:00:00+08:00');
  const result = extensionDecision({ end, now, creditsRemaining: 0, extension: null });
  assert.equal(result.ok, false);
});
