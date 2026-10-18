const test = require('node:test');
const assert = require('node:assert/strict');
const domain = require('../server/garden/domain');
const config = require('../server/garden/garden.config');

test('monthKey uses Asia/Manila (default) so late-evening UTC can still be the next day', () => {
  const lateUtc = new Date('2026-09-30T17:00:00.000Z');
  assert.equal(domain.monthKeyOf(lateUtc, 'Asia/Manila'), '2026-10');
  assert.equal(domain.monthKeyOf(lateUtc, 'UTC'), '2026-09');
});

test('monthKey and range reject bad values', () => {
  assert.equal(domain.isValidMonthKey('2026-09'), true);
  assert.equal(domain.isValidMonthKey('2026-13'), false);
  assert.equal(domain.isValidMonthKey('26-09'), false);
  assert.throws(() => domain.monthRange('nope'));
});

test('stage thresholds sit on 20/40/60/80/100 for a 100-drop target', () => {
  const target = 100;
  const name = (drops) => domain.stageFor(drops, target).key;
  assert.equal(name(0), 'seed');
  assert.equal(name(19), 'seed');
  assert.equal(name(20), 'sprout');
  assert.equal(name(39), 'sprout');
  assert.equal(name(40), 'small-plant');
  assert.equal(name(59), 'small-plant');
  assert.equal(name(60), 'medium-plant');
  assert.equal(name(79), 'medium-plant');
  assert.equal(name(80), 'large-tree');
  assert.equal(name(99), 'large-tree');
  assert.equal(name(100), 'fully-grown');
  assert.equal(name(250), 'fully-grown');
});

test('progress percent clamps at 100', () => {
  assert.equal(domain.progressPercent(0, 12), 0);
  assert.equal(domain.progressPercent(6, 12), 50);
  assert.equal(domain.progressPercent(12, 12), 100);
  assert.equal(domain.progressPercent(40, 12), 100);
});

test('monthly target is scheduled lessons only, otherwise the default', () => {
  assert.equal(config.DEFAULT_MONTHLY_TARGET, 22);
  assert.equal(domain.computeMonthlyTarget({ lessons: 0, tasks: 2, games: 4 }), 22);
  assert.equal(domain.computeMonthlyTarget({ lessons: 8, tasks: 1, games: 4 }), 8);
});

test('stage thresholds for targets 20, 22, and 26 use ceil of 20/40/60/80/100%', () => {
  function pointsFor(target) {
    return config.STAGES.map((stage) => Math.ceil((stage.minPercent * target) / 100));
  }
  assert.deepEqual(pointsFor(20), [0, 4, 8, 12, 16, 20]);
  assert.deepEqual(pointsFor(22), [0, 5, 9, 14, 18, 22]);
  assert.deepEqual(pointsFor(26), [0, 6, 11, 16, 21, 26]);
  [20, 22, 26].forEach((target) => {
    pointsFor(target).forEach((points, index) => {
      assert.equal(domain.stageIndexFor(points, target), index);
      if (points > 0) assert.equal(domain.stageIndexFor(points - 1, target), index - 1);
    });
  });
});

test('species rotation never repeats a neighbour and wraps the list', () => {
  const first = domain.pickSpecies({ studentId: 'mia', monthKey: '2026-10', previousSpecies: null });
  assert.ok(config.SPECIES.includes(first));
  let prev = first;
  const seen = new Set([first]);
  for (let i = 0; i < config.SPECIES.length; i++) {
    const next = domain.pickSpecies({ studentId: 'mia', monthKey: '2026-1' + (i % 2), previousSpecies: prev });
    assert.notEqual(next, prev);
    seen.add(next);
    prev = next;
  }
  assert.equal(seen.size, config.SPECIES.length);
  assert.equal(domain.pickSpecies({ studentId: 'mia', previousSpecies: config.SPECIES[config.SPECIES.length - 1] }), config.SPECIES[0]);
});

test('first species is a hash of studentId|monthKey and ignores treeCount', () => {
  const a = domain.pickSpecies({ studentId: 'mia', monthKey: '2026-10' });
  const b = domain.pickSpecies({ studentId: 'mia', monthKey: '2026-10', treeCount: 99 });
  const c = domain.pickSpecies({ studentId: 'mia', monthKey: '2026-11' });
  assert.equal(a, b);
  assert.ok(config.SPECIES.includes(a));
  assert.ok(config.SPECIES.includes(c));
});

test('game ledger id follows GAME_REWARD_MODE', () => {
  assert.equal(domain.ledgerSourceId({ sourceType: 'game', sourceId: 'hide-and-seek', playId: 'abc' }, 'once-per-month'), 'hide-and-seek');
  assert.equal(domain.ledgerSourceId({ sourceType: 'game', sourceId: 'hide-and-seek', playId: 'abc' }, 'every-play'), 'hide-and-seek#abc');
  assert.equal(domain.paysOnceEver('lesson', 'once-per-month'), true);
  assert.equal(domain.paysOnceEver('game', 'once-per-month'), false);
  assert.equal(domain.paysOnceEver('game', 'once-ever'), true);
});
