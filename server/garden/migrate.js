/**
 * Garden data repair: species-stable earliest tree wins, and one-time care grandfather.
 *
 * Grandfather rule (current month only, idempotent):
 *   If the tree is still on the old “drops = growth” model (no careModel: 'actions')
 *   and this month has ledger rows, write one migrate care_action whose growthPoints
 *   (and cost) equal that month’s earned count, then add the same amount to
 *   totalEcoDropsSpent. availableDrops becomes earned − those applied points, so a
 *   Sprout grown from 5 drops stays a Sprout and does not get 5 spendable drops on
 *   top. A second run finds the migrate requestId and changes nothing.
 *
 * Backup: garden_trees.grandfatherBackup stores { monthLedgerCount, earned, spentBefore, appliedAt }.
 * Reversal is safe because the original numbers stay on the tree; do not delete the backup.
 */

function migrateRequestId(studentId, monthKey) {
  return 'migrate:' + String(studentId) + ':' + String(monthKey);
}

function earliestTree(list) {
  return list.slice().sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    if (ta !== tb) return ta - tb;
    return String(a._id || '') < String(b._id || '') ? -1 : 1;
  })[0];
}

/** Keep the earliest-created row per (studentId, monthKey). */
function planTreeDedupes(trees) {
  const groups = new Map();
  (trees || []).forEach((t) => {
    const key = String(t.studentId) + '|' + String(t.monthKey);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });
  const keep = [];
  const drop = [];
  for (const list of groups.values()) {
    const winner = earliestTree(list);
    keep.push(winner);
    list.forEach((t) => {
      if (t !== winner && String(t._id) !== String(winner._id)) drop.push(t);
    });
  }
  return { keep, drop };
}

async function grandfatherCurrentTree(repo, { studentId, monthKey, now = new Date() }) {
  const tree = await repo.findTree(studentId, monthKey);
  if (!tree) return { migrated: false, reason: 'no_tree', applied: 0 };
  if (tree.careModel === 'actions') return { migrated: false, reason: 'already', applied: 0 };

  const requestId = migrateRequestId(studentId, monthKey);
  const existing = repo.findCareByRequestId ? await repo.findCareByRequestId(studentId, requestId) : null;
  if (existing) {
    if (typeof repo.setTreeCareModel === 'function') {
      await repo.setTreeCareModel(studentId, monthKey, 'actions', tree.grandfatherBackup || null);
    }
    return { migrated: false, reason: 'already', applied: 0 };
  }

  const monthLedgerCount = await repo.countMonthDrops(studentId, monthKey);
  const totals = repo.getDropTotals
    ? await repo.getDropTotals(studentId)
    : { earned: await repo.getTotalDrops(studentId), spent: 0 };
  const backup = {
    monthLedgerCount,
    earned: Number(totals.earned) || 0,
    spentBefore: Number(totals.spent) || 0,
    appliedAt: now,
  };

  if (monthLedgerCount > 0) {
    const insert = await repo.insertCareAction({
      studentId,
      monthKey,
      action: 'migrate',
      cost: monthLedgerCount,
      growthPoints: monthLedgerCount,
      stageAt: 0,
      requestId,
      createdAt: now,
    });
    if (insert.inserted && typeof repo.addSpent === 'function') {
      await repo.addSpent(studentId, monthLedgerCount);
    }
  }

  if (typeof repo.setTreeCareModel === 'function') {
    await repo.setTreeCareModel(studentId, monthKey, 'actions', backup);
  }
  return { migrated: true, reason: 'ok', applied: monthLedgerCount, backup };
}

module.exports = { migrateRequestId, earliestTree, planTreeDedupes, grandfatherCurrentTree };
