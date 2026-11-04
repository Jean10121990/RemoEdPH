const mongoose = require('mongoose');

const STAGES = [
  'Inquiry',
  'Assessment done',
  'Trial',
  'Registered',
  'Paid plan',
  'Renewal due',
  'At-risk',
  'Lost',
];

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    email: { type: String, default: '', lowercase: true, trim: true, index: true },
    phone: { type: String, default: '', index: true },
    country: { type: String, default: '' },
    language: { type: String, default: 'en' },
    timeZone: { type: String, default: '' },
    source: {
      type: String,
      enum: ['assessment', 'register', 'messenger', 'instagram', 'webchat', 'email', 'referral', 'manual'],
      default: 'manual',
    },
    utm: {
      source: { type: String, default: '' },
      medium: { type: String, default: '' },
      campaign: { type: String, default: '' },
    },
    referralCode: { type: String, default: '' },
    assessmentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    studentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    stage: { type: String, enum: STAGES, default: 'Inquiry', index: true },
    tags: { type: [String], default: [] },
    ownerAdminId: { type: String, default: '' },
    notes: [{ text: String, at: { type: Date, default: Date.now }, by: String }],
    lastContactAt: { type: Date, default: null },
    reminderSent: {
      h24: { type: Date, default: null },
      d3: { type: Date, default: null },
      d7: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Lead', leadSchema);
module.exports.STAGES = STAGES;
