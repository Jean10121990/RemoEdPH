const { GardenError } = require('./errors');
const { GARDEN_BADGES } = require('./badges.config');
const { DECORATIONS, decorationByKey } = require('./decorations.config');
const {
  MAX_TREES_PER_MONTH,
  CREDIT_EXPIRY_DAYS,
  EXPIRY_REMINDER_DAYS,
  REWARDS,
} = require('./rewards.config');
const math = require('./rewardMath');
const domain = require('./domain');
const { assertWritable } = require('./parentGuard');

function seqOf(tree) {
  return tree && tree.sequence ? tree.sequence : 1;
}

function createRewardService({ repo, garden, creditsEnabled = REWARDS.creditsEnabled, timeZone }) {
  const zone = timeZone || require('./garden.config').GARDEN_TIMEZONE;

  async function lessonCount(studentId, monthKey) {
    if (!repo.countLedger) return 0;
    return repo.countLedger(studentId, monthKey, 'lesson');
  }

  async function grantedThisMonth(studentId, monthKey) {
    if (!repo.listClaims) return 0;
    const rows = await repo.listClaims(studentId);
    return rows
      .filter((row) => row.monthKey === monthKey && (row.sequence || 1) === 1)
      .reduce((sum, row) => sum + (Number(row.grantedCredits) || 0), 0);
  }

  function publicClaim(row, extra) {
    return {
      ok: true,
      replayed: !!(extra && extra.replayed),
      treeId: String(row.treeId),
      rolledCredits: Number(row.rolledCredits) || 0,
      grantedCredits: Number(row.grantedCredits) || 0,
      expiresAt: row.expiresAt || null,
      tier: row.tier,
      rangeLabel: row.rangeLabel || null,
      message: row.message || '',
      reason: row.reason || '',
      newBadges: (extra && extra.newBadges) || [],
    };
  }

  async function awardBadgeCredits(studentId, badges, now) {
    const granted = [];
    for (const badge of badges) {
      if (!badge.credits || !repo.grantLessonCredits) continue;
      const claimId = 'badge:' + badge.key + ':' + studentId;
      const expiresAt = new Date(now.getTime() + CREDIT_EXPIRY_DAYS * 86400000);
      const result = await repo.grantLessonCredits({
        studentId,
        claimId,
        credits: badge.credits,
        expiresAt,
        reason: 'badge_reward',
      });
      if (result && result.granted) {
        granted.push({ key: badge.key, credits: badge.credits, expiresAt });
        if (repo.recordCreditGrant) {
          const source = badge.key === 'evergreen' ? 'evergreen' : 'streak';
          await repo.recordCreditGrant({
            studentId,
            monthKey: domain.monthKeyOf(now, zone),
            source,
            credits: badge.credits,
          });
        }
      }
    }
    return granted;
  }

  async function evaluateBadges(studentId, focus, now) {
    const trees = repo.listAllTrees ? await repo.listAllTrees(studentId) : [];
    const completed = trees.filter((tree) => tree.completedAt);
    const owned = repo.listBadges ? (await repo.listBadges(studentId)).map((row) => row.badgeKey) : [];
    const state = {
      completedCount: completed.length,
      perfect: completed.some((tree) => tree.perfectMonth),
      speciesCount: new Set(completed.map((tree) => tree.species)).size,
      early: !!(focus && focus.completedAt && math.dayOfMonth(focus.completedAt, zone) < 25),
      streak: math.completionStreak(completed.map((tree) => tree.monthKey)),
    };
    const fresh = math.newlyEarnedBadges(state, owned);
    const saved = [];
    for (const badge of fresh) {
      const inserted = repo.insertBadge
        ? await repo.insertBadge({ studentId, badgeKey: badge.key, earnedAt: now })
        : true;
      if (inserted) saved.push(badge);
    }
    const credits = await awardBadgeCredits(studentId, saved, now);
    return saved.map((badge) => ({
      key: badge.key,
      name: badge.name,
      credits: (credits.find((row) => row.key === badge.key) || {}).credits || 0,
    }));
  }

  async function claim(studentId, treeId, now = new Date(), rngInt, view) {
    assertWritable(view);
    const tree = repo.findTreeById ? await repo.findTreeById(treeId) : null;
    if (!tree || tree.studentId !== studentId) {
      throw new GardenError(404, 'TREE_NOT_FOUND', 'That tree is not yours.');
    }
    if (!tree.completedAt) {
      throw new GardenError(409, 'TREE_NOT_COMPLETE', 'Finish the tree before claiming.');
    }
    const existing = repo.findClaim ? await repo.findClaim(studentId, treeId) : null;
    if (existing) return publicClaim(existing, { replayed: true });

    const lessonsDone = await lessonCount(studentId, tree.monthKey);
    const perfectMonth = lessonsDone === tree.monthlyTarget;
    const alreadyGranted = await grantedThisMonth(studentId, tree.monthKey);
    const decision = math.decideCredits({
      sequence: seqOf(tree),
      lessonsDone,
      monthlyTarget: tree.monthlyTarget,
      perfectMonth,
      alreadyGranted,
      creditsEnabled,
      rngInt: rngInt || math.cryptoTicket,
    });
    const expiresAt = decision.grantedCredits > 0
      ? new Date(now.getTime() + CREDIT_EXPIRY_DAYS * 86400000)
      : null;
    const doc = {
      studentId,
      treeId: String(tree._id),
      monthKey: tree.monthKey,
      sequence: seqOf(tree),
      ...decision,
      expiresAt,
      reminderSentAt: null,
      createdAt: now,
      audit: [{
        at: now,
        rolledCredits: decision.rolledCredits,
        grantedCredits: decision.grantedCredits,
        reason: decision.reason,
      }],
    };
    const inserted = repo.insertClaim ? await repo.insertClaim(doc) : doc;
    if (!inserted) {
      const raced = await repo.findClaim(studentId, treeId);
      return publicClaim(raced, { replayed: true });
    }
    if (decision.grantedCredits > 0 && repo.grantLessonCredits) {
      await repo.grantLessonCredits({
        studentId,
        claimId: String(tree._id),
        credits: decision.grantedCredits,
        expiresAt,
        reason: 'tree_reward',
      });
      if (repo.recordCreditGrant && decision.tier) {
        await repo.recordCreditGrant({
          studentId,
          monthKey: tree.monthKey,
          source: decision.tier === 2 ? 'tier2' : 'tier1',
          credits: decision.grantedCredits,
        });
      }
    }
    if (repo.markTreeClaimed) await repo.markTreeClaimed(tree._id, { claimedAt: now, perfectMonth });
    const newBadges = await evaluateBadges(studentId, { ...tree, perfectMonth, completedAt: tree.completedAt }, now);
    if (repo.notify) {
      const profile = repo.profile ? await repo.profile(studentId) : null;
      const name = (profile && profile.firstName) || 'Your child';
      const badgeNames = newBadges.map((badge) => badge.name).join(', ') || 'none new';
      const exp = expiresAt ? expiresAt.toLocaleDateString('en-PH', { timeZone: zone }) : 'none';
      await repo.notify(studentId, {
        type: 'garden_tree_complete',
        message: name + ' finished a ' + tree.species + ' tree. Lessons done: ' + lessonsDone
          + '. Badges: ' + badgeNames + '. Free lessons: ' + decision.grantedCredits + '. Expiry: ' + exp + '.',
      });
    }
    return publicClaim(doc, { newBadges });
  }

  async function plantBonus(studentId, now = new Date(), view) {
    assertWritable(view);
    const monthKey = domain.monthKeyOf(now, zone);
    const trees = repo.listAllTrees ? await repo.listAllTrees(studentId) : [];
    const mine = trees.filter((tree) => tree.monthKey === monthKey);
    if (mine.length >= MAX_TREES_PER_MONTH) {
      throw new GardenError(409, 'TREE_CAP', 'This month already has two trees.');
    }
    const first = mine.find((tree) => seqOf(tree) === 1) || (await garden.ensureCurrentMonthTree(studentId, now));
    if (!first.completedAt) {
      throw new GardenError(409, 'TREE_NOT_COMPLETE', 'Finish and claim this tree first.');
    }
    const claimRow = repo.findClaim ? await repo.findClaim(studentId, first._id) : null;
    if (!claimRow) {
      throw new GardenError(409, 'CLAIM_REQUIRED', 'Claim this tree before planting another.');
    }
    if (mine.some((tree) => seqOf(tree) === 2)) {
      return { ok: true, replayed: true, tree: garden.view(mine.find((tree) => seqOf(tree) === 2), 0, true) };
    }
    const species = require('./domain').pickSpecies({
      studentId,
      monthKey,
      previousSpecies: first.species,
    });
    const inserted = await repo.insertTree({
      studentId,
      monthKey,
      sequence: 2,
      species,
      monthlyTarget: first.monthlyTarget,
      careModel: 'actions',
      finalStage: null,
      monthEcoDrops: null,
      createdAt: now,
      finalizedAt: null,
    });
    const saved = inserted || (await repo.findTreeBySequence(studentId, monthKey, 2));
    return { ok: true, replayed: !inserted, tree: garden.view(saved, 0, true) };
  }

  async function forest(studentId) {
    const trees = repo.listAllTrees ? await repo.listAllTrees(studentId) : [];
    const claims = repo.listClaims ? await repo.listClaims(studentId) : [];
    const badges = repo.listBadges ? await repo.listBadges(studentId) : [];
    const owned = new Set(badges.map((row) => row.badgeKey));
    const completed = trees.filter((tree) => tree.completedAt);
    const streak = math.completionStreak(completed.map((tree) => tree.monthKey));
    const speciesCount = new Set(completed.map((tree) => tree.species)).size;
    return {
      trees: trees.map((tree) => ({
        id: String(tree._id),
        monthKey: tree.monthKey,
        label: domain.monthLabel(tree.monthKey),
        sequence: seqOf(tree),
        species: tree.species,
        completed: !!tree.completedAt,
        perfectMonth: !!tree.perfectMonth,
        unfinished: !tree.completedAt && !!tree.finalizedAt,
        claimed: claims.some((row) => String(row.treeId) === String(tree._id)),
        stageName: tree.completedAt ? 'Fully Grown Tree' : 'Growing',
      })),
      totals: {
        trees: completed.length,
        badges: owned.size,
        freeLessons: claims.reduce((sum, row) => sum + (Number(row.grantedCredits) || 0), 0),
      },
      badges: GARDEN_BADGES.map((badge) => ({
        key: badge.key,
        name: badge.name,
        earned: owned.has(badge.key),
        requirement: badge.requirement,
        progress: badge.kind === 'trees'
          ? Math.min(completed.length, badge.count) + '/' + badge.count
          : badge.kind === 'streak'
            ? streak + '/' + badge.count
            : badge.kind === 'species'
              ? speciesCount + '/' + badge.count
              : '',
      })),
      decorations: DECORATIONS.map((item) => ({ key: item.key, name: item.name, cost: item.cost, enabled: item.enabled })),
    };
  }

  async function buyDecoration(studentId, itemKey, requestId, now = new Date(), view) {
    assertWritable(view);
    const item = decorationByKey(itemKey);
    if (!item || !item.enabled) {
      throw new GardenError(400, 'UNKNOWN_DECORATION', 'That decoration is not available.');
    }
    if (!requestId) throw new GardenError(400, 'INVALID_REQUEST_ID', 'Each purchase needs a request id.');
    const owned = repo.listDecorations ? await repo.listDecorations(studentId) : [];
    if (owned.some((row) => row.itemKey === item.key)) {
      return { ok: true, replayed: true, itemKey: item.key };
    }
    const wallet = await garden.balances(studentId);
    if (wallet.availableDrops < item.cost) {
      throw new GardenError(409, 'INSUFFICIENT_DROPS', 'You need more Eco-Drops for that.');
    }
    const inserted = await repo.insertDecoration({
      studentId,
      itemKey: item.key,
      cost: item.cost,
      requestId,
      createdAt: now,
    });
    if (!inserted) return { ok: true, replayed: true, itemKey: item.key };
    const spent = await repo.trySpend(studentId, item.cost);
    if (!spent) {
      if (repo.deleteDecoration) await repo.deleteDecoration(studentId, item.key);
      throw new GardenError(409, 'INSUFFICIENT_DROPS', 'You need more Eco-Drops for that.');
    }
    return { ok: true, replayed: false, itemKey: item.key, availableDrops: wallet.availableDrops - item.cost };
  }

  async function remindExpiring(studentId, now = new Date()) {
    if (!repo.listClaims || !repo.markReminder) return [];
    const soon = now.getTime() + EXPIRY_REMINDER_DAYS * 86400000;
    const due = (await repo.listClaims(studentId)).filter((row) => {
      if (!row.expiresAt || row.reminderSentAt || !(row.grantedCredits > 0)) return false;
      const at = new Date(row.expiresAt).getTime();
      return at > now.getTime() && at <= soon;
    });
    const sent = [];
    for (const row of due) {
      await repo.markReminder(row.treeId, now);
      if (repo.notify) {
        await repo.notify(studentId, {
          type: 'garden_credit_expiry',
          message: 'Free lessons from your tree expire on ' + new Date(row.expiresAt).toLocaleDateString() + '.',
        });
      }
      sent.push(String(row.treeId));
    }
    return sent;
  }

  async function previewForTree(studentId, tree) {
    if (!tree || !tree.id) return null;
    const lessonsDone = await lessonCount(studentId, tree.monthKey);
    const perfectMonth = lessonsDone === tree.monthlyTarget;
    return math.previewCopy({
      sequence: tree.sequence || 1,
      lessonsDone,
      monthlyTarget: tree.monthlyTarget,
      perfectMonth,
    });
  }

  return { claim, plantBonus, forest, buyDecoration, remindExpiring, previewForTree, evaluateBadges };
}

module.exports = { createRewardService };
