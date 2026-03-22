const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Referral link code (used for commission tracking)
  referralCode: { type: String, default: null, unique: true, sparse: true },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  hasGeneratedPassword: { type: Boolean, default: false }
});

module.exports = mongoose.model('Admin', adminSchema); 