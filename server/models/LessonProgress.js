const mongoose = require('mongoose');

const lessonProgressSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    index: true
  },
  lessonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lesson',
    required: true,
    index: true
  },
  curriculumId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Curriculum',
    required: true,
    index: true
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    index: true
  },
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'completed'],
    default: 'not_started',
    index: true
  },
  completedAt: {
    type: Date
  },
  teacherId: {
    type: String,
    index: true
  },
  notes: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Indexes
lessonProgressSchema.index({ studentId: 1, lessonId: 1 }, { unique: true });
lessonProgressSchema.index({ studentId: 1, status: 1 });
lessonProgressSchema.index({ curriculumId: 1, status: 1 });

module.exports = mongoose.model('LessonProgress', lessonProgressSchema);

