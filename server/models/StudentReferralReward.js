const mongoose = require('mongoose');
const { REFERRAL_REWARD_MAX } = require('../config/studentReferral');

const studentReferralRewardSchema = new mongoose.Schema(
  {
    referrerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    referredUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      unique: true,
    },
    paymentId: { type: String, required: true, trim: true },
    creditsAwarded: {
      type: Number,
      required: true,
      min: 0,
      max: REFERRAL_REWARD_MAX,
      default: 0,
    },
    /** One-time peso bonus for the referring parent. Older rows used creditsAwarded instead. */
    bonusPhp: { type: Number, default: 0, min: 0 },
    reversedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'referral_rewards' }
);

module.exports = mongoose.model('StudentReferralReward', studentReferralRewardSchema);
