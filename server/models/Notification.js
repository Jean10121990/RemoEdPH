const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  teacherId: { type: String, required: true, index: true },
  type: { type: String, required: true, index: true }, // booking, cancel, salary, announcement, peer-message, …
  message: { type: String, required: true },
  read: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now, index: true },
  senderId: { type: String, default: null }, // peer-message sender teacherId
  bookingId: { type: String, default: null, index: true },
  actionUrl: { type: String, default: null },
  meta: { type: mongoose.Schema.Types.Mixed, default: null },
  importance: { type: String, enum: ['actionable', 'fyi'], default: 'fyi', index: true },
});

notificationSchema.index({ teacherId: 1, createdAt: -1 });
notificationSchema.index({ teacherId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
