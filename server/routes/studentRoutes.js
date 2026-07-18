/**
 * Student API router — mounted at app.use('/api/student', studentRoutes).
 *
 * Important paths (full URL = /api/student + path below):
 * - GET  /bookings/history   — recent bookings (query: limit 1–50, default 20; newest first)
 * - GET  /bookings           — calendar week slice (query: week=YYYY-MM-DD, timezoneOffset, tz)
 * - GET  /profile            — student profile
 *
 * The implementation lives in ../student.js (this file is the documented entry point).
 */
module.exports = require('../student');
