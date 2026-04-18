const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const applicationSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    /** Legacy: some older applications only have this (bcrypt). New applications use contactNo only. */
    password: {
      type: String,
      required: false,
      default: null
    },
    contactNo: {
      type: String,
      default: '',
      trim: true
    },
    currentStage: {
      type: String,
      enum: ['applied', 'testing', 'interviewing', 'demo', 'documentation', 'passed', 'failed'],
      default: 'applied',
      index: true
    },
    status: {
      type: Boolean,
      default: true,
      index: true
    },
    teacherActivationStatus: {
      type: String,
      enum: ['Applicant', 'Active Teacher'],
      default: 'Applicant',
      index: true
    },
    passedAt: {
      type: Date,
      default: null
    },
    failedAt: {
      type: Date,
      default: null
    },
    /** After a failed screening, applicant may submit again only on or after this date (typically failedAt + 3 months). */
    reapplyEligibleAt: {
      type: Date,
      default: null
    },
    hiredAt: {
      type: Date,
      default: null
    },
    testAnswers: {
      text: {
        type: String,
        default: ''
      },
      videoUrls: {
        type: [String],
        default: []
      }
    },
    demoVideoUrl: {
      type: String,
      default: ''
    },
    uploadedDocuments: {
      nbi: {
        type: String,
        default: ''
      },
      nationalId: {
        type: String,
        default: ''
      }
    }
  },
  {
    timestamps: true
  }
);

applicationSchema.pre('save', async function applicationPreSave(next) {
  if (!this.isModified('password')) return next();
  const p = this.password;
  if (p == null || String(p).trim() === '') {
    this.password = undefined;
    return next();
  }
  try {
    this.password = await bcrypt.hash(String(p), 10);
    return next();
  } catch (error) {
    return next(error);
  }
});

applicationSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(candidatePassword, this.password);
};

applicationSchema.index({ email: 1, currentStage: 1 });
applicationSchema.index({ email: 1, teacherActivationStatus: 1 });
applicationSchema.index({ email: 1, status: 1 });

module.exports = mongoose.model('Application', applicationSchema);
