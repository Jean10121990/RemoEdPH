const mongoose = require('mongoose');

/**
 * Monthly student leaderboard snapshot (Asia/Manila calendar month).
 * Points: badge quality + attendance volume + skill-domain breadth.
 */
const monthlyStudentScoreSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/, index: true },
    totalPoints: { type: Number, default: 0 },
    goldCount: { type: Number, default: 0 },
    silverCount: { type: Number, default: 0 },
    bronzeCount: { type: Number, default: 0 },
    domainCount: { type: Number, default: 0 },
    attendanceCount: { type: Number, default: 0 },
    rank: { type: Number, default: null },
    /** Earliest qualifying event in the month (tie-breaker). */
    earliestAt: { type: Date, default: null },
    /** Age bracket from booking studentLevel / student age (filter key). */
    ageGroup: { type: String, default: 'ALL', index: true },
  },
  { timestamps: true }
);

monthlyStudentScoreSchema.index({ month: 1, studentId: 1 }, { unique: true });
monthlyStudentScoreSchema.index({ month: 1, rank: 1 });
monthlyStudentScoreSchema.index({ month: 1, ageGroup: 1, rank: 1 });

module.exports = mongoose.model('MonthlyStudentScore', monthlyStudentScoreSchema);
