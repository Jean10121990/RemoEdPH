const mongoose = require('mongoose');

const marketingCalendarEntrySchema = new mongoose.Schema({
  dateKey: { type: String, required: true, index: true },
  slot: { type: String, required: true },
  title: { type: String, default: '', maxlength: 120 },
  keyTopic: { type: String, default: '', maxlength: 2000 },
  contentType: { type: String, enum: ['facebook', 'email', 'ad'], default: 'facebook' },
  targetMarket: { type: String, default: 'General International (Asia)', maxlength: 80 },
  generatedCopy: { type: String, default: '', maxlength: 20000 },
  emailSubject: { type: String, default: '', maxlength: 200 },
  emailBody: { type: String, default: '', maxlength: 20000 },
  posterConfig: { type: mongoose.Schema.Types.Mixed, default: null },
  status: { type: String, enum: ['planned', 'drafted', 'edited', 'scheduled'], default: 'planned' },
  dryRun: { type: Boolean, default: false },
  updatedBy: { type: String, default: '', maxlength: 120 },
}, { timestamps: true });

marketingCalendarEntrySchema.index({ dateKey: 1, slot: 1 }, { unique: true });

module.exports = mongoose.model('MarketingCalendarEntry', marketingCalendarEntrySchema);
