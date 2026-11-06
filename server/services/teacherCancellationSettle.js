'use strict';

const Booking = require('../models/Booking');
const TeacherSlot = require('../models/TeacherSlot');
const { releaseReservedCreditForBooking } = require('./bookingCreditLedger');
const { isEmergencyReason } = require('../utils/emergencyExcuse');
const { getBookingStartAsDate } = require('../utils/bookingScheduledStart');
const { notifyTeacher, notifyStudent } = require('./notifyService');
const {
  assignApprovedEmergency,
  canAssignSubstitute,
} = require('./emergencySubstituteService');

async function finishApprovedCancellation(cancellationRequest, adminNotes) {
  const booking = await Booking.findById(cancellationRequest.bookingId);
  if (!booking) return { outcome: 'missing' };

  const emergencyOk = isEmergencyReason(cancellationRequest.emergencyReason) && !!cancellationRequest.proofPath;
  const start = getBookingStartAsDate(booking);
  const now = new Date();
  const note = adminNotes ? ` Admin notes: ${adminNotes}` : '';

  if (emergencyOk) {
    let moved = false;
    if (canAssignSubstitute(start, now)) {
      const result = await assignApprovedEmergency(booking, now);
      moved = result === 'moved';
    }
    if (moved) {
      cancellationRequest.status = 'approved';
      cancellationRequest.proofValidity = 'pending';
      cancellationRequest.penaltyWaived = true;
      cancellationRequest.adminReview = {
        reviewedBy: 'system',
        reviewedAt: now,
        adminNotes: adminNotes || 'Approved because another teacher is free for this time.',
      };
      await cancellationRequest.save();
      await Booking.updateOne({ _id: booking._id }, { $set: { penaltyWaived: true } });
      await notifyTeacher(
        booking.teacherId,
        'cancel',
        `Your emergency cancellation was approved. The class was moved to another teacher.${note}`,
        { bookingId: String(booking._id), actionUrl: '/teacher-class-table.html' }
      );
      return { outcome: 'moved' };
    }

    const tooLate = !!(start && !canAssignSubstitute(start, now));
    const why = tooLate
      ? 'Declined because fewer than 5 minutes remain, so the class cannot be assigned to another teacher.'
      : 'Declined because no other teacher is free for this time.';
    cancellationRequest.status = 'rejected';
    cancellationRequest.proofValidity = 'pending';
    cancellationRequest.penaltyWaived = false;
    cancellationRequest.adminReview = {
      reviewedBy: 'system',
      reviewedAt: now,
      adminNotes: why,
    };
    await cancellationRequest.save();
    await notifyTeacher(
      booking.teacherId,
      'cancellation-rejected',
      `Your emergency cancellation was declined. ${why} The class stays with you.`,
      { bookingId: String(booking._id), actionUrl: '/teacher-class-table.html' }
    );
    await notifyStudent(
      booking.studentId,
      'booking',
      `Your class on ${booking.date} at ${booking.time} is still scheduled.`,
      { bookingId: String(booking._id), actionUrl: '/student-class-table.html' }
    );
    return { outcome: 'declined', tooLate };
  }

  if (canAssignSubstitute(start, now)) {
    const result = await assignApprovedEmergency(booking, now);
    if (result === 'moved') return { outcome: 'moved', tooLate: false };
  }

  booking.status = 'cancelled';
  if (emergencyOk) {
    booking.penaltyWaived = true;
    cancellationRequest.penaltyWaived = true;
    await cancellationRequest.save();
  }
  await releaseReservedCreditForBooking(booking);
  await booking.save();
  await TeacherSlot.updateOne(
    { teacherId: booking.teacherId, date: booking.date, time: booking.time },
    { $set: { available: true } }
  );

  const studentMsg = `Your class on ${booking.date} at ${booking.time} was cancelled.${note}`;
  await notifyTeacher(
    booking.teacherId,
    'cancel',
    `Your cancellation request for ${booking.date} at ${booking.time} was approved.${note}`,
    { bookingId: String(booking._id), actionUrl: '/teacher-class-table.html' }
  );
  await notifyStudent(
    booking.studentId,
    'cancel',
    studentMsg,
    { bookingId: String(booking._id), actionUrl: '/student-book.html' }
  );
  return { outcome: 'cancelled', tooLate: false };
}

module.exports = { finishApprovedCancellation };
