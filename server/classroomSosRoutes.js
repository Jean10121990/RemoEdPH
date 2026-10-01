const express = require('express');
const {
  verifyToken,
  requireTeacher,
  verifyAdminApiAuth,
  requirePermission,
} = require('./authMiddleware');
const sos = require('./services/classroomSosService');

const teacherSosRouter = express.Router();

/** Teacher JWT. Ownership is the canonical teacher id on the booking, not the body. */
teacherSosRouter.post('/classroom-sos', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherRaw = req.user.teacherId || req.user.username;
    const result = await sos.raiseSos(teacherRaw, req.body || {});
    res.json({
      success: true,
      created: result.created,
      incident: sos.publicIncident(result.incident),
    });
  } catch (e) {
    res.status(e.statusCode || 500).json({
      success: false,
      error: e.message || 'Could not raise SOS',
      code: e.code,
    });
  }
});

teacherSosRouter.post('/classroom-sos/:id/withdraw', verifyToken, requireTeacher, async (req, res) => {
  try {
    const incident = await sos.withdrawSos(req.user.teacherId || req.user.username, req.params.id);
    res.json({ success: true, incident: sos.publicIncident(incident) });
  } catch (e) {
    res.status(e.statusCode || 500).json({
      success: false,
      error: e.message || 'Could not withdraw SOS',
      code: e.code,
    });
  }
});

const adminSosRouter = express.Router();

/** Admin JWT plus incident:manage. Super-Admin always passes. */
adminSosRouter.get('/incidents', verifyAdminApiAuth, requirePermission('incident:manage'), async (req, res) => {
  try {
    const incidents = await sos.listIncidents(String(req.query.status || 'open'));
    res.json({ success: true, incidents });
  } catch (e) {
    res.status(500).json({ success: false, error: 'Could not list incidents' });
  }
});

adminSosRouter.post('/incidents/:id/action', verifyAdminApiAuth, requirePermission('incident:manage'), async (req, res) => {
  try {
    const result = await sos.actOnIncident(
      req.params.id,
      req.body && req.body.action,
      req.user.adminId || req.user.username
    );
    res.json({
      success: true,
      incident: sos.publicIncident(result.incident),
      observeUrl: result.observeUrl || '',
      creditRestored: !!result.creditRestored,
    });
  } catch (e) {
    res.status(e.statusCode || 500).json({
      success: false,
      error: e.message || 'Could not update incident',
      code: e.code,
    });
  }
});

module.exports = { teacherSosRouter, adminSosRouter };
