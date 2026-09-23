const mongoose = require('mongoose');

/**
 * Admin fee payout snapshot for a bi-monthly cutoff (YYYY-MM-1 | YYYY-MM-2).
 * Each eligible admin earns 1% of subscription gross sales for that period.
 */
const adminPayoutSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
      index: true,
    },
    adminUsername: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    periodKey: {
      type: String,
      required: true,
      index: true,
    },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    grossSales: { type: Number, default: 0 },
    commissionRate: { type: Number, default: 1 },
    totalAmount: { type: Number, default: 0 },
    totalHours: { type: Number, default: 0 },
    totalShifts: { type: Number, default: 0 },
    completedShifts: { type: Number, default: 0 },
    eligible: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['draft', 'generated', 'paid', 'void'],
      default: 'generated',
    },
    generatedAt: { type: Date, default: Date.now },
    paidAt: { type: Date, default: null },
    paidBy: { type: String, default: '' },
    notes: { type: String, default: '' },
  },
  { timestamps: true, collection: 'admin_payouts' }
);

adminPayoutSchema.index({ adminUsername: 1, periodKey: 1 }, { unique: true });

module.exports = mongoose.model('AdminPayout', adminPayoutSchema);
