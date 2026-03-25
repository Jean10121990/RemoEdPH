const mongoose = require('mongoose');

/**
 * Stores PayMongo webhook event ids after signature verification to reject replays
 * before business logic (defense in depth alongside student.processedPaymentIds).
 */
const paymongoWebhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    eventType: { type: String, default: '' },
  },
  { timestamps: true }
);

paymongoWebhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model('PaymongoWebhookEvent', paymongoWebhookEventSchema);
