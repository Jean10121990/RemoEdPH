const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true
  },
  role: {
    type: String,
    /** `admin` = all users (legacy); `admins` = admins only */
    enum: ['teacher', 'student', 'admin', 'admins'],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Announcement', announcementSchema); 