const { isPaidSubscriber } = require('../services/freePlanAccess');

module.exports = function requirePaidPlan(req, res, next) {
  const student = req.student || null;
  if (!isPaidSubscriber(student)) {
    return res.status(402).json({
      error: 'You need credits to book a live class.',
      code: 'INSUFFICIENT_CREDITS',
      next: '/student-credits.html',
    });
  }
  next();
};
