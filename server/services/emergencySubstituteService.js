'use strict';

/**
 * After QA approves a teacher emergency cancellation, move the class to
 * another open teacher immediately. Assignment stops when fewer than
 * 5 minutes remain. The booking, credit, and start time stay the same.
 */
const Booking = require('../models/Booking');
const Teacher = require('../models/Teacher');
const TeacherSlot = require('../models/TeacherSlot');
const CancellationRequest = require('../models/CancellationRequest');
const { getBookingStartAsDate } = require('../utils/bookingScheduledStart');
const { isCancelledStatus } = require('../utils/bookingStatus');
const { normalizeId } = require('../utils/normalizeId');
const {
  resolveToCanonicalTeacherId,
  getCandidateTeachersForBooking,
  findOpenSlotsForBooking,
  slotTimeKeys,
} = require('./teacherSlotResolve');
const { notifyTeacher, notifyStudent, notifyAdmin } = require('./notifyService');
const { formatStudentClassWhen } = require('./classReminderService');

const CANCEL_LEAD_MS = 10 * 60 * 1000;
const ASSIGN_LEAD_MS = 5 * 60 * 1000;
const EMERGENCY_LOOKBACK_MS = 18 * 60 * 60 * 1000;

const SKIP_STATUSES = ['cancelled_by_student_emergency', 'Completed', 'completed', 'absent'];

function canRequestEmergencyCancellation(start, now) {
  if (!start || !now) return false;
  return start.getTime() - now.getTime() >= CANCEL_LEAD_MS;
}

function canAssignSubstitute(start, now) {
  if (!start || !now) return false;
  return start.getTime() - now.getTime() >= ASSIGN_LEAD_MS;
}

function isTeacherCancelledLesson(booking) {
  const status = String((booking && booking.status) || '').toLowerCase();
  if (status !== 'cancelled') return false;
  const reason = booking && booking.cancellationReason;
  const text = typeof reason === 'string' ? reason : String((reason && reason.reason) || '');
  if (/reschedul/i.test(text)) return false;
  return true;
}

function pickSubstituteTeacher(candidates, blockedIds) {
  const blocked = new Set((blockedIds || []).map((id) => normalizeId(id)).filter(Boolean));
  for (const id of candidates || []) {
    const key = normalizeId(id);
    if (key && !blocked.has(key)) return String(id);
  }
  return null;
}

function teacherDisplayName(teacher) {
  if (!teacher) return 'another teacher';
  const nick = teacher.nickname && String(teacher.nickname).trim();
  if (nick) return nick;
  const full = teacher.fullname && String(teacher.fullname).trim();
  if (full) return full;
  const joined = [teacher.firstName, teacher.lastName].filter(Boolean).join(' ').trim();
  return joined || teacher.username || 'another teacher';
}

async function loadTeacher(teacherId) {
  return Teacher.findOne({ teacherId }).select('teacherId nickname fullname firstName lastName username').lean();
}

async function releaseOriginalSlot(originalTeacherId, start, booking) {
  const date = String((booking && booking.date) || '').slice(0, 10);
  const times = slotTimeKeys(booking && booking.time);
  const or = [];
  if (start && !Number.isNaN(start.getTime())) {
    or.push({
      dateTimeUtc: { $gte: new Date(start.getTime() - 2000), $lte: new Date(start.getTime() + 2000) },
    });
  }
  if (date && times.length) or.push({ date, time: { $in: times } });
  if (!or.length) return;
  const slots = await TeacherSlot.find({ available: false, $or: or }).select('_id teacherId').lean();
  for (const slot of slots) {
    const tid = await resolveToCanonicalTeacherId(slot.teacherId);
    if (tid && normalizeId(tid) === normalizeId(originalTeacherId)) {
      await TeacherSlot.updateOne({ _id: slot._id }, { $set: { available: true } });
    }
  }
}

async function assignOne(booking, emergencyKeys, now, opts) {
  const force = !!(opts && opts.force);
  const status = String(booking.status || '').toLowerCase();
  if (SKIP_STATUSES.map((s) => s.toLowerCase()).includes(status)) return 'skip';
  if (booking.attendance && booking.attendance.teacherEntered) return 'skip';
  const start = getBookingStartAsDate(booking);
  if (!canAssignSubstitute(start, now)) return 'too-late';

  const original = (await resolveToCanonicalTeacherId(booking.teacherId)) || String(booking.teacherId || '').trim();
  const originalKey = normalizeId(original);
  const teacherCancelled = isTeacherCancelledLesson(booking);
  const emergency = !!(originalKey && emergencyKeys.has(originalKey));
  if (!original) return 'skip';
  if (!force && !teacherCancelled && !emergency) return 'skip';
  if (!force && !teacherCancelled && isCancelledStatus(booking.status)) return 'skip';

  const utcIso = start.toISOString();
  const candidates = await getCandidateTeachersForBooking(booking, utcIso);
  const substituteId = pickSubstituteTeacher(candidates, [original, ...emergencyKeys]);
  if (!substituteId) {
    if (!booking.substituteNoCoverNotifiedAt) {
      const claimed = await Booking.findOneAndUpdate(
        { _id: booking._id, substituteNoCoverNotifiedAt: null, substituteAssignedAt: null },
        { $set: { substituteNoCoverNotifiedAt: new Date() } },
        { new: true }
      );
      if (claimed) {
        const when = formatStudentClassWhen(booking, start, true);
        await notifyAdmin(
          'schedule-change',
          `No other teacher is free for ${booking.studentId} at ${when}. The class stays with the original teacher.`,
          { bookingId: String(booking._id), actionUrl: '/admin-teacher-schedule.html', importance: 'actionable' }
        );
      }
    }
    return 'no-cover';
  }

  const openSlots = await findOpenSlotsForBooking(booking, utcIso);
  let slotId = null;
  for (const slot of openSlots) {
    const tid = (await resolveToCanonicalTeacherId(slot.teacherId)) || String(slot.teacherId || '').trim();
    if (tid && normalizeId(tid) === normalizeId(substituteId)) {
      slotId = slot._id;
      break;
    }
  }
  if (!slotId) return 'no-cover';
  const locked = await TeacherSlot.findOneAndUpdate(
    { _id: slotId, available: true },
    { $set: { available: false } },
    { new: true }
  );
  if (!locked) return 'no-cover';

  const note = 'Substitute teacher assigned because of an emergency.';
  const prev = String(booking.scheduleRemark || '').trim();
  let updated;
  try {
    updated = await Booking.findOneAndUpdate(
      {
        _id: booking._id,
        substituteAssignedAt: null,
        status: { $nin: ['Completed', 'completed', 'absent'] },
      },
      {
        $set: {
          teacherId: substituteId,
          originalTeacherId: original,
          substituteAssignedAt: new Date(),
          status: 'Booked',
          scheduleRemark: prev ? prev + ' ' + note : note,
        },
      },
      { new: true }
    );
  } catch (err) {
    await TeacherSlot.updateOne({ _id: locked._id }, { $set: { available: true } });
    throw err;
  }
  if (!updated) {
    await TeacherSlot.updateOne({ _id: locked._id }, { $set: { available: true } });
    return 'skip';
  }

  await releaseOriginalSlot(original, start, booking);

  const [nextTeacher, previousTeacher] = await Promise.all([
    loadTeacher(substituteId),
    loadTeacher(original),
  ]);
  const when = formatStudentClassWhen(booking, start, false);
  const nextName = teacherDisplayName(nextTeacher);
  const previousName = teacherDisplayName(previousTeacher);
  const bid = String(booking._id);

  await notifyStudent(
    booking.studentId,
    'schedule-change',
    `Your class at ${when} is now with ${nextName}. Open My Schedule and enter that class.`,
    {
      bookingId: bid,
      actionUrl: '/student-class-table.html',
      importance: 'actionable',
    }
  );
  await notifyTeacher(
    substituteId,
    'schedule-change',
    `You are covering ${booking.studentId} at ${when}. ${previousName} has an emergency.`,
    { bookingId: bid, actionUrl: '/teacher-class-table.html', importance: 'actionable' }
  );
  await notifyTeacher(
    original,
    'schedule-change',
    `Your class with ${booking.studentId} at ${when} was moved to ${nextName}.`,
    { bookingId: bid, actionUrl: '/teacher-class-table.html', importance: 'actionable' }
  );
  await notifyAdmin(
    'schedule-change',
    `${booking.studentId} at ${when} moved from ${previousName} to ${nextName} because of an emergency.`,
    { bookingId: bid, actionUrl: '/admin-teacher-schedule.html', importance: 'fyi' }
  );
  return 'moved';
}

async function assignApprovedEmergency(booking, nowDate) {
  const now = nowDate instanceof Date ? nowDate : new Date();
  return assignOne(booking, new Set(), now, { force: true });
}

async function runEmergencySubstituteJob(nowDate) {
  const now = nowDate instanceof Date ? nowDate : new Date();
  const since = new Date(now.getTime() - EMERGENCY_LOOKBACK_MS);
  const requests = await CancellationRequest.find({
    requesterType: 'teacher',
    status: 'approved',
    createdAt: { $gte: since },
  })
    .select('bookingId')
    .limit(40)
    .lean();

  let moved = 0;
  let noCover = 0;
  const seen = new Set();
  for (const request of requests) {
    const bookingId = String(request.bookingId || '');
    if (!bookingId || seen.has(bookingId)) continue;
    seen.add(bookingId);
    try {
      const booking = await Booking.findById(request.bookingId);
      if (!booking || booking.substituteAssignedAt) continue;
      const status = String(booking.status || '').toLowerCase();
      if (status === 'completed' || status === 'absent') continue;
      if (booking.attendance && booking.attendance.teacherEntered) continue;
      const result = await assignApprovedEmergency(booking, now);
      if (result === 'moved') {
        moved += 1;
        await CancellationRequest.updateOne(
          { _id: request._id },
          {
            $set: {
              status: 'approved',
              'adminReview.reviewedBy': 'system',
              'adminReview.reviewedAt': now,
              'adminReview.adminNotes': 'Assigned to another teacher who is open at this same time.',
            },
          }
        );
      }
      if (result === 'no-cover') noCover += 1;
    } catch (err) {
      console.warn('[emergency-substitute]', request && request.bookingId, err.message || err);
    }
  }
  if (moved > 0) console.log(`⏰ Moved ${moved} cancelled class(es) to an open teacher at the same time`);
  return { moved, noCover };
}

module.exports = {
  CANCEL_LEAD_MS,
  ASSIGN_LEAD_MS,
  canRequestEmergencyCancellation,
  canAssignSubstitute,
  isTeacherCancelledLesson,
  pickSubstituteTeacher,
  assignApprovedEmergency,
  runEmergencySubstituteJob,
};
