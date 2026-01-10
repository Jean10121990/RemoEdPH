const mongoose = require('mongoose');

const teacherAttendanceAnalysisSchema = new mongoose.Schema({
    teacherId: {
        type: String,
        required: true,
        index: true
    },
    periodStart: {
        type: Date,
        required: true,
        index: true
    },
    periodEnd: {
        type: Date,
        required: true
    },
    periodType: {
        type: String,
        enum: ['weekly', 'monthly', 'custom'],
        required: true
    },
    // Attendance metrics
    completedClasses: {
        type: Number,
        default: 0
    },
    teacherAbsences: {
        type: Number,
        default: 0
    },
    studentAbsences: {
        type: Number,
        default: 0
    },
    cancellations: {
        type: Number,
        default: 0
    },
    lateArrivals: {
        type: Number,
        default: 0
    },
    totalLateMinutes: {
        type: Number,
        default: 0
    },
    systemIssues: {
        type: Number,
        default: 0
    },
    teacherIssues: {
        type: Number,
        default: 0
    },
    studentIssues: {
        type: Number,
        default: 0
    },
    // Detailed breakdown
    breakdown: {
        completed: [{
            bookingId: String,
            date: Date,
            time: String,
            lateMinutes: Number
        }],
        teacherAbsent: [{
            bookingId: String,
            date: Date,
            time: String,
            reason: String
        }],
        studentAbsent: [{
            bookingId: String,
            date: Date,
            time: String
        }],
        cancelled: [{
            bookingId: String,
            date: Date,
            time: String,
            cancelledBy: String,
            cancellationTime: Date
        }],
        late: [{
            bookingId: String,
            date: Date,
            time: String,
            lateMinutes: Number
        }],
        systemIssues: [{
            bookingId: String,
            issueId: String,
            date: Date,
            description: String
        }],
        teacherIssues: [{
            bookingId: String,
            issueId: String,
            date: Date,
            description: String
        }],
        studentIssues: [{
            bookingId: String,
            issueId: String,
            date: Date,
            description: String
        }]
    },
    // Calculated metrics
    attendanceRate: {
        type: Number,
        default: 0 // Percentage of completed classes vs total scheduled
    },
    punctualityRate: {
        type: Number,
        default: 0 // Percentage of on-time classes vs completed classes
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

// Index for efficient queries
teacherAttendanceAnalysisSchema.index({ teacherId: 1, periodStart: -1, periodEnd: -1 });

module.exports = mongoose.model('TeacherAttendanceAnalysis', teacherAttendanceAnalysisSchema);

