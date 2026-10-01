const Booking = require('../models/Booking');
const IncidentReport = require('../models/IncidentReport');
const { resolveToCanonicalTeacherId } = require('./teacherSlotResolve');
const { restoreCreditAfterTechnicalSos } = require('./bookingCreditLedger');
const { notifyAdmin } = require('./notifyService');
const realtime = require('../realtime');

const CATEGORY_TIER = {
  technical_failure: 1,
  unaccompanied_child: 2,
  unauthorized_adult: 3,
  safety_distress: 3,
};

const CATEGORY_LABEL = {
  technical_failure: 'Technical failure (power or internet)',
  unaccompanied_child: 'Unaccompanied child under 6',
  unauthorized_adult: 'Unauthorized adult or behavioral issue',
  safety_distress: 'Safety, distress, or inappropriate content',
};

const WITHDRAW_MS = 15 * 1000;

function httpError(status, message, code) {
  const err = new Error(message);
  err.statusCode = status;
  err.code = code;
  return err;
}

function publicIncident(doc) {
  if (!doc) return null;
  const row = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(row._id),
    bookingId: row.bookingId ? String(row.bookingId) : '',
    classroomId: row.classroomId || '',
    lessonId: row.lessonId ? String(row.lessonId) : '',
    teacherId: row.teacherId || '',
    studentId: row.studentId || '',
    category: row.category,
    categoryLabel: CATEGORY_LABEL[row.category] || row.category,
    tier: row.tier,
    description: row.description || '',
    status: row.status,
    creditRestored: row.creditRestored === true,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  };
}

async function emitSos(incident, extra) {
  const payload = Object.assign({ incident: publicIncident(incident) }, extra || {});
  if (incident && incident.classroomId) {
    realtime.emitToRoom(incident.classroomId, 'classroom-sos', payload);
  }
  try {
    const Admin = require('../models/Admin');
    const admins = await Admin.find({}).select('username').limit(50).lean();
    const names = new Set(['admin']);
    admins.forEach((row) => {
      if (row && row.username) names.add(String(row.username));
    });
    names.forEach((name) => {
      realtime.emitToRoom('notif:admin:' + name, 'classroom-sos', payload);
    });
  } catch (e) {
    console.warn('[sos] admin fan-out failed:', e.message || e);
  }
}

async function loadOwnedBooking(teacherRaw, body) {
  const teacherId = await resolveToCanonicalTeacherId(teacherRaw);
  if (!teacherId) throw httpError(403, 'Teacher identity could not be resolved.', 'TEACHER_REQUIRED');
  const bookingId = body && body.bookingId;
  const classroomId = body && (body.classroomId || body.room);
  let booking = null;
  if (bookingId && String(bookingId).match(/^[a-f0-9]{24}$/i)) {
    booking = await Booking.findById(bookingId);
  }
  if (!booking && classroomId) {
    booking = await Booking.findOne({ classroomId: String(classroomId) });
  }
  if (!booking) throw httpError(404, 'Class not found.', 'BOOKING_NOT_FOUND');
  const owner = await resolveToCanonicalTeacherId(booking.teacherId);
  if (!owner || owner !== teacherId) {
    throw httpError(403, 'This class is not yours.', 'NOT_YOUR_CLASS');
  }
  return { booking, teacherId };
}

async function raiseSos(teacherRaw, body) {
  const category = String((body && body.category) || '');
  if (!CATEGORY_TIER[category]) {
    throw httpError(400, 'Choose an incident category.', 'INVALID_CATEGORY');
  }
  const { booking, teacherId } = await loadOwnedBooking(teacherRaw, body);
  const existing = await IncidentReport.findOne({
    classroomId: booking.classroomId || '',
    status: 'open',
  });
  if (existing) return { incident: existing, created: false };

  const description = String((body && body.description) || '').trim().slice(0, 500);
  const incident = await IncidentReport.create({
    bookingId: booking._id,
    classroomId: booking.classroomId || '',
    lessonId: booking.lessonId || null,
    teacherId,
    studentId: booking.studentId || '',
    category,
    tier: CATEGORY_TIER[category],
    description,
    status: 'open',
    raisedBy: teacherId,
  });

  const label = CATEGORY_LABEL[category];
  const message =
    'SOS in class ' +
    (booking.classroomId || '') +
    ' — ' +
    label +
    '. Student ' +
    (booking.studentId || '') +
    '.';
  try {
    await notifyAdmin('classroom-sos', message, {
      actionUrl: '/admin-qa-hub.html#sos',
      meta: { incidentId: String(incident._id), classroomId: booking.classroomId || '' },
    });
  } catch (e) {
    console.warn('[sos] notify failed:', e.message || e);
  }
  try {
    const emailService = require('../emailService');
    await emailService.sendRawEmail(
      'admin@remoedph.com',
      'RemoEd SOS: ' + label,
      '<p>' + message + '</p><p><a href="https://remoedph.com/admin-qa-hub.html#sos">Open Classroom SOS</a></p>',
      message
    );
  } catch (e) {
    console.warn('[sos] email failed:', e.message || e);
  }
  emitSos(incident, { event: 'raised' });
  return { incident, created: true };
}

async function withdrawSos(teacherRaw, incidentId) {
  const teacherId = await resolveToCanonicalTeacherId(teacherRaw);
  const incident = await IncidentReport.findById(incidentId);
  if (!incident) throw httpError(404, 'Incident not found.', 'NOT_FOUND');
  if (incident.teacherId !== teacherId && incident.raisedBy !== teacherId) {
    throw httpError(403, 'This incident is not yours.', 'NOT_YOUR_CLASS');
  }
  if (incident.status !== 'open') {
    throw httpError(400, 'This SOS can no longer be withdrawn.', 'SOS_NOT_OPEN');
  }
  const age = Date.now() - new Date(incident.createdAt).getTime();
  if (age > WITHDRAW_MS) {
    throw httpError(400, 'The 15-second withdraw window has closed.', 'SOS_WITHDRAW_CLOSED');
  }
  incident.status = 'withdrawn';
  incident.resolvedAt = new Date();
  await incident.save();
  emitSos(incident, { event: 'withdrawn' });
  return incident;
}

async function listIncidents(status) {
  const q = {};
  if (status && status !== 'all') q.status = status;
  const rows = await IncidentReport.find(q).sort({ createdAt: -1 }).limit(100).lean();
  return rows.map(publicIncident);
}

async function actOnIncident(incidentId, action, adminId) {
  const incident = await IncidentReport.findById(incidentId);
  if (!incident) throw httpError(404, 'Incident not found.', 'NOT_FOUND');
  const allowed = ['observe', 'pause', 'terminate', 'resolve'];
  if (allowed.indexOf(action) === -1) {
    throw httpError(400, 'Unknown action.', 'INVALID_ACTION');
  }
  if (action === 'observe') {
    incident.status = 'observing';
    await incident.save();
    emitSos(incident, { event: 'observing' });
    return { incident, observeUrl: '/live-classroom.html?room=' + encodeURIComponent(incident.classroomId || '') + '&observer=1&type=observer' };
  }
  if (action === 'pause' || action === 'terminate') {
    const command = action === 'pause' ? 'pause' : 'terminate';
    realtime.emitToRoom(incident.classroomId, 'classroom-session-command', {
      command,
      incidentId: String(incident._id),
      category: incident.category,
    });
    if (action === 'pause') {
      incident.status = 'paused';
      await incident.save();
      emitSos(incident, { event: 'paused' });
      return { incident };
    }
    const booking = incident.bookingId ? await Booking.findById(incident.bookingId) : null;
    let creditRestored = false;
    if (incident.category === 'technical_failure' && booking) {
      const result = await restoreCreditAfterTechnicalSos(booking);
      creditRestored = !!result.restored;
    }
    if (booking) {
      booking.scheduleRemark = 'Ended by admin';
      await booking.save();
    }
    incident.status = 'terminated';
    incident.creditRestored = creditRestored;
    incident.resolvedBy = String(adminId || '');
    incident.resolvedAt = new Date();
    await incident.save();
    emitSos(incident, { event: 'terminated', creditRestored });
    return { incident, creditRestored };
  }
  const wasPaused = incident.status === 'paused';
  incident.status = 'resolved';
  incident.resolvedBy = String(adminId || '');
  incident.resolvedAt = new Date();
  await incident.save();
  if (incident.bookingId) {
    await Booking.updateOne(
      { _id: incident.bookingId },
      { $set: { scheduleRemark: 'Resolved' } }
    );
  }
  emitSos(incident, { event: 'resolved' });
  if (incident.classroomId) {
    realtime.emitToRoom(incident.classroomId, 'classroom-session-command', {
      command: 'resume',
      incidentId: String(incident._id),
      wasPaused,
    });
    realtime.schedulePeerReady(incident.classroomId);
  }
  return { incident };
}

async function ensureSosScheduleRemarks(teacherId) {
  const id = String(teacherId || '').trim();
  if (!id) return;
  const incidents = await IncidentReport.find({
    teacherId: id,
    status: { $in: ['terminated', 'resolved'] },
    bookingId: { $ne: null },
  })
    .select('bookingId status')
    .limit(200)
    .lean();
  for (const inc of incidents) {
    const remark = inc.status === 'terminated' ? 'Ended by admin' : 'Resolved';
    const booking = await Booking.findById(inc.bookingId);
    if (!booking) continue;
    const wasCancelled = String(booking.status || '') === 'cancelled';
    if (booking.scheduleRemark === remark && !wasCancelled) continue;
    booking.scheduleRemark = remark;
    if (wasCancelled) booking.status = 'Booked';
    try {
      await booking.save();
    } catch (err) {
      if (wasCancelled) {
        booking.status = 'cancelled';
        await booking.save();
      }
    }
  }
}

module.exports = {
  CATEGORY_TIER,
  publicIncident,
  raiseSos,
  withdrawSos,
  listIncidents,
  actOnIncident,
  ensureSosScheduleRemarks,
};
