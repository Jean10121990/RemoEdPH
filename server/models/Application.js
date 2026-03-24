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
    password: {
      type: String,
      required: true
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
  try {
    this.password = await bcrypt.hash(this.password, 10);
    return next();
  } catch (error) {
    return next(error);
  }
});

applicationSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Application', applicationSchema);
