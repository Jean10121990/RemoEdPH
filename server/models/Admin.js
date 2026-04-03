const mongoose = require('mongoose');

const ADMIN_ROLES = ['super_admin', 'admin_hr', 'admin_accounting', 'admin_qa'];

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
  email: { type: String, default: null },
  /** Portal RBAC: super_admin has full access; others are scoped in admin router. */
  adminRole: {
    type: String,
    enum: ADMIN_ROLES,
    default: 'super_admin',
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
  hasGeneratedPassword: { type: Boolean, default: false },
  /** Super-admin created account without password — user completes setup via token. */
  mustSetPassword: { type: Boolean, default: false },
  passwordSetupTokenHash: { type: String, default: null },
  passwordSetupExpires: { type: Date, default: null },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  address: { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  birthday: { type: Date, default: null },
  education: { type: String, default: '' },
  experience: { type: String, default: '' },
  certificates: { type: String, default: '' },
  profilePicturePath: { type: String, default: null },
  idDocumentPath: { type: String, default: null },
  /** Uploaded NBI clearance document (separate from government ID). */
  nbiClearanceDocumentPath: { type: String, default: null },
  nbiClearanceStatus: {
    type: String,
    enum: ['none', 'pending', 'submitted', 'verified'],
    default: 'none',
  },
});

module.exports = mongoose.model('Admin', adminSchema); 