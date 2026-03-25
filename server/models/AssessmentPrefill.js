const mongoose = require('mongoose');
const { piiContactString } = require('../utils/piiMongoose');

const assessmentPrefillSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },
    childName: { type: String, default: '' },
    parentEmail: { type: String, default: '' },
    contactNumber: piiContactString(''),
    expiresAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    toJSON: { getters: true },
    toObject: { getters: true },
  }
);

assessmentPrefillSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AssessmentPrefill', assessmentPrefillSchema);
