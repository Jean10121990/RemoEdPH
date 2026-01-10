const mongoose = require('mongoose');

const starReceivedSchema = new mongoose.Schema({
    recipientId: {
        type: String,
        required: true,
        index: true
    },
    recipientType: {
        type: String,
        enum: ['teacher', 'student'],
        required: true,
        index: true
    },
    giverId: {
        type: String,
        required: true
    },
    giverType: {
        type: String,
        enum: ['teacher', 'student'],
        required: true
    },
    bookingId: {
        type: String,
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    feedbackId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Feedback',
        required: false
    },
    receivedAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    lessonDate: {
        type: Date,
        required: true
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
starReceivedSchema.index({ recipientId: 1, recipientType: 1, receivedAt: -1 });
starReceivedSchema.index({ bookingId: 1 });
starReceivedSchema.index({ recipientId: 1, recipientType: 1, rating: 1 });

module.exports = mongoose.model('StarReceived', starReceivedSchema);

