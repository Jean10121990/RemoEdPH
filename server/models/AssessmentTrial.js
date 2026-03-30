const mongoose = require('mongoose');

const assessmentTrialSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    parentEmail: { type: String, required: true, lowercase: true, trim: true, index: true },
    childName: { type: String, default: '' },
    contactNumber: { type: String, default: '' },
    cefrLevel: { type: String, default: '' },
    score: { type: Number, default: 0 },
    redeemedByStudentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      default: null,
    },
    redeemedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AssessmentTrial', assessmentTrialSchema);
