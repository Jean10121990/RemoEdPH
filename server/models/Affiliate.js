const mongoose = require('mongoose');

/**
 * Independent Growth Affiliate portal account (parallel to Student / Teacher).
 * referralSlug is a random code used in /enroll?ref=
 * Older email or name slugs stay in previousReferralSlugs so shared links still count.
 */
const affiliateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, default: null, trim: true, lowercase: true },
    phone: { type: String, default: '' },
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, default: null },
    /** Random public code for /enroll?ref=. Not the email. */
    referralSlug: { type: String, required: true, unique: true, trim: true },
    /** Retired email or name slugs. Old links still resolve. */
    previousReferralSlugs: { type: [String], default: [] },
    christianValuesBackground: { type: Boolean, default: true },
    notes: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'active', 'inactive', 'suspended'],
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
