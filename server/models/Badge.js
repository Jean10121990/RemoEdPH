const mongoose = require('mongoose');

/**
 * RemoEdKids growth badges — SKILL | CHARACTER | HABIT.
 * Positive, non-competitive recognition for 1-on-1 ESL lessons.
 */
const badgeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    category: {
      type: String,
      enum: ['SKILL', 'CHARACTER', 'HABIT'],
      required: true,
      index: true,
    },
    description: { type: String, required: true },
    unlockHint: { type: String, default: 'Keep practicing — you are growing every day!' },
    iconName: { type: String, required: true },
    colorHex: { type: String, required: true, default: '#00aeef' },
    active: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Badge', badgeSchema);
