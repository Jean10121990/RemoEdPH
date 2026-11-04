'use strict';

const Booking = require('../models/Booking');
const ReviewRequest = require('../models/ReviewRequest');
const Student = require('../models/Student');
const { sendRawEmail } = require('../emailService');

async function maybeSendReviewNudge(studentId, rating) {
  if (!studentId || Number(rating) < 4) return;
  const existing = await ReviewRequest.findOne({ studentId: String(studentId) }).lean();
  if (existing) return;
  const done = await Booking.countDocuments({
    studentId: String(studentId),
    status: { $in: ['completed', 'Completed', 'finished'] },
  });
  if (done < 4) return;
  const student = await Student.findOne({
    $or: [{ username: String(studentId) }, { studentId: String(studentId) }],
  }).select('email name shareCode').lean();
  if (!student || !student.email) return;
  const ref = student.shareCode ? `https://remoedph.com/enroll?ref=${encodeURIComponent(student.shareCode)}` : 'https://remoedph.com/';
  const html = `<p>Thank you for learning with RemoEd.</p>
    <p>Share your teacher: <a href="${ref}">${ref}</a></p>
    <p><a href="https://www.facebook.com/remoedph">Facebook</a> · <a href="https://www.google.com/search?q=RemoEd+PH">Google</a></p>`;
  const sent = await sendRawEmail(student.email, 'How was your RemoEd class?', html, 'Thank you for learning with RemoEd.');
  if (sent && sent.success) await ReviewRequest.create({ studentId: String(studentId) });
}

module.exports = { maybeSendReviewNudge };
