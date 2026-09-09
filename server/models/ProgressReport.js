const mongoose = require('mongoose');

const QUALITATIVE_LEVELS = ['Exploring', 'Growing', 'Mastering'];

const skillAssessmentSchema = new mongoose.Schema(
  {
    Vocabulary: { type: String, enum: QUALITATIVE_LEVELS, default: 'Exploring' },
    Grammar: { type: String, enum: QUALITATIVE_LEVELS, default: 'Exploring' },
    Reading: { type: String, enum: QUALITATIVE_LEVELS, default: 'Exploring' },
    Writing: { type: String, enum: QUALITATIVE_LEVELS, default: 'Exploring' },
    Spelling: { type: String, enum: QUALITATIVE_LEVELS, default: 'Exploring' },
    Pronunciation: { type: String, enum: QUALITATIVE_LEVELS, default: 'Exploring' },
  },
  { _id: false }
);

/**
 * Quarterly progress letter for parents — encouraging, non-graded.
 */
const progressReportSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    quarter: { type: String, enum: ['Q1', 'Q2', 'Q3', 'Q4'], required: true },
    year: { type: Number, required: true, index: true },
    skillsAssessment: { type: skillAssessmentSchema, default: () => ({}) },
    teacherSummary: { type: String, maxlength: 4000, default: '' },
    attendanceRate: { type: Number, min: 0, max: 100, default: null },
    createdByTeacherId: { type: String, default: '' },
  },
  { timestamps: true }
);

progressReportSchema.index({ studentId: 1, year: 1, quarter: 1 }, { unique: true });

module.exports = mongoose.model('ProgressReport', progressReportSchema);
module.exports.QUALITATIVE_LEVELS = QUALITATIVE_LEVELS;
