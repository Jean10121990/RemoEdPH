const mongoose = require('mongoose');

const lessonCheckpointAttemptSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    level: { type: String, required: true },
    lessonNumber: { type: Number, required: true, min: 1, max: 220 },
    scorePercent: { type: Number, required: true, min: 0, max: 100 },
    correctCount: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 1 },
    passed: { type: Boolean, required: true, index: true },
  },
  { timestamps: true }
);

lessonCheckpointAttemptSchema.index({ studentId: 1, level: 1, lessonNumber: 1, createdAt: -1 });

module.exports = mongoose.model('LessonCheckpointAttempt', lessonCheckpointAttemptSchema);
