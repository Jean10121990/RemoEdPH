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
  const claims = [];
  const badges = [];
  const decorations = [];
  const grants = [];
  const notices = [];
  const creditGrants = [];
  const shares = [];
  const shareAudits = [];
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
      const sequence = doc.sequence || 1;
      if (
        !this.allowDuplicateTrees &&
        trees.some((t) => t.studentId === doc.studentId && t.monthKey === doc.monthKey && (t.sequence || 1) === sequence)
      ) {
        return null;
      }
      const row = { ...doc, sequence, _id: doc._id || 't' + nextId++ };
      trees.push(row);
      return { ...row };
    },

    forcePushTree(doc) {
      trees.push({ ...doc, _id: doc._id || 't' + nextId++ });
    },

    async latestTreeBefore(studentId, monthKey) {
      const older = trees.filter((t) => t.studentId === studentId && t.monthKey < monthKey);
      if (!older.length) return null;
      const latestMonth = older.map((t) => t.monthKey).sort().pop();
      return earliestMatch(older.filter((t) => t.monthKey === latestMonth));
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

    async setTreeTarget(studentId, monthKey, monthlyTarget, backup) {
      const t = trees.find((x) => x.studentId === studentId && x.monthKey === monthKey && !x.finalizedAt);
      if (!t) return;
      const prev = t.grandfatherBackup && typeof t.grandfatherBackup === 'object' ? t.grandfatherBackup : {};
      if (prev.monthlyTargetBefore == null) {
        t.grandfatherBackup = { ...prev, ...(backup || {}), monthlyTargetBefore: t.monthlyTarget };
      }
      t.monthlyTarget = monthlyTarget;
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

    async sumGrowthPoints(studentId, monthKey, sequence = 1) {
      return care
        .filter((c) => c.studentId === studentId && c.monthKey === monthKey && (c.sequence || 1) === sequence)
        .reduce((n, c) => n + (Number(c.growthPoints) || 0), 0);
    },

    async findCareByRequestId(studentId, requestId) {
      const row = care.find((c) => c.studentId === studentId && c.requestId === requestId);
      return row ? { ...row } : null;
    },

    async countFertilizerAtStage(studentId, monthKey, stageAt, sequence = 1) {
      return care.filter(
        (c) =>
          c.studentId === studentId &&
          c.monthKey === monthKey &&
          c.action === 'fertilize' &&
          c.stageAt === stageAt &&
          (c.sequence || 1) === sequence
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
            c.stageAt === doc.stageAt &&
            (c.sequence || 1) === (doc.sequence || 1)
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

    findTreeById(id) {
      const t = trees.find((row) => String(row._id) === String(id));
      return t ? { ...t } : null;
    },

    async findTreeBySequence(studentId, monthKey, sequence) {
      const t = trees.find((row) => row.studentId === studentId && row.monthKey === monthKey && (row.sequence || 1) === sequence);
      return t ? { ...t } : null;
    },

    async listAllTrees(studentId) {
      return trees
        .filter((t) => t.studentId === studentId)
        .sort((a, b) => (a.monthKey === b.monthKey ? (a.sequence || 1) - (b.sequence || 1) : a.monthKey < b.monthKey ? -1 : 1))
        .map((t) => ({ ...t }));
    },

    async completeTree(id, patch) {
      const t = trees.find((row) => String(row._id) === String(id));
      if (t && !t.completedAt) Object.assign(t, patch);
    },

    async markTreeClaimed(id, patch) {
      const t = trees.find((row) => String(row._id) === String(id));
      if (t) Object.assign(t, patch);
    },

    async countLedger(studentId, monthKey, sourceType) {
      return ledger.filter((e) => e.studentId === studentId && e.monthKey === monthKey && e.sourceType === sourceType).length;
    },

    async findClaim(studentId, treeId) {
      const row = claims.find((c) => c.studentId === studentId && String(c.treeId) === String(treeId));
      return row ? { ...row } : null;
    },

    async listClaims(studentId) {
      return claims.filter((c) => c.studentId === studentId).map((c) => ({ ...c }));
    },

    async insertClaim(doc) {
      if (claims.some((c) => c.studentId === doc.studentId && String(c.treeId) === String(doc.treeId))) return null;
      claims.push({ ...doc });
      return { ...doc };
    },

    async markReminder(treeId, now) {
      const row = claims.find((c) => String(c.treeId) === String(treeId));
      if (row && !row.reminderSentAt) row.reminderSentAt = now;
    },

    async notify(studentId, note) {
      notices.push({ studentId, ...note });
    },

    async grantLessonCredits({ studentId, claimId, credits, expiresAt }) {
      const n = Math.max(0, Math.floor(Number(credits) || 0));
      if (!n) return { granted: false, credits: 0 };
      if (grants.some((g) => g.claimId === String(claimId))) return { granted: false, credits: n };
      grants.push({ studentId, claimId: String(claimId), credits: n });
      const s = students.get(studentId);
      if (s) {
        s.lessonCredits = (s.lessonCredits || 0) + n;
        s.creditLots = s.creditLots || [];
        s.creditLots.push({
          creditsRemaining: n,
          expiresAt,
          paymentId: String(claimId),
        });
      }
      return { granted: true, credits: n };
    },

    grants() { return grants.slice(); },
    notices() { return notices.slice(); },

    async listBadges(studentId) {
      return badges.filter((b) => b.studentId === studentId).map((b) => ({ ...b }));
    },

    async insertBadge(doc) {
      if (badges.some((b) => b.studentId === doc.studentId && b.badgeKey === doc.badgeKey)) return false;
      badges.push({ ...doc });
      return true;
    },

    async listDecorations(studentId) {
      return decorations.filter((d) => d.studentId === studentId).map((d) => ({ ...d }));
    },

    async insertDecoration(doc) {
      if (decorations.some((d) => d.studentId === doc.studentId && d.itemKey === doc.itemKey)) return false;
      decorations.push({ ...doc });
      return true;
    },

    async deleteDecoration(studentId, itemKey) {
      const i = decorations.findIndex((d) => d.studentId === studentId && d.itemKey === itemKey);
      if (i >= 0) decorations.splice(i, 1);
    },

    profile(studentId) {
      const s = students.get(studentId);
      return s ? { ...s } : null;
    },

    async listLinkedChildren(viewerId) {
      const me = students.get(viewerId);
      if (!me) return [];
      const email = String(me.parentEmail || '').trim().toLowerCase();
      const rows = email
        ? [...students.values()].filter((s) => String(s.parentEmail || '').trim().toLowerCase() === email)
        : [me];
      return rows.map((s) => ({ ...s, creditLots: (s.creditLots || []).map((lot) => ({ ...lot })) }));
    },

    async setSharing(studentId, patch) {
      const s = students.get(studentId);
      if (!s) return false;
      Object.assign(s, patch);
      return true;
    },

    async recordCreditGrant(doc) {
      creditGrants.push({ ...doc });
    },

    async listCreditGrants(monthKey) {
      return creditGrants.filter((row) => !monthKey || row.monthKey === monthKey).map((row) => ({ ...row }));
    },

    async findShareByTarget(studentId, type, targetId) {
      const row = shares.find((s) => s.studentId === studentId && s.type === type && s.targetId === targetId);
      return row ? { ...row } : null;
    },

    async findShareById(shareId) {
      const row = shares.find((s) => s.shareId === shareId);
      return row ? { ...row } : null;
    },

    async insertShare(doc) {
      if (shares.some((s) => s.studentId === doc.studentId && s.type === doc.type && s.targetId === doc.targetId)) return null;
      shares.push({ ...doc });
      return { ...doc };
    },

    async clearRevoke(shareId) {
      const row = shares.find((s) => s.shareId === shareId);
      if (row) row.revokedAt = null;
    },

    async revokeShare(shareId, now, by) {
      const row = shares.find((s) => s.shareId === shareId);
      if (!row) return;
      row.revokedAt = now;
      row.audit = row.audit || [];
      row.audit.push({ action: 'revoke', at: now, by });
    },

    async bumpView(shareId) {
      const row = shares.find((s) => s.shareId === shareId);
      if (row) row.viewCount = (row.viewCount || 0) + 1;
    },

    async shareAudit(doc) {
      shareAudits.push({ ...doc });
    },

    shareAudits() { return shareAudits.slice(); },

    async countMonthlyLessons() { return lessonCount; },
    async countMonthlyTasks() { return taskCount; },

    treeKey,
  };
}

module.exports = { createMemoryRepo };
