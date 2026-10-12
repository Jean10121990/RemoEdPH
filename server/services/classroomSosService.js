const Booking = require('../models/Booking');
const IncidentReport = require('../models/IncidentReport');
const { resolveToCanonicalTeacherId } = require('./teacherSlotResolve');
const { restoreCreditAfterTechnicalSos } = require('./bookingCreditLedger');
const { notifyAdmin } = require('./notifyService');
const realtime = require('../realtime');

const {
  CATEGORY_TIER,
  CATEGORY_LABEL,
  actionAllowed,
  canEscalate,
} = require('./classroomSosPolicy');
const crypto = require('crypto');

const WITHDRAW_MS = 15 * 1000;

function httpError(status, message, code) {
  const err = new Error(message);
  err.statusCode = status;
  err.code = code;
  return err;
}

function publicIncident(doc, opts) {
  if (!doc) return null;
  const staff = !!(opts && opts.staff);
  const row = doc.toObject ? doc.toObject() : doc;
  const base = {
    id: String(row._id),
    caseRef: row.caseRef || '',
    bookingId: row.bookingId ? String(row.bookingId) : '',
    classroomId: row.classroomId || '',
    lessonId: row.lessonId ? String(row.lessonId) : '',
    teacherId: row.teacherId || '',
    studentId: staff ? row.studentId || '' : '',
    category: row.category,
    categoryLabel: CATEGORY_LABEL[row.category] || row.category,
    tier: row.tier,
    originalTier: row.originalTier || row.tier,
    description: row.description || '',
    status: row.status,
    reviewStatus: row.reviewStatus || 'not_required',
    creditRestored: row.creditRestored === true,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    acknowledgedAt: row.acknowledgedAt || null,
  };
  if (!staff) return base;
  base.studentId = row.studentId || '';
  base.assignedTo = row.assignedTo || '';
  base.troubleshooting = row.troubleshooting || '';
  base.parentContactNote = row.parentContactNote || '';
  base.escalatedFrom = row.escalatedFrom || null;
  base.actions = Array.isArray(row.actions) ? row.actions : [];
  return base;
}

async function nextCaseRef() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  for (let i = 0; i < 5; i++) {
    const ref = 'SOS-' + day + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const exists = await IncidentReport.exists({ caseRef: ref });
    if (!exists) return ref;
  }
  return 'SOS-' + day + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function pushAction(incident, entry) {
  incident.actions = incident.actions || [];
  incident.actions.push({
    at: new Date(),
    actor: String(entry.actor || ''),
    action: entry.action,
    reason: String(entry.reason || '').slice(0, 500),
    fromTier: entry.fromTier == null ? null : entry.fromTier,
    toTier: entry.toTier == null ? null : entry.toTier,
    outcome: entry.outcome || '',
  });
}

async function emitSos(incident, extra) {
  const payload = Object.assign({ incident: publicIncident(incident, { staff: true }) }, extra || {});
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
  const tier = CATEGORY_TIER[category];
  const caseRef = await nextCaseRef();
  const incident = await IncidentReport.create({
    bookingId: booking._id,
    classroomId: booking.classroomId || '',
    lessonId: booking.lessonId || null,
    teacherId,
    studentId: booking.studentId || '',
    category,
    tier,
    originalTier: tier,
    caseRef,
    description,
    status: 'open',
    raisedBy: teacherId,
    actions: [
      {
        at: new Date(),
        actor: teacherId,
        action: 'submit',
        reason: description,
        toTier: tier,
        outcome: 'recorded',
      },
    ],
  });

  const label = CATEGORY_LABEL[category];
  const urgent = tier === 3 ? 'URGENT Tier 3 ' : 'Tier ' + tier + ' ';
  const message =
    urgent +
    'SOS ' +
    caseRef +
    ' in class ' +
    (booking.classroomId || '') +
    ' — ' +
    label +
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

async function listIncidents(status, tier) {
  const q = {};
  if (status && status !== 'all') q.status = status;
  const tierNum = Number(tier);
  if (tierNum === 1 || tierNum === 2 || tierNum === 3) q.tier = tierNum;
  const rows = await IncidentReport.find(q).sort({ tier: -1, createdAt: -1 }).limit(100).lean();
  return rows.map((row) => publicIncident(row, { staff: true }));
}

async function incidentCounts() {
  const rows = await IncidentReport.find({
    status: { $in: ['open', 'observing', 'paused'] },
  })
    .select('tier status reviewStatus acknowledgedAt')
    .lean();
  const counts = { active: rows.length, tier1: 0, tier2: 0, tier3: 0, unacked: 0, reviewPending: 0 };
  rows.forEach((row) => {
    if (row.tier === 1) counts.tier1 += 1;
    if (row.tier === 2) counts.tier2 += 1;
    if (row.tier === 3) counts.tier3 += 1;
    if (!row.acknowledgedAt) counts.unacked += 1;
  });
  counts.reviewPending = await IncidentReport.countDocuments({ reviewStatus: 'pending' });
  return counts;
}

async function actOnIncident(incidentId, action, adminId, body) {
  const incident = await IncidentReport.findById(incidentId);
  if (!incident) throw httpError(404, 'Incident not found.', 'NOT_FOUND');
  const allowed = ['observe', 'pause', 'terminate', 'resolve', 'acknowledge', 'note', 'escalate', 'parent_contact', 'troubleshoot', 'review'];
  if (allowed.indexOf(action) === -1) {
    throw httpError(400, 'Unknown action.', 'INVALID_ACTION');
  }
  const gate = actionAllowed(incident.tier, action);
  if (!gate.ok) throw httpError(403, gate.message, gate.code);
  const reason = String((body && body.reason) || '').trim().slice(0, 500);
  const actor = String(adminId || '');

  if (action === 'acknowledge') {
    incident.acknowledgedAt = incident.acknowledgedAt || new Date();
    incident.acknowledgedBy = actor;
    incident.assignedTo = incident.assignedTo || actor;
    pushAction(incident, { actor, action, outcome: 'acknowledged' });
    await incident.save();
    emitSos(incident, { event: 'acknowledged' });
    return { incident };
  }
  if (action === 'note' || action === 'troubleshoot') {
    if (reason.length < 4) throw httpError(400, 'Add a short note.', 'REASON_REQUIRED');
    if (action === 'troubleshoot') {
      incident.troubleshooting = (incident.troubleshooting ? incident.troubleshooting + '\n' : '') + reason;
    }
    pushAction(incident, { actor, action, reason, outcome: 'recorded' });
    await incident.save();
    return { incident };
  }
  if (action === 'parent_contact') {
    if (reason.length < 8) throw httpError(400, 'Record who was contacted and what was said.', 'REASON_REQUIRED');
    incident.parentContactNote = (incident.parentContactNote ? incident.parentContactNote + '\n' : '') + reason;
    pushAction(incident, { actor, action, reason, outcome: 'recorded' });
    await incident.save();
    return { incident };
  }
  if (action === 'escalate') {
    const toTier = Number(body && body.tier);
    if (!canEscalate(incident.tier, toTier)) {
      throw httpError(400, 'Escalate only to a higher tier.', 'INVALID_ESCALATION');
    }
    if (reason.length < 8) throw httpError(400, 'Say why this is now a higher tier.', 'REASON_REQUIRED');
    const fromTier = incident.tier;
    incident.escalatedFrom = fromTier;
    if (!incident.originalTier) incident.originalTier = fromTier;
    incident.tier = toTier;
    pushAction(incident, { actor, action, reason, fromTier, toTier, outcome: 'escalated' });
    await incident.save();
    emitSos(incident, { event: 'escalated' });
    try {
      await notifyAdmin(
        'classroom-sos',
        (toTier === 3 ? 'URGENT Tier 3 escalation ' : 'Escalated to Tier ' + toTier + ' ') +
          (incident.caseRef || '') +
          '. ' +
          reason,
        { actionUrl: '/admin-qa-hub.html#sos', meta: { incidentId: String(incident._id) } }
      );
    } catch (e) {
      console.warn('[sos] escalate notify failed:', e.message || e);
    }
    return { incident };
  }
  if (action === 'review') {
    if (Number(incident.tier) !== 3) {
      throw httpError(400, 'Supervisory review is for Tier 3.', 'REVIEW_TIER');
    }
    if (reason.length < 8) throw httpError(400, 'Record the review outcome.', 'REASON_REQUIRED');
    incident.reviewStatus = 'reviewed';
    pushAction(incident, { actor, action, reason, outcome: 'reviewed' });
    await incident.save();
    return { incident };
  }
  if (action === 'observe') {
    incident.status = 'observing';
    incident.assignedTo = incident.assignedTo || actor;
    pushAction(incident, { actor, action, reason, outcome: 'observer_link' });
    await incident.save();
    emitSos(incident, { event: 'observing' });
    return { incident, observeUrl: '/live-classroom.html?room=' + encodeURIComponent(incident.classroomId || '') + '&observer=1&type=observer' };
  }
  if (action === 'pause' || action === 'terminate') {
    if (action === 'pause' && Number(incident.tier) === 2 && reason.length < 8) {
      throw httpError(400, 'Say why the class needs to pause.', 'REASON_REQUIRED');
    }
    if (action === 'terminate' && reason.length < 8) {
      throw httpError(400, 'Say why the class is ending.', 'REASON_REQUIRED');
    }
    const command = action === 'pause' ? 'pause' : 'terminate';
    realtime.emitToRoom(incident.classroomId, 'classroom-session-command', {
      command,
      incidentId: String(incident._id),
      category: incident.category,
    });
    if (action === 'pause') {
      incident.status = 'paused';
      pushAction(incident, { actor, action, reason, outcome: 'command_sent' });
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
    incident.resolvedBy = actor;
    incident.resolvedAt = new Date();
    if (Number(incident.tier) === 3) incident.reviewStatus = 'pending';
    pushAction(incident, { actor, action, reason, outcome: 'command_sent' });
    await incident.save();
    emitSos(incident, { event: 'terminated', creditRestored });
    return { incident, creditRestored };
  }
  if (Number(incident.tier) === 3 && reason.length < 8) {
    throw httpError(400, 'Tier 3 needs a short resolution note. Review can follow after the class is safe.', 'REASON_REQUIRED');
  }
  const wasPaused = incident.status === 'paused';
  incident.status = 'resolved';
  incident.resolvedBy = actor;
  incident.resolvedAt = new Date();
  if (Number(incident.tier) === 3) incident.reviewStatus = 'pending';
  pushAction(incident, { actor, action, reason, outcome: 'resolved' });
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
    if (wasPaused) realtime.schedulePeerReady(incident.classroomId);
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
  incidentCounts,
  actOnIncident,
  ensureSosScheduleRemarks,
};
