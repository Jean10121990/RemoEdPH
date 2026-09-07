const mongoose = require('mongoose');

const ADMIN_ROLES = ['super_admin', 'admin_hr', 'admin_accounting', 'admin_qa'];

/** Staff admin account (portal “admin user”). Includes TOTP 2FA fields for RBAC sign-in. */
const adminSchema = new mongoose.Schema({
  /** Optional HR / payroll id — not unique (multiple unset values caused duplicate index errors). */
  employeeId: {
    type: String,
    default: null,
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
  /** Optional referral link code — not unique (many admins have none; unique+sparse still E11000 on some DBs). */
  referralCode: { type: String, default: null },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  hasGeneratedPassword: { type: Boolean, default: false },
  /** Super-admin created account without password — user completes setup via token. */
  mustSetPassword: { type: Boolean, default: false },
  passwordSetupTokenHash: { type: String, default: null },
  passwordSetupExpires: { type: Date, default: null },
  /** Encrypted TOTP shared secret (AES-GCM at rest). */
  twoFactorSecret: { type: String },
  /** When true, admin must complete TOTP at sign-in (see /api/auth/verify-2fa). */
  isTwoFactorEnabled: { type: Boolean, default: false },
  /** JWTs issued before this time (unix iat) are rejected once 2FA is on (Bearer-only clients). */
  twoFactorEnabledAt: { type: Date, default: null },
  /** Incremented to invalidate other sessions (see POST /api/admin/security/logout-other-sessions). */
  sessionVersion: { type: Number, default: 0 },
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

  /** Admin & Back-Office Terms of Service acceptance */
  tosAgreement: {
    accepted: { type: Boolean, default: false },
    acceptedAt: { type: Date, default: null },
    effectiveDate: { type: Date, default: null },
    legalName: { type: String, default: '' },
    assignedRole: { type: String, default: '' },
    version: { type: String, default: '' },
  },

  /** Admin & Back-Office Privacy Policy acceptance */
  privacyPolicy: {
    accepted: { type: Boolean, default: false },
    acceptedAt: { type: Date, default: null },
    effectiveDate: { type: Date, default: null },
    legalName: { type: String, default: '' },
    version: { type: String, default: '' },
  },
});

module.exports = mongoose.model('Admin', adminSchema); 