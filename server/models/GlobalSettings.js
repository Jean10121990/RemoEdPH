const mongoose = require('mongoose');

const globalSettingsSchema = new mongoose.Schema({
  globalRate: {
    type: Number,
    default: 100,
    required: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('GlobalSettings', globalSettingsSchema); 