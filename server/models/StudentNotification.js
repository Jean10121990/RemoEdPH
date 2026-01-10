const mongoose = require('mongoose');

const studentNotificationSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  type: { type: String, required: true }, // e.g. booking, cancel, reminder, announcement
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StudentNotification', studentNotificationSchema);
