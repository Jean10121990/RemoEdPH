const mongoose = require('mongoose');

const socialAccountSchema = new mongoose.Schema(
  {
    platform: { type: String, enum: ['facebook', 'instagram', 'linkedin', 'x', 'tiktok'], required: true },
    accountName: { type: String, default: '' },
    tokenEncrypted: { type: String, default: '' },
    enabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SocialAccount', socialAccountSchema);
