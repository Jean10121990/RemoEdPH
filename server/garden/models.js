const mongoose = require('mongoose');

/** One row per Eco-Drop earned. studentId is Student.username. */
const ecoDropEntrySchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    sourceType: { type: String, enum: ['lesson', 'task', 'game'], required: true },
    sourceId: { type: String, required: true, maxlength: 160 },
    monthKey: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'eco_drop_ledger', versionKey: false }
);

ecoDropEntrySchema.index({ studentId: 1, sourceType: 1, sourceId: 1, monthKey: 1 }, { unique: true });
/** Month progress is an indexed count, not a stored counter. */
ecoDropEntrySchema.index({ studentId: 1, monthKey: 1 });

/** One tree per student per month. Stage is always computed; finalStage is the archived snapshot. */
const gardenTreeSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    monthKey: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    species: { type: String, required: true },
    monthlyTarget: { type: Number, required: true, min: 1 },
    lastSeenStage: { type: Number, default: 0, min: 0 },
    finalStage: { type: Number, default: null },
    monthEcoDrops: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now },
    finalizedAt: { type: Date, default: null },
  },
  { collection: 'garden_trees', versionKey: false }
);

gardenTreeSchema.index({ studentId: 1, monthKey: 1 }, { unique: true });

const EcoDropEntry = mongoose.models.EcoDropEntry || mongoose.model('EcoDropEntry', ecoDropEntrySchema);
const GardenTree = mongoose.models.GardenTree || mongoose.model('GardenTree', gardenTreeSchema);

module.exports = { EcoDropEntry, GardenTree };
