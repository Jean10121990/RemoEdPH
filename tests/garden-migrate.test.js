const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryRepo } = require('./helpers/garden-memory-repo');
const { createGardenService } = require('../server/garden/gardenService');
const { createEcoDropService } = require('../server/garden/ecoDropService');
const { grandfatherCurrentTree, planTreeDedupes } = require('../server/garden/migrate');
const domain = require('../server/garden/domain');

test('Sprout-with-5-drops stays Sprout after grandfather and balance is earned minus applied', async () => {
  const repo = createMemoryRepo({ lessons: 21, tasks: 0 });
  const garden = createGardenService({ repo, timeZone: 'Asia/Manila' });
  const ecoDrops = createEcoDropService({ repo, garden });
  const now = new Date('2026-10-15T02:00:00.000Z');
  for (let i = 0; i < 5; i++) {
    await ecoDrops.award({ studentId: 'mia', sourceType: 'lesson', sourceId: 'old-' + i, now });
  }
  const tree = await garden.ensureCurrentMonthTree('mia', now);
  await repo.setTreeCareModel('mia', tree.monthKey, undefined, null);
  const t = repo.trees().find((x) => x.monthKey === tree.monthKey);
  delete t.careModel;

  const first = await grandfatherCurrentTree(repo, { studentId: 'mia', monthKey: tree.monthKey, now });
  assert.equal(first.migrated, true);
  assert.equal(first.applied, 5);
  const cur = await garden.getCurrent('mia', now);
  assert.equal(cur.tree.growthPoints, 5);
  assert.equal(cur.availableDrops, 0);
  assert.equal(cur.totalEarned, 5);
  const expected = domain.stageFor(5, cur.tree.monthlyTarget).key;
  assert.equal(cur.tree.stage.key, expected);
  if (cur.tree.monthlyTarget <= 25) assert.equal(cur.tree.stage.key, 'sprout');

  const second = await grandfatherCurrentTree(repo, { studentId: 'mia', monthKey: tree.monthKey, now });
  assert.equal(second.migrated, false);
  const again = await garden.getCurrent('mia', now);
  assert.equal(again.tree.growthPoints, 5);
  assert.equal(again.availableDrops, 0);
  assert.equal(repo.careActions().filter((c) => c.action === 'migrate').length, 1);
});

test('dedupe keeps the earliest tree per month', () => {
  const { keep, drop } = planTreeDedupes([
    { _id: 'b', studentId: 'mia', monthKey: '2026-10', species: 'Oak', createdAt: new Date('2026-10-02') },
    { _id: 'a', studentId: 'mia', monthKey: '2026-10', species: 'Narra', createdAt: new Date('2026-10-01') },
    { _id: 'c', studentId: 'mia', monthKey: '2026-09', species: 'Acacia', createdAt: new Date('2026-09-01') },
  ]);
  assert.equal(keep.length, 2);
  assert.equal(drop.length, 1);
  assert.equal(drop[0].species, 'Oak');
  assert.equal(keep.find((t) => t.monthKey === '2026-10').species, 'Narra');
});
