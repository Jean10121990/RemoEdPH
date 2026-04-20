const mongoose = require('mongoose');
const { piiContactString } = require('../utils/piiMongoose');

const teacherSchema = new mongoose.Schema({
  /** Stable id for slots/bookings — same as `username` for new accounts; legacy kjb/T* values still supported. */
  teacherId: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  hireDate: { type: Date, default: null },
  
     // Basic teacher info (for compatibility with existing code)
   firstName: { type: String, default: '' },
   middleName: { type: String, default: '' },
   lastName: { type: String, default: '' },
   
   // Personal Information
   fullname: { type: String, default: '' },
  birthday: { type: Date },
  gender: { type: String, enum: ['Male', 'Female', 'Other', ''], default: '' },
  language: { type: String, enum: ['English', 'Filipino', 'Spanish', 'Chinese', 'Japanese', ''], default: '' },
  hobbies: { type: String, default: '' },
  address: { type: String, default: '' },
  contact: piiContactString(''),
  email: { type: String, default: '' },
  emergencyContact: piiContactString(''),
  
  // Professional Information
  introduction: { type: String, default: '' },
  experience: { type: String, default: '' },
  professionalPoints: { type: Number, default: 0 },
  loyaltyPoints: { type: Number, default: 0 },
  ladderTier: { type: String, default: 'Not Qualified' },
  careerGrowthTitle: { type: String, default: 'Not Qualified' },
  hasEnglishDegree4Year: { type: Boolean, default: false },
  hasTesolTeylTefl: { type: Boolean, default: false },
  hasIeltsCertificate: { type: Boolean, default: false },
  eslExperienceLevel: {
    type: String,
    enum: ['none', '2years', '3to5', '5plus'],
    default: 'none'
  },
  /** Total years teaching (classroom / formal); points: 3y=20, 5y=30, 10y=40, 15y=50, 20+=50 */
  teachingExperienceBand: {
    type: String,
    enum: ['none', 'y3', 'y5', 'y10', 'y15', 'y20plus'],
    default: 'none'
  },
  hasValuesAlignment: { type: Boolean, default: false },
  // H.E.A.R.T. commitments
  heartHospitality: { type: Boolean, default: false },
  heartExcellence: { type: Boolean, default: false },
  heartAffection: { type: Boolean, default: false },
  heartRespect: { type: Boolean, default: false },
  heartTogetherness: { type: Boolean, default: false },
  // RemoEd Code of Honor commitments
  honorAvoidFalseWitness: { type: Boolean, default: false },
  honorNoGossipPolitics: { type: Boolean, default: false },
  honorIntegritySpeech: { type: Boolean, default: false },
  honorGoodAttitudeAntiGreed: { type: Boolean, default: false },
  honorFinancialStewardship: { type: Boolean, default: false },
  hasProfessionalLetLicense: { type: Boolean, default: false },
  hasMastersDegree: { type: Boolean, default: false },
  hasDoctorateDegree: { type: Boolean, default: false },
  
  // Profile Picture
  profilePicture: { type: String, default: null },
  
  // Video Introduction
  videoIntroduction: { type: String, default: null },
  videoIntroductionFileName: { type: String, default: null },
  
  // Education Details
  education: [{
    degree: { type: String, default: '' },
    school: { type: String, default: '' },
    yearGraduated: { type: Number },
    gpa: { type: Number }
  }],
  
  // Work Experience Details
  workExperience: [{
    company: { type: String, default: '' },
    jobTitle: { type: String, default: '' },
    duration: { type: String, default: '' },
    isPresent: { type: Boolean, default: false },
    jobDescription: { type: String, default: '' }
  }],
  
  // Documents & Certifications
  documents: {
    diploma: { type: String, default: null }, // Legacy single diploma support
    diplomas: [{ 
      fileData: { type: String },
      fileName: { type: String }
    }],
    certifications: [{ type: String }], // Legacy certifications support
    certificates: [{ 
      fileData: { type: String },
      fileName: { type: String }
    }],
    validId: { type: String, default: null }, // Legacy single valid ID support
    validIds: [{
      fileData: { type: String },
      fileName: { type: String }
    }]
  },
  
  // Teaching Abilities
  teachingAbilities: {
    listening: {
      description: { type: String, default: '' },
      level: { type: String, default: null }, // Assessed by system
      criteria: [{ type: String }] // Assessment criteria
    },
    reading: {
      description: { type: String, default: '' },
      level: { type: String, default: null },
      criteria: [{ type: String }]
    },
    speaking: {
      description: { type: String, default: '' },
      level: { type: String, default: null },
      criteria: [{ type: String }]
    },
    writing: {
      description: { type: String, default: '' },
      level: { type: String, default: null },
      criteria: [{ type: String }]
    },
    pronunciation: {
      description: { type: String, default: '' },
      level: { type: String, default: null },
      criteria: [{ type: String }]
    },
    grammar: {
      description: { type: String, default: '' },
      level: { type: String, default: null },
      criteria: [{ type: String }]
    },
    vocabulary: {
      description: { type: String, default: '' },
      level: { type: String, default: null },
      criteria: [{ type: String }]
    },
    creativityHobbies: { type: String, default: '' }
  },

  // Personality Assessment
  teachingPersonality: {
    interpersonal: {
      description: { type: String, default: '' },
      level: { type: String, default: null },
      criteria: [{ type: String }]
    },
    professionalism: {
      description: { type: String, default: '' },
      level: { type: String, default: null },
      criteria: [{ type: String }]
    },
    cultural: {
      description: { type: String, default: '' },
      level: { type: String, default: null },
      criteria: [{ type: String }]
    },
    technology: {
      description: { type: String, default: '' },
      level: { type: String, default: null },
      criteria: [{ type: String }]
    },
    engagement: {
      description: { type: String, default: '' },
      level: { type: String, default: null },
      criteria: [{ type: String }]
    }
  },
  
  // Professional Development - Certifications with expiration tracking
  professionalCertifications: [{
    name: { type: String, required: true },
    organization: { type: String, required: true },
    issueDate: { type: Date, required: true },
    expiryDate: { type: Date, default: null }, // null if doesn't expire
    certificateNumber: { type: String, default: null },
    certificateFile: { type: String, default: null }, // Base64 or file path
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Skill Assessments History
  skillAssessments: [{
    assessmentDate: { type: Date, default: Date.now },
    assessedBy: { type: String, default: null }, // Admin/Trainer ID or 'system'
    skills: {
      listening: { type: String, default: null },
      reading: { type: String, default: null },
      speaking: { type: String, default: null },
      writing: { type: String, default: null },
      pronunciation: { type: String, default: null },
      grammar: { type: String, default: null },
      vocabulary: { type: String, default: null }
    },
    personality: {
      interpersonal: { type: String, default: null },
      professionalism: { type: String, default: null },
      cultural: { type: String, default: null },
      technology: { type: String, default: null },
      engagement: { type: String, default: null }
    },
    notes: { type: String, default: '' },
    totals: {
      skillsTotal: { type: Number, default: null },
      skillsMax: { type: Number, default: null },
      personalityTotal: { type: Number, default: null },
      personalityMax: { type: Number, default: null },
      total: { type: Number, default: null },
      max: { type: Number, default: null },
      normalizedToRubric: { type: Number, default: null },
      band: { type: String, default: null }
    },
    levelChange: { type: String, default: null } // e.g., "Intermediate to Advanced"
  }],
  
  // Training Progress
  trainingProgress: [{
    courseId: { type: String, required: true },
    courseName: { type: String, required: true },
    status: { type: String, enum: ['available', 'in-progress', 'completed'], default: 'available' },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null }
  }],
  
  // Rate Information (hourlyRate = per 25-min class PHP; synced from payout tier + creds)
  hourlyRate: { type: Number, default: 100 },
  /** Base pay tier (180/230/280/330). Set by admin; null = derive from hourlyRate for legacy rows. */
  payoutTierBase: { type: Number, default: null },
  payoutCred1: { type: Boolean, default: false },
  payoutCred2: { type: Boolean, default: false },
  payoutCred3: { type: Boolean, default: false },

  // Referral link code (used for teacher commission tracking)
  referralCode: { type: String, default: null, unique: true, sparse: true },
  
  // Payment History
  paymentHistory: [{
    duration: { type: String },
    issueDate: { type: Date },
    amount: { type: Number },
    remark: { type: Number, default: 0 },
    paymentMethod: { type: String },
    account: { type: String },
    /** Dispersed / pending / failed — indexed with teacherId for fee views */
    status: { type: String },
    /** Optional mirror for admin queries (defaults unset; use status if blank) */
    paymentStatus: { type: String },
    /** Short label for statements (optional) */
    studentName: { type: String },
  }],
  
  // Original fields
  photo: { type: String, default: null },
  intro: { type: String, default: 'No introduction available' },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  
  // Status field
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  loginAttempts: { type: Number, default: 0 },
  lockUntil: { type: Date, default: null },
  hasGeneratedPassword: { type: Boolean, default: false },
  
  // Assessment Test Results
  assessmentTests: {
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    listening: {
      audioRecording: { type: String, default: null }, // Base64 audio data
      audioFileName: { type: String, default: null },
      completedAt: { type: Date, default: null }
    },
    typing: {
      wpm: { type: Number, default: null }, // Words per minute
      accuracy: { type: Number, default: null }, // Percentage
      text: { type: String, default: null }, // Typed text
      completedAt: { type: Date, default: null }
    },
    reading: {
      audioRecording: { type: String, default: null }, // Base64 audio data
      audioFileName: { type: String, default: null },
      text: { type: String, default: null }, // Text that was read
      completedAt: { type: Date, default: null }
    },
    pronunciation: {
      audioRecording: { type: String, default: null }, // Base64 audio data
      audioFileName: { type: String, default: null },
      words: [{ 
        word: { type: String },
        audio: { type: String } // Individual word recordings
      }],
      completedAt: { type: Date, default: null }
    },
    grammar: {
      score: { type: Number, default: null },
      total: { type: Number, default: null },
      answers: { type: mongoose.Schema.Types.Mixed, default: null },
      completedAt: { type: Date, default: null }
    },
    vocabulary: {
      score: { type: Number, default: null },
      total: { type: Number, default: null },
      answers: { type: mongoose.Schema.Types.Mixed, default: null },
      completedAt: { type: Date, default: null }
    },
    personality: {
      score: { type: Number, default: null },
      total: { type: Number, default: null },
      percent: { type: Number, default: null },
      answers: { type: mongoose.Schema.Types.Mixed, default: null },
      categoryScores: { type: mongoose.Schema.Types.Mixed, default: null },
      completedAt: { type: Date, default: null }
    }
  }
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true },
});

teacherSchema.index({ email: 1, teacherId: 1 });
teacherSchema.index({ email: 1, status: 1 });
teacherSchema.index({ teacherId: 1, status: 1 });
/** Public teacher directory / landing: filter by status + stable sort (avoids in-memory sorts on large sets). */
teacherSchema.index({ status: 1, fullname: 1, teacherId: 1 });
// Service-fee / payout: teacher + line status (multikey on paymentHistory)
teacherSchema.index({ teacherId: 1, 'paymentHistory.status': 1 });
teacherSchema.index({ teacherId: 1, 'paymentHistory.paymentStatus': 1 });

module.exports = mongoose.model('Teacher', teacherSchema); 