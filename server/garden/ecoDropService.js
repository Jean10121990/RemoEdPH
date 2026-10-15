/**
 * The only way to earn an Eco-Drop. Called server-side by the lesson, task, and game
 * completion handlers after their own pass/finish checks; there is no client "add drop" route.
 *
 * Idempotency is the unique (studentId, sourceType, sourceId, monthKey) index on
 * eco_drop_ledger: retries, double clicks, and concurrent calls insert at most one row.
 */
const config = require('./garden.config');
const domain = require('./domain');

const SOURCE_TYPES = new Set(['lesson', 'task', 'game']);

function stageSummary(stage) {
  return { index: stage.index, key: stage.key, name: stage.name };
}

function createEcoDropService({ repo, garden, rewardMode = config.GAME_REWARD_MODE }) {
  /**
   * @param {{ studentId: string, sourceType: 'lesson'|'task'|'game', sourceId: string, playId?: string, now?: Date }} args
   * @returns {Promise<{ awarded: boolean, totalEcoDrops: number, monthEcoDrops: number, stageBefore: object|null, stageAfter: object|null, monthKey?: string, monthlyTarget?: number, reason?: string }>}
   */
  async function award({ studentId, sourceType, sourceId, playId = '', now = new Date() }) {
    const empty = { awarded: false, totalEcoDrops: 0, monthEcoDrops: 0, stageBefore: null, stageAfter: null };
    if (!SOURCE_TYPES.has(sourceType)) return { ...empty, reason: 'invalid_source_type' };
    const rawId = String(sourceId || '').trim();
    if (!rawId || rawId.length > 120) return { ...empty, reason: 'invalid_source_id' };

    const student = await repo.resolveStudent(studentId);
    if (!student) return { ...empty, reason: 'student_not_found' };
    const username = student.username;

    const ledgerId = domain.ledgerSourceId({ sourceType, sourceId: rawId, playId }, rewardMode);
    if (!ledgerId) return { ...empty, reason: 'invalid_play' };

    const tree = await garden.ensureCurrentMonthTree(username, now);
    const target = tree.monthlyTarget;

    let inserted = false;
    let reason = 'already_awarded';
    const once = domain.paysOnceEver(sourceType, rewardMode);
    if (!(once && (await repo.hasLedgerEntry({ studentId: username, sourceType, sourceId: ledgerId })))) {
      const res = await repo.insertLedgerAndIncrement(
        { studentId: username, sourceType, sourceId: ledgerId, monthKey: tree.monthKey, createdAt: now },
        { celebrate: sourceType === 'lesson' }
      );
      inserted = res.inserted;
      if (inserted) reason = undefined;
    }

    const [after, totals, points] = await Promise.all([
      repo.countMonthDrops(username, tree.monthKey),
      repo.getDropTotals
        ? repo.getDropTotals(username)
        : repo.getTotalDrops(username).then((earned) => ({ earned, spent: 0 })),
      repo.sumGrowthPoints ? repo.sumGrowthPoints(username, tree.monthKey) : Promise.resolve(0),
    ]);
    const earned = Math.max(0, Number(totals.earned) || 0);
    const spent = Math.max(0, Number(totals.spent) || 0);
    const available = Math.max(0, earned - spent);
    const growth = Math.max(0, Number(points) || 0);
    const result = {
      awarded: inserted,
      totalEcoDrops: available,
      availableDrops: available,
      totalEarned: earned,
      monthEcoDrops: after,
      stageBefore: stageSummary(domain.stageFor(growth, target)),
      stageAfter: stageSummary(domain.stageFor(growth, target)),
      monthKey: tree.monthKey,
      monthlyTarget: target,
    };
    if (reason) result.reason = reason;
    return result;
  }

  return { award };
}

module.exports = { createEcoDropService, SOURCE_TYPES };
