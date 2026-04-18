const express = require('express');
const mongoose = require('mongoose');
const Teacher = require('../models/Teacher');

const router = express.Router();

async function resolveCanonicalTeacherId(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!s || s === 'undefined' || s === 'null') return null;

  let row = await Teacher.findOne({ teacherId: s });
  if (row) return row.teacherId;

  row = await Teacher.findOne({ $or: [{ username: s }, { email: s }] });
  if (row) return row.teacherId;

  if (mongoose.Types.ObjectId.isValid(s)) {
    row = await Teacher.findById(s);
    if (row) return row.teacherId;
  }
  return null;
}

/**
 * GET /api/slots/:teacherId?week=YYYY-MM-DD&allSlots=true&tz=...
 * Validates teacher exists (JSON body on errors), then serves the same payload as GET /api/teacher/slots.
 */
router.get('/:teacherId', async (req, res) => {
  try {
    const raw = String(req.params.teacherId || '').trim();
    if (!raw || raw === 'undefined' || raw === 'null') {
      return res.status(400).json({
        success: false,
        error: 'Invalid teacher id',
        message: 'The teacher id in the URL is missing or invalid. Please sign in again.',
        code: 'INVALID_TEACHER_ID',
      });
    }

    const canonical = await resolveCanonicalTeacherId(raw);
    if (!canonical) {
      return res.status(404).json({
        success: false,
        error: 'Teacher not found',
        message: 'No teacher record matches this id. Please sign out and sign in again.',
        code: 'TEACHER_NOT_FOUND',
      });
    }

    const week = req.query.week;
    if (!week) {
      return res.status(400).json({
        success: false,
        error: 'Missing week parameter',
        message: 'Add ?week=YYYY-MM-DD (Monday of the week you want to load).',
        code: 'MISSING_WEEK',
      });
    }

    const qs = new URLSearchParams();
    Object.keys(req.query).forEach((k) => {
      let v = req.query[k];
      if (Array.isArray(v)) v = v[0];
      if (v !== undefined && v !== null && String(v) !== '') qs.set(k, String(v));
    });
    qs.set('teacherId', canonical);

    return res.redirect(307, `/api/teacher/slots?${qs.toString()}`);
  } catch (e) {
    console.error('GET /api/slots/:teacherId:', e);
    return res.status(500).json({
      success: false,
      error: 'Server error',
      message: 'Could not load slots. Please try again.',
      code: 'SLOTS_ERROR',
    });
  }
});

module.exports = router;
