const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createMemoryRepo } = require('./helpers/garden-memory-repo');
const { createGardenService } = require('../server/garden/gardenService');
const { createCareService } = require('../server/garden/careService');
const { createEcoDropService } = require('../server/garden/ecoDropService');
const { createGardenRouter } = require('../server/garden/routes');
const { GardenError } = require('../server/garden/errors');
const domain = require('../server/garden/domain');
const careConfig = require('../server/garden/care.config');

function setup(seed) {
  const repo = createMemoryRepo(seed);
  const garden = createGardenService({ repo, timeZone: 'Asia/Manila' });
  const care = createCareService({ repo, garden });
  const ecoDrops = createEcoDropService({ repo, garden });
  return { repo, garden, care, ecoDrops };
}

async function giveDrops(ecoDrops, n, now) {
  for (let i = 0; i < n; i++) {
    await ecoDrops.award({ studentId: 'mia', sourceType: 'lesson', sourceId: 'L-' + i, now });
  }
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

test('care costs come from care.config', () => {
  assert.equal(careConfig.ACTIONS.water.cost, 1);
  assert.equal(careConfig.ACTIONS.water.growthPoints, 1);
  assert.equal(careConfig.ACTIONS.fertilize.cost, 3);
  assert.equal(careConfig.ACTIONS.fertilize.growthPoints, 2);
  assert.equal(careConfig.ACTIONS.fertilize.oncePerStage, true);
});

test('water with 0 drops is rejected', async () => {
  const { garden, care } = setup();
  const now = new Date('2026-10-15T02:00:00.000Z');
  await garden.getCurrent('mia', now);
  await assert.rejects(
    () => care.applyCare('mia', { action: 'water', requestId: 'water-empty-01' }, now),
    (err) => err instanceof GardenError && err.code === 'INSUFFICIENT_DROPS'
  );
});

test('water deducts 1 drop and adds 1 growth point', async () => {
  const { garden, care, ecoDrops } = setup();
  const now = new Date('2026-10-15T02:00:00.000Z');
  await giveDrops(ecoDrops, 2, now);
  const result = await care.applyCare('mia', { action: 'water', requestId: 'water-once-01' }, now);
  assert.equal(result.ok, true);
  assert.equal(result.availableDrops, 1);
  assert.equal(result.totalEarned, 2);
  assert.equal(result.growthPoints, 1);
  const cur = await garden.getCurrent('mia', now);
  assert.equal(cur.availableDrops, 1);
  assert.equal(cur.tree.growthPoints, 1);
});

test('fertilizer costs 3 and adds 2, once per stage', async () => {
  const { garden, care, ecoDrops } = setup();
  const now = new Date('2026-10-15T02:00:00.000Z');
  await giveDrops(ecoDrops, 6, now);
  const first = await care.applyCare('mia', { action: 'fertilize', requestId: 'fert-once-01' }, now);
  assert.equal(first.growthPoints, 2);
  assert.equal(first.availableDrops, 3);
  await assert.rejects(
    () => care.applyCare('mia', { action: 'fertilize', requestId: 'fert-once-02' }, now),
    (err) => err instanceof GardenError && err.code === 'FERTILIZER_LIMIT'
  );
  await care.applyCare('mia', { action: 'water', requestId: 'water-after-fert' }, now);
  const after = await garden.getCurrent('mia', now);
  assert.equal(after.availableDrops, 2);
  assert.equal(after.tree.growthPoints, 3);
});

test('duplicate requestId charges once', async () => {
  const { care, ecoDrops, garden } = setup();
  const now = new Date('2026-10-15T02:00:00.000Z');
  await giveDrops(ecoDrops, 3, now);
  const a = await care.applyCare('mia', { action: 'water', requestId: 'same-click' }, now);
  const b = await care.applyCare('mia', { action: 'water', requestId: 'same-click' }, now);
  assert.equal(a.availableDrops, 2);
  assert.equal(b.availableDrops, 2);
  assert.equal(b.replayed, true);
  const cur = await garden.getCurrent('mia', now);
  assert.equal(cur.tree.growthPoints, 1);
});

test('10 concurrent waters with 3 drops yield 3 successes and balance 0', async () => {
  const { garden, care, ecoDrops } = setup();
  const now = new Date('2026-10-15T02:00:00.000Z');
  await giveDrops(ecoDrops, 3, now);
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) => care.applyCare('mia', { action: 'water', requestId: 'concurrent-water-' + i }, now))
  );
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  const fail = results.filter((r) => r.status === 'rejected' && r.reason && r.reason.code === 'INSUFFICIENT_DROPS').length;
  assert.equal(ok, 3);
  assert.equal(fail, 7);
  const cur = await garden.getCurrent('mia', now);
  assert.equal(cur.availableDrops, 0);
  assert.equal(cur.tree.growthPoints, 3);
});

test('care on a past tree is rejected', async () => {
  const { garden, care, ecoDrops } = setup();
  const sept = new Date('2026-09-15T02:00:00.000Z');
  await ecoDrops.award({ studentId: 'mia', sourceType: 'lesson', sourceId: 'L1', now: sept });
  await garden.getCurrent('mia', sept);
  const oct = new Date('2026-10-15T02:00:00.000Z');
  await garden.getCurrent('mia', oct);
  await assert.rejects(
    () => care.applyCare('mia', { action: 'water', requestId: 'water-past-01', monthKey: '2026-09' }, oct),
    (err) => err instanceof GardenError && err.code === 'READ_ONLY_TREE'
  );
});

test('care at 100% is rejected without charge', async () => {
  const { garden, care, ecoDrops } = setup({ lessons: 2, tasks: 0 });
  const now = new Date('2026-10-15T02:00:00.000Z');
  const first = await garden.getCurrent('mia', now);
  const need = first.tree.monthlyTarget;
  await giveDrops(ecoDrops, need + 1, now);
  for (let i = 0; i < need; i++) {
    await care.applyCare('mia', { action: 'water', requestId: 'water-complete-' + i }, now);
  }
  const before = await garden.getCurrent('mia', now);
  assert.equal(before.tree.progressPercent, 100);
  await assert.rejects(
    () => care.applyCare('mia', { action: 'water', requestId: 'water-too-late' }, now),
    (err) => err instanceof GardenError && err.code === 'TREE_COMPLETE'
  );
  const after = await garden.getCurrent('mia', now);
  assert.equal(after.availableDrops, before.availableDrops);
});

test('student A cannot act on student B’s tree', async () => {
  const repo = createMemoryRepo({
    students: [
      { username: 'mia', totalEcoDrops: 0 },
      { username: 'leo', totalEcoDrops: 0 },
    ],
  });
  const garden = createGardenService({ repo, timeZone: 'Asia/Manila' });
  const care = createCareService({ repo, garden });
  const ecoDrops = createEcoDropService({ repo, garden });
  const now = new Date('2026-10-15T02:00:00.000Z');
  await ecoDrops.award({ studentId: 'mia', sourceType: 'lesson', sourceId: 'L1', now });
  await garden.getCurrent('mia', now);

  function appFor(username) {
    const app = express();
    app.use(express.json());
    app.use(
      '/api/garden',
      createGardenRouter({
        garden,
        care,
        auth: [(req, _res, next) => { req.student = { username, profilePicture: '' }; next(); }],
        clock: () => now,
      })
    );
    return app;
  }

  const a = await listen(appFor('mia'));
  const b = await listen(appFor('leo'));
  try {
    const mia = await fetch(a.url + '/api/garden/care', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'water', requestId: 'mia-water-01' }),
    }).then((r) => r.json());
    const leo = await fetch(b.url + '/api/garden/care', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'water', requestId: 'leo-water-01' }),
    });
    const leoBody = await leo.json();
    assert.equal(mia.ok, true);
    assert.equal(leo.status, 409);
    assert.equal(leoBody.code, 'INSUFFICIENT_DROPS');
    const miaTree = await garden.getCurrent('mia', now);
    const leoTree = await garden.getCurrent('leo', now);
    assert.equal(miaTree.tree.growthPoints, 1);
    assert.equal(leoTree.tree.growthPoints, 0);
    assert.notEqual(miaTree.tree.species, null);
  } finally {
    await a.close();
    await b.close();
  }
});

test('growth-point stage boundaries and 100% clamp', () => {
  const target = 100;
  assert.equal(domain.stageFor(19, target).key, 'seed');
  assert.equal(domain.stageFor(20, target).key, 'sprout');
  assert.equal(domain.stageFor(39, target).key, 'sprout');
  assert.equal(domain.stageFor(40, target).key, 'small-plant');
  assert.equal(domain.progressPercent(250, target), 100);
});

test('ambient set per stage matches config', () => {
  const config = require('../server/garden/garden.config');
  assert.equal(config.STAGES[0].ambient.butterflies, 0);
  assert.equal(config.STAGES[2].ambient.butterflies, 1);
  assert.equal(config.STAGES[3].ambient.bees, 1);
  assert.equal(config.STAGES[4].ambient.birds, 1);
  assert.equal(config.STAGES[5].ambient.rainbow, true);
});
