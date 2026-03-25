const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  employeeId: {
    type: String,
    default: null,
    unique: true,
    sparse: true
  },
  username: {
    type: String,
    required: true,
    unique: true
  },
  /** Bcrypt hash — preferred field (never store plaintext). */
  passwordHash: {
    type: String,
    default: null
  },
  /** @deprecated Legacy bcrypt hash; use passwordHash. Login accepts either. */
  password: {
    type: String,
    default: null
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