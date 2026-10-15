/**
 * In-memory garden repository for node:test. Same methods as createMongoRepository.
 */
function createMemoryRepo(seed = {}) {
  const students = new Map();
  (seed.students || [{ username: 'mia', profilePicture: '', totalEcoDrops: 0 }]).forEach((s) => {
    students.set(s.username, { ...s, totalEcoDrops: Number(s.totalEcoDrops) || 0 });
  });
  const ledger = [];
  const ledgerKeys = new Set();
  const trees = [];
  let lessonCount = seed.lessons != null ? seed.lessons : 8;
  let taskCount = seed.tasks != null ? seed.tasks : 0;

  function treeKey(studentId, monthKey) {
    return studentId + '|' + monthKey;
  }

  function ledgerKey(entry) {
    return [entry.studentId, entry.sourceType, entry.sourceId, entry.monthKey].join('|');
  }

  return {
    setLessonCount(n) { lessonCount = n; },
    setTaskCount(n) { taskCount = n; },
    ledger() { return ledger.slice(); },
    trees() { return trees.slice(); },

    async resolveStudent(key) {
      const s = students.get(String(key || ''));
      return s ? { username: s.username, profilePicture: s.profilePicture || '', totalEcoDrops: s.totalEcoDrops } : null;
    },

    async hasLedgerEntry({ studentId, sourceType, sourceId }) {
      return ledger.some((e) => e.studentId === studentId && e.sourceType === sourceType && e.sourceId === sourceId);
    },

    async insertLedgerAndIncrement(entry) {
      const key = ledgerKey(entry);
      if (ledgerKeys.has(key)) return { inserted: false };
      ledgerKeys.add(key);
      ledger.push({ ...entry });
      const s = students.get(entry.studentId);
      if (s) s.totalEcoDrops += 1;
      return { inserted: true };
    },

    async countMonthDrops(studentId, monthKey) {
      return ledger.filter((e) => e.studentId === studentId && e.monthKey === monthKey).length;
    },

    async getTotalDrops(studentId) {
      const s = students.get(studentId);
      return s ? s.totalEcoDrops : 0;
    },

    async findTree(studentId, monthKey) {
      const t = trees.find((x) => x.studentId === studentId && x.monthKey === monthKey);
      return t ? { ...t } : null;
    },

    async insertTree(doc) {
      if (trees.some((t) => t.studentId === doc.studentId && t.monthKey === doc.monthKey)) return null;
      const row = { ...doc };
      trees.push(row);
      return { ...row };
    },

    async latestTreeBefore(studentId, monthKey) {
      return trees
        .filter((t) => t.studentId === studentId && t.monthKey < monthKey)
        .sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1))[0] || null;
    },

    async countTrees(studentId) {
      return trees.filter((t) => t.studentId === studentId).length;
    },

    async listUnfinalizedBefore(studentId, monthKey) {
      return trees.filter((t) => t.studentId === studentId && t.monthKey < monthKey && !t.finalizedAt).map((t) => ({ ...t }));
    },

    async finalizeTree(studentId, monthKey, patch) {
      const t = trees.find((x) => x.studentId === studentId && x.monthKey === monthKey && !x.finalizedAt);
      if (t) Object.assign(t, patch);
    },

    async setTreeTarget(studentId, monthKey, monthlyTarget) {
      const t = trees.find((x) => x.studentId === studentId && x.monthKey === monthKey && !x.finalizedAt);
      if (t) t.monthlyTarget = monthlyTarget;
    },

    async raiseLastSeenStage(studentId, monthKey, stage) {
      const t = trees.find((x) => x.studentId === studentId && x.monthKey === monthKey);
      if (!t) return 0;
      t.lastSeenStage = Math.max(Number(t.lastSeenStage) || 0, stage);
      return t.lastSeenStage;
    },

    async listTrees(studentId) {
      return trees.filter((t) => t.studentId === studentId).sort((a, b) => (a.monthKey < b.monthKey ? -1 : 1)).map((t) => ({ ...t }));
    },

    async countMonthlyLessons() { return lessonCount; },
    async countMonthlyTasks() { return taskCount; },

    treeKey,
  };
}

module.exports = { createMemoryRepo };
