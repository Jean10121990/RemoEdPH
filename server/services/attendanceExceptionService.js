const crypto = require('crypto');
const { DateTime } = require('luxon');
const TimeLog = require('../models/TimeLog');
const AttendanceException = require('../models/AttendanceException');
const AttendanceAudit = require('../models/AttendanceAudit');
const Teacher = require('../models/Teacher');
const Admin = require('../models/Admin');
const {
  attendanceConfig,
  cutoffForAttendanceDate,
  formatPhLabel,
  isBlockingStatus,
  parseReportedTimeout,
  reviewerIsEmployee,
  ownerExemptFromAttendance,
  BLOCKING_STATUSES,
  CLASSIFICATIONS,
} = require('./attendanceExceptionPolicy');

let closeLock = false;

function hoursBetween(start, end) {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.round(((b - a) / 3600000) * 100) / 100;
}

async function writeAudit(entry) {
  await AttendanceAudit.create({
    actorId: entry.actorId || 'system',
    actorRole: entry.actorRole || 'system',
    action: entry.action,
    entityId: entry.entityId ? String(entry.entityId) : '',
    reference: entry.reference || '',
    previous: entry.previous == null ? null : entry.previous,
    next: entry.next == null ? null : entry.next,
    reason: String(entry.reason || '').slice(0, 2000),
    at: new Date(),
  });
}

async function displayNameFor(ownerType, workerId) {
  if (ownerType === 'admin') {
    const username = String(workerId || '').replace(/^admin:/i, '');
    const admin = await Admin.findOne({ username: new RegExp('^' + username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') })
      .select('username firstName lastName')
      .lean();
    if (!admin) return username;
    const name = [admin.firstName, admin.lastName].filter(Boolean).join(' ').trim();
    return name || admin.username;
  }
  const teacher = await Teacher.findOne({ teacherId: workerId }).select('firstName lastName username teacherId').lean();
  if (!teacher) return String(workerId || '');
  const name = [teacher.firstName, teacher.lastName].filter(Boolean).join(' ').trim();
  return name || teacher.username || teacher.teacherId;
}

async function nextReference(attendanceDate) {
  const day = String(attendanceDate || '').replace(/-/g, '');
  for (let i = 0; i < 5; i++) {
    const ref = 'AE-' + day + '-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const exists = await AttendanceException.exists({ reference: ref });
    if (!exists) return ref;
  }
  return 'AE-' + day + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

async function notifyWorker(ownerType, workerId, message) {
  try {
    const { notifyTeacher } = require('./notifyService');
    const id = ownerType === 'admin' ? String(workerId || '').replace(/^admin:/i, '') : workerId;
    await notifyTeacher(id, 'attendance_exception', message, { importance: 'actionable' });
  } catch (err) {
    console.warn('attendance notify worker:', err.message || err);
  }
}

async function notifyReviewers(message) {
  try {
    const { notifyTeacher } = require('./notifyService');
    const reviewers = await Admin.find({ adminRole: { $in: ['super_admin', 'admin_hr'] } })
      .select('username')
      .limit(40)
      .lean();
    for (const row of reviewers) {
      if (row && row.username) {
        await notifyTeacher(row.username, 'attendance_exception', message, { importance: 'actionable' });
      }
    }
  } catch (err) {
    console.warn('attendance notify reviewers:', err.message || err);
  }
}

function usernameFromAdminWorker(workerId) {
  return String(workerId || '').replace(/^admin:/i, '').trim();
}

async function isOwnerExemptWorker(workerId) {
  const username = usernameFromAdminWorker(workerId);
  if (!username || !/^admin:/i.test(String(workerId || ''))) return false;
  const admin = await Admin.findOne({
    username: new RegExp('^' + username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
  })
    .select('adminRole')
    .lean();
  if (!admin) return false;
  return ownerExemptFromAttendance(admin.adminRole || 'super_admin');
}

async function ownerWorkerIds() {
  const admins = await Admin.find({ adminRole: 'super_admin' }).select('username').limit(30).lean();
  return admins
    .map((row) => 'admin:' + String(row && row.username ? row.username : '').trim().toLowerCase())
    .filter((id) => id !== 'admin:');
}

async function excuseOwnerException(doc, actor) {
  if (!doc) return null;
  if (!isBlockingStatus(doc.status) && doc.blocksTimeIn !== true) return doc;
  const fromStatus = doc.status;
  const fromClass = doc.classification;
  const actorId = (actor && actor.username) || 'system';
  doc.status = 'CANCELLED';
  doc.classification = 'EXCUSED';
  doc.blocksTimeIn = false;
  doc.reviewedAt = new Date();
  doc.reviewerUsername = actorId;
  doc.reviewerComments = 'Owner is exempt from attendance exceptions.';
  doc.decisions.push({
    action: 'OWNER_EXEMPT',
    actorId,
    actorRole: 'super_admin',
    at: new Date(),
    comment: 'Owner is exempt from attendance exceptions.',
    fromStatus,
    toStatus: 'CANCELLED',
    fromClassification: fromClass,
    toClassification: 'EXCUSED',
  });
  await doc.save();
  await writeAudit({
    actorId,
    actorRole: 'super_admin',
    action: 'OWNER_EXEMPT',
    entityId: doc._id,
    reference: doc.reference,
    previous: { status: fromStatus, classification: fromClass },
    next: { status: 'CANCELLED', classification: 'EXCUSED', blocksTimeIn: false },
    reason: 'Owner is exempt from attendance exceptions.',
  });
  return doc;
}

async function releaseOwnerExceptions(workerId) {
  const ids = workerId ? [String(workerId)] : await ownerWorkerIds();
  if (!ids.length) return;
  const rows = await AttendanceException.find({
    workerId: { $in: ids },
    $or: [{ blocksTimeIn: true }, { status: { $in: BLOCKING_STATUSES } }],
  });
  for (const doc of rows) {
    if (!(await isOwnerExemptWorker(doc.workerId))) continue;
    await excuseOwnerException(doc, { username: 'system' });
  }
}

async function findBlocking(workerId) {
  if (!workerId) return null;
  if (await isOwnerExemptWorker(workerId)) {
    await releaseOwnerExceptions(workerId);
    return null;
  }
  return AttendanceException.findOne({
    workerId: String(workerId),
    blocksTimeIn: true,
    status: { $in: BLOCKING_STATUSES },
  })
    .sort({ attendanceDate: 1, createdAt: 1 })
    .lean();
}

function publicException(doc, { includeReviewNotes }) {
  if (!doc) return null;
  const row = {
    id: String(doc._id),
    reference: doc.reference,
    workerId: doc.workerId,
    ownerType: doc.ownerType,
    displayName: doc.displayName || '',
    attendanceDate: doc.attendanceDate,
    timeLogId: doc.timeLogId ? String(doc.timeLogId) : '',
    originalTimeIn: doc.originalTimeIn || {},
    systemClockOut: doc.systemClockOut || {},
    reportedClockOut: doc.reportedClockOut || {},
    approvedClockOut: doc.approvedClockOut || {},
    explanation: doc.explanation || '',
    evidenceNote: doc.evidenceNote || '',
    status: doc.status,
    classification: doc.classification,
    submittedAt: doc.submittedAt || null,
    reviewedAt: doc.reviewedAt || null,
    blocksTimeIn: doc.blocksTimeIn === true,
    rejectionReason: doc.status === 'REJECTED' || includeReviewNotes ? doc.rejectionReason || '' : doc.rejectionReason || '',
    clarificationRequest: doc.clarificationRequest || '',
    reviewerComments: includeReviewNotes || doc.status !== 'PENDING_REVIEW' ? doc.reviewerComments || '' : '',
  };
  if (includeReviewNotes) {
    row.reviewerUsername = doc.reviewerUsername || '';
    row.decisions = doc.decisions || [];
  }
  return row;
}

async function closeOpenSessions(now = new Date()) {
  if (closeLock) return { skipped: true, closed: 0 };
  closeLock = true;
  const cfg = attendanceConfig();
  let closed = 0;
  const failures = [];
  try {
    const open = await TimeLog.find({ status: 'clocked-in' }).limit(80);
    for (const log of open) {
      try {
        const ownerType = log.logOwnerType === 'admin' ? 'admin' : 'teacher';
        const cutoff = cutoffForAttendanceDate(log.date, cfg, { ownerType });
        if (!cutoff || DateTime.fromJSDate(now).setZone(cfg.zone) < cutoff) continue;
        const label = formatPhLabel(cutoff.toJSDate(), cfg.zone);
        const closeReason = 'Open session closed at 12:00 midnight. This is not verified working time.';
        const totalHours = hoursBetween(log.clockIn && log.clockIn.timestamp, cutoff.toJSDate());
        const updated = await TimeLog.findOneAndUpdate(
          { _id: log._id, status: 'clocked-in' },
          {
            $set: {
              status: 'clocked-out',
              clockOut: { time: label, timestamp: cutoff.toJSDate() },
              clockOutSource: 'SYSTEM_AUTOMATIC',
              systemClockOut: {
                time: label,
                timestamp: cutoff.toJSDate(),
                reason: closeReason,
              },
              totalHours,
            },
          },
          { new: true }
        );
        if (!updated) continue;
        const already = await AttendanceException.findOne({ timeLogId: updated._id }).select('_id reference').lean();
        if (already) {
          closed += 1;
          continue;
        }
        if (ownerType === 'admin' && (await isOwnerExemptWorker(updated.teacherId))) {
          closed += 1;
          continue;
        }
        const reference = await nextReference(updated.date);
        const name = await displayNameFor(ownerType, updated.teacherId);
        let created;
        try {
          created = await AttendanceException.create({
            reference,
            workerId: updated.teacherId,
            ownerType,
            displayName: name,
            timeLogId: updated._id,
            attendanceDate: updated.date,
            originalTimeIn: {
              time: (updated.clockIn && updated.clockIn.time) || '',
              timestamp: updated.clockIn && updated.clockIn.timestamp,
            },
            originalTimeOut: { time: '', timestamp: null },
            systemClockOut: {
              time: label,
              timestamp: cutoff.toJSDate(),
              reason: 'SYSTEM_AUTOMATIC',
            },
            status: 'PENDING_REVIEW',
            classification: 'ATTENDANCE_EXCEPTION',
            blocksTimeIn: true,
            decisions: [
              {
                action: 'AUTO_CLOSE',
                actorId: 'system',
                actorRole: 'system',
                at: new Date(),
                comment: 'Session closed at cutoff. Not classified as negligence.',
                toStatus: 'PENDING_REVIEW',
                toClassification: 'ATTENDANCE_EXCEPTION',
              },
            ],
          });
        } catch (err) {
          if (err && err.code === 11000) continue;
          throw err;
        }
        await writeAudit({
          action: 'AUTO_CLOSE',
          entityId: created._id,
          reference: created.reference,
          next: { timeLogId: String(updated._id), systemClockOut: label, status: 'PENDING_REVIEW' },
          reason: 'Open attendance session closed at cutoff',
        });
        await notifyWorker(
          ownerType,
          updated.teacherId,
          'Missed time-out for ' + updated.date + '. Reference ' + created.reference + '. Submit a correction before you can time in again.'
        );
        if (ownerType === 'admin') {
          try {
            const { syncAdminAttendanceFromTimeLog } = require('./adminAttendanceSync');
            const username = String(updated.teacherId || '').replace(/^admin:/i, '');
            await syncAdminAttendanceFromTimeLog(updated, username);
          } catch (syncErr) {
            console.warn('attendance admin sync:', syncErr.message || syncErr);
          }
        }
        closed += 1;
      } catch (err) {
        failures.push(String(err.message || err));
        console.warn('attendance close:', log._id, err.message || err);
      }
    }
    return { closed, failures };
  } finally {
    closeLock = false;
  }
}

async function listMine(workerId) {
  const rows = await AttendanceException.find({ workerId: String(workerId) })
    .sort({ attendanceDate: -1, createdAt: -1 })
    .limit(30)
    .lean();
  return rows.map((row) => publicException(row, { includeReviewNotes: false }));
}

async function loadOwned(id, workerId) {
  const doc = await AttendanceException.findById(id);
  if (!doc) return { error: { status: 404, message: 'Attendance exception not found.' } };
  if (String(doc.workerId) !== String(workerId)) {
    return { error: { status: 403, message: 'You can only update your own attendance exception.' } };
  }
  return { doc };
}

async function submitRequest(workerId, id, body) {
  const loaded = await loadOwned(id, workerId);
  if (loaded.error) return loaded;
  const doc = loaded.doc;
  if (doc.status === 'APPROVED' || doc.status === 'CANCELLED') {
    return { error: { status: 409, message: 'This request is already closed.' } };
  }
  if (doc.status === 'PENDING_REVIEW' && doc.submittedAt && doc.status !== 'REJECTED') {
    return { error: { status: 409, message: 'A request for this session is already waiting for review.' } };
  }
  if (doc.status === 'NEEDS_CLARIFICATION') {
    return { error: { status: 409, message: 'Reply to the clarification request instead of sending a new correction.' } };
  }
  const cfg = attendanceConfig();
  const parsed = parseReportedTimeout({
    attendanceDate: doc.attendanceDate,
    clockIn: doc.originalTimeIn && doc.originalTimeIn.timestamp,
    reportedHm: body && body.reportedTimeOut,
    zone: cfg.zone,
  });
  if (!parsed.ok) return { error: { status: 400, message: parsed.message } };
  const explanation = String((body && body.explanation) || '').trim();
  if (explanation.length < 8) {
    return { error: { status: 400, message: 'Explain why the time-out was missed (at least a short sentence).' } };
  }
  const evidenceNote = String((body && body.evidenceNote) || '').trim().slice(0, 2000);
  const previous = {
    status: doc.status,
    reported: doc.reportedClockOut && doc.reportedClockOut.time,
    rejectionReason: doc.rejectionReason,
  };
  const fromStatus = doc.status;
  doc.reportedClockOut = {
    time: formatPhLabel(parsed.at.toJSDate(), cfg.zone),
    timestamp: parsed.at.toJSDate(),
  };
  doc.explanation = explanation.slice(0, 2000);
  doc.evidenceNote = evidenceNote;
  doc.status = 'PENDING_REVIEW';
  doc.submittedAt = new Date();
  doc.blocksTimeIn = true;
  doc.decisions.push({
    action: fromStatus === 'REJECTED' ? 'RESUBMIT' : 'SUBMIT',
    actorId: workerId,
    actorRole: doc.ownerType,
    at: new Date(),
    comment: explanation.slice(0, 500),
    fromStatus,
    toStatus: 'PENDING_REVIEW',
  });
  await doc.save();
  await writeAudit({
    actorId: workerId,
    actorRole: doc.ownerType,
    action: fromStatus === 'REJECTED' ? 'RESUBMIT' : 'SUBMIT',
    entityId: doc._id,
    reference: doc.reference,
    previous,
    next: { status: 'PENDING_REVIEW', reported: doc.reportedClockOut.time },
    reason: explanation,
  });
  await notifyReviewers(
    doc.displayName + ' submitted attendance correction ' + doc.reference + ' for ' + doc.attendanceDate + '.'
  );
  return { doc: publicException(doc.toObject(), { includeReviewNotes: false }) };
}

async function clarify(workerId, id, body) {
  const loaded = await loadOwned(id, workerId);
  if (loaded.error) return loaded;
  const doc = loaded.doc;
  if (doc.status !== 'NEEDS_CLARIFICATION') {
    return { error: { status: 409, message: 'This request is not waiting for clarification.' } };
  }
  const note = String((body && body.note) || '').trim();
  if (note.length < 4) return { error: { status: 400, message: 'Add the clarification HR asked for.' } };
  const from = doc.status;
  doc.explanation = (doc.explanation ? doc.explanation + '\n' : '') + note;
  doc.status = 'PENDING_REVIEW';
  doc.blocksTimeIn = true;
  doc.decisions.push({
    action: 'CLARIFY',
    actorId: workerId,
    actorRole: doc.ownerType,
    at: new Date(),
    comment: note.slice(0, 500),
    fromStatus: from,
    toStatus: 'PENDING_REVIEW',
  });
  await doc.save();
  await writeAudit({
    actorId: workerId,
    actorRole: doc.ownerType,
    action: 'CLARIFY',
    entityId: doc._id,
    reference: doc.reference,
    previous: { status: from },
    next: { status: 'PENDING_REVIEW' },
    reason: note,
  });
  await notifyReviewers(doc.displayName + ' clarified ' + doc.reference + '.');
  return { doc: publicException(doc.toObject(), { includeReviewNotes: false }) };
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function listForHr(query) {
  await releaseOwnerExceptions();
  const filter = {};
  const status = String(query.status || '').trim();
  if (status && status !== 'ALL') filter.status = status;
  const classification = String(query.classification || '').trim();
  if (classification) filter.classification = classification;
  const reviewer = String(query.reviewer || '').trim();
  if (reviewer) filter.reviewerUsername = new RegExp('^' + escapeRegex(reviewer) + '$', 'i');
  const employee = String(query.employee || '').trim();
  if (employee) {
    const rx = new RegExp(escapeRegex(employee), 'i');
    filter.$or = [{ workerId: rx }, { displayName: rx }, { reference: rx }];
  }
  if (query.from || query.to) {
    filter.attendanceDate = {};
    if (query.from) filter.attendanceDate.$gte = String(query.from).slice(0, 10);
    if (query.to) filter.attendanceDate.$lte = String(query.to).slice(0, 10);
  }
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
  const [total, rows] = await Promise.all([
    AttendanceException.countDocuments(filter),
    AttendanceException.find(filter)
      .sort({ attendanceDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);
  return {
    total,
    page,
    limit,
    rows: rows.map((row) => publicException(row, { includeReviewNotes: true })),
  };
}

async function summary() {
  await releaseOwnerExceptions();
  const cfg = attendanceConfig();
  const grouped = await AttendanceException.aggregate([
    { $group: { _id: { status: '$status', classification: '$classification' }, n: { $sum: 1 } } },
  ]);
  const counts = {
    pending: 0,
    needsClarification: 0,
    approved: 0,
    rejected: 0,
    confirmedNegligence: 0,
    excused: 0,
    dismissed: 0,
    overdue: 0,
  };
  grouped.forEach((row) => {
    const status = row._id && row._id.status;
    const classification = row._id && row._id.classification;
    const n = row.n || 0;
    if (status === 'PENDING_REVIEW') counts.pending += n;
    if (status === 'NEEDS_CLARIFICATION') counts.needsClarification += n;
    if (status === 'APPROVED') counts.approved += n;
    if (status === 'REJECTED') counts.rejected += n;
    if (classification === 'CONFIRMED_NEGLIGENCE') counts.confirmedNegligence += n;
    if (classification === 'EXCUSED') counts.excused += n;
    if (classification === 'DISMISSED') counts.dismissed += n;
  });
  const sla = new Date(Date.now() - cfg.reviewSlaHours * 3600000);
  counts.overdue = await AttendanceException.countDocuments({
    status: 'PENDING_REVIEW',
    submittedAt: { $ne: null, $lt: sla },
  });
  return counts;
}

async function getOne(id) {
  const existing = await AttendanceException.findById(id);
  if (!existing) return null;
  if (await isOwnerExemptWorker(existing.workerId)) {
    await excuseOwnerException(existing, { username: 'system' });
  }
  const doc = await AttendanceException.findById(id).lean();
  if (!doc) return null;
  const audits = await AttendanceAudit.find({ reference: doc.reference }).sort({ at: 1 }).limit(100).lean();
  const prior = await AttendanceException.countDocuments({
    workerId: doc.workerId,
    classification: 'CONFIRMED_NEGLIGENCE',
    _id: { $ne: doc._id },
  });
  return {
    exception: publicException(doc, { includeReviewNotes: true }),
    audits: audits.map((a) => ({
      action: a.action,
      actorId: a.actorId,
      actorRole: a.actorRole,
      at: a.at,
      reason: a.reason,
      previous: a.previous,
      next: a.next,
    })),
    confirmedRepeatCount: prior,
  };
}

async function decide(id, reviewer, action, body) {
  const username = String(reviewer.username || '').trim();
  const role = String(reviewer.adminRole || 'admin');
  const doc = await AttendanceException.findById(id);
  if (!doc) return { error: { status: 404, message: 'Attendance exception not found.' } };
  if (await isOwnerExemptWorker(doc.workerId)) {
    const released = await excuseOwnerException(doc, { username, adminRole: role });
    return {
      doc: publicException(released.toObject(), { includeReviewNotes: true }),
      timeInReleased: true,
    };
  }
  if (reviewerIsEmployee(username, doc.workerId)) {
    return { error: { status: 403, message: 'You cannot review your own attendance exception.' } };
  }
  if (action === 'classify') {
    const nextClass = String((body && body.classification) || '').trim();
    if (CLASSIFICATIONS.indexOf(nextClass) === -1) {
      return { error: { status: 400, message: 'Choose a valid incident classification.' } };
    }
    const from = doc.classification;
    if (from === nextClass) return { doc: publicException(doc.toObject(), { includeReviewNotes: true }) };
    doc.classification = nextClass;
    doc.decisions.push({
      action: 'CLASSIFY',
      actorId: username,
      actorRole: role,
      at: new Date(),
      comment: String((body && body.comment) || '').slice(0, 500),
      fromClassification: from,
      toClassification: nextClass,
    });
    await doc.save();
    await writeAudit({
      actorId: username,
      actorRole: role,
      action: 'CLASSIFY',
      entityId: doc._id,
      reference: doc.reference,
      previous: { classification: from },
      next: { classification: nextClass },
      reason: (body && body.comment) || '',
    });
    return { doc: publicException(doc.toObject(), { includeReviewNotes: true }) };
  }

  if (action === 'clarify') {
    if (doc.status !== 'PENDING_REVIEW') {
      return { error: { status: 409, message: 'Only a request in review can be sent back for clarification.' } };
    }
    const note = String((body && body.note) || '').trim();
    if (note.length < 4) return { error: { status: 400, message: 'Tell the employee what to clarify.' } };
    const updated = await AttendanceException.findOneAndUpdate(
      { _id: doc._id, status: 'PENDING_REVIEW' },
      {
        $set: { status: 'NEEDS_CLARIFICATION', clarificationRequest: note, reviewerUsername: username, blocksTimeIn: true },
        $push: {
          decisions: {
            action: 'REQUEST_CLARIFICATION',
            actorId: username,
            actorRole: role,
            at: new Date(),
            comment: note,
            fromStatus: 'PENDING_REVIEW',
            toStatus: 'NEEDS_CLARIFICATION',
          },
        },
      },
      { new: true }
    );
    if (!updated) return { error: { status: 409, message: 'This request was already updated.' } };
    await writeAudit({
      actorId: username,
      actorRole: role,
      action: 'REQUEST_CLARIFICATION',
      entityId: updated._id,
      reference: updated.reference,
      previous: { status: 'PENDING_REVIEW' },
      next: { status: 'NEEDS_CLARIFICATION' },
      reason: note,
    });
    await notifyWorker(updated.ownerType, updated.workerId, 'HR needs clarification on ' + updated.reference + '. ' + note);
    return { doc: publicException(updated.toObject(), { includeReviewNotes: true }) };
  }

  if (action === 'reject') {
    const reason = String((body && body.reason) || '').trim();
    if (reason.length < 8) return { error: { status: 400, message: 'A rejection reason is required.' } };
    if (OPEN_OR_PENDING(doc.status) === false) {
      return { error: { status: 409, message: 'This request cannot be rejected in its current status.' } };
    }
    const from = doc.status;
    const updated = await AttendanceException.findOneAndUpdate(
      { _id: doc._id, status: from },
      {
        $set: {
          status: 'REJECTED',
          rejectionReason: reason,
          reviewerUsername: username,
          reviewerComments: String((body && body.comments) || '').slice(0, 2000),
          reviewedAt: new Date(),
          blocksTimeIn: true,
        },
        $push: {
          decisions: {
            action: 'REJECT',
            actorId: username,
            actorRole: role,
            at: new Date(),
            comment: reason,
            fromStatus: from,
            toStatus: 'REJECTED',
          },
        },
      },
      { new: true }
    );
    if (!updated) return { error: { status: 409, message: 'This request was already updated.' } };
    await writeAudit({
      actorId: username,
      actorRole: role,
      action: 'REJECT',
      entityId: updated._id,
      reference: updated.reference,
      previous: { status: from },
      next: { status: 'REJECTED' },
      reason,
    });
    await notifyWorker(
      updated.ownerType,
      updated.workerId,
      'Attendance correction ' + updated.reference + ' was rejected. ' + reason
    );
    return { doc: publicException(updated.toObject(), { includeReviewNotes: true }) };
  }

  if (action === 'approve') {
    if (!doc.reportedClockOut || !doc.reportedClockOut.timestamp) {
      return { error: { status: 400, message: 'The employee has not reported an actual time-out yet.' } };
    }
    if (doc.status !== 'PENDING_REVIEW' && doc.status !== 'NEEDS_CLARIFICATION') {
      return { error: { status: 409, message: 'This request is not waiting for approval.' } };
    }
    const from = doc.status;
    const comments = String((body && body.comments) || '').slice(0, 2000);
    const updated = await AttendanceException.findOneAndUpdate(
      { _id: doc._id, status: from },
      {
        $set: {
          status: 'APPROVED',
          approvedClockOut: doc.reportedClockOut,
          reviewerUsername: username,
          reviewerComments: comments,
          reviewedAt: new Date(),
          blocksTimeIn: false,
        },
        $push: {
          decisions: {
            action: 'APPROVE',
            actorId: username,
            actorRole: role,
            at: new Date(),
            comment: comments,
            fromStatus: from,
            toStatus: 'APPROVED',
          },
        },
      },
      { new: true }
    );
    if (!updated) return { error: { status: 409, message: 'This request was already updated.' } };
    const log = await TimeLog.findById(updated.timeLogId);
    const previousOut = log && log.clockOut ? { time: log.clockOut.time, source: log.clockOutSource || '' } : null;
    if (log) {
      const approvedAt = new Date(updated.approvedClockOut.timestamp);
      log.clockOut = { time: updated.approvedClockOut.time, timestamp: approvedAt };
      log.clockOutSource = 'HR_APPROVED';
      log.approvedClockOut = {
        time: updated.approvedClockOut.time,
        timestamp: approvedAt,
        reviewerUsername: username,
      };
      log.totalHours = hoursBetween(log.clockIn && log.clockIn.timestamp, approvedAt);
      log.status = 'clocked-out';
      await log.save();
      if (updated.ownerType === 'admin') {
        try {
          const { syncAdminAttendanceFromTimeLog } = require('./adminAttendanceSync');
          await syncAdminAttendanceFromTimeLog(log, String(updated.workerId).replace(/^admin:/i, ''));
        } catch (syncErr) {
          console.warn('attendance approve sync:', syncErr.message || syncErr);
        }
      }
    }
    await writeAudit({
      actorId: username,
      actorRole: role,
      action: 'APPROVE',
      entityId: updated._id,
      reference: updated.reference,
      previous: { status: from, clockOut: previousOut },
      next: { status: 'APPROVED', approvedClockOut: updated.approvedClockOut.time },
      reason: comments,
    });
    const stillBlocked = await findBlocking(updated.workerId);
    await notifyWorker(
      updated.ownerType,
      updated.workerId,
      stillBlocked
        ? 'Correction ' + updated.reference + ' was approved. Another attendance exception still blocks time-in.'
        : 'Correction ' + updated.reference + ' was approved. You can time in again.'
    );
    return {
      doc: publicException(updated.toObject(), { includeReviewNotes: true }),
      timeInReleased: !stillBlocked,
    };
  }

  return { error: { status: 400, message: 'Unknown review action.' } };
}

function OPEN_OR_PENDING(status) {
  return status === 'PENDING_REVIEW' || status === 'NEEDS_CLARIFICATION';
}

async function payrollReport(query) {
  await releaseOwnerExceptions();
  const filter = { blocksTimeIn: true, status: { $in: BLOCKING_STATUSES } };
  if (query.from || query.to) {
    filter.attendanceDate = {};
    if (query.from) filter.attendanceDate.$gte = String(query.from).slice(0, 10);
    if (query.to) filter.attendanceDate.$lte = String(query.to).slice(0, 10);
  }
  const rows = await AttendanceException.find(filter).sort({ attendanceDate: 1 }).limit(200).lean();
  const decided = await AttendanceException.find({
    reviewedAt: { $ne: null },
    ...(query.from || query.to
      ? {
          attendanceDate: {
            ...(query.from ? { $gte: String(query.from).slice(0, 10) } : {}),
            ...(query.to ? { $lte: String(query.to).slice(0, 10) } : {}),
          },
        }
      : {}),
  })
    .select('submittedAt reviewedAt status classification')
    .limit(500)
    .lean();
  let reviewMs = 0;
  let reviewN = 0;
  decided.forEach((row) => {
    if (row.submittedAt && row.reviewedAt) {
      reviewMs += new Date(row.reviewedAt) - new Date(row.submittedAt);
      reviewN += 1;
    }
  });
  return {
    unresolved: rows.map((row) => publicException(row, { includeReviewNotes: true })),
    averageReviewHours: reviewN ? Math.round((reviewMs / reviewN / 3600000) * 10) / 10 : null,
    note: 'System-generated time-outs are not verified working time. Do not apply a salary deduction from this report.',
  };
}

module.exports = {
  findBlocking,
  closeOpenSessions,
  listMine,
  submitRequest,
  clarify,
  listForHr,
  summary,
  getOne,
  decide,
  payrollReport,
  publicException,
};
