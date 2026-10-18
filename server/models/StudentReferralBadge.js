const mongoose = require('mongoose');

const studentReferralBadgeSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    badgeKey: { type: String, required: true, trim: true },
    earnedAt: { type: Date, default: Date.now },
  },
  { collection: 'user_badges' }
);

studentReferralBadgeSchema.index({ studentId: 1, badgeKey: 1 }, { unique: true });

module.exports = mongoose.model('StudentReferralBadge', studentReferralBadgeSchema);
