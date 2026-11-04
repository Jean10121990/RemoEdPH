const mongoose = require('mongoose');

const reviewRequestSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, unique: true },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReviewRequest', reviewRequestSchema);
