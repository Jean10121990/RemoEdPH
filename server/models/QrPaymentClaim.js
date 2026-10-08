const mongoose = require('mongoose');

const qrPaymentClaimSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    username: { type: String, required: true },
    planId: { type: String, required: true },
    amountPhp: { type: Number, required: true },
    referenceNormalized: { type: String, required: true },
    referenceDisplay: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'rejected'],
      default: 'pending',
      index: true,
    },
    confirmedBy: { type: String, default: '' },
    confirmedAt: { type: Date, default: null },
    rejectedBy: { type: String, default: '' },
    rejectedAt: { type: Date, default: null },
    creditsAdded: { type: Number, default: 0 },
  },
  { timestamps: true }
);

qrPaymentClaimSchema.index(
  { referenceNormalized: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ['pending', 'confirmed'] } },
  }
);

module.exports = mongoose.model('QrPaymentClaim', qrPaymentClaimSchema);
