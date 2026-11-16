const mongoose = require('mongoose');

const skillQuestionSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true, unique: true, index: true },
    skill: {
      type: String,
      enum: ['listening', 'speaking', 'pronunciation', 'reading'],
      required: true,
    },
    ageBand: { type: String, enum: ['3-4', '5-6'], required: true },
    kind: { type: String, enum: ['picture', 'rating'], required: true },
    prompt: { type: String, default: '', maxlength: 500 },
    audioUrl: { type: String, default: '', maxlength: 500 },
    imageUrls: { type: [String], default: [] },
    options: { type: [String], default: [] },
    correctIndex: { type: Number, default: 0, min: 0, max: 5 },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SkillQuestion', skillQuestionSchema);
