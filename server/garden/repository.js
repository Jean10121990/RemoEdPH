/**
 * Mongo persistence for the garden. The services depend only on this interface,
 * so tests can pass an in-memory repository with the same methods.
 */
const mongoose = require('mongoose');
const {
  EcoDropEntry,
  GardenTree,
  CareAction,
  GardenRewardClaim,
  GardenStudentBadge,
  GardenDecoration,
} = require('./models');

function isDuplicateKey(err) {
  return !!(err && (err.code === 11000 || /E11000|duplicate key/i.test(String(err.message || ''))));
}

function transactionsUnsupported(err) {
  const msg = String((err && err.message) || '');
  return !!(err && (err.code === 20 || /Transaction numbers are only allowed|replica set|does not support transactions/i.test(msg)));
}

function fertilizerDup(err) {
  const msg = String((err && err.message) || '');
  return isDuplicateKey(err) && /stageAt|fertilize/i.test(msg);
}

async function ensureGardenIndexes() {
  await GardenTree.updateMany({ sequence: { $exists: false } }, { $set: { sequence: 1 } });
  await CareAction.updateMany({ sequence: { $exists: false } }, { $set: { sequence: 1 } });
  await GardenTree.syncIndexes();
  await CareAction.syncIndexes();
}

function createMongoRepository() {
  const Student = require('../models/Student');
  const Booking = require('../models/Booking');
  const LessonCheckpointAttempt = require('../models/LessonCheckpointAttempt');
  const { isMongoObjectId } = require('../utils/mongoObjectId');
  let canUseTransactions = true;

  async function aliasesFor(username) {
    try {
      const studentBadgeService = require('../services/studentBadgeService');
      const list = await studentBadgeService.resolveStudentIdAliases(username);
      return list && list.length ? list : [username];
    } catch (_e) {
      return [username];
    }
  }

  async function writeEntry(entry, opts, session) {
    await EcoDropEntry.create([entry], session ? { session } : {});
    const inc = { totalEcoDropsEarned: 1 };
    if (opts && opts.celebrate) inc.pendingEcoDropCelebration = 1;
    await Student.updateOne({ username: entry.studentId }, { $inc: inc }, session ? { session } : {});
  }

  return {
    async resolveStudent(key) {
      const sid = String(key || '').trim();
      if (!sid) return null;
      const or = [{ username: sid }, { email: sid.toLowerCase() }, { studentCode: sid }];
      if (isMongoObjectId(sid)) or.push({ _id: sid });
      const doc = await Student.findOne({ $or: or })
        .select('username profilePicture totalEcoDropsEarned totalEcoDropsSpent')
        .lean();
      if (!doc || !doc.username) return null;
      const earned = Number(doc.totalEcoDropsEarned) || 0;
      const spent = Number(doc.totalEcoDropsSpent) || 0;
      return {
        username: String(doc.username),
        profilePicture: doc.profilePicture || '',
        totalEcoDrops: Math.max(0, earned - spent),
        totalEarned: earned,
        totalSpent: spent,
      };
    },

    async hasLedgerEntry({ studentId, sourceType, sourceId }) {
      return !!(await EcoDropEntry.exists({ studentId, sourceType, sourceId }));
    },

    /** Ledger row + cached total in one unit. Duplicate key = { inserted: false }. */
    async insertLedgerAndIncrement(entry, opts = {}) {
      try {
        if (canUseTransactions) {
          const session = await mongoose.startSession();
          try {
            await session.withTransaction(() => writeEntry(entry, opts, session));
            return { inserted: true };
          } catch (err) {
            if (!transactionsUnsupported(err)) throw err;
            canUseTransactions = false;
          } finally {
            await session.endSession();
          }
        }
        await writeEntry(entry, opts, null);
        return { inserted: true };
      } catch (err) {
        if (isDuplicateKey(err)) return { inserted: false };
        throw err;
      }
    },

    countMonthDrops(studentId, monthKey) {
      return EcoDropEntry.countDocuments({ studentId, monthKey });
    },

    async getTotalDrops(studentId) {
      const totals = await this.getDropTotals(studentId);
      return totals.earned;
    },

    async getDropTotals(studentId) {
      const doc = await Student.findOne({ username: studentId })
        .select('totalEcoDropsEarned totalEcoDropsSpent')
        .lean();
      return {
        earned: doc ? Number(doc.totalEcoDropsEarned) || 0 : 0,
        spent: doc ? Number(doc.totalEcoDropsSpent) || 0 : 0,
      };
    },

    /** Earliest row wins if a race left duplicates. */
    findTree(studentId, monthKey) {
      return GardenTree.findOne({ studentId, monthKey }).sort({ createdAt: 1, _id: 1 }).lean();
    },

    /** Returns the inserted tree, or null if another request created it first. */
    async insertTree(doc) {
      try {
        const created = await GardenTree.create(doc);
        return created.toObject();
      } catch (err) {
        if (isDuplicateKey(err)) return null;
        throw err;
      }
    },

    /** Earliest tree of the latest previous month. Duplicate rows must not change the next species. */
    latestTreeBefore(studentId, monthKey) {
      return GardenTree.findOne({ studentId, monthKey: { $lt: monthKey } })
        .sort({ monthKey: -1, createdAt: 1, _id: 1 })
        .lean();
    },

    countTrees(studentId) {
      return GardenTree.countDocuments({ studentId });
    },

    listUnfinalizedBefore(studentId, monthKey) {
      return GardenTree.find({ studentId, monthKey: { $lt: monthKey }, finalizedAt: null }).lean();
    },

    async finalizeTree(studentId, monthKey, { finalStage, monthEcoDrops, finalizedAt }) {
      await GardenTree.updateOne(
        { studentId, monthKey, finalizedAt: null },
        { $set: { finalStage, monthEcoDrops, finalizedAt } }
      );
    },

    async setTreeTarget(studentId, monthKey, monthlyTarget, backup) {
      const tree = await this.findTree(studentId, monthKey);
      if (!tree || tree.finalizedAt) return;
      const prev = tree.grandfatherBackup && typeof tree.grandfatherBackup === 'object' ? tree.grandfatherBackup : {};
      const grandfatherBackup = prev.monthlyTargetBefore != null
        ? prev
        : { ...prev, ...(backup || {}), monthlyTargetBefore: tree.monthlyTarget };
      await GardenTree.updateOne(
        { studentId, monthKey, finalizedAt: null },
        { $set: { monthlyTarget, grandfatherBackup } }
      );
    },

    async setTreeCareModel(studentId, monthKey, careModel, backup) {
      const $set = { careModel };
      if (backup) $set.grandfatherBackup = backup;
      await GardenTree.updateOne({ studentId, monthKey }, { $set });
    },

    async listTrees(studentId) {
      const rows = await GardenTree.find({ studentId }).sort({ monthKey: 1, createdAt: 1, _id: 1 }).lean();
      const byMonth = new Map();
      rows.forEach((row) => {
        if (!byMonth.has(row.monthKey)) byMonth.set(row.monthKey, row);
      });
      return Array.from(byMonth.values());
    },

    async sumGrowthPoints(studentId, monthKey, sequence = 1) {
      const rows = await CareAction.aggregate([
        { $match: { studentId, monthKey, $or: [{ sequence }, { sequence: { $exists: false } }, { sequence: null }] } },
        { $group: { _id: null, n: { $sum: '$growthPoints' } } },
      ]);
      if (sequence !== 1) {
        const only = await CareAction.aggregate([
          { $match: { studentId, monthKey, sequence } },
          { $group: { _id: null, n: { $sum: '$growthPoints' } } },
        ]);
        return only.length ? Number(only[0].n) || 0 : 0;
      }
      return rows.length ? Number(rows[0].n) || 0 : 0;
    },

    findCareByRequestId(studentId, requestId) {
      return CareAction.findOne({ studentId, requestId }).lean();
    },

    countFertilizerAtStage(studentId, monthKey, stageAt, sequence = 1) {
      const seq = sequence === 1
        ? { $or: [{ sequence: 1 }, { sequence: { $exists: false } }, { sequence: null }] }
        : { sequence };
      return CareAction.countDocuments({ studentId, monthKey, action: 'fertilize', stageAt, ...seq });
    },

    async insertCareAction(doc) {
      try {
        const created = await CareAction.create(doc);
        return { inserted: true, doc: created.toObject() };
      } catch (err) {
        if (isDuplicateKey(err)) {
          const byReq = await CareAction.findOne({ requestId: doc.requestId }).lean();
          if (byReq) return { inserted: false, duplicate: 'requestId', doc: byReq };
          if (fertilizerDup(err) || doc.action === 'fertilize') {
            const fert = await CareAction.findOne({
              studentId: doc.studentId,
              monthKey: doc.monthKey,
              action: 'fertilize',
              stageAt: doc.stageAt,
            }).lean();
            return { inserted: false, duplicate: 'fertilizer', doc: fert };
          }
          return { inserted: false, duplicate: 'unknown', doc: null };
        }
        throw err;
      }
    },

    async deleteCareAction(doc) {
      if (!doc) return;
      if (doc._id) {
        await CareAction.deleteOne({ _id: doc._id });
        return;
      }
      if (doc.requestId) await CareAction.deleteOne({ requestId: doc.requestId });
    },

    async trySpend(studentId, cost) {
      const n = Math.max(0, Math.floor(Number(cost) || 0));
      if (n === 0) return true;
      const res = await Student.updateOne(
        {
          username: studentId,
          $expr: {
            $gte: [
              {
                $subtract: [
                  { $ifNull: ['$totalEcoDropsEarned', 0] },
                  { $ifNull: ['$totalEcoDropsSpent', 0] },
                ],
              },
              n,
            ],
          },
        },
        { $inc: { totalEcoDropsSpent: n } }
      );
      return (res.modifiedCount || 0) > 0 || (res.matchedCount || 0) > 0;
    },

    async addSpent(studentId, amount) {
      const n = Math.max(0, Math.floor(Number(amount) || 0));
      if (n === 0) return;
      await Student.updateOne({ username: studentId }, { $inc: { totalEcoDropsSpent: n } });
    },

    /** Classes scheduled in the month that can still be finished (not cancelled / absent). */
    async countMonthlyLessons(studentId, { start, end }) {
      const ids = await aliasesFor(studentId);
      return Booking.countDocuments({
        studentId: { $in: ids },
        dateTimeUtc: { $gte: start, $lt: end },
        status: { $not: new RegExp('^(cancel|absent)', 'i') },
      });
    },

    /** Lesson checks (tasks) the student opened this month: distinct level + lesson. */
    findTreeById(id) {
      if (!mongoose.Types.ObjectId.isValid(id)) return null;
      return GardenTree.findById(id).lean();
    },

    findTreeBySequence(studentId, monthKey, sequence) {
      return GardenTree.findOne({ studentId, monthKey, sequence }).lean();
    },

    listAllTrees(studentId) {
      return GardenTree.find({ studentId }).sort({ monthKey: 1, sequence: 1, createdAt: 1 }).lean();
    },

    async completeTree(id, patch) {
      await GardenTree.updateOne({ _id: id, completedAt: null }, { $set: patch });
    },

    async markTreeClaimed(id, patch) {
      await GardenTree.updateOne({ _id: id }, { $set: patch });
    },

    countLedger(studentId, monthKey, sourceType) {
      return EcoDropEntry.countDocuments({ studentId, monthKey, sourceType });
    },

    findClaim(studentId, treeId) {
      return GardenRewardClaim.findOne({ studentId, treeId: String(treeId) }).lean();
    },

    listClaims(studentId) {
      return GardenRewardClaim.find({ studentId }).lean();
    },

    async insertClaim(doc) {
      try {
        const created = await GardenRewardClaim.create(doc);
        return created.toObject();
      } catch (err) {
        if (isDuplicateKey(err)) return null;
        throw err;
      }
    },

    async markReminder(treeId, now) {
      await GardenRewardClaim.updateOne(
        { treeId: String(treeId), reminderSentAt: null },
        { $set: { reminderSentAt: now } }
      );
    },

    async notify(studentId, { type, message }) {
      const StudentNotification = require('../models/StudentNotification');
      await StudentNotification.create({ studentId, type, message, importance: 'fyi' });
    },

    async grantLessonCredits({ studentId, claimId, credits, expiresAt, reason }) {
      const n = Math.max(0, Math.floor(Number(credits) || 0));
      const key = String(claimId || '');
      if (!n || !key) return { granted: false, credits: 0 };
      const { buildCreditLot } = require('../services/creditLots');
      const student = await Student.findOne({ username: studentId });
      if (!student) return { granted: false, credits: 0 };
      if ((student.processedPaymentIds || []).includes(key)) return { granted: false, credits: n };
      const lot = buildCreditLot({
        planId: reason === 'badge_reward' ? 'badge_reward' : 'tree_reward',
        planLabel: reason === 'badge_reward' ? 'Garden badge' : 'Tree reward',
        credits: n,
        purchasedAt: new Date(),
        expiresAt,
        paymentId: key,
      });
      const balanceAfter = Number(student.creditBalance || 0) + n;
      const res = await Student.updateOne(
        { _id: student._id, processedPaymentIds: { $ne: key } },
        {
          $inc: { creditBalance: n },
          $push: {
            processedPaymentIds: key,
            creditLots: lot,
            creditHistory: {
              date: new Date(),
              plan: lot.planLabel,
              credits: n,
              amountPaid: 0,
              paymentId: key,
              entryType: 'adjustment',
              balanceAfter,
            },
          },
        }
      );
      return { granted: (res.modifiedCount || 0) > 0, credits: n };
    },

    listBadges(studentId) {
      return GardenStudentBadge.find({ studentId }).lean();
    },

    async insertBadge(doc) {
      try {
        await GardenStudentBadge.create(doc);
        return true;
      } catch (err) {
        if (isDuplicateKey(err)) return false;
        throw err;
      }
    },

    listDecorations(studentId) {
      return GardenDecoration.find({ studentId }).lean();
    },

    async insertDecoration(doc) {
      try {
        await GardenDecoration.create(doc);
        return true;
      } catch (err) {
        if (isDuplicateKey(err)) return false;
        throw err;
      }
    },

    async deleteDecoration(studentId, itemKey) {
      await GardenDecoration.deleteOne({ studentId, itemKey });
    },

    async countMonthlyTasks(studentId, { start, end }) {
      const rows = await LessonCheckpointAttempt.aggregate([
        { $match: { studentId: String(studentId), createdAt: { $gte: start, $lt: end } } },
        { $group: { _id: { level: '$level', lessonNumber: '$lessonNumber' } } },
        { $count: 'n' },
      ]);
      return rows.length ? rows[0].n : 0;
    },
  };
}

module.exports = { createMongoRepository, ensureGardenIndexes, isDuplicateKey };
