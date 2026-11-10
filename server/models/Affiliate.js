const mongoose = require('mongoose');

/**
 * Independent Growth Affiliate portal account (parallel to Student / Teacher).
 * referralSlug is email (preferred) or complete name — used in /enroll?ref=
 */
const affiliateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, default: null, trim: true, lowercase: true },
    phone: { type: String, default: '' },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, default: null },
    /** Unique human-readable ref for links (email lowercased, or trimmed full name). */
    referralSlug: { type: String, required: true, unique: true, trim: true },
    christianValuesBackground: { type: Boolean, default: true },
    notes: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'active', 'inactive'],
      default: 'pending',
      index: true,
    },
    /** Set after first successful login emails username + password to the affiliate. */
    credentialsEmailedAt: { type: Date, default: null },
    payoutMethod: { type: String, enum: ['', 'gcash', 'bank'], default: '' },
    payoutAccountName: { type: String, default: '' },
    payoutAccountNumber: { type: String, default: '' },
    payoutBankName: { type: String, default: '' },
    withdrawals: [
      {
        amountPhp: { type: Number, required: true, min: 0 },
        method: { type: String, default: '' },
        accountName: { type: String, default: '' },
        accountNumber: { type: String, default: '' },
        bankName: { type: String, default: '' },
        qrCode: { type: String, default: '' },
        status: { type: String, enum: ['requested', 'paid'], default: 'requested' },
        requestedAt: { type: Date, default: Date.now },
        paidAt: { type: Date, default: null },
        payoutDate: { type: String, default: '' },
      },
    ],
  },
  { timestamps: true }
);

affiliateSchema.index({ email: 1 }, { sparse: true });

module.exports = mongoose.model('Affiliate', affiliateSchema);
