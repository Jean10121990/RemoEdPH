const mongoose = require('mongoose');

const studentGardenItemSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    itemType: {
      type: String,
      enum: ['seed', 'plant', 'flower', 'tree'],
      required: true,
      default: 'seed',
    },
    growthStage: { type: Number, min: 0, max: 3, default: 0 },
    positionIndex: { type: Number, min: 0, max: 7, required: true },
    plantedAt: { type: Date, default: Date.now },
    /** Milestone / special variant key (optional). */
    variant: { type: String, default: '' },
  },
  { timestamps: true }
);

studentGardenItemSchema.index({ studentId: 1, positionIndex: 1 }, { unique: true });

module.exports = mongoose.model('StudentGardenItem', studentGardenItemSchema);
