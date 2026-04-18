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
  getCandidateTeachersForSlotUtc,
} = require('./teacherSlotResolve');

function toUtcFromLocal(dateStr, timeStr, zone) {
  const z = zone && DateTime.now().setZone(zone).isValid ? zone : 'Asia/Manila';
  const dt = DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: z });
  if (!dt.isValid) throw new Error(`Invalid date/time: ${dateStr} ${timeStr} in zone ${z}`);
  return { utcIso: dt.toUTC().toISO(), zoneUsed: z };
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
    if (!effectiveSubscribed && availableCredits <= 0) {
      return res.status(403).json({
        error: 'Subscription required to book your next lesson.',
        code: 'SUBSCRIPTION_REQUIRED_LESSON_2',
      });
    }
    if (availableCredits <= 0) {
      return res.status(400).json({ error: 'Insufficient credits. Please top up your plan.' });
    }

    const missingFields = [];
    if (!studentId) missingFields.push('studentId');
    if (!dateTimeUtc && (!date || !time)) missingFields.push('dateTimeUtc');
    if (!lesson) missingFields.push('lesson');
    if (!studentLevel) missingFields.push('studentLevel');

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: 'Missing required fields: ' + missingFields.join(', '),
        details: {
          studentId: !!studentId,
          date: !!date,
          time: !!time,
          lesson: !!lesson,
          studentLevel: !!studentLevel
        },
        missingFields
      });
    }

    let canonicalUtc = dateTimeUtc;
    if (!canonicalUtc) {
      const { utcIso } = toUtcFromLocal(date, time, timezone || 'Asia/Manila');
      canonicalUtc = utcIso;
    }
    const dt = DateTime.fromISO(canonicalUtc, { zone: 'utc' });
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
    const existingSlot = slotRows.find((s) => String(s._id) === slotIdTrim) || null;
    if (!existingSlot || existingSlot.available === false) {
      return res.status(400).json({ error: 'Selected slot is no longer available or not open for booking' });
    }

    let chosenTeacherId = await resolveToCanonicalTeacherId(existingSlot.teacherId);
    if (!chosenTeacherId || !candidates.includes(chosenTeacherId)) {
      return res.status(400).json({
        error: 'That slot is not open for booking or the teacher is no longer available for this time.',
        candidates
      });
    }

    if (preferredRaw != null && String(preferredRaw).trim() !== '') {
      const resolvedPref = await resolveToCanonicalTeacherId(preferredRaw);
      if (!resolvedPref) {
        return res.status(400).json({ error: 'Preferred teacher not found.' });
      }
      if (resolvedPref !== chosenTeacherId) {
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
        $or: [{ dateTimeUtc: utcInstant }, { dateTimeUtc: canonicalUtc }],
        status: { $nin: ['cancelled'] }
      });
      if (session) dupQ = dupQ.session(session);
      const dup = await dupQ;
      if (dup) {
        const err = new Error('Selected slot is already booked');
        err.statusCode = 400;
        err.code = 'ALREADY_BOOKED';
        throw err;
      }

      const reservedStudent = await Student.findOneAndUpdate(
        {
          _id: req.user.studentId,
          $expr: {
            $gt: [
              {
                $subtract: [
                  { $ifNull: ['$totalCredits', { $ifNull: ['$creditBalance', 0] }] },
                  { $ifNull: ['$reservedCredits', 0] },
                ],
              },
              0,
            ],
          },
        },
        {
          $inc: {
            reservedCredits: 1,
            creditBalance: -1
          }
        },
        findOpts
      );
      if (!reservedStudent) {
        const err = new Error('Insufficient credits. Please top up your plan.');
        err.statusCode = 400;
        err.code = 'INSUFFICIENT_CREDITS';
        throw err;
      }

      const lockedSlot = await TeacherSlot.findOneAndUpdate(
        {
          _id: existingSlot._id,
          teacherId: existingSlot.teacherId,
          available: true
        },
        { $set: { available: false } },
        findOpts
      );

      if (!lockedSlot) {
        if (!session) {
          await Student.updateOne(
            { _id: req.user.studentId },
            {
              $inc: { creditBalance: 1, reservedCredits: -1 }
            }
          ).catch(() => {});
        }
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
          await Student.updateOne(
            { _id: req.user.studentId },
            {
              $inc: { creditBalance: 1, reservedCredits: -1 }
            }
          ).catch(() => {});
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

      const studentName = student ? `${student.firstName} ${student.lastName}` : studentId;
      await createBookingNotification(
        chosenTeacherId,
        'booking',
        `New class booked for ${dateUtc} at ${timeUtc} with ${studentName}.`
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
    res.status(500).json({ error: err.message });
  }
}

module.exports = { runBookSlot };
