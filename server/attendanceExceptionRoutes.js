const express = require('express');
const { verifyToken, requireTeacher, verifyAdminApiAuth, requireAdmin } = require('./authMiddleware');
const { roleHas } = require('./services/adminRbac');
const svc = require('./services/attendanceExceptionService');

const teacherRouter = express.Router();
const adminRouter = express.Router();

function sendResult(res, result) {
  if (result && result.error) {
    return res.status(result.error.status).json({ success: false, message: result.error.message, error: result.error.message });
  }
  return res.json({ success: true, ...result });
}

teacherRouter.get('/attendance-exceptions/mine', verifyToken, requireTeacher, async (req, res) => {
  try {
    const blocking = await svc.findBlocking(req.user.teacherId);
    const rows = await svc.listMine(req.user.teacherId);
    res.json({ success: true, blocking: blocking ? svc.publicException(blocking, { includeReviewNotes: false }) : null, rows });
  } catch (err) {
    console.error('teacher attendance mine:', err);
    res.status(500).json({ success: false, message: 'Could not load attendance exceptions.' });
  }
});

teacherRouter.post('/attendance-exceptions/:id/submit', verifyToken, requireTeacher, async (req, res) => {
  try {
    sendResult(res, await svc.submitRequest(req.user.teacherId, req.params.id, req.body || {}));
  } catch (err) {
    console.error('teacher attendance submit:', err);
    res.status(500).json({ success: false, message: 'Could not submit the correction.' });
  }
});

teacherRouter.post('/attendance-exceptions/:id/clarify', verifyToken, requireTeacher, async (req, res) => {
  try {
    sendResult(res, await svc.clarify(req.user.teacherId, req.params.id, req.body || {}));
  } catch (err) {
    console.error('teacher attendance clarify:', err);
    res.status(500).json({ success: false, message: 'Could not send the clarification.' });
  }
});

adminRouter.get('/my-attendance-exceptions', verifyAdminApiAuth, requireAdmin, async (req, res) => {
  try {
    const workerId = 'admin:' + String(req.user.username || '').toLowerCase();
    const blocking = await svc.findBlocking(workerId);
    const rows = await svc.listMine(workerId);
    res.json({ success: true, blocking: blocking ? svc.publicException(blocking, { includeReviewNotes: false }) : null, rows });
  } catch (err) {
    console.error('admin attendance mine:', err);
    res.status(500).json({ success: false, message: 'Could not load attendance exceptions.' });
  }
});

adminRouter.post('/my-attendance-exceptions/:id/submit', verifyAdminApiAuth, requireAdmin, async (req, res) => {
  try {
    const workerId = 'admin:' + String(req.user.username || '').toLowerCase();
    sendResult(res, await svc.submitRequest(workerId, req.params.id, req.body || {}));
  } catch (err) {
    console.error('admin attendance submit:', err);
    res.status(500).json({ success: false, message: 'Could not submit the correction.' });
  }
});

adminRouter.post('/my-attendance-exceptions/:id/clarify', verifyAdminApiAuth, requireAdmin, async (req, res) => {
  try {
    const workerId = 'admin:' + String(req.user.username || '').toLowerCase();
    sendResult(res, await svc.clarify(workerId, req.params.id, req.body || {}));
  } catch (err) {
    console.error('admin attendance clarify:', err);
    res.status(500).json({ success: false, message: 'Could not send the clarification.' });
  }
});

async function requireReviewer(req, res, next) {
  const role = String((req.user && req.user.adminRole) || '').toLowerCase();
  if (role === 'super_admin') return next();
  const ok = await roleHas(role, 'hr:attendance_review');
  if (!ok) return res.status(403).json({ success: false, message: 'HR review permission is required.' });
  return next();
}

async function requireReportReader(req, res, next) {
  const role = String((req.user && req.user.adminRole) || '').toLowerCase();
  if (role === 'super_admin') return next();
  const hr = await roleHas(role, 'hr:attendance_review');
  const payroll = await roleHas(role, 'acct:payroll_view');
  if (!hr && !payroll) return res.status(403).json({ success: false, message: 'You cannot view this attendance report.' });
  return next();
}

adminRouter.get('/attendance-exceptions/summary', verifyAdminApiAuth, requireAdmin, requireReviewer, async (req, res) => {
  try {
    res.json({ success: true, counts: await svc.summary() });
  } catch (err) {
    console.error('attendance summary:', err);
    res.status(500).json({ success: false, message: 'Could not load counts.' });
  }
});

adminRouter.get('/attendance-exceptions/report', verifyAdminApiAuth, requireAdmin, requireReportReader, async (req, res) => {
  try {
    res.json({ success: true, ...(await svc.payrollReport(req.query || {})) });
  } catch (err) {
    console.error('attendance report:', err);
    res.status(500).json({ success: false, message: 'Could not load the report.' });
  }
});

adminRouter.get('/attendance-exceptions', verifyAdminApiAuth, requireAdmin, requireReviewer, async (req, res) => {
  try {
    res.json({ success: true, ...(await svc.listForHr(req.query || {})) });
  } catch (err) {
    console.error('attendance list:', err);
    res.status(500).json({ success: false, message: 'Could not load attendance exceptions.' });
  }
});

adminRouter.get('/attendance-exceptions/:id', verifyAdminApiAuth, requireAdmin, requireReviewer, async (req, res) => {
  try {
    const detail = await svc.getOne(req.params.id);
    if (!detail) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, ...detail });
  } catch (err) {
    console.error('attendance detail:', err);
    res.status(500).json({ success: false, message: 'Could not load the request.' });
  }
});

function review(action) {
  return async (req, res) => {
    try {
      sendResult(
        res,
        await svc.decide(req.params.id, { username: req.user.username, adminRole: req.user.adminRole }, action, req.body || {})
      );
    } catch (err) {
      console.error('attendance ' + action + ':', err);
      res.status(500).json({ success: false, message: 'Could not save the review.' });
    }
  };
}

adminRouter.post('/attendance-exceptions/:id/approve', verifyAdminApiAuth, requireAdmin, requireReviewer, review('approve'));
adminRouter.post('/attendance-exceptions/:id/reject', verifyAdminApiAuth, requireAdmin, requireReviewer, review('reject'));
adminRouter.post('/attendance-exceptions/:id/clarify', verifyAdminApiAuth, requireAdmin, requireReviewer, review('clarify'));
adminRouter.post('/attendance-exceptions/:id/classify', verifyAdminApiAuth, requireAdmin, requireReviewer, review('classify'));

module.exports = { teacherRouter, adminRouter };
