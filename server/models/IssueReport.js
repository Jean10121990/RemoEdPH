const mongoose = require('mongoose');

const issueReportSchema = new mongoose.Schema({
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
    issueType: {
        type: String,
        required: true,
        enum: [
            'Lesson Issue (Cannot preview lesson)',
            'Technical Issue (Audio/Video problems)',
            'Student Behavior Issue',
            'Payment Issue',
            'Schedule Conflict',
            'Other'
        ]
    },
    description: {
        type: String,
        required: true,
        maxlength: 1000
    },
    screenshotPath: {
        type: String,
        required: false
    },
    status: {
        type: String,
        required: true,
        enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
        default: 'pending'
    },
    // New fields for IT/tech support review
    validityStatus: {
        type: String,
        required: false,
        enum: ['valid', 'invalid', 'pending_review'],
        default: 'pending_review'
    },
    adminReviewNotes: {
        type: String,
        maxlength: 1000
    },
    reviewedBy: {
        type: String
    },
    reviewedAt: {
        type: Date
    },
    // Reschedule functionality
    canReschedule: {
        type: Boolean,
        default: false
    },
    rescheduleDeadline: {
        type: Date
    },
    rescheduleRequested: {
        type: Boolean,
        default: false
    },
    rescheduleRequestedAt: {
        type: Date
    },
    // Payment impact fields
    teacherPaymentImpact: {
        type: String,
        required: true,
        enum: ['normal', 'no_payment', 'partial_payment_10', 'partial_payment_50'],
        default: 'normal'
    },
    studentPaymentImpact: {
        type: String,
        required: true,
        enum: ['normal', 'full_payment', 'reschedule_available'],
        default: 'normal'
    },
    // Resolution details
    resolutionType: {
        type: String,
        enum: ['system-issue', 'teacher-fault', 'student-issue']
    },
    resolveNotes: {
        type: String,
        maxlength: 1000
    },
    teacherFaultReason: {
        type: String,
        maxlength: 500
    },
    resolvedAt: {
        type: Date
    },
    resolvedBy: {
        type: String
    },
    adminResponse: {
        type: String,
        maxlength: 1000
    },
    submittedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for efficient queries
issueReportSchema.index({ teacherId: 1, submittedAt: -1 });
issueReportSchema.index({ status: 1, submittedAt: -1 });
issueReportSchema.index({ bookingId: 1 });
issueReportSchema.index({ validityStatus: 1, status: 1 });
issueReportSchema.index({ studentId: 1, canReschedule: 1 });

module.exports = mongoose.model('IssueReport', issueReportSchema);
