const mongoose = require('mongoose');

const studentNotificationSchema = new mongoose.Schema({
  studentId: { type: String, required: true, index: true }, // student username
  type: { type: String, required: true, index: true }, // booking, cancel, reminder, announcement, …
  message: { type: String, required: true },
  read: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  bookingId: { type: String, default: null, index: true },
  actionUrl: { type: String, default: null },
  meta: { type: mongoose.Schema.Types.Mixed, default: null },
  importance: { type: String, enum: ['actionable', 'fyi'], default: 'fyi', index: true },
});

studentNotificationSchema.index({ studentId: 1, createdAt: -1 });
studentNotificationSchema.index({ studentId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('StudentNotification', studentNotificationSchema);
