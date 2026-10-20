const mongoose = require('mongoose');

const wordResultSchema = new mongoose.Schema(
  {
    word: { type: String, required: true, maxlength: 40 },
    attempts: { type: Number, default: 0, min: 0, max: 50 },
    correctFirstTry: { type: Boolean, default: false },
    spokeIt: { type: Boolean, default: false },
  },
  { _id: false }
);

const trialBookingSchema = new mongoose.Schema(
  {
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
    childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    type: { type: String, default: 'interactive_trial', enum: ['interactive_trial'] },
    status: { type: String, enum: ['ready', 'started', 'completed', 'expired'], default: 'ready' },
    theme: { type: String, default: 'fruits' },
    words: { type: [wordResultSchema], default: [] },
    secondsSpent: { type: Number, default: 0 },
    startedAt: Date,
    completedAt: Date,
    expiresAt: { type: Date, required: true },
    convertedToPlan: { type: Boolean, default: false },
  },
  { timestamps: true }
);

trialBookingSchema.index({ childId: 1 }, { unique: true });

module.exports = mongoose.model('TrialBooking', trialBookingSchema);
