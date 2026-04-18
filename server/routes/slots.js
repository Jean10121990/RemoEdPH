const express = require('express');
const Teacher = require('../models/Teacher');

const router = express.Router();

/** 24-char hex ObjectId string (MongoDB _id) — avoids treating arbitrary strings as ObjectId. */
function isProbableHexObjectId(s) {
  return typeof s === 'string' && /^[a-f0-9]{24}$/i.test(String(s).trim());
}

function escapeRegex(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve stable `teacher.teacherId` string from URL param.
 * Uses **Teachers** collection (`Teacher` model) only — not Users/Admins.
 * 1) `findById` when param is a 24-char hex MongoDB _id (preferred for slot loader).
 * 2) Stable `teacherId` field (e.g. kjb… / legacy ids).
 * 3) Username exact, then username case-insensitive.
 * 4) Email case-insensitive anchored regex match.
 */
async function resolveCanonicalTeacherIdFromParam(raw) {
  const s = String(raw || '').trim();
  if (!s || s === 'undefined' || s === 'null') return null;

  if (isProbableHexObjectId(s)) {
    const byId = await Teacher.findById(s).lean();
    if (byId) return byId.teacherId;
  }

  let row = await Teacher.findOne({ teacherId: s }).lean();
  if (row) return row.teacherId;

  row = await Teacher.findOne({ username: s }).lean();
  if (row) return row.teacherId;

  const sLower = s.toLowerCase();
  row = await Teacher.findOne({
    $expr: {
      $eq: [{ $toLower: { $ifNull: ['$username', ''] } }, sLower],
    },
  }).lean();
  if (row) return row.teacherId;

  row = await Teacher.findOne({
    email: { $regex: new RegExp('^' + escapeRegex(s) + '$', 'i') },
  }).lean();
  if (row) return row.teacherId;

  return null;
}

/**
 * GET /api/slots/:teacherId?week=YYYY-MM-DD&allSlots=true&tz=...
 * `:teacherId` should be the teacher document **MongoDB _id** (24 hex) when possible; legacy stable `teacherId` / username still supported.
 */
router.get('/:teacherId', async (req, res) => {
  const raw = String(req.params.teacherId || '').trim();

  try {
    if (!raw || raw === 'undefined' || raw === 'null') {
      return res.status(400).json({
        success: false,
        error: 'Invalid teacher id',
        message: 'The teacher id in the URL is missing or invalid. Please sign in again.',
        code: 'INVALID_TEACHER_ID',
        searchedId: raw,
      });
    }

    const canonical = await resolveCanonicalTeacherIdFromParam(raw);
    if (!canonical) {
      return res.status(404).json({
        success: false,
        error: 'No teacher matches',
        message: 'No teacher record matches this id in the Teachers collection. Please sign out and sign in again.',
        code: 'TEACHER_NOT_FOUND',
        searchedId: raw,
      });
    }

    const week = req.query.week;
    if (!week) {
      return res.status(400).json({
        success: false,
        error: 'Missing week parameter',
        message: 'Add ?week=YYYY-MM-DD (Monday of the week you want to load).',
        code: 'MISSING_WEEK',
        searchedId: raw,
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
      searchedId: raw,
    });
  }
});

module.exports = router;
