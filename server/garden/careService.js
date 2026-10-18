/**
 * Water / Fertilizer. Clients send only { action, requestId }; costs live in care.config.
 */
const domain = require('./domain');
const { careAction } = require('./care.config');
const { GardenError } = require('./errors');
const { grandfatherCurrentTree } = require('./migrate');

function validRequestId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9._:-]{8,80}$/.test(id);
}

function stageSummary(index) {
  const s = domain.stageFor(0, 1);
  const list = require('./garden.config').STAGES;
  const row = list[Math.max(0, Math.min(list.length - 1, index))];
  return { index, key: row.key, name: row.name };
}

function createCareService({ repo, garden }) {
  async function snapshot(studentId, tree, now) {
    const points = await repo.sumGrowthPoints(studentId, tree.monthKey, tree.sequence || 1);
    const wallet = await garden.balances(studentId);
    const viewed = garden.view(tree, points, true);
    return {
      ok: true,
      availableDrops: wallet.availableDrops,
      totalEarned: wallet.totalEarned,
      growthPoints: points,
      progress: viewed.progressPercent,
      tree: viewed,
    };
  }

  async function applyCare(studentId, { action, requestId, monthKey } = {}, now = new Date()) {
    const spec = careAction(action);
    if (!spec) {
      throw new GardenError(400, 'INVALID_ACTION', 'Choose Water or Fertilizer.');
    }
    if (!validRequestId(requestId)) {
      throw new GardenError(400, 'INVALID_REQUEST_ID', 'Each tap needs its own request id.');
    }

    const tree = garden.activeTree
      ? await garden.activeTree(studentId, now)
      : await garden.ensureCurrentMonthTree(studentId, now);
    if ((monthKey && monthKey !== tree.monthKey) || tree.finalizedAt) {
      throw new GardenError(409, 'READ_ONLY_TREE', 'Past trees cannot be watered.');
    }

    const replay = await repo.findCareByRequestId(studentId, requestId);
    if (replay) {
      const out = await snapshot(studentId, tree, now);
      const stage = domain.stageIndexFor(out.growthPoints, tree.monthlyTarget);
      return {
        ...out,
        stageBefore: stageSummary(stage),
        stageAfter: stageSummary(stage),
        unlockedStage: null,
        replayed: true,
      };
    }

    await grandfatherCurrentTree(repo, { studentId, monthKey: tree.monthKey, now });

    const sequence = tree.sequence || 1;
    const pointsBefore = await repo.sumGrowthPoints(studentId, tree.monthKey, sequence);
    const progressBefore = domain.progressPercent(pointsBefore, tree.monthlyTarget);
    const stageBefore = domain.stageIndexFor(pointsBefore, tree.monthlyTarget);
    if (progressBefore >= 100) {
      throw new GardenError(409, 'TREE_COMPLETE', 'This tree is already fully grown.');
    }

    if (spec.oncePerStage) {
      const used = await repo.countFertilizerAtStage(studentId, tree.monthKey, stageBefore, sequence);
      if (used > 0) {
        throw new GardenError(409, 'FERTILIZER_LIMIT', 'Fertilizer can be used once per stage.');
      }
    }

    const wallet = await garden.balances(studentId);
    if (wallet.availableDrops < spec.cost) {
      throw new GardenError(409, 'INSUFFICIENT_DROPS', 'You need more Eco-Drops for that.');
    }

    const insert = await repo.insertCareAction({
      studentId,
      monthKey: tree.monthKey,
      action: spec.action,
      cost: spec.cost,
      growthPoints: spec.growthPoints,
      sequence,
      stageAt: stageBefore,
      requestId,
      createdAt: now,
    });

    if (!insert.inserted) {
      if (insert.duplicate === 'requestId' && insert.doc && insert.doc.studentId === studentId) {
        const out = await snapshot(studentId, tree, now);
        const stage = domain.stageIndexFor(out.growthPoints, tree.monthlyTarget);
        return {
          ...out,
          stageBefore: stageSummary(stage),
          stageAfter: stageSummary(stage),
          unlockedStage: null,
          replayed: true,
        };
      }
      if (insert.duplicate === 'fertilizer') {
        throw new GardenError(409, 'FERTILIZER_LIMIT', 'Fertilizer can be used once per stage.');
      }
      throw new GardenError(409, 'INSUFFICIENT_DROPS', 'You need more Eco-Drops for that.');
    }

    const spent = await repo.trySpend(studentId, spec.cost);
    if (!spent) {
      await repo.deleteCareAction(insert.doc);
      throw new GardenError(409, 'INSUFFICIENT_DROPS', 'You need more Eco-Drops for that.');
    }

    const pointsAfter = pointsBefore + spec.growthPoints;
    if (domain.progressPercent(pointsAfter, tree.monthlyTarget) >= 100 && garden.markTreeComplete) {
      const lessonsDone = repo.countLedger ? await repo.countLedger(studentId, tree.monthKey, 'lesson') : 0;
      await garden.markTreeComplete(tree, {
        points: pointsAfter,
        dropsSpent: spec.cost,
        lessonsDone,
        now,
      });
    }
    const stageAfter = domain.stageIndexFor(pointsAfter, tree.monthlyTarget);
    const viewed = garden.view(tree, pointsAfter, true);
    const afterWallet = await garden.balances(studentId);
    return {
      ok: true,
      availableDrops: afterWallet.availableDrops,
      totalEarned: afterWallet.totalEarned,
      growthPoints: pointsAfter,
      progress: viewed.progressPercent,
      stageBefore: stageSummary(stageBefore),
      stageAfter: stageSummary(stageAfter),
      unlockedStage: stageAfter > stageBefore ? stageSummary(stageAfter) : null,
      tree: viewed,
    };
  }

  return { applyCare };
}

module.exports = { createCareService, validRequestId };
