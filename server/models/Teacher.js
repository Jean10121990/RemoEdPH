const mongoose = require('mongoose');

const teacherSchema = new mongoose.Schema({
  teacherId: { type: String, required: true, unique: true }, // Unique teacher ID like "kjb00000001"
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  
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
  contact: { type: String, default: '' },
  email: { type: String, default: '' },
  emergencyContact: { type: String, default: '' },
  
  // Professional Information
  introduction: { type: String, default: '' },
  experience: { type: String, default: '' },
  
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
    validId: { type: String, default: null }
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
    creativityHobbies: { type: String, default: '' }
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
      writing: { type: String, default: null }
    },
    notes: { type: String, default: '' },
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
  
  // Rate Information
  hourlyRate: { type: Number, default: 100 },
  
  // Payment History
  paymentHistory: [{
    duration: { type: String },
    issueDate: { type: Date },
    amount: { type: Number },
    remark: { type: Number, default: 0 },
    paymentMethod: { type: String },
    account: { type: String },
    status: { type: String }
  }],
  
  // Original fields
  photo: { type: String, default: null },
  intro: { type: String, default: 'No introduction available' },
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  
  // Status field
  status: { type: String, enum: ['active', 'suspended'], default: 'active' },
  hasGeneratedPassword: { type: Boolean, default: false }
}, {
  timestamps: true
});

module.exports = mongoose.model('Teacher', teacherSchema); 