const mongoose = require('mongoose');

const pendingRegistrationSchema = new mongoose.Schema(
  {
    registrationId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    email: { type: String, required: true },
    passwordHash: { type: String, required: true },
    parentName: { type: String, default: '' },
    plan: { type: String, required: true },
    amount: { type: Number, required: true },
    description: { type: String, default: '' },
    referralCode: { type: String, default: '' },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'cancelled'],
      default: 'pending'
    },
    paymongoCheckoutId: { type: String, default: '' },
    checkoutUrl: { type: String, default: '' },
    paymongoEventId: { type: String, default: '' },
    processedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model('PendingRegistration', pendingRegistrationSchema);
