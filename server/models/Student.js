const mongoose = require('mongoose');
const { piiContactString } = require('../utils/piiMongoose');

const studentSchema = new mongoose.Schema({
  /** Official ID when assigned; omit field until set — do not default null (breaks sparse unique index). */
  studentCode: { type: String, unique: true, sparse: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: false, unique: true },
  password: { type: String, required: true },
  firstName: { type: String, required: false },
  middleName: { type: String },
  lastName: { type: String, required: false },
  gender: { type: String },
  birthday: { type: Date },
  age: { type: Number },
  contact: piiContactString(''),
  address: { type: String },
  language: { type: String },
  hobbies: { type: String },
  parentName: { type: String },
  parentContact: piiContactString(''),
  emergencyContact: piiContactString(''),
  aboutMe: { type: String },
  photo: { type: String },
  profilePicture: { type: String },
  level: { type: String, default: 'Beginner' }, // Beginner, Intermediate, Advanced
  cefrLevel: { type: String }, // A1, A2, B1, B2, C1, C2
  leveling: { type: String }, // For custom leveling system (temporary, will be replaced)
  assessmentScore: { type: Number },
  assessmentDate: { type: Date },
  education: [{
    schoolName: { type: String },
    level: { type: String },
    yearStarted: { type: Number },
    yearEnded: { type: Number }
  }],
  documents: {
    studentId: { type: String },
    birthCertificate: { type: String },
    academicRecords: { type: String },
    certificates: { type: String }
  },
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  /** Failed password attempts; reset on successful login */
  loginAttempts: { type: Number, default: 0 },
  /** When set and in the future, login is rejected until this time */
  lockUntil: { type: Date, default: null },
  hasGeneratedPassword: { type: Boolean, default: false },
  /** Canonical ids: spark | steady | scholar | summit (aliases: 1month, 3months, 6months, 1year). Credits = months × 22; see server/config/planCredits.js */
  subscriptionPlan: { type: String },
  subscriptionStartDate: { type: Date },
  subscriptionEndDate: { type: Date },
  subscriptionStatus: { type: String, enum: ['pending', 'active', 'expired', 'cancelled'], default: 'pending' },
  paymentStatus: { type: String, enum: ['unpaid', 'pending', 'paid'], default: 'unpaid' },
  paymentMethod: { type: String, enum: ['bank', 'gcash', 'paypal', 'paymongo', null], default: null },
  paymentReference: { type: String, default: '' },
  paymentDetails: {
    bankName: { type: String, default: '' },
    accountName: { type: String, default: '' },
    gcashNumber: piiContactString(''),
    paypalEmail: { type: String, default: '' }
  },
  paymentPaidAt: { type: Date, default: null },
  pendingCheckout: {
    sessionId: { type: String, default: '' },
    createdAt: { type: Date, default: null }
  },
  /**
   * Conversion funnel: standard (default) → trial_active (claimed assessment token) →
   * trial_completed (free class consumed) → active_subscriber (paid via PayMongo).
   * Booking is blocked while trial_completed until payment promotes to active_subscriber.
   */
  accountStatus: {
    type: String,
    enum: ['standard', 'trial_active', 'trial_completed', 'active_subscriber'],
    default: 'standard',
  },
  trialCompletedAt: { type: Date, default: null },
  /**
   * One free lesson from post-assessment registration; false after that class is completed.
   */
  hasFreeTrial: { type: Boolean, default: false },
  /** First-visit welcome tour on student dashboard; cleared after dismiss. */
  hasSeenWelcomeTour: { type: Boolean, default: false },
  /** When the post-assessment free trial credit was granted (for 24h booking reminders). */
  assessmentTrialGrantedAt: { type: Date, default: null },
  /** Set when the gentle 'book your trial' reminder email was sent. */
  trialBookingReminderSentAt: { type: Date, default: null },
  /** Paid active subscription (synced with PayMongo webhooks / login self-heal). */
  isSubscribed: { type: Boolean, default: false },
  /**
   * When true, the next class booked counts as the one free trial from level assessment;
   * cleared after that class completes (credit consumed).
   */
  assessmentTrialCreditActive: { type: Boolean, default: false },
  // Lesson credits (used for flexible scheduling)
  creditBalance: { type: Number, default: 0 }, // pool of purchased credits not yet consumed by finished lessons
  /** Credits held for upcoming bookings (deducted from "available" until class is finished or cancelled). */
  reservedCredits: { type: Number, default: 0 },
  totalCreditsEarned: { type: Number, default: 0 }, // total credits ever purchased
  usedCredits: { type: Number, default: 0 }, // lifetime credits spent on bookings
  /** Optional explicit pool size; booking math falls back to creditBalance when unset. */
  totalCredits: { type: Number, default: null },
  /** Idempotency for PayMongo / multi-step payments */
  processedPaymentIds: { type: [String], default: [] },
  creditHistory: [{
    date: { type: Date, default: Date.now },
    plan: { type: String, default: '' },
    credits: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    paymentId: { type: String, default: '' },
    /** purchase = top-up; usage = lesson consumed after teacher marks class finished */
    entryType: { type: String, enum: ['purchase', 'usage'], default: 'purchase' },
    balanceAfter: { type: Number, default: null }
  }],
  creditTransactions: [{
    date: { type: Date, default: Date.now },
    type: { type: String, enum: ['purchase', 'adjustment', 'use'], default: 'purchase' },
    plan: { type: String, default: '' },
    description: { type: String, default: '' },
    credits: { type: Number, default: 0 }, // positive for add, negative for use
    balanceAfter: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 }
  }],
  // Referral tracking (teacher referral link -> student signup/subscription)
  referralCode: { type: String, default: null },
  referredByTeacherId: { type: String, default: null }, // legacy (teacher only)
  referredByOwnerType: { type: String, enum: ['teacher', 'admin', null], default: null },
  referredByOwnerId: { type: String, default: null }, // teacherId or admin username
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true },
});

module.exports = mongoose.model('Student', studentSchema); 