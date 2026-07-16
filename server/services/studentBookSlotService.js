/**
 * Student slot booking — isolated from teacher routes (called by studentController / teacher API).
 */
const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const TeacherSlot = require('../models/TeacherSlot');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification');
const slotsRedisCache = require('./slotsRedisCache');
const slotBookingLock = require('./slotBookingLock');
const realtime = require('../realtime');
const {
  getAvailableBookingCredits,
  getCreditPoolTotal,
  getReservedCredits,
  reconcileStudentCreditBalanceIfDrifted,
} = require('./studentCreditSummary');
const {
  resolveToCanonicalTeacherId,
  findOpenSlotsByUtcInstant,
  findOpenTeacherSlotByUtcAndNormalizedTeacher,
  getCandidateTeachersForSlotUtc,
} = require('./teacherSlotResolve');
const { normalizeId } = require('../utils/normalizeId');

function preferredTeacherIdLooksLikeEmail(raw) {
  const v = normalizeId(raw);
  return v.includes('@') && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/** Teacher-facing notification text — many students have empty first/last until profile is completed. */
function studentDisplayNameForNotification(studentDoc, usernameFallback) {
  if (!studentDoc) return usernameFallback || 'A student';
  const fromParts = [studentDoc.firstName, studentDoc.middleName, studentDoc.lastName]
    .map((x) => (x != null ? String(x).trim() : ''))
    .filter(Boolean)
    .join(' ')
    .trim();
  if (fromParts) return fromParts;
  const u = studentDoc.username != null ? String(studentDoc.username).trim() : '';
  if (u) return u;
  const e = studentDoc.email != null ? String(studentDoc.email).trim() : '';
  if (e) return e;
  return usernameFallback || 'A student';
}

function bookingWhenLabelForNotification(canonicalUtcIso, slotDoc, fallbackZone) {
  const z =
    slotDoc &&
    slotDoc.teacherLocalZone &&
    DateTime.now().setZone(String(slotDoc.teacherLocalZone)).isValid
      ? String(slotDoc.teacherLocalZone)
      : fallbackZone && DateTime.now().setZone(String(fallbackZone)).isValid
        ? String(fallbackZone)
        : 'Asia/Manila';
  try {
    const localDt = DateTime.fromISO(String(canonicalUtcIso), { zone: 'utc' }).setZone(z);
    if (!localDt.isValid) return `${canonicalUtcIso} (UTC)`;
    return `${localDt.toFormat('LLL d, yyyy')} at ${localDt.toFormat('HH:mm')} (${z})`;
  } catch (_e) {
    return `${canonicalUtcIso} (UTC)`;
  }
}

function isMongoDuplicateKeyError(err) {
  if (!err) return false;
  const code = err.code != null ? err.code : err.codeName;
  if (code === 11000 || code === '11000' || code === 'DuplicateKey') return true;
  const msg = String(err.message || '');
  return /E11000|duplicate key/i.test(msg);
}

function toUtcFromLocal(dateStr, timeStr, zone) {
  // Prefer client IANA zone; never force Asia/Manila — missing zone → interpret as UTC.
  const z = zone && DateTime.now().setZone(zone).isValid ? zone : 'utc';
  const dt = DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: z });
  if (!dt.isValid) throw new Error(`Invalid date/time: ${dateStr} ${timeStr} in zone ${z}`);
  return { utcIso: dt.toUTC().toISO(), zoneUsed: z };
}

/** Parse client startTime / dateTimeUtc into a strict UTC ISO string. */
function normalizeBookingStartToUtcIso(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return DateTime.fromJSDate(raw, { zone: 'utc' }).toUTC().toISO();
  }
  const s = String(raw).trim();
  let dt = DateTime.fromISO(s, { setZone: true });
  if (!dt.isValid) dt = DateTime.fromISO(s, { zone: 'utc' });
  if (!dt.isValid) {
    const asDate = new Date(s);
    if (!Number.isNaN(asDate.getTime())) {
      dt = DateTime.fromJSDate(asDate, { zone: 'utc' });
    }
  }
  if (!dt.isValid) return null;
  return dt.toUTC().toISO();
}

async function createBookingNotification(teacherId, type, message) {
  try {
    await Notification.create({
      teacherId: teacherId.toString(),
      type,
      message,
      read: false
    });
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

async function runBookSlot(req, res) {
  try {
    console.log('🔍 ========== BOOKING REQUEST RECEIVED ==========');
    const {
      teacherId,
      preferredTeacherId,
      date,
      time,
      dateTimeUtc,
      startTime,
      lesson,
      lessonId,
      studentLevel,
      timezone,
      assignmentMode = 'firstAvailable',
      slotId: slotIdBody,
    } = req.body;
    const preferredRaw = preferredTeacherId != null && preferredTeacherId !== '' ? preferredTeacherId : teacherId;

    let student = await Student.findById(req.user.studentId);
    if (!student) {
      return res.status(400).json({ error: 'Student not found' });
    }
    if (await reconcileStudentCreditBalanceIfDrifted(req.user.studentId, student.toObject())) {
      student = await Student.findById(req.user.studentId);
    }
    const effectiveSubscribed =
      student.isSubscribed === true ||
      (student.paymentStatus === 'paid' && student.subscriptionStatus === 'active');
    const studentId = student.username;
    const availableCredits = getAvailableBookingCredits(student);
    const canUseTrial = !!student.assessmentTrialCreditActive;
    if (!effectiveSubscribed && availableCredits <= 0 && !canUseTrial) {
      return res.status(403).json({
        error: 'Subscription required to book your next lesson.',
        code: 'SUBSCRIPTION_REQUIRED_LESSON_2',
      });
    }
    if (availableCredits <= 0 && !canUseTrial) {
      return res.status(400).json({ error: 'Insufficient credits. Please top up your plan.' });
    }

    const missingFields = [];
    if (!studentId) missingFields.push('studentId');
    if (!dateTimeUtc && !startTime && (!date || !time)) missingFields.push('dateTimeUtc|startTime');
    if (!lesson) missingFields.push('lesson');
    if (!studentLevel) missingFields.push('studentLevel');

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields: ' + missingFields.join(', '),
        details: {
          studentId: !!studentId,
          date: !!date,
          time: !!time,
          dateTimeUtc: !!dateTimeUtc,
          startTime: !!startTime,
          lesson: !!lesson,
          studentLevel: !!studentLevel
        },
        missingFields
      });
    }

    // Canonical storage: always UTC ISO (never persist server/PHT wall-clock).
    let canonicalUtc = normalizeBookingStartToUtcIso(dateTimeUtc || startTime);
    if (!canonicalUtc) {
      if (!date || !time) {
        return res.status(400).json({ error: 'Invalid startTime / dateTimeUtc' });
      }
      if (!timezone) {
        return res.status(400).json({
          error: 'timezone (IANA) is required when date/time are sent without a UTC startTime',
          code: 'TIMEZONE_REQUIRED',
        });
      }
      const { utcIso } = toUtcFromLocal(date, time, timezone);
      canonicalUtc = utcIso;
    }
    const dt = DateTime.fromISO(canonicalUtc, { zone: 'utc' });
    if (!dt.isValid) {
      return res.status(400).json({ error: 'Could not normalize booking start to UTC' });
    }
    const dateUtc = dt.toISODate();
    const timeUtc = dt.toFormat('HH:mm');

    const slotIdTrim = slotIdBody != null ? String(slotIdBody).trim() : '';
    if (!slotIdTrim) {
      return res.status(400).json({
        error: 'slotId is required (Mongo _id of the teacher slot).',
        code: 'MISSING_SLOT_ID',
      });
    }
    if (!mongoose.Types.ObjectId.isValid(slotIdTrim)) {
      return res.status(400).json({ error: 'Invalid slot id', code: 'INVALID_SLOT_ID' });
    }

    const candidates = await getCandidateTeachersForSlotUtc(canonicalUtc);
    console.log('🔍 Candidate teachers for slot:', candidates);

    if (candidates.length === 0) {
      return res.status(400).json({
        error: 'No teacher has an open slot for this time, or all are already booked.'
      });
    }

    const slotRows = await findOpenSlotsByUtcInstant(canonicalUtc);
    const wantsPreferred =
      preferredRaw != null && String(preferredRaw).trim() !== '';
    const resolvedPrefEarly = wantsPreferred ? await resolveToCanonicalTeacherId(preferredRaw) : null;

    let existingSlot = null;
    if (resolvedPrefEarly) {
      const byPref = await findOpenTeacherSlotByUtcAndNormalizedTeacher(canonicalUtc, resolvedPrefEarly);
      if (byPref) existingSlot = byPref;
    }
    if (!existingSlot) {
      existingSlot = slotRows.find((s) => String(s._id) === slotIdTrim) || null;
    }
    if (!existingSlot || existingSlot.available === false) {
      return res.status(400).json({ error: 'Selected slot is no longer available or not open for booking' });
    }

    let chosenTeacherId = await resolveToCanonicalTeacherId(existingSlot.teacherId);
    const candNorm = new Set(candidates.map((c) => normalizeId(c)));
    if (!chosenTeacherId || !candNorm.has(normalizeId(chosenTeacherId))) {
      return res.status(400).json({
        error: 'That slot is not open for booking or the teacher is no longer available for this time.',
        candidates
      });
    }

    if (wantsPreferred) {
      if (!resolvedPrefEarly) {
        return res.status(400).json({ error: 'Preferred teacher not found.' });
      }
      if (!preferredTeacherIdLooksLikeEmail(preferredRaw)) {
        return res.status(400).json({
          error: 'Preferred teacher must be the teacher account email (e.g. name@domain.com).',
          code: 'PREFERRED_MUST_BE_EMAIL',
        });
      }
      const recheck = await findOpenTeacherSlotByUtcAndNormalizedTeacher(canonicalUtc, preferredRaw);
      if (
        !recheck ||
        recheck.available !== true ||
        String(recheck._id) !== String(existingSlot._id)
      ) {
        return res.status(400).json({
          error: 'That time is no longer available for the selected teacher. Please refresh and try again.',
          code: 'SLOT_NOT_AVAILABLE_FOR_TEACHER',
        });
      }
      if (normalizeId(resolvedPrefEarly) !== normalizeId(chosenTeacherId)) {
        return res.status(400).json({
          error:
            'Preferred teacher does not match the selected slot. Choose the teacher who owns that time, or pick another slot.',
          code: 'PREFERRED_SLOT_TEACHER_MISMATCH',
        });
      }
    }

    const teacher = await Teacher.findOne({ teacherId: chosenTeacherId });
    if (!teacher) {
      return res.status(400).json({ error: 'Assigned teacher record not found' });
    }

    const utcInstant = new Date(canonicalUtc);

    const useTransactions =
      String(process.env.USE_TRANSACTIONS || '').toLowerCase() === 'true';

    async function createBookingAtomic(session) {
      const findOpts = { new: true };
      if (session) findOpts.session = session;

      let dupQ = Booking.findOne({
        teacherId: chosenTeacherId,
        dateTimeUtc: utcInstant,
        status: { $nin: ['cancelled', 'cancelled_by_student_emergency'] },
      });
      if (session) dupQ = dupQ.session(session);
      const existingBooking = await dupQ;
      if (existingBooking) {
        const err = new Error('This slot has already been booked.');
        err.statusCode = 409;
        err.code = 'ALREADY_BOOKED';
        throw err;
      }

      // Gate: live balance > 0 (no reserve-on-book). Allow active free-trial booking.
      let creditGateQ = Student.findOne({
        _id: req.user.studentId,
        $or: [{ creditBalance: { $gt: 0 } }, { assessmentTrialCreditActive: true }],
      });
      if (session) creditGateQ = creditGateQ.session(session);
      const creditGate = await creditGateQ;
      if (!creditGate) {
        const err = new Error('Insufficient credits. Please top up your plan.');
        err.statusCode = 400;
        err.code = 'INSUFFICIENT_CREDITS';
        throw err;
      }

      // Match by _id + available only — teacherId on the row can differ in casing/legacy form from chosenTeacherId.
      const lockedSlot = await TeacherSlot.findOneAndUpdate(
        { _id: existingSlot._id, available: true },
        { $set: { available: false } },
        findOpts
      );

      if (!lockedSlot) {
        const err = new Error(
          'This time slot was just booked by another student. Please choose a different time.'
        );
        err.statusCode = 409;
        err.code = 'SLOT_NOT_AVAILABLE';
        throw err;
      }

      let countQ = Booking.countDocuments({ studentId });
      if (session) countQ = countQ.session(session);
      const studentBookingCount = await countQ;
      const usernamePart = studentId.includes('@') ? studentId.split('@')[0] : studentId;
      const dateStr = dateUtc.replace(/-/g, '');
      const timeStr = timeUtc.replace(':', '');
      const classroomId = `${dateStr}${timeStr}${usernamePart}${studentBookingCount + 1}`;

      const b = new Booking({
        studentId,
        teacherId: chosenTeacherId,
        date: dateUtc,
        time: timeUtc,
        dateTimeUtc: utcInstant,
        studentLocalZone: timezone || null,
        teacherLocalZone: teacher?.teacherLocalZone || lockedSlot?.teacherLocalZone || null,
        lesson,
        lessonId: lessonId || null,
        studentLevel,
        classroomId,
        status: 'Booked',
        isAssessmentFreeTrialBooking: !!student.assessmentTrialCreditActive,
      });
      try {
        if (session) {
          await b.save({ session });
        } else {
          await b.save();
        }
      } catch (saveErr) {
        if (!session) {
          await TeacherSlot.updateOne(
            { _id: existingSlot._id, teacherId: existingSlot.teacherId },
            { $set: { available: true } }
          );
        }
        if (isMongoDuplicateKeyError(saveErr)) {
          const err = new Error('Sorry, this slot was just booked by someone else.');
          err.statusCode = 409;
          err.code = 'ALREADY_BOOKED';
          throw err;
        }
        throw saveErr;
      }
      return b;
    }

    function isTransactionUnsupportedError(err) {
      const msg = (err && err.message) || String(err);
      return (
        msg.includes('Transaction numbers are only allowed') ||
        msg.includes('transactions are not supported') ||
        msg.includes('replica set') ||
        msg.includes('ReplicaSet') ||
        /transaction.*not.*support/i.test(msg)
      );
    }

    const lockOwner = String(req.user.studentId || studentId || '');
    const lockResult = await slotBookingLock.tryAcquireSlotLock(chosenTeacherId, slotIdTrim, lockOwner);
    if (!lockResult.redisSkipped && !lockResult.acquired) {
      return res.status(409).json({
        error: 'This slot is currently being processed by another user.',
        code: 'SLOT_LOCK_HELD',
      });
    }
    const lockHeld = !lockResult.redisSkipped && lockResult.acquired;

    let booking;
    try {
      try {
        if (!useTransactions) {
          booking = await createBookingAtomic(null);
        } else {
          const session = await mongoose.startSession();
          let sessionHandled = false;
          try {
            await session.withTransaction(async () => {
              booking = await createBookingAtomic(session);
            });
          } catch (txnErr) {
            const e =
              txnErr && txnErr.statusCode
                ? txnErr
                : txnErr && txnErr.cause && txnErr.cause.statusCode
                  ? txnErr.cause
                  : txnErr;
            if (e && e.statusCode && e.message) {
              await session.endSession().catch(() => {});
              sessionHandled = true;
              return res.status(e.statusCode).json({
                error: e.message,
                code: e.code || undefined
              });
            }
            if (isTransactionUnsupportedError(txnErr)) {
              await session.endSession().catch(() => {});
              sessionHandled = true;
              console.warn(
                '⚠️ USE_TRANSACTIONS=true but MongoDB rejected the transaction; using atomic slot-lock fallback'
              );
              booking = await createBookingAtomic(null);
            } else {
              await session.endSession().catch(() => {});
              sessionHandled = true;
              throw txnErr;
            }
          } finally {
            if (!sessionHandled) await session.endSession().catch(() => {});
          }
        }
      } catch (bookErr) {
        const e =
          bookErr && bookErr.statusCode
            ? bookErr
            : bookErr && bookErr.cause && bookErr.cause.statusCode
              ? bookErr.cause
              : bookErr;
        if (isMongoDuplicateKeyError(bookErr) || isMongoDuplicateKeyError(e)) {
          return res.status(409).json({
            error: 'Sorry, this slot was just booked by someone else.',
            code: 'ALREADY_BOOKED',
          });
        }
        if (e && e.statusCode && e.message) {
          return res.status(e.statusCode).json({
            error: e.message,
            code: e.code || undefined
          });
        }
        throw bookErr;
      }

      await slotsRedisCache.invalidateSlotsCache(chosenTeacherId);

      console.log('✅ Booking created:', booking._id, 'teacher:', chosenTeacherId, 'mode:', preferredRaw ? 'preferred' : assignmentMode);

      const studentName = studentDisplayNameForNotification(student, studentId);
      const whenLabel = bookingWhenLabelForNotification(canonicalUtc, existingSlot, timezone || 'Asia/Manila');
      await createBookingNotification(
        chosenTeacherId,
        'booking',
        `New class booked for ${whenLabel} with ${studentName}.`
      );

      try {
        const payload = {
          teacherId: chosenTeacherId,
          date: dateUtc,
          time: timeUtc,
          dateTimeUtc: canonicalUtc,
          bookingId: booking._id.toString(),
          ts: Date.now()
        };
        realtime.emitAll('bookingsUpdated', payload);
        realtime.emitAll('slotsUpdated', payload);
      } catch (socketError) {
        console.error('⚠️ bookingsUpdated/slotsUpdated emit:', socketError);
      }

      const refreshedStudent = await Student.findById(req.user.studentId).lean();
      res.json({
        success: true,
        bookingId: booking._id,
        teacherId: chosenTeacherId,
        assignmentMode: preferredRaw ? 'preferred' : assignmentMode,
        message: 'Class booked successfully',
        bookingMode: useTransactions ? 'transaction' : 'atomic-slot-lock',
        useTransactions,
        credits: {
          balance: getCreditPoolTotal(refreshedStudent),
          totalCredits: getCreditPoolTotal(refreshedStudent),
          reservedCredits: getReservedCredits(refreshedStudent),
          availableCredits: getAvailableBookingCredits(refreshedStudent),
          usedCredits: refreshedStudent?.usedCredits ?? ((refreshedStudent?.totalCreditsEarned || 0) - (refreshedStudent?.creditBalance || 0))
        }
      });
    } finally {
      if (lockHeld) {
        await slotBookingLock.releaseSlotLock(chosenTeacherId, slotIdTrim);
      }
    }
  } catch (err) {
    console.error('❌ Error booking class:', err);
    if (isMongoDuplicateKeyError(err)) {
      return res.status(409).json({
        error: 'Sorry, this slot was just booked by someone else.',
        code: 'ALREADY_BOOKED',
      });
    }
    res.status(500).json({ error: err.message });
  }
}

module.exports = { runBookSlot };
