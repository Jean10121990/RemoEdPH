const mongoose = require('mongoose');

const cancellationRequestSchema = new mongoose.Schema({
  bookingId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Booking', 
    required: true 
  },
  requesterType: { 
    type: String, 
    enum: ['student', 'teacher'], 
    required: true 
  },
  requesterId: { 
    type: String, 
    required: true 
  },
  reason: { 
    type: String, 
    required: true,
    minlength: 10,
    maxlength: 500
  },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  adminReview: {
    reviewedBy: { 
      type: String 
    },
    reviewedAt: { 
      type: Date 
    },
    adminNotes: { 
      type: String,
      maxlength: 500
    }
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Update the updatedAt field before saving
cancellationRequestSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('CancellationRequest', cancellationRequestSchema); 