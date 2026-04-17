const mongoose = require('mongoose');

const loginLogSchema = new mongoose.Schema(
  {
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
      index: true,
    },
    ip: { type: String, default: '' },
    browser: { type: String, default: '' },
    os: { type: String, default: '' },
    platform: { type: String, default: '' },
    isMobile: { type: Boolean, default: false },
    /** Last activity time for this device fingerprint (adminId + browser + os). */
    timestamp: { type: Date, default: Date.now },
  },
  { collection: 'loginlogs' }
);

loginLogSchema.index({ adminId: 1, timestamp: -1 });
loginLogSchema.index({ adminId: 1, browser: 1, os: 1 });

module.exports = mongoose.model('LoginLog', loginLogSchema);
