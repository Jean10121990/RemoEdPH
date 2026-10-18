const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryRepo } = require('./helpers/garden-memory-repo');
const { createGardenService } = require('../server/garden/gardenService');
const { createRewardService } = require('../server/garden/rewardService');
const { GardenError } = require('../server/garden/errors');
const math = require('../server/garden/rewardMath');
const { TIERS } = require('../server/garden/rewards.config');

const NOW = new Date('2026-10-10T04:00:00.000Z');

function wire(opts) {
  const repo = createMemoryRepo({ lessons: (opts && opts.lessons) || 22 });
  const garden = createGardenService({ repo });
  const rewards = createRewardService({
    repo,
    garden,
    creditsEnabled: opts && opts.creditsEnabled === false ? false : true,
  });
  return { repo, garden, rewards };
}

async function seedLessons(repo, studentId, monthKey, n) {
  for (let i = 0; i < n; i += 1) {
    await repo.insertLedgerAndIncrement({
      studentId,
      monthKey,
      sourceType: 'lesson',
      sourceId: 'lesson-' + i,
    });
  }
}

async function grownTree(ctx, studentId, lessons) {
  const tree = await ctx.garden.ensureCurrentMonthTree(studentId, NOW);
  await seedLessons(ctx.repo, studentId, tree.monthKey, lessons);
  await ctx.garden.markTreeComplete(tree, { dropsSpent: 17, lessonsDone: lessons, now: NOW });
  return ctx.repo.findTreeById(tree._id);
}

test('weighted tickets land on the published buckets', () => {
  function at(ticket) {
    return math.rollWeighted(TIERS[1], () => ticket);
  }
  assert.equal(at(1), 1);
  assert.equal(at(60), 1);
  assert.equal(at(61), 2);
  assert.equal(at(90), 2);
  assert.equal(at(91), 3);
  assert.equal(at(100), 3);
  assert.equal(math.rollWeighted(TIERS[2], () => 50), 2);
  assert.equal(math.rollWeighted(TIERS[2], () => 51), 3);
  assert.equal(math.rollWeighted(TIERS[2], () => 86), 4);
});

test('17 of 22 earns no credits, 18 is tier 1, 22 is tier 2', async () => {
  const ctx = wire();
  const short = await grownTree(ctx, 'mia', 17);
  const denied = await ctx.rewards.claim('mia', short._id, NOW, () => 1);
  assert.equal(denied.grantedCredits, 0);
  assert.match(denied.message, /at least 18 lessons/);

  const ctx2 = wire();
  const mid = await grownTree(ctx2, 'mia', 18);
  const tier1 = await ctx2.rewards.claim('mia', mid._id, NOW, () => 1);
  assert.equal(tier1.tier, 1);
  assert.equal(tier1.grantedCredits, 1);
  assert.equal(tier1.rangeLabel, '1 to 3');

  const ctx3 = wire();
  const full = await grownTree(ctx3, 'mia', 22);
  const tier2 = await ctx3.rewards.claim('mia', full._id, NOW, () => 100);
  assert.equal(tier2.tier, 2);
  assert.equal(tier2.rolledCredits, 4);
  assert.equal(tier2.rangeLabel, '2 to 4');
});

test('a bonus tree grants no lesson credits', async () => {
  const ctx = wire();
  const first = await grownTree(ctx, 'mia', 22);
  await ctx.rewards.claim('mia', first._id, NOW, () => 1);
  const planted = await ctx.rewards.plantBonus('mia', NOW);
  await ctx.garden.markTreeComplete(await ctx.repo.findTreeById(planted.tree.id), {
    dropsSpent: 10,
    lessonsDone: 22,
    now: NOW,
  });
  const bonus = await ctx.rewards.claim('mia', planted.tree.id, NOW, () => 1);
  assert.equal(bonus.grantedCredits, 0);
  assert.equal(bonus.reason, 'bonus_tree');
});

test('monthly cap trims the stored roll', async () => {
  const ctx = wire();
  const tree = await grownTree(ctx, 'mia', 22);
  await ctx.repo.insertClaim({
    studentId: 'mia',
    treeId: 'seed-claim',
    monthKey: tree.monthKey,
    sequence: 1,
    grantedCredits: 3,
    rolledCredits: 3,
  });
  const claim = await ctx.rewards.claim('mia', tree._id, NOW, () => 100);
  assert.equal(claim.rolledCredits, 4);
  assert.equal(claim.grantedCredits, 1);
  assert.equal(claim.reason, 'monthly_cap');
});

test('twenty concurrent claims grant once', async () => {
  const ctx = wire();
  const tree = await grownTree(ctx, 'mia', 22);
  const results = await Promise.all(
    Array.from({ length: 20 }, () => ctx.rewards.claim('mia', tree._id, NOW, () => 91))
  );
  const granted = ctx.repo.grants().filter((row) => row.claimId === String(tree._id));
  assert.equal(granted.length, 1);
  assert.equal(granted[0].credits, 4);
  assert.equal(results.filter((row) => !row.replayed).length, 1);
});

test('credits expire in 60 days and the kill switch stores a roll of zero', async () => {
  const ctx = wire();
  const tree = await grownTree(ctx, 'mia', 18);
  const claim = await ctx.rewards.claim('mia', tree._id, NOW, () => 1);
  const days = (new Date(claim.expiresAt) - NOW) / 86400000;
  assert.ok(days > 59 && days < 61);

  const paused = createRewardService({
    repo: ctx.repo,
    garden: ctx.garden,
    creditsEnabled: false,
  });
  const other = await grownTree({ ...ctx, rewards: paused }, 'leo', 22);
  const off = await paused.claim('leo', other._id, NOW, () => 100);
  assert.equal(off.grantedCredits, 0);
  assert.equal(off.reason, 'credits_disabled');
  assert.equal(ctx.repo.grants().some((row) => row.studentId === 'leo'), false);
});

test('badge bonus credits are granted once and a skipped month breaks the streak', async () => {
  assert.equal(math.completionStreak(['2026-01', '2026-02', '2026-04']), 1);
  assert.equal(math.completionStreak(['2026-01', '2026-02', '2026-03']), 3);
  const ctx = wire();
  for (let i = 0; i < 12; i += 1) {
    const month = '2025-' + String(i + 1).padStart(2, '0');
    await ctx.repo.insertTree({
      studentId: 'mia',
      monthKey: month,
      sequence: 1,
      species: 'Oak',
      monthlyTarget: 22,
      completedAt: NOW,
      perfectMonth: false,
      createdAt: NOW,
    });
  }
  const earned = await ctx.rewards.evaluateBadges('mia', { completedAt: NOW, perfectMonth: false }, NOW);
  assert.equal(earned.some((badge) => badge.key === 'evergreen' && badge.credits === 3), true);
  const again = await ctx.rewards.evaluateBadges('mia', { completedAt: NOW }, NOW);
  assert.equal(again.length, 0);
  assert.equal(ctx.repo.grants().filter((row) => row.claimId === 'badge:evergreen:mia').length, 1);
});

test('bonus tree cap and concurrent plants keep a single second tree', async () => {
  const ctx = wire();
  const first = await grownTree(ctx, 'mia', 22);
  await assert.rejects(() => ctx.rewards.plantBonus('mia', NOW), (err) => err instanceof GardenError && err.code === 'CLAIM_REQUIRED');
  await ctx.rewards.claim('mia', first._id, NOW, () => 1);
  const planted = await Promise.all(Array.from({ length: 20 }, () => ctx.rewards.plantBonus('mia', NOW)));
  const trees = await ctx.repo.listAllTrees('mia');
  assert.equal(trees.filter((row) => row.sequence === 2).length, 1);
  assert.equal(planted.filter((row) => !row.replayed).length, 1);
  await assert.rejects(() => ctx.rewards.plantBonus('mia', NOW), (err) => err.code === 'TREE_CAP');
});

test('another student cannot claim the tree', async () => {
  const ctx = wire();
  const tree = await grownTree(ctx, 'mia', 22);
  await assert.rejects(
    () => ctx.rewards.claim('leo', tree._id, NOW, () => 1),
    (err) => err instanceof GardenError && err.code === 'TREE_NOT_FOUND'
  );
});

test('a finished tree before launch is not marked claimable just by opening the garden', async () => {
  const ctx = wire();
  const tree = await ctx.garden.ensureCurrentMonthTree('mia', NOW);
  await ctx.repo.insertCareAction({
    studentId: 'mia',
    monthKey: tree.monthKey,
    action: 'water',
    cost: 1,
    growthPoints: 22,
    sequence: 1,
    stageAt: 0,
    requestId: 'old-water-1',
    createdAt: NOW,
  });
  const viewed = await ctx.garden.getCurrent('mia', NOW);
  assert.equal(viewed.tree.progressPercent, 100);
  assert.equal(viewed.tree.completed, false);
});
