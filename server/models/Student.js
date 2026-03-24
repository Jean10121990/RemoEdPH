const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  studentCode: { type: String, default: null, unique: true, sparse: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: false, unique: true },
  password: { type: String, required: true },
  firstName: { type: String, required: false },
  middleName: { type: String },
  lastName: { type: String, required: false },
  gender: { type: String },
  birthday: { type: Date },
  age: { type: Number },
  contact: { type: String },
  address: { type: String },
  language: { type: String },
  hobbies: { type: String },
  parentName: { type: String },
  parentContact: { type: String },
  emergencyContact: { type: String },
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
  hasGeneratedPassword: { type: Boolean, default: false },
  subscriptionPlan: { type: String }, // '1month', '3months', '6months', '1year'
  subscriptionStartDate: { type: Date },
  subscriptionEndDate: { type: Date },
  subscriptionStatus: { type: String, enum: ['pending', 'active', 'expired', 'cancelled'], default: 'pending' },
  paymentStatus: { type: String, enum: ['unpaid', 'pending', 'paid'], default: 'unpaid' },
  paymentMethod: { type: String, enum: ['bank', 'gcash', 'paypal', 'paymongo', null], default: null },
  paymentReference: { type: String, default: '' },
  paymentDetails: {
    bankName: { type: String, default: '' },
    accountName: { type: String, default: '' },
    gcashNumber: { type: String, default: '' },
    paypalEmail: { type: String, default: '' }
  },
  paymentPaidAt: { type: Date, default: null },
  pendingCheckout: {
    sessionId: { type: String, default: '' },
    createdAt: { type: Date, default: null }
  },
  // Lesson credits (used for flexible scheduling)
  creditBalance: { type: Number, default: 0 }, // pool of purchased credits not yet consumed by finished lessons
  /** Credits held for upcoming bookings (deducted from "available" until class is finished or cancelled). */
  reservedCredits: { type: Number, default: 0 },
  totalCreditsEarned: { type: Number, default: 0 }, // total credits ever purchased
  usedCredits: { type: Number, default: 0 }, // lifetime credits spent on bookings
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
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema); 