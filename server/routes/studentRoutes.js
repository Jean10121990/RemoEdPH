/**
 * Student API router — mounted at app.use('/api/student', studentRoutes).
 *
 * Important paths (full URL = /api/student + path below):
 * - GET  /bookings/history   — booking history page (query: weeks, integer 1–104)
 * - GET  /bookings           — calendar week slice (query: week=YYYY-MM-DD)
 * - GET  /profile            — student profile
 *
 * The implementation lives in ../student.js (this file is the documented entry point).
 */
module.exports = require('../student');
