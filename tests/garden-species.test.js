const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryRepo } = require('./helpers/garden-memory-repo');
const { createGardenService } = require('../server/garden/gardenService');
const config = require('../server/garden/garden.config');

function setup() {
  const repo = createMemoryRepo();
  const garden = createGardenService({ repo, timeZone: 'Asia/Manila' });
  return { repo, garden };
}

test('parallel current + history on first visit still creates one species', async () => {
  const { garden } = setup();
  const now = new Date('2026-10-15T02:00:00.000Z');
  const [cur] = await Promise.all([garden.getCurrent('mia', now), garden.getHistory('mia', now)]);
  const again = await garden.getCurrent('mia', now);
  assert.equal(again.tree.species, cur.tree.species);
});

test('50 sequential reads in one month return the same species', async () => {
  const { garden } = setup();
  const now = new Date('2026-10-15T02:00:00.000Z');
  const first = await garden.getCurrent('mia', now);
  for (let i = 0; i < 49; i++) {
    const again = await garden.getCurrent('mia', now);
    assert.equal(again.tree.species, first.tree.species);
    assert.equal(again.tree.monthKey, '2026-10');
  }
});

test('20 concurrent first-requests create exactly one tree', async () => {
  const { garden, repo } = setup();
  const now = new Date('2026-10-15T02:00:00.000Z');
  await Promise.all(Array.from({ length: 20 }, () => garden.ensureCurrentMonthTree('mia', now)));
  assert.equal(repo.trees().filter((t) => t.monthKey === '2026-10').length, 1);
  const species = new Set(repo.trees().map((t) => t.species));
  assert.equal(species.size, 1);
});

test('month change gives a different species than the previous month', async () => {
  const { garden } = setup();
  const first = await garden.getCurrent('mia', new Date('2026-09-15T02:00:00.000Z'));
  const second = await garden.getCurrent('mia', new Date('2026-10-15T02:00:00.000Z'));
  assert.notEqual(second.tree.species, first.tree.species);
  assert.ok(config.SPECIES.includes(first.tree.species));
  assert.ok(config.SPECIES.includes(second.tree.species));
});

test('findTree keeps the earliest duplicate and GET does not rewrite species', async () => {
  const repo = createMemoryRepo({ allowDuplicateTrees: true });
  repo.allowDuplicateTrees = true;
  const garden = createGardenService({ repo, timeZone: 'Asia/Manila' });
  const now = new Date('2026-10-15T02:00:00.000Z');
  repo.forcePushTree({
    studentId: 'mia',
    monthKey: '2026-10',
    species: 'Narra',
    monthlyTarget: 12,
    careModel: 'actions',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    finalizedAt: null,
  });
  repo.forcePushTree({
    studentId: 'mia',
    monthKey: '2026-10',
    species: 'Oak',
    monthlyTarget: 12,
    careModel: 'actions',
    createdAt: new Date('2026-10-02T00:00:00.000Z'),
    finalizedAt: null,
  });
  const current = await garden.getCurrent('mia', now);
  assert.equal(current.tree.species, 'Narra');
});

test('species list is the rotation config, in order', () => {
  assert.deepEqual(config.SPECIES, [
    'Acacia',
    'Narra',
    'Oak',
    'Mahogany',
    'Mango',
    'Banyan',
    'Molave',
    'Cherry Blossom',
    'Pine',
    'Maple',
  ]);
});

test('duplicate previous-month trees do not change the next species', async () => {
  const repo = createMemoryRepo();
  const garden = createGardenService({ repo, timeZone: 'Asia/Manila' });
  const early = new Date('2026-09-01T00:00:00.000Z');
  const late = new Date('2026-09-02T00:00:00.000Z');
  repo.forcePushTree({
    studentId: 'mia',
    monthKey: '2026-09',
    species: 'Acacia',
    monthlyTarget: 12,
    careModel: 'actions',
    createdAt: early,
    finalizedAt: null,
  });
  repo.forcePushTree({
    studentId: 'mia',
    monthKey: '2026-09',
    species: 'Narra',
    monthlyTarget: 12,
    careModel: 'actions',
    createdAt: late,
    finalizedAt: null,
  });
  const now = new Date('2026-10-15T02:00:00.000Z');
  const results = await Promise.all(Array.from({ length: 20 }, () => garden.getCurrent('mia', now)));
  results.forEach((row) => assert.equal(row.tree.species, 'Narra'));
  assert.equal(repo.trees().filter((t) => t.monthKey === '2026-10').length, 1);
});
