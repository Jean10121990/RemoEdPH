const mongoose = require('mongoose');

const assessmentPrefillSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    childName: { type: String, default: '' },
    parentEmail: { type: String, default: '' },
    contactNumber: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

assessmentPrefillSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AssessmentPrefill', assessmentPrefillSchema);
