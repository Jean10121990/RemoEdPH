const mongoose = require('mongoose');

/**
 * Monthly teacher leaderboard snapshot (Asia/Manila calendar month).
 * Points: lessons completed + 5★ ratings + punctuality bonus + badges awarded.
 */
const monthlyTeacherScoreSchema = new mongoose.Schema(
  {
    teacherId: { type: String, required: true, index: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/, index: true },
    totalPoints: { type: Number, default: 0 },
    lessonsCompletedCount: { type: Number, default: 0 },
    avgStudentRating: { type: Number, default: 0 },
    punctualityScore: { type: Number, default: 0 },
    badgesAwardedCount: { type: Number, default: 0 },
    fiveStarCount: { type: Number, default: 0 },
    rank: { type: Number, default: null },
    earliestAt: { type: Date, default: null },
  },
  { timestamps: true }
);

monthlyTeacherScoreSchema.index({ month: 1, teacherId: 1 }, { unique: true });
monthlyTeacherScoreSchema.index({ month: 1, rank: 1 });

module.exports = mongoose.model('MonthlyTeacherScore', monthlyTeacherScoreSchema);
