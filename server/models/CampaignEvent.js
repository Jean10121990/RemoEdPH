const mongoose = require('mongoose');

const campaignEventSchema = new mongoose.Schema(
  {
    campaignId: { type: String, default: '' },
    email: { type: String, default: '', index: true },
    type: { type: String, enum: ['queued', 'open', 'click', 'paid', 'unsubscribed'], default: 'queued' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CampaignEvent', campaignEventSchema);
