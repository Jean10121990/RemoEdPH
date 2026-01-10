const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
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
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        required: false,
        maxlength: 1000
    },
    submittedAt: {
        type: Date,
        default: Date.now
    },
    lessonDate: {
        type: Date,
        required: true
    }
}, {
    timestamps: true
});

// Index for efficient queries
feedbackSchema.index({ teacherId: 1, submittedAt: -1 });
feedbackSchema.index({ bookingId: 1 });

module.exports = mongoose.model('Feedback', feedbackSchema);
