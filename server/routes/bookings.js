const express = require('express');
const { verifyToken, requireTeacher } = require('../authMiddleware');
const teacherRoutes = require('../teacher');

const router = express.Router();

/**
 * Teacher “save open slots” — same handler as POST /api/teacher/open-slot.
 * Teacher ID always comes from the JWT via requireTeacher (never from the URL).
 */
router.post('/save-slot', verifyToken, requireTeacher, teacherRoutes.handleTeacherOpenSlots);

module.exports = router;
