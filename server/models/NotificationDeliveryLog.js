const mongoose = require('mongoose');

const notificationDeliveryLogSchema = new mongoose.Schema(
  {
    audience: { type: String, required: true, index: true }, // student | teacher | admin
    recipientId: { type: String, required: true, index: true },
    type: { type: String, required: true, index: true },
    bookingId: { type: String, default: null, index: true },
    status: {
      type: String,
      required: true,
      enum: ['sent', 'skipped_pref', 'skipped_quiet', 'skipped_dedupe', 'failed'],
      index: true,
    },
    reason: { type: String, default: null },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

notificationDeliveryLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });

module.exports = mongoose.model('NotificationDeliveryLog', notificationDeliveryLogSchema);
