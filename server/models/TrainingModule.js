const mongoose = require('mongoose');

const trainingModuleSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TrainingCourse',
    required: true,
    index: true
  },
  moduleIndex: { type: Number, required: true, default: 0 },
  title: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['video', 'guideline', 'asset', 'quiz_ack'],
    default: 'guideline'
  },
  content: { type: String, default: '' },
  videoUrl: { type: String, default: '' },
  assetUrl: { type: String, default: '' },
  assetName: { type: String, default: '' },
  durationMinutes: { type: Number, default: 5 },
  published: { type: Boolean, default: true }
}, { timestamps: true });

trainingModuleSchema.index({ courseId: 1, moduleIndex: 1 });

module.exports = mongoose.model('TrainingModule', trainingModuleSchema);
