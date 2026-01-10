const mongoose = require('mongoose');

const rewardSchema = new mongoose.Schema({
    bookingId: {
        type: String,
        required: true
    },
    teacherId: {
        type: String,
        required: true,
        index: true
    },
    studentId: {
        type: String,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['cookie', 'star'],
        required: true
    },
    reason: {
        type: String,
        default: 'Good performance during class'
    },
    givenAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
rewardSchema.index({ studentId: 1, givenAt: -1 });
rewardSchema.index({ teacherId: 1, givenAt: -1 });
rewardSchema.index({ bookingId: 1 });

module.exports = mongoose.model('Reward', rewardSchema);
