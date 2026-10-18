const mongoose = require('mongoose');
const { REFERRAL_REWARD_MIN, REFERRAL_REWARD_MAX } = require('../config/studentReferral');

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
      min: REFERRAL_REWARD_MIN,
      max: REFERRAL_REWARD_MAX,
    },
    reversedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'referral_rewards' }
);

module.exports = mongoose.model('StudentReferralReward', studentReferralRewardSchema);
