/**
 * Mongo persistence for the garden. The services depend only on this interface,
 * so tests can pass an in-memory repository with the same methods.
 */
const mongoose = require('mongoose');
const { EcoDropEntry, GardenTree } = require('./models');

function isDuplicateKey(err) {
  return !!(err && (err.code === 11000 || /E11000|duplicate key/i.test(String(err.message || ''))));
}

function transactionsUnsupported(err) {
  const msg = String((err && err.message) || '');
  return !!(err && (err.code === 20 || /Transaction numbers are only allowed|replica set|does not support transactions/i.test(msg)));
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
        .select('username profilePicture totalEcoDropsEarned')
        .lean();
      if (!doc || !doc.username) return null;
      return {
        username: String(doc.username),
        profilePicture: doc.profilePicture || '',
        totalEcoDrops: Number(doc.totalEcoDropsEarned) || 0,
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
      const doc = await Student.findOne({ username: studentId }).select('totalEcoDropsEarned').lean();
      return doc ? Number(doc.totalEcoDropsEarned) || 0 : 0;
    },

    findTree(studentId, monthKey) {
      return GardenTree.findOne({ studentId, monthKey }).lean();
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

    latestTreeBefore(studentId, monthKey) {
      return GardenTree.findOne({ studentId, monthKey: { $lt: monthKey } }).sort({ monthKey: -1 }).lean();
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

    async setTreeTarget(studentId, monthKey, monthlyTarget) {
      await GardenTree.updateOne({ studentId, monthKey, finalizedAt: null }, { $set: { monthlyTarget } });
    },

    async raiseLastSeenStage(studentId, monthKey, stage) {
      await GardenTree.updateOne({ studentId, monthKey }, { $max: { lastSeenStage: stage } });
      const doc = await GardenTree.findOne({ studentId, monthKey }).select('lastSeenStage').lean();
      return doc ? Number(doc.lastSeenStage) || 0 : 0;
    },

    listTrees(studentId) {
      return GardenTree.find({ studentId }).sort({ monthKey: 1 }).lean();
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

module.exports = { createMongoRepository, isDuplicateKey };
