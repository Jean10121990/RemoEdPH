const mongoose = require('mongoose');

/**
 * 2% monthly recurring accrual for an affiliate-referred student.
 * One row per affiliate + student + calendar month (YYYY-MM).
 */
const affiliateRecurringLedgerSchema = new mongoose.Schema(
  {
    affiliateId: { type: String, required: true, index: true },
    studentId: { type: String, required: true, index: true },
    yyyymm: { type: String, required: true, index: true }, // Asia/Manila YYYY-MM
    amountPhp: { type: Number, required: true, min: 0 },
    planType: { type: String, default: '' },
    sourcePaymentId: { type: String, default: null },
  },
  { timestamps: true }
);

affiliateRecurringLedgerSchema.index(
  { affiliateId: 1, studentId: 1, yyyymm: 1 },
  { unique: true }
);

module.exports = mongoose.model('AffiliateRecurringLedger', affiliateRecurringLedgerSchema);
