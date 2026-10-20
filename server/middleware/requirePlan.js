const { isPaidSubscriber } = require('../services/freePlanAccess');

module.exports = function requirePaidPlan(req, res, next) {
  const student = req.student || null;
  if (!isPaidSubscriber(student)) {
    return res.status(402).json({
      error: 'A paid plan is needed to book a live lesson.',
      next: '/plans',
    });
  }
  next();
};
