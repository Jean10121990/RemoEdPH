const test = require('node:test');
const assert = require('node:assert/strict');
const { createMemoryRepo } = require('./helpers/garden-memory-repo');
const { createGardenService } = require('../server/garden/gardenService');
const { createCareService } = require('../server/garden/careService');
const { createRewardService } = require('../server/garden/rewardService');
const { createParentService } = require('../server/garden/parentService');
const { createShareService, createViewLimiter } = require('../server/garden/shareService');
const { GardenError } = require('../server/garden/errors');

const NOW = new Date('2026-10-10T04:00:00.000Z');

function family() {
  const repo = createMemoryRepo({
    lessons: 22,
    students: [
      { username: 'mia', firstName: 'Mia', lastName: 'Santos', parentEmail: 'parent@x.com', age: 10, level: 'Sprouts', email: 'mia@x.com' },
      { username: 'leo', firstName: 'Leo', lastName: 'Santos', parentEmail: 'parent@x.com', age: 14, level: 'Sprouts' },
      { username: 'other', firstName: 'Otto', lastName: 'Reyes', parentEmail: 'other@x.com', age: 15 },
    ],
  });
  const garden = createGardenService({ repo });
  const care = createCareService({ repo, garden });
  const rewards = createRewardService({ repo, garden });
  const parent = createParentService({ repo, garden });
  const allowView = createViewLimiter({ max: 2, windowMs: 60000 });
  const shares = createShareService({ repo, parent, origin: 'https://remoedph.com', allowView });
  return { repo, garden, care, rewards, parent, shares };
}

async function finish(ctx, studentId, lessons) {
  const tree = await ctx.garden.ensureCurrentMonthTree(studentId, NOW);
  for (let i = 0; i < lessons; i += 1) {
    await ctx.repo.insertLedgerAndIncrement({ studentId, monthKey: tree.monthKey, sourceType: 'lesson', sourceId: studentId + '-lesson-' + i });
  }
  await ctx.garden.markTreeComplete(tree, { dropsSpent: 17, lessonsDone: lessons, now: NOW });
  return ctx.repo.findTreeById(tree._id);
}

test('parent card numbers, zero state, and sibling scope', async () => {
  const ctx = family();
  const empty = await ctx.parent.cards('mia', NOW);
  assert.equal(empty.cards.length, 2);
  assert.equal(empty.cards[0].zero, true);
  assert.match(empty.cards[0].zeroMessage, /No free lessons/);
  const other = await ctx.parent.cards('other', NOW);
  assert.equal(other.cards.length, 1);
  assert.equal(other.cards[0].childName, 'Otto');

  const tree = await finish(ctx, 'mia', 10);
  await ctx.repo.insertLedgerAndIncrement({ studentId: 'mia', monthKey: tree.monthKey, sourceType: 'task', sourceId: 'task-1' });
  const growing = await ctx.parent.cards('mia', NOW);
  const mia = growing.cards.find((card) => card.childName === 'Mia');
  assert.match(mia.tree.text, / of 22 lessons/);
  assert.match(mia.eligibilityTip, /needs 8 more lessons/);
  assert.equal(growing.cards.some((card) => card.childName === 'Otto'), false);

  await ctx.rewards.claim('mia', tree._id, NOW, () => 1);
  const paid = (await ctx.parent.cards('mia', NOW)).cards.find((card) => card.childName === 'Mia');
  assert.equal(paid.freeLessonsThisMonth, 0);
  assert.equal(paid.eligibilityTip.length > 0, true);
});

test('18 lessons show on the card and a parent cannot water or claim', async () => {
  const ctx = family();
  const tree = await finish(ctx, 'mia', 18);
  const claim = await ctx.rewards.claim('mia', tree._id, NOW, () => 1);
  assert.equal(claim.grantedCredits, 1);
  const card = (await ctx.parent.cards('mia', NOW)).cards.find((row) => row.childName === 'Mia');
  assert.equal(card.freeLessonsThisMonth, 1);
  assert.equal(card.breakdown[0].label, 'Tree reward');
  assert.equal(card.unusedCredits, 1);
  assert.ok(card.nearestExpiry);
  const note = ctx.repo.notices().find((row) => row.type === 'garden_tree_complete');
  assert.ok(note);
  assert.match(note.message, /Mia finished a/);
  assert.match(note.message, /Free lessons: 1/);
  await assert.rejects(
    () => ctx.care.applyCare('mia', { action: 'water', requestId: 'parent-water-01', view: 'parent' }, NOW),
    (err) => err instanceof GardenError && err.code === 'PARENT_READ_ONLY'
  );
  await assert.rejects(
    () => ctx.rewards.claim('mia', tree._id, NOW, () => 1, 'parent'),
    (err) => err.code === 'PARENT_READ_ONLY'
  );
  const cert = await ctx.parent.certificate('mia', tree._id);
  assert.equal(cert.studentName, 'Mia Santos');
  assert.equal(cert.species, tree.species);
  assert.equal(cert.level, 'Sprouts');
  await assert.rejects(() => ctx.parent.certificate('other', tree._id), (err) => err.code === 'TREE_NOT_FOUND');
});

test('expiry reminder is sent once and the admin report totals sources', async () => {
  const ctx = family();
  const tree = await finish(ctx, 'mia', 22);
  await ctx.rewards.claim('mia', tree._id, NOW, () => 100);
  const soon = new Date(NOW.getTime() + 3 * 86400000);
  await ctx.repo.insertClaim({
    studentId: 'mia',
    treeId: 'expiry-tree',
    monthKey: tree.monthKey,
    sequence: 1,
    grantedCredits: 1,
    expiresAt: soon,
  });
  const first = await ctx.rewards.remindExpiring('mia', NOW);
  const second = await ctx.rewards.remindExpiring('mia', NOW);
  assert.equal(first.length, 1);
  assert.equal(second.length, 0);
  assert.equal(ctx.repo.notices().filter((note) => note.type === 'garden_credit_expiry').length, 1);
  const report = await ctx.parent.creditReport(tree.monthKey);
  assert.equal(report.bySource.tier2, 4);
  assert.equal(report.students, 1);
  assert.equal(report.totalCredits, 4);
});

test('share links hide private fields, reuse a token, and 404 when revoked', async () => {
  const ctx = family();
  const tree = await finish(ctx, 'mia', 22);
  await ctx.rewards.claim('mia', tree._id, NOW, () => 1);
  await assert.rejects(
    () => ctx.shares.createShare('mia', { type: 'badge', targetId: 'green_thumb' }, NOW),
    (err) => err.code === 'SHARING_DISABLED'
  );
  await ctx.parent.setSharing('mia', 'mia', { sharingEnabled: true, shareDisplay: 'first' }, NOW);
  const first = await ctx.shares.createShare('mia', { type: 'tree', targetId: String(tree._id) }, NOW);
  const again = await ctx.shares.createShare('mia', { type: 'tree', targetId: String(tree._id) }, NOW);
  assert.equal(first.shareId, again.shareId);
  const pub = await ctx.shares.publicShare(first.shareId, '1.1.1.1', NOW);
  const html = ctx.shares.pageHtml(pub.copy, first.shareId);
  assert.match(html, /noindex/);
  assert.match(html, /og:image/);
  assert.match(html, /https:\/\/remoedph.com\/share\//);
  assert.match(html, /Start learning with RemoEd/);
  assert.equal(html.includes('Santos'), false);
  assert.equal(html.includes('mia@x.com'), false);
  assert.equal(html.includes('credit'), false);
  assert.equal(html.includes('username'), false);
  assert.equal(pub.copy.name, 'Mia');
  assert.equal(JSON.stringify(pub.copy).includes('Santos'), false);
  const png = await ctx.shares.cardPng(first.shareId, 'og');
  assert.equal(png[0], 137);
  assert.equal(png[1], 80);
  await ctx.shares.revoke('mia', first.shareId, NOW);
  await assert.rejects(() => ctx.shares.publicShare(first.shareId, '8.8.8.8', NOW), (err) => err.code === 'SHARE_NOT_FOUND');
  await assert.rejects(() => ctx.shares.publicShare('missing-token', '8.8.4.4', NOW), (err) => err.code === 'SHARE_NOT_FOUND');
});

test('locked items, other families, and the view limit are rejected', async () => {
  const ctx = family();
  const tree = await finish(ctx, 'leo', 22);
  await ctx.parent.setSharing('mia', 'mia', { sharingEnabled: true }, NOW);
  await assert.rejects(
    () => ctx.shares.createShare('mia', { type: 'tree', targetId: String(tree._id) }, NOW),
    (err) => err.code === 'NOT_SHAREABLE'
  );
  await assert.rejects(
    () => ctx.shares.createShare('other', { type: 'forest', targetId: 'summary', childUsername: 'mia' }, NOW),
    (err) => err.code === 'NOT_YOUR_CHILD'
  );
  const allow = createViewLimiter({ max: 1, windowMs: 60000 });
  assert.equal(allow('9.9.9.9', NOW), true);
  assert.equal(allow('9.9.9.9', NOW), false);
});
