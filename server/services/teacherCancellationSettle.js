'use strict';

const Booking = require('../models/Booking');
const { isEmergencyReason } = require('../utils/emergencyExcuse');
const { getBookingStartAsDate } = require('../utils/bookingScheduledStart');
const { notifyTeacher } = require('./notifyService');
const {
  assignApprovedEmergency,
  canAssignSubstitute,
} = require('./emergencySubstituteService');

async function finishApprovedCancellation(cancellationRequest, adminNotes) {
  const booking = await Booking.findById(cancellationRequest.bookingId);
  if (!booking) return { outcome: 'missing' };

  const start = getBookingStartAsDate(booking);
  const now = new Date();
  const note = adminNotes ? ` Admin notes: ${adminNotes}` : '';

  if (!canAssignSubstitute(start, now)) {
    return { outcome: 'too-late' };
  }

  const result = await assignApprovedEmergency(booking, now);
  if (result !== 'moved') {
    return { outcome: 'no-cover' };
  }

  if (isEmergencyReason(cancellationRequest.emergencyReason) && cancellationRequest.proofPath) {
    cancellationRequest.penaltyWaived = true;
    cancellationRequest.proofValidity = cancellationRequest.proofValidity || 'pending';
    await cancellationRequest.save();
    await Booking.updateOne({ _id: booking._id }, { $set: { penaltyWaived: true } });
  }

  await notifyTeacher(
    booking.teacherId,
    'cancel',
    `Your cancellation was approved. The class was moved to another teacher and your slot is open again.${note}`,
    { bookingId: String(booking._id), actionUrl: '/teacher-class-table.html' }
  );
  return { outcome: 'moved' };
}

module.exports = { finishApprovedCancellation };
