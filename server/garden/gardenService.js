/**
 * Garden trees: lazy monthly rollover, current tree, history, seen-stage.
 */
const config = require('./garden.config');
const domain = require('./domain');
const { gamesRegistry } = require('./games.config');
const { GardenError } = require('./errors');

function publicStages() {
  return config.STAGES.map((s, index) => ({ index, key: s.key, name: s.name, minPercent: s.minPercent, asset: s.asset }));
}

function createGardenService({ repo, games = gamesRegistry, timeZone = config.GARDEN_TIMEZONE }) {
  async function computeTarget(studentId, monthKey) {
    const range = domain.monthRange(monthKey, timeZone);
    const [lessons, tasks] = await Promise.all([
      repo.countMonthlyLessons(studentId, range),
      repo.countMonthlyTasks(studentId, range),
    ]);
    return domain.computeMonthlyTarget({ lessons, tasks, games: games.count() });
  }

  async function finalizePrevious(studentId, monthKey, now) {
    const open = await repo.listUnfinalizedBefore(studentId, monthKey);
    for (const tree of open) {
      const drops = await repo.countMonthDrops(studentId, tree.monthKey);
      await repo.finalizeTree(studentId, tree.monthKey, {
        finalStage: domain.stageIndexFor(drops, tree.monthlyTarget),
        monthEcoDrops: drops,
        finalizedAt: now,
      });
    }
  }

  /**
   * Idempotent and safe under concurrent requests: the unique (studentId, monthKey)
   * index lets exactly one insert win; the others read the winner's tree.
   */
  async function ensureCurrentMonthTree(studentId, now = new Date()) {
    const monthKey = domain.monthKeyOf(now, timeZone);
    let tree = await repo.findTree(studentId, monthKey);
    if (!tree) {
      const [previous, treeCount, monthlyTarget] = await Promise.all([
        repo.latestTreeBefore(studentId, monthKey),
        repo.countTrees(studentId),
        computeTarget(studentId, monthKey),
      ]);
      const species = domain.pickSpecies({
        studentId,
        previousSpecies: previous ? previous.species : null,
        treeCount,
      });
      tree =
        (await repo.insertTree({
          studentId,
          monthKey,
          species,
          monthlyTarget,
          lastSeenStage: 0,
          finalStage: null,
          monthEcoDrops: null,
          createdAt: now,
          finalizedAt: null,
        })) || (await repo.findTree(studentId, monthKey));
    }
    await finalizePrevious(studentId, monthKey, now);
    return tree;
  }

  function view(tree, liveDrops, isCurrent) {
    const finalized = !isCurrent && tree.finalizedAt != null;
    const drops = finalized ? Number(tree.monthEcoDrops) || 0 : liveDrops;
    const stageIndex = finalized
      ? Math.min(config.STAGES.length - 1, Math.max(0, Number(tree.finalStage) || 0))
      : domain.stageIndexFor(drops, tree.monthlyTarget);
    const s = config.STAGES[stageIndex];
    return {
      monthKey: tree.monthKey,
      label: domain.monthLabel(tree.monthKey),
      species: tree.species,
      isCurrent,
      readOnly: !isCurrent,
      stage: { index: stageIndex, key: s.key, name: s.name, asset: s.asset },
      progressPercent: domain.progressPercent(drops, tree.monthlyTarget),
      monthEcoDrops: drops,
      monthlyTarget: tree.monthlyTarget,
      nextStage: isCurrent ? domain.nextStageInfo(drops, tree.monthlyTarget) : null,
      lastSeenStage: isCurrent ? Math.min(stageIndex, Number(tree.lastSeenStage) || 0) : stageIndex,
    };
  }

  async function getCurrent(studentId, now = new Date()) {
    let tree = await ensureCurrentMonthTree(studentId, now);
    const drops = await repo.countMonthDrops(studentId, tree.monthKey);
    const computed = await computeTarget(studentId, tree.monthKey);
    const target = domain.reconcileTarget(tree.monthlyTarget, computed, drops);
    if (target !== tree.monthlyTarget) {
      await repo.setTreeTarget(studentId, tree.monthKey, target);
      tree = { ...tree, monthlyTarget: target };
    }
    const [treeCount, totalEcoDrops] = await Promise.all([repo.countTrees(studentId), repo.getTotalDrops(studentId)]);
    return {
      tree: view(tree, drops, true),
      totalEcoDrops,
      hasHistory: treeCount > 1,
      stages: publicStages(),
      timeZone,
    };
  }

  /** Past trees only, oldest first. Months the student never opened have no tree. */
  async function getHistory(studentId, now = new Date()) {
    const current = await ensureCurrentMonthTree(studentId, now);
    const trees = await repo.listTrees(studentId);
    return trees
      .filter((t) => domain.compareMonthKeys(t.monthKey, current.monthKey) < 0)
      .map((t) => {
        const v = view(t, 0, false);
        return { monthKey: v.monthKey, label: v.label, species: v.species, finalStage: v.stage };
      });
  }

  async function getTree(studentId, monthKey, now = new Date()) {
    if (!domain.isValidMonthKey(monthKey)) {
      throw new GardenError(400, 'INVALID_MONTH', 'Month must look like 2026-09.');
    }
    const current = await ensureCurrentMonthTree(studentId, now);
    if (monthKey === current.monthKey) {
      return (await getCurrent(studentId, now)).tree;
    }
    const tree = await repo.findTree(studentId, monthKey);
    if (!tree || domain.compareMonthKeys(monthKey, current.monthKey) > 0) {
      throw new GardenError(404, 'TREE_NOT_FOUND', 'No tree for that month.');
    }
    return view(tree, 0, false);
  }

  /** Records that the unlock animation up to `stage` was shown (never above the real stage). */
  async function markSeenStage(studentId, { monthKey, stage }, now = new Date()) {
    if (!domain.isValidMonthKey(monthKey)) {
      throw new GardenError(400, 'INVALID_MONTH', 'Month must look like 2026-09.');
    }
    const n = Number(stage);
    if (!Number.isInteger(n) || n < 0 || n >= config.STAGES.length) {
      throw new GardenError(400, 'INVALID_STAGE', 'Stage must be a stage number.');
    }
    const tree = await ensureCurrentMonthTree(studentId, now);
    if (tree.monthKey !== monthKey) {
      throw new GardenError(409, 'NOT_CURRENT_MONTH', 'Only the current tree can be updated.');
    }
    const drops = await repo.countMonthDrops(studentId, monthKey);
    const real = domain.stageIndexFor(drops, tree.monthlyTarget);
    const lastSeenStage = await repo.raiseLastSeenStage(studentId, monthKey, Math.min(n, real));
    return { monthKey, lastSeenStage };
  }

  return { ensureCurrentMonthTree, getCurrent, getHistory, getTree, markSeenStage, computeTarget };
}

module.exports = { createGardenService, publicStages };
