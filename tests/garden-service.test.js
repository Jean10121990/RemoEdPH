const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createMemoryRepo } = require('./helpers/garden-memory-repo');
const { createGardenService } = require('../server/garden/gardenService');
const { createEcoDropService } = require('../server/garden/ecoDropService');
const { createGardenRouter } = require('../server/garden/routes');
const { GardenError } = require('../server/garden/errors');
const config = require('../server/garden/garden.config');

function setup(seed) {
  const repo = createMemoryRepo(seed);
  const garden = createGardenService({ repo, timeZone: 'Asia/Manila' });
  const ecoDrops = createEcoDropService({ repo, garden });
  return { repo, garden, ecoDrops };
}

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: 'http://127.0.0.1:' + port,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

test('new month creates a new species and finalizes last month’s tree', async () => {
  const { garden, ecoDrops, repo } = setup();
  const sept = new Date('2026-09-15T02:00:00.000Z');
  await ecoDrops.award({ studentId: 'mia', sourceType: 'lesson', sourceId: 'L1', now: sept });
  const first = await garden.getCurrent('mia', sept);
  const oct = new Date('2026-10-15T02:00:00.000Z');
  const second = await garden.getCurrent('mia', oct);
  assert.notEqual(second.tree.species, first.tree.species);
  assert.equal(second.tree.stage.key, 'seed');
  const old = repo.trees().find((t) => t.monthKey === '2026-09');
  assert.ok(old.finalizedAt);
  assert.equal(old.finalStage, first.tree.stage.index);
  assert.equal(old.monthEcoDrops, 1);
  const hist = await garden.getHistory('mia', oct);
  assert.equal(hist.length, 1);
  assert.equal(hist[0].monthKey, '2026-09');
  assert.equal(hist[0].finalStage.key, first.tree.stage.key);
});

test('ensureCurrentMonthTree is idempotent under two overlapping calls', async () => {
  const { garden, repo } = setup();
  const now = new Date('2026-10-15T02:00:00.000Z');
  await Promise.all([garden.ensureCurrentMonthTree('mia', now), garden.ensureCurrentMonthTree('mia', now)]);
  assert.equal(repo.trees().filter((t) => t.monthKey === '2026-10').length, 1);
});

test('skipped months never appear in history', async () => {
  const { garden, ecoDrops } = setup();
  await ecoDrops.award({ studentId: 'mia', sourceType: 'lesson', sourceId: 'L1', now: new Date('2026-08-10T02:00:00.000Z') });
  const now = new Date('2026-10-15T02:00:00.000Z');
  const hist = await garden.getHistory('mia', now);
  assert.deepEqual(hist.map((t) => t.monthKey), ['2026-08']);
});

test('history bounds: unknown or future month is TREE_NOT_FOUND', async () => {
  const { garden } = setup();
  const now = new Date('2026-10-15T02:00:00.000Z');
  await garden.ensureCurrentMonthTree('mia', now);
  await assert.rejects(() => garden.getTree('mia', '2026-01', now), (err) => err instanceof GardenError && err.code === 'TREE_NOT_FOUND');
  await assert.rejects(() => garden.getTree('mia', '2026-12', now), (err) => err instanceof GardenError && err.code === 'TREE_NOT_FOUND');
  await assert.rejects(() => garden.getTree('mia', 'nope', now), (err) => err instanceof GardenError && err.code === 'INVALID_MONTH');
});

test('student A cannot read student B’s tree', async () => {
  const repo = createMemoryRepo({
    students: [
      { username: 'mia', totalEcoDrops: 0 },
      { username: 'leo', totalEcoDrops: 0 },
    ],
  });
  const garden = createGardenService({ repo, timeZone: 'Asia/Manila' });
  const ecoDrops = createEcoDropService({ repo, garden });
  const now = new Date('2026-09-15T02:00:00.000Z');
  await ecoDrops.award({ studentId: 'mia', sourceType: 'lesson', sourceId: 'L1', now });

  function appFor(username) {
    const app = express();
    app.use(express.json());
    app.use(
      '/api/garden',
      createGardenRouter({
        garden,
        auth: [(req, _res, next) => { req.student = { username, profilePicture: '' }; next(); }],
        clock: () => new Date('2026-10-15T02:00:00.000Z'),
      })
    );
    return app;
  }

  const a = await listen(appFor('mia'));
  const b = await listen(appFor('leo'));
  try {
    const miaHist = await fetch(a.url + '/api/garden/history').then((r) => r.json());
    const leoHist = await fetch(b.url + '/api/garden/history').then((r) => r.json());
    const leoPast = await fetch(b.url + '/api/garden/2026-09');
    const leoBody = await leoPast.json();
    assert.equal(miaHist.trees.length, 1);
    assert.equal(leoHist.trees.length, 0);
    assert.equal(leoPast.status, 404);
    assert.equal(leoBody.code, 'TREE_NOT_FOUND');
  } finally {
    await a.close();
    await b.close();
  }
});

test('reaching the monthly target lands on Fully Grown Tree', async () => {
  const { garden, ecoDrops } = setup({ lessons: 2, tasks: 0 });
  const now = new Date('2026-10-15T02:00:00.000Z');
  const first = await garden.getCurrent('mia', now);
  const need = first.tree.monthlyTarget;
  for (let i = 0; i < need; i++) {
    await ecoDrops.award({ studentId: 'mia', sourceType: 'lesson', sourceId: 'L' + i, now });
  }
  const after = await garden.getCurrent('mia', now);
  assert.equal(after.tree.stage.key, 'fully-grown');
  assert.equal(after.tree.progressPercent, 100);
  assert.equal(after.tree.nextStage, null);
  const extra = await ecoDrops.award({ studentId: 'mia', sourceType: 'lesson', sourceId: 'overflow', now });
  assert.equal(extra.awarded, true);
  const clamped = await garden.getCurrent('mia', now);
  assert.equal(clamped.tree.stage.key, 'fully-grown');
  assert.equal(clamped.tree.progressPercent, 100);
});

test('stages list matches the config module', () => {
  assert.deepEqual(
    config.STAGES.map((s) => s.minPercent),
    [0, 20, 40, 60, 80, 100]
  );
});
