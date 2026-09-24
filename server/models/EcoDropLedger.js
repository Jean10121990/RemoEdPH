const mongoose = require('mongoose');

const ecoDropLedgerSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    amount: { type: Number, required: true },
    reason: {
      type: String,
      enum: ['lesson_complete', 'buy_seed', 'water_plant', 'buy_tree'],
      required: true,
    },
    lessonId: { type: mongoose.Schema.Types.ObjectId, default: null },
    bookingId: { type: mongoose.Schema.Types.ObjectId, default: null },
    gardenItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    balanceAfter: { type: Number, default: null },
  },
  { timestamps: true }
);

/** One Eco-Drop per completed lesson — sparse so spend rows omit lessonId. */
ecoDropLedgerSchema.index(
  { studentId: 1, lessonId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      reason: 'lesson_complete',
      lessonId: { $type: 'objectId' },
    },
  }
);

module.exports = mongoose.model('EcoDropLedger', ecoDropLedgerSchema);
