/**
 * In-memory garden repository for node:test. Same methods as createMongoRepository.
 */
function createMemoryRepo(seed = {}) {
  const students = new Map();
  (seed.students || [{ username: 'mia', profilePicture: '', totalEcoDrops: 0 }]).forEach((s) => {
    students.set(s.username, {
      ...s,
      totalEcoDrops: Number(s.totalEcoDrops) || 0,
      totalSpent: Number(s.totalSpent) || 0,
    });
  });
  const ledger = [];
  const ledgerKeys = new Set();
  const trees = [];
  const care = [];
  const requestIds = new Set();
  let lessonCount = seed.lessons != null ? seed.lessons : 8;
  let taskCount = seed.tasks != null ? seed.tasks : 0;
  let nextId = 1;

  function treeKey(studentId, monthKey) {
    return studentId + '|' + monthKey;
  }

  function ledgerKey(entry) {
    return [entry.studentId, entry.sourceType, entry.sourceId, entry.monthKey].join('|');
  }

  function earliestMatch(list) {
    return list
      .slice()
      .sort((a, b) => {
        const ta = new Date(a.createdAt || 0).getTime();
        const tb = new Date(b.createdAt || 0).getTime();
        if (ta !== tb) return ta - tb;
        return String(a._id || '') < String(b._id || '') ? -1 : 1;
      })[0] || null;
  }

  return {
    setLessonCount(n) { lessonCount = n; },
    setTaskCount(n) { taskCount = n; },
    ledger() { return ledger.slice(); },
    trees() { return trees.slice(); },
    careActions() { return care.slice(); },
    allowDuplicateTrees: !!seed.allowDuplicateTrees,

    async resolveStudent(key) {
      const s = students.get(String(key || ''));
      if (!s) return null;
      return {
        username: s.username,
        profilePicture: s.profilePicture || '',
        totalEcoDrops: Math.max(0, s.totalEcoDrops - (s.totalSpent || 0)),
        totalEarned: s.totalEcoDrops,
        totalSpent: s.totalSpent || 0,
      };
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

    async getDropTotals(studentId) {
      const s = students.get(studentId);
      return { earned: s ? s.totalEcoDrops : 0, spent: s ? s.totalSpent || 0 : 0 };
    },

    async findTree(studentId, monthKey) {
      const match = trees.filter((x) => x.studentId === studentId && x.monthKey === monthKey);
      const t = earliestMatch(match);
      return t ? { ...t } : null;
    },

    async insertTree(doc) {
      if (!this.allowDuplicateTrees && trees.some((t) => t.studentId === doc.studentId && t.monthKey === doc.monthKey)) {
        return null;
      }
      const row = { ...doc, _id: 't' + nextId++ };
      trees.push(row);
      return { ...row };
    },

    forcePushTree(doc) {
      trees.push({ ...doc, _id: doc._id || 't' + nextId++ });
    },

    async latestTreeBefore(studentId, monthKey) {
      return trees
        .filter((t) => t.studentId === studentId && t.monthKey < monthKey)
        .sort((a, b) => (a.monthKey < b.monthKey ? 1 : -1))[0] || null;
    },

    async countTrees(studentId) {
      const keys = new Set(trees.filter((t) => t.studentId === studentId).map((t) => t.monthKey));
      return keys.size;
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

    async setTreeCareModel(studentId, monthKey, careModel, backup) {
      const t = trees.find((x) => x.studentId === studentId && x.monthKey === monthKey);
      if (!t) return;
      t.careModel = careModel;
      if (backup) t.grandfatherBackup = backup;
    },

    async listTrees(studentId) {
      const byMonth = new Map();
      trees
        .filter((t) => t.studentId === studentId)
        .forEach((t) => {
          const cur = byMonth.get(t.monthKey);
          if (!cur) byMonth.set(t.monthKey, t);
          else {
            const winner = earliestMatch([cur, t]);
            byMonth.set(t.monthKey, winner);
          }
        });
      return Array.from(byMonth.values())
        .sort((a, b) => (a.monthKey < b.monthKey ? -1 : 1))
        .map((t) => ({ ...t }));
    },

    async sumGrowthPoints(studentId, monthKey) {
      return care
        .filter((c) => c.studentId === studentId && c.monthKey === monthKey)
        .reduce((n, c) => n + (Number(c.growthPoints) || 0), 0);
    },

    async findCareByRequestId(studentId, requestId) {
      const row = care.find((c) => c.studentId === studentId && c.requestId === requestId);
      return row ? { ...row } : null;
    },

    async countFertilizerAtStage(studentId, monthKey, stageAt) {
      return care.filter(
        (c) => c.studentId === studentId && c.monthKey === monthKey && c.action === 'fertilize' && c.stageAt === stageAt
      ).length;
    },

    async insertCareAction(doc) {
      if (requestIds.has(doc.requestId)) {
        const existing = care.find((c) => c.requestId === doc.requestId);
        return { inserted: false, duplicate: 'requestId', doc: existing ? { ...existing } : null };
      }
      if (
        doc.action === 'fertilize' &&
        care.some(
          (c) =>
            c.studentId === doc.studentId &&
            c.monthKey === doc.monthKey &&
            c.action === 'fertilize' &&
            c.stageAt === doc.stageAt
        )
      ) {
        return { inserted: false, duplicate: 'fertilizer', doc: null };
      }
      requestIds.add(doc.requestId);
      const row = { ...doc, _id: 'c' + nextId++ };
      care.push(row);
      return { inserted: true, doc: { ...row } };
    },

    async deleteCareAction(doc) {
      if (!doc) return;
      const i = care.findIndex((c) => (doc._id && c._id === doc._id) || c.requestId === doc.requestId);
      if (i >= 0) {
        requestIds.delete(care[i].requestId);
        care.splice(i, 1);
      }
    },

    async trySpend(studentId, cost) {
      const n = Math.max(0, Math.floor(Number(cost) || 0));
      const s = students.get(studentId);
      if (!s) return false;
      if (s.totalEcoDrops - (s.totalSpent || 0) < n) return false;
      s.totalSpent = (s.totalSpent || 0) + n;
      return true;
    },

    async addSpent(studentId, amount) {
      const s = students.get(studentId);
      if (!s) return;
      s.totalSpent = (s.totalSpent || 0) + Math.max(0, Math.floor(Number(amount) || 0));
    },

    async countMonthlyLessons() { return lessonCount; },
    async countMonthlyTasks() { return taskCount; },

    treeKey,
  };
}

module.exports = { createMemoryRepo };
