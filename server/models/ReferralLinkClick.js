const mongoose = require('mongoose');

/**
 * Aggregate click counts for a referral / share code (student, teacher, or admin).
 * One document per code. Incremented by public POST /api/public/referral-click.
 */
const referralLinkClickSchema = new mongoose.Schema(
  {
    referralCode: { type: String, required: true, unique: true, trim: true, index: true },
    ownerType: {
      type: String,
      enum: ['student', 'teacher', 'admin', 'unknown'],
      default: 'unknown',
    },
    ownerId: { type: String, default: '' },
    clickCount: { type: Number, default: 0, min: 0 },
    lastClickAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReferralLinkClick', referralLinkClickSchema);
