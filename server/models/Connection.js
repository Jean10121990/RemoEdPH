const mongoose = require('mongoose');

const connectionSchema = new mongoose.Schema({
  requesterId: {
    type: String,
    required: true,
    index: true
  },
  recipientId: {
    type: String,
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'cancelled'],
    default: 'pending',
    index: true
  },
  message: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index to ensure unique connection requests
connectionSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });

// Index for efficient queries
connectionSchema.index({ requesterId: 1, status: 1 });
connectionSchema.index({ recipientId: 1, status: 1 });

const Connection = mongoose.model('Connection', connectionSchema);

module.exports = Connection;
