const mongoose = require('mongoose');

const teacherTrainingProgressSchema = new mongoose.Schema({
  teacherId: { type: String, required: true, index: true },
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TrainingCourse',
    required: true,
    index: true
  },
  moduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TrainingModule',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'completed'],
    default: 'not_started'
  },
  watchSeconds: { type: Number, default: 0 },
  completedAt: { type: Date, default: null }
}, { timestamps: true });

teacherTrainingProgressSchema.index({ teacherId: 1, moduleId: 1 }, { unique: true });

module.exports = mongoose.model('TeacherTrainingProgress', teacherTrainingProgressSchema);
