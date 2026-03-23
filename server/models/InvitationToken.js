const mongoose = require('mongoose');

const invitationTokenSchema = new mongoose.Schema(
  {
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true,
      index: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    isUsed: {
      type: Boolean,
      default: false,
      index: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    usedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('InvitationToken', invitationTokenSchema);
