const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  teacherId: { type: String, required: true },
  type: { type: String, required: true }, // e.g. booking, cancel, salary, absent, announcement, peer-message
  message: { type: String, required: true },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  senderId: { type: String, default: null } // for peer-message: teacherId of sender (enables reply)
});

module.exports = mongoose.model('Notification', notificationSchema); 