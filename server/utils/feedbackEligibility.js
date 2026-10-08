/**
 * Class feedback is only for a class that was taught.
 * Student absent stays absent. A report issue keeps its fee with QA’s review.
 */
const IssueReport = require('../models/IssueReport');

function isStudentAbsentBooking(booking) {
  if (!booking) return false;
  const st = String(booking.status || '').toLowerCase();
  return st === 'absent' || !!booking.absentMarkedAt;
}

/**
 * @returns {Promise<{ blocked: boolean, code?: string, error?: string }>}
 */
async function feedbackBlockForBooking(booking) {
  if (!booking) {
    return { blocked: true, code: 'BOOKING_MISSING', error: 'Booking not found' };
  }
  if (isStudentAbsentBooking(booking)) {
    return {
      blocked: true,
      code: 'STUDENT_ABSENT',
      error: 'This class is marked student absent. It cannot be changed to complete feedback.',
    };
  }

  const issues = await IssueReport.find({ bookingId: String(booking._id) })
    .select('status')
    .lean();
  if (!issues.length) return { blocked: false };

  const waitingOnQa = issues.some((issue) => {
    const st = String(issue.status || '').toLowerCase();
    return st === 'pending' || st === 'reviewed';
  });
  if (waitingOnQa) {
    return {
      blocked: true,
      code: 'ISSUE_PENDING_QA',
      error:
        'This class has a report issue. QA still has to check the proof. The teaching fee is set from that review, not from class feedback.',
    };
  }

  const resolved = issues.some((issue) => String(issue.status || '').toLowerCase() === 'resolved');
  if (resolved) {
    return {
      blocked: true,
      code: 'ISSUE_RESOLVED',
      error:
        'This class was reported as an issue. The teaching fee follows QA’s decision (system issue, teacher issue, or student issue). Class feedback is not used for that fee.',
    };
  }

  return { blocked: false };
}

module.exports = {
  isStudentAbsentBooking,
  feedbackBlockForBooking,
};
