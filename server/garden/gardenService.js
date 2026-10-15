/**
 * Garden trees: lazy monthly rollover, current tree, history. Reads do not pick species.
 */
const config = require('./garden.config');
const domain = require('./domain');
const { gamesRegistry } = require('./games.config');
const { GardenError } = require('./errors');
const { grandfatherCurrentTree } = require('./migrate');

function publicStages() {
  return config.STAGES.map((s, index) => ({
    index,
    key: s.key,
    name: s.name,
    minPercent: s.minPercent,
    asset: s.asset,
    ambient: s.ambient || { butterflies: 0, bees: 0, birds: 0, rainbow: false },
  }));
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
      const points = await repo.sumGrowthPoints(studentId, tree.monthKey);
      await repo.finalizeTree(studentId, tree.monthKey, {
        finalStage: domain.stageIndexFor(points, tree.monthlyTarget),
        monthEcoDrops: points,
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
      const [previous, monthlyTarget] = await Promise.all([
        repo.latestTreeBefore(studentId, monthKey),
        computeTarget(studentId, monthKey),
      ]);
      const species = domain.pickSpecies({
        studentId,
        monthKey,
        previousSpecies: previous ? previous.species : null,
      });
      tree =
        (await repo.insertTree({
          studentId,
          monthKey,
          species,
          monthlyTarget,
          careModel: 'actions',
          finalStage: null,
          monthEcoDrops: null,
          createdAt: now,
          finalizedAt: null,
        })) || (await repo.findTree(studentId, monthKey));
      await finalizePrevious(studentId, monthKey, now);
    }
    return tree;
  }

  function view(tree, growthPoints, isCurrent) {
    const finalized = !isCurrent && tree.finalizedAt != null;
    const points = finalized ? Number(tree.monthEcoDrops) || 0 : growthPoints;
    const stageIndex = finalized
      ? Math.min(config.STAGES.length - 1, Math.max(0, Number(tree.finalStage) || 0))
      : domain.stageIndexFor(points, tree.monthlyTarget);
    const s = config.STAGES[stageIndex];
    return {
      monthKey: tree.monthKey,
      label: domain.monthLabel(tree.monthKey),
      species: tree.species,
      isCurrent,
      readOnly: !isCurrent,
      stage: { index: stageIndex, key: s.key, name: s.name, asset: s.asset, ambient: s.ambient },
      progressPercent: domain.progressPercent(points, tree.monthlyTarget),
      growthPoints: points,
      monthEcoDrops: points,
      monthlyTarget: tree.monthlyTarget,
      nextStage: isCurrent ? domain.nextStageInfo(points, tree.monthlyTarget) : null,
    };
  }

  async function balances(studentId) {
    const totals = repo.getDropTotals
      ? await repo.getDropTotals(studentId)
      : { earned: await repo.getTotalDrops(studentId), spent: 0 };
    const earned = Math.max(0, Number(totals.earned) || 0);
    const spent = Math.max(0, Number(totals.spent) || 0);
    return { totalEarned: earned, totalSpent: spent, availableDrops: Math.max(0, earned - spent) };
  }

  async function getCurrent(studentId, now = new Date()) {
    let tree = await ensureCurrentMonthTree(studentId, now);
    await grandfatherCurrentTree(repo, { studentId, monthKey: tree.monthKey, now });
    tree = (await repo.findTree(studentId, tree.monthKey)) || tree;
    const points = await repo.sumGrowthPoints(studentId, tree.monthKey);
    const computed = await computeTarget(studentId, tree.monthKey);
    const target = domain.reconcileTarget(tree.monthlyTarget, computed, points);
    if (target !== tree.monthlyTarget) {
      await repo.setTreeTarget(studentId, tree.monthKey, target);
      tree = { ...tree, monthlyTarget: target };
    }
    const [treeCount, wallet] = await Promise.all([repo.countTrees(studentId), balances(studentId)]);
    return {
      tree: view(tree, points, true),
      totalEcoDrops: wallet.availableDrops,
      availableDrops: wallet.availableDrops,
      totalEarned: wallet.totalEarned,
      hasHistory: treeCount > 1,
      stages: publicStages(),
      care: require('./care.config').ACTIONS,
      timeZone,
    };
  }

  /** Past trees only. Does not create a current tree (read-only). */
  async function getHistory(studentId, now = new Date()) {
    const monthKey = domain.monthKeyOf(now, timeZone);
    const trees = await repo.listTrees(studentId);
    return trees
      .filter((t) => domain.compareMonthKeys(t.monthKey, monthKey) < 0)
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
    const points = tree.finalizedAt != null ? Number(tree.monthEcoDrops) || 0 : await repo.sumGrowthPoints(studentId, monthKey);
    return view(tree, points, false);
  }

  return { ensureCurrentMonthTree, getCurrent, getHistory, getTree, computeTarget, view, balances };
}

module.exports = { createGardenService, publicStages };
