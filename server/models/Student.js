const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
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
  subscriptionStatus: { type: String, enum: ['active', 'expired', 'cancelled'], default: 'active' },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Student', studentSchema); 