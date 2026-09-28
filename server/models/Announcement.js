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
  /** Community topic key. Missing/legacy posts count as `others`. */
  topic: {
    type: String,
    enum: [
      'family-day',
      'teachers-day',
      'students-day',
      'feeding-program',
      'waste-management',
      'mental-health',
      'sustainability',
      'others',
    ],
    default: 'others',
  },
  /** Custom label when topic is `others`. */
  topicOther: {
    type: String,
    default: '',
    maxlength: 80,
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