const mongoose = require('mongoose');

/**
 * Badge awarded to a student by a teacher (growth-mindset recognition).
 */
const studentBadgeSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    badgeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Badge', required: true, index: true },
    badgeKey: { type: String, required: true, index: true },
    awardedByTeacherId: { type: String, required: true, index: true },
    awardedAt: { type: Date, default: Date.now, index: true },
    teacherNote: { type: String, maxlength: 280, default: '' },
    bookingId: { type: String, default: '', index: true },
  },
  { timestamps: true }
);

studentBadgeSchema.index({ studentId: 1, badgeKey: 1, awardedAt: -1 });
studentBadgeSchema.index({ studentId: 1, awardedAt: -1 });

module.exports = mongoose.model('StudentBadge', studentBadgeSchema);
