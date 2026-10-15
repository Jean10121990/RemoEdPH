const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryRepo } = require('./helpers/garden-memory-repo');
const { createGardenService } = require('../server/garden/gardenService');
const { createEcoDropService } = require('../server/garden/ecoDropService');
const { createPlayService } = require('../server/garden/playService');
const { createGamesRegistry, GAMES } = require('../server/garden/games.config');

function setup(seed) {
  const repo = createMemoryRepo(seed);
  const garden = createGardenService({ repo, timeZone: 'Asia/Manila' });
  const ecoDrops = createEcoDropService({ repo, garden });
  return { repo, garden, ecoDrops };
}

test('one lesson awards one drop and is a no-op on retry', async () => {
  const { ecoDrops } = setup();
  const now = new Date('2026-10-15T02:00:00.000Z');
  const first = await ecoDrops.award({ studentId: 'mia', sourceType: 'lesson', sourceId: 'lesson-1', now });
  const again = await ecoDrops.award({ studentId: 'mia', sourceType: 'lesson', sourceId: 'lesson-1', now });
  assert.equal(first.awarded, true);
  assert.equal(first.monthEcoDrops, 1);
  assert.equal(first.totalEcoDrops, 1);
  assert.equal(again.awarded, false);
  assert.equal(again.reason, 'already_awarded');
  assert.equal(again.monthEcoDrops, 1);
  assert.equal(again.totalEcoDrops, 1);
});

test('concurrent duplicate awards insert only one ledger row', async () => {
  const { ecoDrops, repo } = setup();
  const now = new Date('2026-10-15T02:00:00.000Z');
  const results = await Promise.all([
    ecoDrops.award({ studentId: 'mia', sourceType: 'task', sourceId: 'checkpoint:little-seeds:1', now }),
    ecoDrops.award({ studentId: 'mia', sourceType: 'task', sourceId: 'checkpoint:little-seeds:1', now }),
  ]);
  const wins = results.filter((r) => r.awarded).length;
  assert.equal(wins, 1);
  assert.equal(results[0].monthEcoDrops, 1);
  assert.equal(repo.ledger().length, 1);
});

test('a game pays once per month under the default replay rule', async () => {
  const { ecoDrops } = setup();
  const oct = new Date('2026-10-15T02:00:00.000Z');
  const nov = new Date('2026-11-02T02:00:00.000Z');
  const a = await ecoDrops.award({ studentId: 'mia', sourceType: 'game', sourceId: 'pop-the-bubbles', playId: 'p1', now: oct });
  const b = await ecoDrops.award({ studentId: 'mia', sourceType: 'game', sourceId: 'pop-the-bubbles', playId: 'p2', now: oct });
  const c = await ecoDrops.award({ studentId: 'mia', sourceType: 'game', sourceId: 'pop-the-bubbles', playId: 'p3', now: nov });
  assert.equal(a.awarded, true);
  assert.equal(b.awarded, false);
  assert.equal(c.awarded, true);
  assert.equal(c.monthKey, '2026-11');
});

test('lifetime total never resets when the month rolls over', async () => {
  const { ecoDrops } = setup();
  const oct = await ecoDrops.award({ studentId: 'mia', sourceType: 'lesson', sourceId: 'L1', now: new Date('2026-10-15T02:00:00.000Z') });
  const nov = await ecoDrops.award({ studentId: 'mia', sourceType: 'lesson', sourceId: 'L2', now: new Date('2026-11-02T02:00:00.000Z') });
  assert.equal(oct.totalEcoDrops, 1);
  assert.equal(nov.totalEcoDrops, 2);
  assert.equal(nov.monthEcoDrops, 1);
});

test('a fifth game in the registry awards with no garden code changes', async () => {
  const { ecoDrops } = setup();
  const extra = createGamesRegistry(GAMES.concat([{ id: 'star-catch', title: 'Star Catch', rounds: 1, minSeconds: 0 }]));
  const play = createPlayService({ ecoDrops, secret: 'test-secret', games: extra });
  const now = new Date('2026-10-15T02:00:00.000Z');
  const start = play.startGame('mia', 'star-catch', now);
  const later = new Date(now.getTime() + 2000);
  const eco = await play.finishGame('mia', 'star-catch', { ticket: start.ticket, roundsCompleted: 1 }, later);
  assert.equal(eco.awarded, true);
  assert.equal(eco.totalEcoDrops, 1);
});
