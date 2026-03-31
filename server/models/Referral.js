const mongoose = require('mongoose');
const { piiContactString } = require('../utils/piiMongoose');

const referralSchema = new mongoose.Schema(
  {
    referralCode: { type: String, required: true, index: true },
    ownerType: { type: String, enum: ['teacher', 'admin'], required: true, index: true },
    ownerId: { type: String, required: true, index: true }, // teacherId or admin username
    teacherId: { type: String, required: true, index: true }, // legacy mirror of ownerId for compatibility
    studentId: { type: String, required: true, index: true }, // Student _id as string
    studentName: { type: String, default: '' },
    studentEmail: { type: String, default: '' },
    studentContact: piiContactString(''),
    subscriptionPlan: { type: String, default: '' }, // 1month/3months/6months/1year
    amountPaid: { type: Number, default: 0 }, // subscription amount (PHP)
    commissionAmount: { type: Number, default: 500 }, // fixed commission per successful enrollee
    status: { type: String, enum: ['pending', 'successful', 'void'], default: 'successful' }
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

// Prevent duplicate commission per student per referrer
referralSchema.index({ ownerType: 1, ownerId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('Referral', referralSchema);

