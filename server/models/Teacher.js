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
    diploma: { type: String, default: null },
    certifications: [{ type: String }],
    validId: { type: String, default: null }
  },
  
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