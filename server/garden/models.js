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
    sequence: { type: Number, default: 1, min: 1 },
    species: { type: String, required: true },
    monthlyTarget: { type: Number, required: true, min: 1 },
    finalStage: { type: Number, default: null },
    monthEcoDrops: { type: Number, default: null },
    createdAt: { type: Date, default: Date.now },
    finalizedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
    dropsSpent: { type: Number, default: null },
    lessonsDone: { type: Number, default: null },
    daysTaken: { type: Number, default: null },
    perfectMonth: { type: Boolean, default: false },
    /** 'actions' = growth comes from care_actions. Missing on pre-care trees until grandfathered. */
    careModel: { type: String, enum: ['actions'] },
    grandfatherBackup: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { collection: 'garden_trees', versionKey: false }
);

gardenTreeSchema.index({ studentId: 1, monthKey: 1, sequence: 1 }, { unique: true });

const rewardClaimSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    treeId: { type: String, required: true },
    monthKey: { type: String, required: true },
    sequence: { type: Number, default: 1 },
    tier: { type: Number, default: null },
    rolledCredits: { type: Number, default: 0 },
    grantedCredits: { type: Number, default: 0 },
    expiresAt: { type: Date, default: null },
    reminderSentAt: { type: Date, default: null },
    rangeLabel: { type: String, default: '' },
    message: { type: String, default: '' },
    reason: { type: String, default: '' },
    lessonsDone: { type: Number, default: 0 },
    audit: { type: [mongoose.Schema.Types.Mixed], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'reward_claims', versionKey: false }
);
rewardClaimSchema.index({ studentId: 1, treeId: 1 }, { unique: true });

const gardenBadgeSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    badgeKey: { type: String, required: true },
    earnedAt: { type: Date, default: Date.now },
  },
  { collection: 'garden_student_badges', versionKey: false }
);
gardenBadgeSchema.index({ studentId: 1, badgeKey: 1 }, { unique: true });

const decorationSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    itemKey: { type: String, required: true },
    cost: { type: Number, required: true },
    requestId: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'garden_decorations', versionKey: false }
);
decorationSchema.index({ studentId: 1, itemKey: 1 }, { unique: true });

const careActionSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true },
    monthKey: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    sequence: { type: Number, default: 1 },
    action: { type: String, enum: ['water', 'fertilize', 'migrate'], required: true },
    cost: { type: Number, required: true, min: 0 },
    growthPoints: { type: Number, required: true, min: 0 },
    stageAt: { type: Number, default: 0, min: 0 },
    requestId: { type: String, required: true, maxlength: 80 },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'care_actions', versionKey: false }
);

careActionSchema.index({ requestId: 1 }, { unique: true });
careActionSchema.index({ studentId: 1, monthKey: 1 });
careActionSchema.index(
  { studentId: 1, monthKey: 1, sequence: 1, action: 1, stageAt: 1 },
  { unique: true, partialFilterExpression: { action: 'fertilize' } }
);

const EcoDropEntry = mongoose.models.EcoDropEntry || mongoose.model('EcoDropEntry', ecoDropEntrySchema);
const GardenTree = mongoose.models.GardenTree || mongoose.model('GardenTree', gardenTreeSchema);
const CareAction = mongoose.models.CareAction || mongoose.model('CareAction', careActionSchema);
const GardenRewardClaim = mongoose.models.GardenRewardClaim || mongoose.model('GardenRewardClaim', rewardClaimSchema);
const GardenStudentBadge = mongoose.models.GardenStudentBadge || mongoose.model('GardenStudentBadge', gardenBadgeSchema);
const GardenDecoration = mongoose.models.GardenDecoration || mongoose.model('GardenDecoration', decorationSchema);

module.exports = {
  EcoDropEntry,
  GardenTree,
  CareAction,
  GardenRewardClaim,
  GardenStudentBadge,
  GardenDecoration,
};
