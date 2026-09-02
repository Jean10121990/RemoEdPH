const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fsp = require('fs').promises;
const Student = require('./models/Student');
const Booking = require('./models/Booking');
const CancellationRequest = require('./models/CancellationRequest');
const Feedback = require('./models/Feedback');
const StudentNotification = require('./models/StudentNotification');
const AssessmentTrial = require('./models/AssessmentTrial');
const Teacher = require('./models/Teacher');
const PeerMessage = require('./models/PeerMessage');
const Notification = require('./models/Notification');
const { aggregateActiveChats, fetchPeerMessagesPage } = require('./services/peerInboxQueries');
const realtime = require('./realtime');
const Referral = require('./models/Referral');
const PortalVideo = require('./models/PortalVideo');
const Lesson = require('./models/Lesson');
const Curriculum = require('./models/Curriculum');
const { verifyToken, requireStudent } = require('./authMiddleware');
const {
  buildStudentCreditApiResponse,
  reconcileStudentCreditBalanceIfDrifted,
} = require('./services/studentCreditSummary');
const {
  normalizeLevelKey,
  getTotalForLearningJourneyLevel,
  getEffectiveTotalLessonsPurchased,
  computeBatchUnlockState,
  DEFAULT_MAX_BATCH,
} = require('./services/learningJourneyUnlock');
const { logEmergencyCreditRetained } = require('./services/bookingCreditLedger');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { encryptPiiString } = require('./utils/piiCrypto');
const { getBookingStartAsDate } = require('./utils/bookingScheduledStart');
const {
  processImage,
  extractImageBufferFromDataUrl,
  getUploadsRoot,
  safeUnlinkPublicUpload,
} = require('./utils/imageOptimizer');
const studentController = require('./studentController');

const router = express.Router();

/** Trial reminder email — run after profile response (cache hit or miss). */
function scheduleTrialBookingReminderSideEffect(studentDocOrMongoId) {
  setImmediate(async () => {
    try {
      const student =
        studentDocOrMongoId && typeof studentDocOrMongoId === 'object' && studentDocOrMongoId._id
          ? studentDocOrMongoId
          : await Student.findById(studentDocOrMongoId);
      if (!student) return;
      const { sendTrialBookingReminderEmail } = require('./emailService');
      if (
        student.hasFreeTrial !== true ||
        student.accountStatus !== 'trial_active' ||
        !student.assessmentTrialGrantedAt ||
        student.trialBookingReminderSentAt
      ) {
        return;
      }
      const hours =
        (Date.now() - new Date(student.assessmentTrialGrantedAt).getTime()) / 3600000;
      if (hours < 24) return;
      const upd = await Student.findOneAndUpdate(
        {
          _id: student._id,
          trialBookingReminderSentAt: null,
          accountStatus: 'trial_active',
          hasFreeTrial: true,
        },
        { $set: { trialBookingReminderSentAt: new Date() } },
        { new: true }
      );
      if (!upd || !upd.email) return;
      const greet =
        [upd.firstName, upd.lastName].filter(Boolean).join(' ').trim() ||
        (upd.email ? String(upd.email).split('@')[0] : '') ||
        'there';
      await sendTrialBookingReminderEmail(upd.email, greet).catch((err) =>
        console.error('[trial booking reminder] email failed:', err.message || err)
      );
    } catch (e) {
      console.error('[trial booking reminder]', e.message || e);
    }
  });
}

// Helper function to create student notifications
async function createStudentNotification(studentId, type, message) {
  try {
    const notification = new StudentNotification({
      studentId,
      type,
      message
    });
    await notification.save();
    console.log(`📢 Student notification created: ${studentId} - ${type}`);
    return notification;
  } catch (error) {
    console.error('❌ Error creating student notification:', error);
    throw error;
  }
}

// Test route to verify student routes are working
router.get('/test', (req, res) => {
  res.json({ message: 'Student routes are working!' });
});

// Test route to verify cancel-booking route exists
router.get('/test-cancel-route', (req, res) => {
  res.json({ message: 'Cancel booking route is registered!', route: '/api/student/cancel-booking' });
});



// Test route to create sample notifications (for testing)
router.post('/create-test-notifications', verifyToken, requireStudent, async (req, res) => {
  try {
    const studentUsername = req.user.username;
    
    // Create some sample notifications
    const sampleNotifications = [
      {
        type: 'booking',
        message: 'Your class has been confirmed for tomorrow at 9:00 AM with Teacher Sarah'
      },
      {
        type: 'reminder',
        message: 'Don\'t forget your class today at 3:00 PM with Teacher John'
      },
      {
        type: 'announcement',
        message: 'New lesson materials are available for your upcoming class'
      },
      {
        type: 'booking',
        message: 'Your class request for Friday has been approved'
      },
      {
        type: 'reminder',
        message: 'Please prepare for your English speaking practice session'
      }
    ];
    
    for (const notification of sampleNotifications) {
      await createStudentNotification(studentUsername, notification.type, notification.message);
    }
    
    res.json({ success: true, message: 'Test notifications created successfully' });
  } catch (error) {
    console.error('Error creating test notifications:', error);
    res.status(500).json({ error: 'Failed to create test notifications' });
  }
});

// Get student profile
router.get('/profile', verifyToken, requireStudent, async (req, res) => {
  try {
    console.log('🔍 Profile fetch request for student ID:', req.user.studentId);
    console.log('🔍 User from token:', req.user);

    const cached = await studentController.getStudentProfileFromCache(req.user.studentId);
    if (cached) {
      scheduleTrialBookingReminderSideEffect(req.user.studentId);
      return res.json(cached);
    }

    const student = await Student.findById(req.user.studentId);
    
    if (!student) {
      console.log('❌ Student not found with ID:', req.user.studentId);
      return res.status(404).json({ error: 'Student not found' });
    }

    console.log('✅ Student found:', {
      id: student._id,
      username: student.username,
      email: student.email,
      firstName: student.firstName,
      lastName: student.lastName
    });

    const body = {
      profile: {
        username: student.username,
        firstName: student.firstName,
        middleName: student.middleName,
        lastName: student.lastName,
        gender: student.gender,
        birthday: student.birthday,
        age: student.age,
        contact: student.contact,
        email: student.email,
        address: student.address,
        language: student.language,
        hobbies: student.hobbies,
        parentName: student.parentName,
        parentContact: student.parentContact,
        emergencyContact: student.emergencyContact,
        aboutMe: student.aboutMe,
        profilePicture: student.profilePicture,
        education: student.education,
        documents: student.documents,
        cefrLevel: student.cefrLevel,
        leveling: student.leveling,
        assessmentScore: student.assessmentScore,
        assessmentDate: student.assessmentDate,
        accountStatus: student.accountStatus || 'standard',
        trialCompletedAt: student.trialCompletedAt || null,
        subscriptionStatus: student.subscriptionStatus || 'pending',
        paymentStatus: student.paymentStatus || 'unpaid',
        hasFreeTrial: student.hasFreeTrial === true,
        hasSeenWelcomeTour: student.hasSeenWelcomeTour === true,
        isSubscribed:
          student.isSubscribed === true ||
          (student.paymentStatus === 'paid' && student.subscriptionStatus === 'active'),
      }
    };
    await studentController.setStudentProfileCache(req.user.studentId, body);
    res.json(body);
    scheduleTrialBookingReminderSideEffect(student);
  } catch (error) {
    console.error('❌ Error fetching student profile:', error);
    res.status(500).json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Server error'
          : String(error && error.message ? error.message : 'Server error'),
    });
  }
});

// Mark welcome tour completed (first-login onboarding)
router.post('/welcome-tour/dismiss', verifyToken, requireStudent, async (req, res) => {
  try {
    await Student.updateOne({ _id: req.user.studentId }, { $set: { hasSeenWelcomeTour: true } });
    await studentController.invalidateStudentProfileCache(req.user.studentId);
    res.json({ success: true });
  } catch (error) {
    console.error('welcome-tour/dismiss:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Save/update student profile
router.post('/profile', verifyToken, requireStudent, async (req, res) => {
  try {
    console.log('Profile update request received:', req.body);
    console.log('Student ID:', req.user.studentId);
    
    const {
      firstName,
      middleName,
      lastName,
      gender,
      birthday,
      age,
      contact,
      email,
      address,
      language,
      hobbies,
      parentName,
      parentContact,
      emergencyContact,
      aboutMe,
      education
    } = req.body;

    const updateData = {
      firstName: firstName || '',
      middleName: middleName || '',
      lastName: lastName || '',
      gender: gender || '',
      birthday: birthday || null,
      age: age || null,
      // Raw updates skip Mongoose setters — encrypt here when PII_ENCRYPTION_KEY is set
      contact: encryptPiiString(contact || ''),
      email: email || req.user.username, // Use username as fallback for email
      address: address || '',
      language: language || '',
      hobbies: hobbies || '',
      parentName: parentName || '',
      parentContact: encryptPiiString(parentContact || ''),
      emergencyContact: encryptPiiString(emergencyContact || ''),
      aboutMe: aboutMe || '',
      education: education || []
    };

    console.log('Update data:', updateData);

    const student = await Student.findByIdAndUpdate(
      req.user.studentId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!student) {
      console.log('Student not found with ID:', req.user.studentId);
      return res.status(404).json({ error: 'Student not found' });
    }

    console.log('Profile updated successfully:', student);
    await studentController.invalidateStudentProfileCache(req.user.studentId);
    res.json({ message: 'Profile updated successfully', student });
  } catch (error) {
    console.error('Error updating student profile:', error);
    res.status(500).json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Server error'
          : String(error && error.message ? error.message : 'Server error'),
    });
  }
});

// Upload student document
router.post('/upload-document', verifyToken, requireStudent, async (req, res) => {
  try {
    const { documentType, fileData, fileName } = req.body;

    if (!documentType || !fileData) {
      return res.status(400).json({ error: 'Missing document data' });
    }

    const updateField = {};
    let profilePicBuf = null;
    let previousStudentProfilePic = null;

    // Handle different document types
    if (documentType === 'profilePicture') {
      const existing = await Student.findById(req.user.studentId).select('profilePicture').lean();
      previousStudentProfilePic = existing?.profilePicture || null;
      profilePicBuf = extractImageBufferFromDataUrl(String(fileData));
      if (profilePicBuf) {
        const optimized = await processImage(profilePicBuf, 'avatar');
        const dir = path.join(getUploadsRoot(), 'student-profiles');
        await fsp.mkdir(dir, { recursive: true });
        const sid = String(req.user.studentId).replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `${sid}-${Date.now()}.webp`;
        await fsp.writeFile(path.join(dir, filename), optimized);
        updateField.profilePicture = `/uploads/student-profiles/${filename}`;
      } else {
        const t = String(fileData).trim();
        if (t.startsWith('/uploads/') || /^https?:\/\//i.test(t)) {
          updateField.profilePicture = t;
        } else {
          return res.status(400).json({ error: 'Invalid profile picture image' });
        }
      }
    } else {
      // For other documents, store in documents object
      updateField[`documents.${documentType}`] = fileData;
    }

    const student = await Student.findByIdAndUpdate(
      req.user.studentId,
      updateField,
      { new: true }
    );

    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    if (
      documentType === 'profilePicture' &&
      profilePicBuf &&
      previousStudentProfilePic &&
      previousStudentProfilePic !== student.profilePicture
    ) {
      await safeUnlinkPublicUpload(previousStudentProfilePic, ['student-profiles']);
    }

    await studentController.invalidateStudentProfileCache(req.user.studentId);
    const body = { message: 'Document uploaded successfully' };
    if (documentType === 'profilePicture' && student.profilePicture) {
      body.profilePicture = student.profilePicture;
    }
    res.json(body);
  } catch (error) {
    console.error('Error uploading student document:', error);
    const errStr = String(error && error.message ? error.message : '');
    const badImage =
      errStr === 'Image too large' ||
      /input buffer|unsupported image|unsupported file|metadata|vips|sharp/i.test(errStr);
    if (badImage) {
      return res.status(400).json({ error: 'Invalid or unsupported image' });
    }
    res.status(500).json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Server error'
          : errStr || 'Server error',
    });
  }
});

// Cancellation request endpoints for students
router.post('/request-cancellation', verifyToken, requireStudent, async (req, res) => {
  try {
    const { bookingId, reason } = req.body;
    const studentId = req.user.studentId;
    
    if (!bookingId || !reason) {
      return res.status(400).json({ 
        success: false, 
        error: 'Booking ID and reason are required' 
      });
    }
    
    if (reason.length < 10) {
      return res.status(400).json({ 
        success: false, 
        error: 'Reason must be at least 10 characters long' 
      });
    }
    
    // Find the booking and verify it belongs to this student
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        error: 'Booking not found' 
      });
    }
    
    if (booking.studentId !== req.user.username) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied. This booking does not belong to you.' 
      });
    }
    
    // Check if class has already started (align with dateTimeUtc / zones, not naive local Date)
    const classDateTime = getBookingStartAsDate(booking);
    const now = new Date();
    if (!classDateTime || classDateTime <= now) {
      return res.status(400).json({
        success: false,
        error: !classDateTime
          ? 'Cannot determine class schedule for cancellation'
          : 'Cannot cancel a class that has already started',
      });
    }

    // Check if there's already a pending cancellation request
    const existingRequest = await CancellationRequest.findOne({
      bookingId,
      status: 'pending'
    });
    
    if (existingRequest) {
      return res.status(400).json({ 
        success: false, 
        error: 'A cancellation request is already pending for this booking' 
      });
    }
    
    // Create cancellation request
    const cancellationRequest = new CancellationRequest({
      bookingId,
      requesterType: 'student',
      requesterId: req.user.username,
      reason
    });
    
    await cancellationRequest.save();
    
    res.json({
      success: true,
      message: 'Cancellation request submitted successfully. It will be reviewed by admin.',
      cancellationRequest
    });
  } catch (err) {
    console.error('Error submitting cancellation request:', err);
    res.status(500).json({ error: 'Failed to submit cancellation request' });
  }
});

// Direct cancellation endpoint for students (emergency cancel with credit protection)
// Route: POST /api/student/cancel-booking
router.post('/cancel-booking', verifyToken, requireStudent, async (req, res) => {
  console.log('📞 [SERVER] /api/student/cancel-booking endpoint called');
  console.log('📞 [SERVER] Request body:', req.body);
  console.log('📞 [SERVER] Student username:', req.user?.username);
  try {
    const { bookingId, reason, emergency } = req.body;
    const studentUsername = req.user.username;
    const EMERGENCY_REASONS = [
      'Power Interruption',
      'Natural Disaster',
      'Accident/Medical Emergency',
      'Other Valid Reason',
    ];

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        error: 'Booking ID is required',
      });
    }

    const reasonText = String(reason || '').trim();
    if (!EMERGENCY_REASONS.includes(reasonText)) {
      return res.status(400).json({
        success: false,
        error: 'A valid emergency cancellation reason is required',
      });
    }

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found',
      });
    }

    const ownerIds = collectStudentIdentifiers(req);
    if (!ownerIds.includes(booking.studentId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. This booking does not belong to you.',
      });
    }

    const { isCancelledStatus } = require('./utils/bookingStatus');
    if (isCancelledStatus(booking.status)) {
      return res.status(400).json({
        success: false,
        error: 'This booking is already cancelled',
      });
    }

    const classDateTime = getBookingStartAsDate(booking);
    const now = new Date();
    if (!classDateTime) {
      return res.status(400).json({
        success: false,
        error: 'Cannot determine class schedule for cancellation',
      });
    }
    if (classDateTime <= now) {
      return res.status(400).json({
        success: false,
        error: 'Cannot cancel a class that has already started or completed',
      });
    }

    const minutesUntilStart = (classDateTime.getTime() - now.getTime()) / 60000;
    if (minutesUntilStart <= 30) {
      return res.status(400).json({
        success: false,
        error:
          'The 30-minute emergency cancellation window has closed. Credits will be forfeited if you do not attend.',
      });
    }

    booking.status = 'cancelled_by_student_emergency';
    booking.cancellationTime = now;
    booking.cancellationReason = {
      reason: reasonText,
      rejected: false,
      emergency: emergency !== false,
    };

    // No-reserve model: balance was never held; log retain only (no release/refund).
    await logEmergencyCreditRetained(booking);

    await booking.save();

    try {
      const TeacherSlot = require('./models/TeacherSlot');
      const slotUpdateResult = await TeacherSlot.updateOne(
        { teacherId: booking.teacherId, date: booking.date, time: booking.time },
        { available: true }
      );
      console.log(
        '✅ Slot marked available after student emergency cancel:',
        slotUpdateResult.modifiedCount > 0
      );
    } catch (slotErr) {
      console.error('⚠️ Could not reopen TeacherSlot after emergency cancel:', slotErr.message || slotErr);
    }

    console.log(
      `✅ [STUDENT] Booking ${bookingId} emergency-cancelled by student ${studentUsername}`
    );

    res.json({
      success: true,
      message: 'Booking cancelled successfully. Credit retained.',
      booking,
    });
  } catch (err) {
    console.error('❌ Error cancelling booking:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel booking',
    });
  }
});

// Get cancellation requests for student
router.get('/cancellation-requests', verifyToken, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.username;
    
    const requests = await CancellationRequest.find({
      requesterId: studentId,
      requesterType: 'student'
    })
    .populate('bookingId', 'date time lesson studentLevel')
    .sort({ createdAt: -1 });
    
    res.json({
      success: true,
      requests
    });
  } catch (err) {
    console.error('Error fetching cancellation requests:', err);
    res.status(500).json({ error: 'Failed to fetch cancellation requests' });
  }
});

function collectStudentIdentifiers(req) {
  const ids = [];
  if (req.student && req.student.username) ids.push(req.student.username);
  if (req.student && req.student.email) ids.push(req.student.email);
  if (req.student && req.student._id) ids.push(String(req.student._id));
  if (req.user && req.user.username) ids.push(req.user.username);
  if (req.user && req.user.studentId) ids.push(String(req.user.studentId));
  return [...new Set(ids.filter(Boolean))];
}

/**
 * Batch-load Teacher + teacher→student Feedback for a booking list (avoids N+1 queries per row).
 * @param {object} [options]
 * @param {boolean} [options.lightTeacher] — Only names/ids (no photo/intro) for small payloads.
 * @param {boolean} [options.skipFeedback] — Skip Feedback query when the client does not need it.
 */
async function enrichStudentBookingsWithTeachersAndFeedback(bookings, uniqueIdentifiers, options = {}) {
  if (!bookings || bookings.length === 0) return [];

  const { lightTeacher = false, skipFeedback = false } = options;

  const bookingObjs = bookings.map((b) => (b && typeof b.toObject === 'function' ? b.toObject() : { ...b }));
  const logicalTeacherIds = [...new Set(bookingObjs.map((b) => b.teacherId).filter(Boolean))];

  let teacherQuery = Teacher.find({ teacherId: { $in: logicalTeacherIds } });
  if (lightTeacher) {
    teacherQuery = teacherQuery.select('teacherId username firstName lastName');
  }
  const teachers =
    logicalTeacherIds.length > 0 ? await teacherQuery.lean() : [];
  const teacherByTid = new Map(teachers.map((t) => [t.teacherId, t]));

  const bookingIdStrs = bookingObjs.map((b) => String(b._id));
  const feedbackDocs =
    !skipFeedback && bookingIdStrs.length > 0
      ? await Feedback.find({
          bookingId: { $in: bookingIdStrs },
          studentId: { $in: uniqueIdentifiers },
          $or: [{ feedbackRole: 'teacher_to_student' }, { feedbackRole: { $exists: false } }],
        })
          .select('bookingId teacherId rating comment submittedAt')
          .lean()
      : [];

  const feedbackKey = (bid, tid) => `${String(bid)}|${String(tid)}`;
  const feedbackMap = new Map();
  for (const f of feedbackDocs) {
    feedbackMap.set(feedbackKey(f.bookingId, f.teacherId), f);
  }

  return bookingObjs.map((bookingObj) => {
    const logicalTeacherId = bookingObj.teacherId;
    const teacher = logicalTeacherId ? teacherByTid.get(logicalTeacherId) : null;
    const bookingIdStr = String(bookingObj._id);
    const teacherFeedbackDoc = feedbackMap.get(feedbackKey(bookingIdStr, logicalTeacherId));

    let teacherFeedback = null;
    if (teacherFeedbackDoc) {
      teacherFeedback = {
        rating: teacherFeedbackDoc.rating,
        comment: teacherFeedbackDoc.comment || '',
        submittedAt: teacherFeedbackDoc.submittedAt,
      };
    }

    const teacherPayload = teacher
      ? lightTeacher
        ? {
            _id: teacher._id,
            teacherId: teacher.teacherId,
            username: teacher.username,
            firstName: teacher.firstName,
            lastName: teacher.lastName,
          }
        : {
            _id: teacher._id,
            teacherId: teacher.teacherId,
            username: teacher.username,
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            photo: teacher.photo,
            intro: teacher.intro,
          }
      : null;

    return {
      ...bookingObj,
      teacherLogicalId: logicalTeacherId,
      teacherFeedback,
      teacherId: teacherPayload,
    };
  });
}

/** Default page size for booking history (keeps payloads small vs 26 weeks of rows). */
const BOOKING_HISTORY_DEFAULT_LIMIT = 20;
const BOOKING_HISTORY_MAX_LIMIT = 50;

function parseHistoryLimitParam(raw) {
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first == null || first === '') return BOOKING_HISTORY_DEFAULT_LIMIT;
  const n = parseInt(String(first).trim(), 10);
  if (!Number.isFinite(n)) return BOOKING_HISTORY_DEFAULT_LIMIT;
  return Math.min(BOOKING_HISTORY_MAX_LIMIT, Math.max(1, n));
}

/** Fields needed by student-booking-history.html (sort keys + table + join link). */
const BOOKING_HISTORY_LEAN_SELECT =
  'studentId teacherId date time dateTimeUtc lesson status classroomId finishedAt absentType';

// One query + batch enrichment for booking history page (replaces many /bookings?week= calls).
router.get('/bookings/history', verifyToken, requireStudent, async (req, res) => {
  try {
    const uniqueIdentifiers = collectStudentIdentifiers(req);
    if (uniqueIdentifiers.length === 0) {
      return res.status(400).json({ error: 'Student identifier missing' });
    }

    const limit = parseHistoryLimitParam(req.query.limit);

    const bookings = await Booking.find({
      studentId: { $in: uniqueIdentifiers },
    })
      .select(BOOKING_HISTORY_LEAN_SELECT)
      .sort({ date: -1, time: -1 })
      .limit(limit)
      .lean();

    const bookingsWithTeacherInfo = await enrichStudentBookingsWithTeachersAndFeedback(
      bookings,
      uniqueIdentifiers,
      { lightTeacher: true, skipFeedback: true }
    );
    res.json({ bookings: bookingsWithTeacherInfo, limit });
  } catch (err) {
    console.error('❌ Error fetching student bookings history:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get student bookings for a week (filter window = client's local week → UTC)
router.get('/bookings', verifyToken, requireStudent, async (req, res) => {
  try {
    const { week, timezoneOffset, tz } = req.query;
    console.log('Fetching bookings for:', req.user.id);
    const uniqueIdentifiers = collectStudentIdentifiers(req);

    if (uniqueIdentifiers.length === 0) {
      console.log('❌ No student identifiers available for bookings query', { user: req.user });
      return res.status(400).json({ error: 'Student identifier missing' });
    }

    const studentIdentifierForLog = uniqueIdentifiers[0];

    if (!week) {
      return res.status(400).json({ error: 'Missing week parameter' });
    }

    const { resolveLocalWeekUtcWindow, localWeekEndDateString } = require('./utils/localWeekWindow');
    let startUtc;
    let endUtc;
    let endDateString;
    let zoneLabel = 'utc';
    try {
      const window = resolveLocalWeekUtcWindow(week, { timezoneOffset, tz });
      startUtc = window.startUtc;
      endUtc = window.endUtc;
      zoneLabel = window.zoneLabel;
      endDateString = localWeekEndDateString(week, { timezoneOffset, tz });
    } catch (parseErr) {
      return res.status(400).json({ error: parseErr.message || 'Invalid week/timezone' });
    }

    console.log(`🔍 Looking for bookings for student identifiers: ${uniqueIdentifiers.join(', ')} in week: ${week}`);
    console.log(`🔍 Local-week UTC window: ${startUtc.toISOString()} → ${endUtc.toISOString()} (zone ${zoneLabel})`);
    console.log(`🔍 Legacy date fallback range: ${week} to ${endDateString} (exclusive)`);

    const { cancelledStatusValues } = require('./utils/bookingStatus');
    const bookings = await Booking.find({
      studentId: { $in: uniqueIdentifiers },
      status: { $nin: cancelledStatusValues() },
      $or: [
        { dateTimeUtc: { $gte: startUtc, $lt: endUtc } },
        // Legacy rows without dateTimeUtc: fall back to stored UTC date strings
        {
          $and: [
            { $or: [{ dateTimeUtc: null }, { dateTimeUtc: { $exists: false } }] },
            { date: { $gte: week, $lt: endDateString } },
          ],
        },
      ],
    }).lean();

    console.log(`🔍 Raw bookings query result count: ${bookings.length}`);
    if (bookings.length > 0) {
      console.log(
        `🔍 Sample booking studentId: ${bookings[0].studentId}, date: ${bookings[0].date}, time: ${bookings[0].time}`
      );
    }

    const bookingsWithTeacherInfo = await enrichStudentBookingsWithTeachersAndFeedback(
      bookings,
      uniqueIdentifiers
    );

    const payload = bookingsWithTeacherInfo.map((b) => {
      const startTime =
        b.dateTimeUtc instanceof Date
          ? b.dateTimeUtc.toISOString()
          : b.dateTimeUtc
            ? new Date(b.dateTimeUtc).toISOString()
            : null;
      return { ...b, startTime };
    });

    console.log(`✅ Found ${payload.length} bookings for student ${studentIdentifierForLog} in week ${week}`);

    res.json({ bookings: payload, week, timezoneOffset: timezoneOffset ?? null, tz: tz || zoneLabel });
  } catch (err) {
    console.error('❌ Error fetching student bookings:', err);
    res.status(500).json({ error: err.message });
  }
});

/** Maps DB / UI level strings to progress sidebar keys (canonical growth levels). */
function normalizeProgressLevel(raw) {
  const { normalizeCurriculumLevel } = require('./config/curriculumLevels');
  return normalizeCurriculumLevel(raw);
}

/** Parse "Batch X" / "Lesson Y" from stored booking title; or linear lesson index 1–220. */
function levelFromLessonTitle(lessonTitle) {
  const t = String(lessonTitle || '');
  const m = t.match(/RemoEd\s+([A-Za-z]+)\s+English/i);
  if (!m) return null;
  return normalizeProgressLevel(m[1]);
}

function parseBatchLessonFromTitle(lessonTitle) {
  const t = String(lessonTitle || '');
  let batch = null;
  let lessonNum = null;
  const bMatch = t.match(/batch\s*(\d+)/i);
  const lMatch = t.match(/lesson\s*(\d+)/i);
  if (bMatch) batch = parseInt(bMatch[1], 10);
  if (lMatch) lessonNum = parseInt(lMatch[1], 10);
  if (batch != null && lessonNum != null && batch >= 1 && batch <= 10 && lessonNum >= 1 && lessonNum <= 22) {
    return { batch, lessonNum };
  }
  if (lMatch && batch == null) {
    const n = parseInt(lMatch[1], 10);
    if (n >= 1 && n <= 220) {
      return { batch: Math.ceil(n / 22), lessonNum: ((n - 1) % 22) + 1 };
    }
  }
  return null;
}

function isBookingLessonCompleted(b) {
  const st = String(b.status || '').toLowerCase();
  if (st === 'completed') return true;
  if (b.attendance && b.attendance.classCompleted) return true;
  return false;
}

/**
 * All non-cancelled bookings → completed lesson keys for the progress sidebar
 * (4 levels × 10 batches × 22 lessons). Keys: "Little Seeds (Age 3):1:1" … "Young Stewards (Age 6):10:22".
 */
router.get('/lesson-progress', verifyToken, requireStudent, async (req, res) => {
  try {
    const uniqueIdentifiers = collectStudentIdentifiers(req);
    if (uniqueIdentifiers.length === 0) {
      return res.status(400).json({ error: 'Student identifier missing' });
    }

    const { cancelledStatusValues } = require('./utils/bookingStatus');
    const bookings = await Booking.find({
      studentId: { $in: uniqueIdentifiers },
      status: { $nin: cancelledStatusValues() },
    })
      .select('lesson studentLevel status attendance lessonId classroomId')
      .lean();

    const completed = bookings.filter(isBookingLessonCompleted);
    const lessonIds = [...new Set(completed.map((b) => b.lessonId).filter(Boolean))];

    let lessonMap = {};
    if (lessonIds.length > 0) {
      const lessons = await Lesson.find({ _id: { $in: lessonIds } })
        .select('lessonNumber order curriculumId')
        .lean();
      const curIds = [...new Set(lessons.map((l) => l.curriculumId).filter(Boolean).map(String))];
      const curricula =
        curIds.length > 0
          ? await Curriculum.find({ _id: { $in: curIds } }).select('level').lean()
          : [];
      const curById = Object.fromEntries(curricula.map((c) => [String(c._id), c]));
      lessonMap = Object.fromEntries(
        lessons.map((l) => [String(l._id), { ...l, curriculum: curById[String(l.curriculumId)] }])
      );
    }

    const completedKeys = new Set();

    for (const b of completed) {
      let level = normalizeProgressLevel(b.studentLevel);
      let batch = null;
      let lessonNum = null;

      if (b.lessonId && lessonMap[String(b.lessonId)]) {
        const l = lessonMap[String(b.lessonId)];
        const cLvl = normalizeProgressLevel(l.curriculum && l.curriculum.level);
        if (cLvl) level = cLvl;
        const num = Number(l.lessonNumber || l.order || 0);
        if (num >= 1 && num <= 220) {
          batch = Math.ceil(num / 22);
          lessonNum = ((num - 1) % 22) + 1;
        }
      }

      if (batch == null || lessonNum == null) {
        const parsed = parseBatchLessonFromTitle(b.lesson);
        if (parsed) {
          batch = parsed.batch;
          lessonNum = parsed.lessonNum;
        }
      }

      if (!level) level = normalizeProgressLevel(b.studentLevel);
      if (!level) level = levelFromLessonTitle(b.lesson);
      if (!level || batch == null || lessonNum == null) continue;
      if (batch < 1 || batch > 10 || lessonNum < 1 || lessonNum > 22) continue;

      completedKeys.add(`${level}:${batch}:${lessonNum}`);
    }

    res.json({
      success: true,
      completedKeys: [...completedKeys],
      levels: require('./config/curriculumLevels').CURRICULUM_LEVELS,
      batchesPerLevel: 10,
      lessonsPerBatch: 22,
    });
  } catch (err) {
    console.error('GET /student/lesson-progress:', err);
    res.status(500).json({ error: 'Failed to load lesson progress' });
  }
});

// Get student notifications (last 31 days only)
router.get('/notifications', verifyToken, requireStudent, async (req, res) => {
  try {
    const studentUsername = req.user.username;
    const cutoff = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const notifications = await StudentNotification.find({
      studentId: studentUsername,
      createdAt: { $gte: cutoff },
    })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      notifications
    });
  } catch (err) {
    console.error('Error fetching student notifications:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Mark individual notification as read
router.patch('/notifications/:notificationId/mark-read', verifyToken, requireStudent, async (req, res) => {
  try {
    const { notificationId } = req.params;
    const studentUsername = req.user.username;
    
    const notification = await StudentNotification.findOneAndUpdate(
      { _id: notificationId, studentId: studentUsername },
      { read: true },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json({ success: true, notification });
  } catch (err) {
    console.error('Error marking notification as read:', err);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.patch('/notifications/mark-read', verifyToken, requireStudent, async (req, res) => {
  try {
    const studentUsername = req.user.username;
    
    const result = await StudentNotification.updateMany(
      { studentId: studentUsername, read: false },
      { read: true }
    );
    
    res.json({ 
      success: true, 
      message: `Marked ${result.modifiedCount} notifications as read` 
    });
  } catch (err) {
    console.error('Error marking all notifications as read:', err);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// Get student upcoming classes
router.get('/upcoming-classes', verifyToken, requireStudent, async (req, res) => {
  try {
    const studentUsername = req.user.username;
    const today = new Date().toISOString().split('T')[0];
    
    // Get upcoming classes for the student
    const upcomingClasses = await Booking.find({
      studentId: studentUsername,
      date: { $gte: today },
      status: { $in: ['booked', 'confirmed'] }
    })
    .populate('teacherId', 'firstName lastName email')
    .sort({ date: 1, time: 1 })
    .limit(5); // Limit to 5 upcoming classes
    
    const formattedClasses = upcomingClasses.map(booking => ({
      id: booking._id,
      date: booking.date,
      time: booking.time,
      teacherName: booking.teacherId?.firstName || booking.teacherId?.email || 'Unknown Teacher',
      lesson: booking.lesson,
      studentLevel: booking.studentLevel
    }));
    
    res.json({
      success: true,
      classes: formattedClasses
    });
  } catch (err) {
    console.error('Error fetching student upcoming classes:', err);
    res.status(500).json({ error: 'Failed to fetch upcoming classes' });
  }
});

// Update student settings (email, username, password)
router.post('/update-settings', verifyToken, requireStudent, async (req, res) => {
  try {
    console.log('🔍 Student settings update request received');
    console.log('🔍 Student ID:', req.user.studentId);
    console.log('🔍 Request body:', req.body);
    
    const { newEmail, newUsername, currentPassword, newPassword } = req.body;
    
    // Find the student
    const student = await Student.findById(req.user.studentId);
    if (!student) {
      console.log('❌ Student not found');
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Validate current password if changing password
    if (newPassword) {
      if (!currentPassword) {
        console.log('❌ Current password required for password change');
        return res.status(400).json({ error: 'Current password is required to change password' });
      }
      
      const bcrypt = require('bcrypt');
      const isPasswordValid = await bcrypt.compare(currentPassword, student.password);
      if (!isPasswordValid) {
        console.log('❌ Current password is incorrect');
        return res.status(400).json({ error: 'Current password is incorrect' });
      }
    }
    
    // Check if new email is already taken
    if (newEmail && newEmail !== student.email) {
      const existingStudent = await Student.findOne({ email: newEmail });
      if (existingStudent) {
        console.log('❌ Email already exists:', newEmail);
        return res.status(400).json({ error: 'Email address is already in use' });
      }
    }
    
    // Check if new username is already taken
    if (newUsername && newUsername !== student.username) {
      const existingStudent = await Student.findOne({ username: newUsername });
      if (existingStudent) {
        console.log('❌ Username already exists:', newUsername);
        return res.status(400).json({ error: 'Username is already in use' });
      }
    }
    
    // Update fields
    const updateData = {};
    
    if (newEmail) {
      updateData.email = newEmail;
      console.log('✅ Email will be updated to:', newEmail);
    }
    
    if (newUsername) {
      updateData.username = newUsername;
      console.log('✅ Username will be updated to:', newUsername);
    }
    
    if (newPassword) {
      const bcrypt = require('bcrypt');
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
      updateData.password = hashedPassword;
      console.log('✅ Password will be updated');
    }
    
    // Save updates
    if (Object.keys(updateData).length > 0) {
      Object.assign(student, updateData);
      await student.save();
      console.log('✅ Student settings updated successfully');
      
      res.json({
        success: true,
        message: 'Settings updated successfully',
        updatedFields: Object.keys(updateData)
      });
    } else {
      console.log('⚠️ No fields to update');
      res.status(400).json({ error: 'No fields to update' });
    }
    
  } catch (error) {
    console.error('❌ Error updating student settings:', error);
    res.status(500).json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Server error'
          : String(error && error.message ? error.message : 'Server error'),
    });
  }
});

const saveAssessmentValidators = [
  body('cefrLevel')
    .trim()
    .notEmpty()
    .withMessage('cefrLevel is required')
    .customSanitizer((v) => String(v || '').trim().toUpperCase())
    .isIn(['A1', 'A2', 'A3', 'B1', 'B2', 'C1', 'C2'])
    .withMessage('Invalid CEFR level'),
  body('score').toFloat().isFloat({ min: 0, max: 100 }).withMessage('score must be 0–100'),
  body('date').optional({ values: 'falsy' }).isISO8601().toDate(),
];

// Save assessment result
router.post('/save-assessment', verifyToken, requireStudent, saveAssessmentValidators, async (req, res) => {
  try {
    console.log('🎯 Assessment result submission received');
    console.log('🔍 Student ID:', req.user.studentId);
    console.log('🔍 Request body:', req.body);

    const val = validationResult(req);
    if (!val.isEmpty()) {
      return res.status(400).json({ error: 'Invalid assessment data', details: val.array() });
    }

    const { cefrLevel, score, date } = req.body;
    
    // Find and update student
    const student = await Student.findById(req.user.studentId);
    if (!student) {
      console.log('❌ Student not found');
      return res.status(404).json({ error: 'Student not found' });
    }
    
    // Update assessment data
    student.cefrLevel = cefrLevel;
    student.leveling = cefrLevel; // Save to leveling field for custom leveling system
    student.assessmentScore = score;
    student.assessmentDate = date ? new Date(date) : new Date();
    
    // Also update the legacy level field for backward compatibility
    if (cefrLevel === 'A1' || cefrLevel === 'A2' || cefrLevel === 'A3') {
      student.level = 'Beginner';
    } else if (cefrLevel === 'B1' || cefrLevel === 'B2') {
      student.level = 'Intermediate';
    } else if (cefrLevel === 'C1' || cefrLevel === 'C2') {
      student.level = 'Advanced';
    }
    
    await student.save();
    
    console.log('✅ Assessment result saved successfully:', {
      cefrLevel: student.cefrLevel,
      leveling: student.leveling,
      score: student.assessmentScore,
      date: student.assessmentDate
    });
    
    res.json({
      success: true,
      message: 'Assessment result saved successfully',
      assessment: {
        cefrLevel: student.cefrLevel,
        leveling: student.leveling,
        score: student.assessmentScore,
        date: student.assessmentDate
      }
    });
  } catch (error) {
    console.error('❌ Error saving assessment result:', error);
    res.status(500).json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Server error'
          : String(error && error.message ? error.message : 'Server error'),
    });
  }
});

// Subscribe to a plan (for landing page)
router.post('/subscribe', async (req, res) => {
  try {
    console.log('💳 Subscription request received:', req.body);
    
    const { email, plan, planPrice, assessmentData } = req.body;
    
    if (!email || !plan) {
      return res.status(400).json({ error: 'Email and plan are required' });
    }
    
    // Find student by email
    const student = await Student.findOne({ email });
    if (!student) {
      return res.status(404).json({ error: 'Student not found. Please register first.' });
    }
    
    // Calculate subscription dates
    const startDate = new Date();
    const endDate = new Date();
    
    switch(plan) {
      case '1month':
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case '3months':
        endDate.setMonth(endDate.getMonth() + 3);
        break;
      case '6months':
        endDate.setMonth(endDate.getMonth() + 6);
        break;
      case '1year':
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
      default:
        return res.status(400).json({ error: 'Invalid plan' });
    }
    
    // Update student subscription
    student.subscriptionPlan = plan;
    student.subscriptionStartDate = startDate;
    student.subscriptionEndDate = endDate;
    // Payment flow: subscription is pending until payment is confirmed
    student.subscriptionStatus = 'pending';
    student.paymentStatus = 'pending';
    student.paymentPaidAt = null;
    student.paymentMethod = null;
    student.paymentReference = '';
    student.paymentDetails = student.paymentDetails || {};

    // Create a short-lived checkout session id so we can confirm payment without requiring login.
    const sessionId = crypto.randomBytes(16).toString('hex');
    student.pendingCheckout = { sessionId, createdAt: new Date() };

    // If we have assessment contact number and student contact is empty, store it
    if (!student.contact && assessmentData && assessmentData.contactNumber) {
      student.contact = String(assessmentData.contactNumber);
    }
    
    await student.save();
    
    console.log('✅ Subscription saved successfully:', {
      email,
      plan,
      startDate,
      endDate
    });
    
    res.json({
      success: true,
      message: 'Subscription created. Payment required to activate.',
      subscription: {
        plan,
        startDate,
        endDate
      },
      checkout: {
        sessionId
      }
    });
  } catch (error) {
    console.error('❌ Error processing subscription:', error);
    res.status(500).json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Server error'
          : String(error && error.message ? error.message : 'Server error'),
    });
  }
});

// Get checkout session info (for payment page)
router.get('/checkout-session', async (req, res) => {
  try {
    const session = String(req.query.session || '').trim();
    if (!session) return res.status(400).json({ success: false, error: 'session is required' });

    const student = await Student.findOne({ 'pendingCheckout.sessionId': session }).lean();
    if (!student) return res.status(404).json({ success: false, error: 'Checkout session not found' });

    res.json({
      success: true,
      checkout: {
        sessionId: session,
        email: student.email || '',
        username: student.username || '',
        plan: student.subscriptionPlan || '',
        planPrice: null,
        paymentStatus: student.paymentStatus || 'unpaid',
        subscriptionStatus: student.subscriptionStatus || 'pending'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error:
        process.env.NODE_ENV === 'production'
          ? 'Server error'
          : String(error && error.message ? error.message : 'Server error'),
    });
  }
});

// Confirm payment for a checkout session (activates subscription + sends email)
router.post('/confirm-payment', async (req, res) => {
  try {
    const {
      sessionId,
      method,
      reference,
      bankName,
      accountName,
      gcashNumber,
      paypalEmail,
      planPrice
    } = req.body || {};

    const sid = String(sessionId || '').trim();
    if (!sid) return res.status(400).json({ success: false, error: 'sessionId is required' });

    const allowed = new Set(['bank', 'gcash', 'paypal']);
    const m = String(method || '').trim().toLowerCase();
    if (!allowed.has(m)) return res.status(400).json({ success: false, error: 'Invalid payment method' });

    const student = await Student.findOne({ 'pendingCheckout.sessionId': sid });
    if (!student) return res.status(404).json({ success: false, error: 'Checkout session not found' });

    // Mark paid + activate subscription
    student.paymentStatus = 'paid';
    student.paymentMethod = m;
    student.paymentReference = String(reference || '').trim();
    student.paymentPaidAt = new Date();
    student.subscriptionStatus = 'active';
    student.paymentDetails = {
      bankName: String(bankName || '').trim(),
      accountName: String(accountName || '').trim(),
      gcashNumber: encryptPiiString(String(gcashNumber || '').trim()),
      paypalEmail: String(paypalEmail || '').trim()
    };

    // Clear pending checkout so session can't be reused
    student.pendingCheckout = { sessionId: '', createdAt: null };

    // Award lesson credits based on plan
    const priceNumber = Number(planPrice || 0) || 0;
    let creditsToAdd = 0;
    let planLabel = student.subscriptionPlan || '';
    switch (student.subscriptionPlan) {
      case '1month':
        creditsToAdd = 20;
        break;
      case '3months':
        creditsToAdd = 60;
        break;
      case '6months':
        creditsToAdd = 120;
        break;
      case '1year':
        creditsToAdd = 240;
        break;
      default:
        creditsToAdd = 0;
    }
    if (creditsToAdd > 0) {
      const nowCredits = new Date();
      const levels = require('./config/curriculumLevels').CURRICULUM_LEVELS;
      const incDoc = {
        creditBalance: creditsToAdd,
        totalCreditsEarned: creditsToAdd,
        totalLessonsPurchased: creditsToAdd,
      };
      levels.forEach(function (k) {
        incDoc['learningJourneyPurchasedByLevel.' + k] = creditsToAdd;
      });
      await student.save();
      await Student.updateOne(
        { _id: student._id },
        {
          $inc: incDoc,
          $push: {
            creditTransactions: {
              date: nowCredits,
              type: 'purchase',
              plan: planLabel,
              description: `Subscription purchase (${planLabel})`,
              credits: creditsToAdd,
              balanceAfter: null,
              amountPaid: priceNumber,
            },
            creditHistory: {
              date: nowCredits,
              plan: planLabel,
              credits: creditsToAdd,
              amountPaid: priceNumber,
              paymentId: String(reference || '').trim() || '',
              entryType: 'purchase',
              balanceAfter: null,
            },
          },
        }
      );
    } else {
      await student.save();
    }

    // Send subscription confirmation email (best-effort)
    let emailStatus = { attempted: true, success: false, fallback: false };
    try {
      const emailService = require('./emailService');
      const r = await emailService.sendSubscriptionEmail(
        student.email,
        student.username || (student.email ? student.email.split('@')[0] : 'Student'),
        student.subscriptionPlan,
        Number(planPrice || 0) || 0
      );
      emailStatus = {
        attempted: true,
        success: !!r?.success,
        fallback: !!r?.fallback
      };
    } catch (e) {
      console.warn('Subscription email failed:', e.message);
      emailStatus = { attempted: true, success: false, fallback: false };
    }

    // Referral commission: credit only after paid
    try {
      const referralCode = student.referralCode;
      const ownerType = student.referredByOwnerType || (student.referredByTeacherId ? 'teacher' : null);
      const ownerId = student.referredByOwnerId || student.referredByTeacherId || null;
      if (referralCode && ownerType && ownerId) {
        let refOk = false;
        if (ownerType === 'teacher') {
          const teacher = await Teacher.findOne({ teacherId: ownerId, referralCode }).lean();
          refOk = !!teacher;
        } else if (ownerType === 'admin') {
          const admin = await require('./models/Admin').findOne({ username: ownerId, referralCode }).lean();
          refOk = !!admin;
        }

        if (refOk) {
          const studentName =
            [student.firstName, student.lastName].filter(Boolean).join(' ').trim() ||
            student.username ||
            '';
          const paid = Number(planPrice || 0) || 0;

          await Referral.updateOne(
            { ownerType, ownerId: String(ownerId), studentId: String(student._id) },
            {
              $setOnInsert: {
                referralCode,
                ownerType,
                ownerId: String(ownerId),
                teacherId: String(ownerId), // legacy mirror
                studentId: String(student._id),
                studentName,
                studentEmail: student.email || '',
                studentContact: encryptPiiString(student.contact || ''),
                subscriptionPlan: student.subscriptionPlan || '',
                amountPaid: paid,
                commissionAmount: 1000,
                status: 'successful'
              }
            },
            { upsert: true }
          );
        }
      }
    } catch (refErr) {
      console.warn('Referral commission tracking failed:', refErr.message);
    }

    res.json({
      success: true,
      message: 'Payment confirmed. Subscription activated.',
      email: emailStatus,
      next: 'student-login.html'
    });
  } catch (error) {
    console.error('❌ Error confirming payment:', error);
    res.status(500).json({
      success: false,
      error:
        process.env.NODE_ENV === 'production'
          ? 'Server error'
          : String(error && error.message ? error.message : 'Server error'),
    });
  }
});

// Get credit summary + history for logged-in student
router.get('/credits', verifyToken, requireStudent, async (req, res) => {
  try {
    let student = await Student.findById(req.user.studentId).lean();
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const healed = await reconcileStudentCreditBalanceIfDrifted(req.user.studentId, student);
    if (healed) {
      student = await Student.findById(req.user.studentId).lean();
    }

    const payload = buildStudentCreditApiResponse(student);
    res.json(payload);
  } catch (error) {
    console.error('❌ Error fetching student credits:', error);
    res.status(500).json({
      success: false,
      error:
        process.env.NODE_ENV === 'production'
          ? 'Server error'
          : String(error && error.message ? error.message : 'Server error'),
    });
  }
});

/** Learning journey batch unlocks from cumulative purchased lessons (per level tab). */
router.get('/unlocked-batches', verifyToken, requireStudent, async (req, res) => {
  try {
    const student = await Student.findById(req.user.studentId).lean();
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    const level = normalizeLevelKey(req.query.level);
    const totalForLevel = getTotalForLearningJourneyLevel(student, level);
    const { lessonsPerBatch, batches } = computeBatchUnlockState(totalForLevel, DEFAULT_MAX_BATCH);
    res.json({
      success: true,
      level,
      totalLessonsPurchased: totalForLevel,
      storedTotalLessonsPurchased: Math.max(0, Number(student.totalLessonsPurchased) || 0),
      effectiveGlobal: getEffectiveTotalLessonsPurchased(student),
      learningJourneyPurchasedByLevel: student.learningJourneyPurchasedByLevel || null,
      lessonsPerBatch,
      batches,
    });
  } catch (error) {
    console.error('❌ Error fetching unlocked-batches:', error);
    res.status(500).json({
      success: false,
      error:
        process.env.NODE_ENV === 'production'
          ? 'Server error'
          : String(error && error.message ? error.message : 'Server error'),
    });
  }
});

// Send subscription confirmation email
router.post('/send-subscription-email', async (req, res) => {
  try {
    console.log('📧 Subscription confirmation email request:', req.body);
    
    const { email, username, plan, planPrice } = req.body;
    
    if (!email || !plan) {
      return res.status(400).json({ error: 'Email and plan are required' });
    }
    
    const emailService = require('./emailService');
    const emailResult = await emailService.sendSubscriptionEmail(
      email,
      username || email.split('@')[0],
      plan,
      planPrice || 0
    );
    
    if (emailResult.success) {
      console.log('✅ Subscription confirmation email sent successfully');
      res.json({
        success: true,
        message: 'Subscription confirmation email sent successfully',
        messageId: emailResult.messageId
      });
    } else {
      console.warn('⚠️ Email sending failed (may not be configured):', emailResult.error);
      res.json({
        success: false,
        message: 'Email service not configured, but subscription is active',
        fallback: emailResult.fallback,
        error: emailResult.error
      });
    }
  } catch (error) {
    console.error('❌ Error sending subscription confirmation email:', error);
    res.status(500).json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Server error'
          : String(error && error.message ? error.message : 'Server error'),
    });
  }
});

// Send assessment result email
router.post('/send-assessment-email', async (req, res) => {
  try {
    console.log('📧 Assessment email request received:', req.body);
    
    const { email, childName, parentEmail, contactNumber, cefrLevel, score } = req.body;
    
    if (!parentEmail && !email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    
    if (!childName) {
      return res.status(400).json({ error: 'Child name is required' });
    }
    
    // Get assessment result from request or from student record
    let finalCefrLevel = cefrLevel;
    let finalScore = score;
    
    if (!finalCefrLevel || finalScore == null) {
      // Try to find student and get their assessment
      const student = await Student.findOne({ email: parentEmail || email });
      if (student) {
        finalCefrLevel = student.cefrLevel || student.leveling || 'Not assessed yet';
        finalScore = student.assessmentScore ?? 0;
      }
    }

    const toEmail = String(parentEmail || email || '')
      .trim()
      .toLowerCase();
    if (!toEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    await AssessmentTrial.deleteMany({
      parentEmail: toEmail,
      redeemedByStudentId: null,
    });
    const token = crypto.randomBytes(24).toString('hex');
    await AssessmentTrial.create({
      token,
      parentEmail: toEmail,
      childName: childName || '',
      contactNumber: String(contactNumber || '').trim(),
      cefrLevel: finalCefrLevel || '',
      score: Number(finalScore) || 0,
    });

    const base = (process.env.FRONTEND_URL || 'http://localhost:5000').replace(/\/$/, '');
    const registerUrl = `${base}/student-register.html?trial=${encodeURIComponent(token)}`;

    // Send email using email service
    const emailService = require('./emailService');
    const emailResult = await emailService.sendAssessmentEmail(
      toEmail,
      childName,
      finalCefrLevel || 'A1',
      finalScore || 0,
      registerUrl
    );
    
    if (emailResult.success) {
      console.log('✅ Assessment email sent successfully');
      res.json({
        success: true,
        message: 'Assessment results emailed successfully',
        trialToken: token,
      });
    } else {
      console.log('⚠️ Email not configured, but assessment data available');
      res.json({ 
        success: true, 
        message: 'Assessment data available. Email not configured.',
        fallback: true,
        assessment: { cefrLevel: finalCefrLevel, score: finalScore },
        trialToken: token,
      });
    }
  } catch (error) {
    console.error('❌ Error sending assessment email:', error);
    res.status(500).json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Server error'
          : String(error && error.message ? error.message : 'Server error'),
    });
  }
});

// Submit feedback for a class
router.post('/feedback/submit', verifyToken, requireStudent, async (req, res) => {
  try {
    console.log('📝 Feedback submission request received');
    console.log('🔍 Student ID:', req.user.studentId);
    console.log('🔍 Request body:', req.body);
    
    const { bookingId, teacherId, rating, comment } = req.body;
    const bookingIdStr = bookingId != null ? String(bookingId).trim() : '';
    const teacherIdStr = teacherId != null ? String(teacherId).trim() : '';
    const ratingNum = Number(rating);

    if (!bookingIdStr || !teacherIdStr || !Number.isFinite(ratingNum)) {
      console.log('❌ Missing required fields', { bookingIdStr, teacherIdStr, rating });
      return res.status(400).json({
        error:
          'Missing required fields: bookingId, teacherId, and a star rating (1–5). Select stars before submitting.',
      });
    }

    if (ratingNum < 1 || ratingNum > 5) {
      console.log('❌ Invalid rating:', rating);
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    
    // Check if student→teacher feedback already exists for this booking
    const existingFeedback = await Feedback.findOne({
      bookingId: bookingIdStr,
      studentId: req.user.studentId,
      feedbackRole: 'student_to_teacher',
    });
    if (existingFeedback) {
      console.log('❌ Feedback already submitted for this booking');
      return res.status(400).json({ error: 'Feedback already submitted for this class' });
    }
    
    // Get booking information for lesson date
    const booking = await Booking.findById(bookingIdStr);
    if (!booking) {
      console.log('❌ Booking not found:', bookingIdStr);
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    // Create new feedback
    const feedback = new Feedback({
      bookingId: bookingIdStr,
      teacherId: teacherIdStr,
      studentId: req.user.studentId,
      rating: ratingNum,
      comment: comment || '',
      lessonDate: new Date(booking.date),
      feedbackRole: 'student_to_teacher',
    });
    
    await feedback.save();
    
    // Save to StarReceived collection for teacher
    const StarReceived = require('./models/StarReceived');
    const starReceived = new StarReceived({
      recipientId: teacherIdStr,
      recipientType: 'teacher',
      giverId: req.user.studentId || req.user.username,
      giverType: 'student',
      bookingId: bookingIdStr,
      rating: ratingNum,
      feedbackId: feedback._id,
      lessonDate: new Date(booking.date + 'T' + booking.time + ':00')
    });
    await starReceived.save();
    console.log('⭐ Star saved to StarReceived collection for teacher:', teacherIdStr);
    
    console.log('✅ Feedback submitted successfully');
    console.log('📊 Feedback details:', {
      bookingId: bookingIdStr,
      teacherId: teacherIdStr,
      studentId: req.user.studentId,
      rating: ratingNum,
      commentLength: comment ? comment.length : 0
    });
    
    res.json({
      success: true,
      message: 'Feedback submitted successfully',
      feedback: {
        id: feedback._id,
        rating: ratingNum,
        comment: feedback.comment,
        submittedAt: feedback.submittedAt
      }
    });
    
  } catch (error) {
    console.error('❌ Error submitting feedback:', error);
    res.status(500).json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Server error'
          : String(error && error.message ? error.message : 'Server error'),
    });
  }
});

// Get feedback history for student
router.get('/feedback/history', verifyToken, requireStudent, async (req, res) => {
  try {
    console.log('📝 Fetching feedback history for student:', req.user.studentId);
    
    const feedbackHistory = await Feedback.find({ studentId: req.user.studentId })
      .sort({ submittedAt: -1 })
      .limit(20);
    
    console.log('✅ Found', feedbackHistory.length, 'feedback entries');
    
    res.json({
      success: true,
      feedback: feedbackHistory
    });
    
  } catch (error) {
    console.error('❌ Error fetching feedback history:', error);
    res.status(500).json({
      error:
        process.env.NODE_ENV === 'production'
          ? 'Server error'
          : String(error && error.message ? error.message : 'Server error'),
    });
  }
});

// Check class access status
router.get('/class-access/:bookingId', verifyToken, requireStudent, async (req, res) => {
  try {
    const { bookingId } = req.params;
    console.log('🔍 Checking class access for booking:', bookingId);
    
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      console.log('❌ Booking not found:', bookingId);
      return res.status(404).json({ 
        allowed: false, 
        message: 'Booking not found' 
      });
    }
    
    // Check if student is authorized for this booking
    if (booking.studentId !== req.user.studentId) {
      console.log('❌ Student not authorized for this booking');
      return res.status(403).json({ 
        allowed: false, 
        message: 'Not authorized for this class' 
      });
    }
    
    const now = new Date();
    const classDate = new Date(booking.date);
    const [hours, minutes] = booking.time.split(':').map(Number);
    
    // Set class start time
    const classStartTime = new Date(classDate);
    classStartTime.setHours(hours, minutes, 0, 0);
    
    // Set class end time (30 minutes after start)
    const classEndTime = new Date(classStartTime);
    classEndTime.setMinutes(classEndTime.getMinutes() + 30);
    
    // Allow access 10 minutes before class starts
    const accessStartTime = new Date(classStartTime);
    accessStartTime.setMinutes(accessStartTime.getMinutes() - 10);
    
    console.log('⏰ Class timing check:');
    console.log('  - Current time:', now.toISOString());
    console.log('  - Class start:', classStartTime.toISOString());
    console.log('  - Class end:', classEndTime.toISOString());
    console.log('  - Access start:', accessStartTime.toISOString());
    
    if (now < accessStartTime) {
      return res.json({
        allowed: false,
        message: `Class access not available yet. Class starts at ${booking.time}. Please wait until ${accessStartTime.toLocaleTimeString()}.`,
        classStartTime: classStartTime.toISOString(),
        accessStartTime: accessStartTime.toISOString()
      });
    }
    
    if (now > classEndTime) {
      return res.json({
        allowed: false,
        message: `Class has ended. Class ended at ${classEndTime.toLocaleTimeString()}.`,
        classEndTime: classEndTime.toISOString()
      });
    }
    
    console.log('✅ Class access allowed');
    res.json({
      allowed: true,
      message: 'Class access allowed',
      booking: {
        id: booking._id,
        date: booking.date,
        time: booking.time,
        teacherId: booking.teacherId,
        studentId: booking.studentId,
        status: booking.status
      },
      classStartTime: classStartTime.toISOString(),
      classEndTime: classEndTime.toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error checking class access:', error);
    res.status(500).json({ 
      allowed: false, 
      message: process.env.NODE_ENV === 'production' ? 'Server error' : String(error && error.message ? error.message : 'Server error')
    });
  }
});

// Mark student as absent
router.post('/booking/:bookingId/mark-absent', verifyToken, requireStudent, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body;
    const studentId = req.user.studentId;
    
    console.log('🚫 Marking student as absent:', { bookingId, studentId, reason });
    
    // Find the booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        error: 'Booking not found' 
      });
    }
    
    // Verify this booking belongs to the student
    if (booking.studentId !== req.user.username) {
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized to mark this booking as absent' 
      });
    }
    
    // Check if booking is already marked as absent or completed
    if (booking.status === 'absent' || booking.status === 'completed') {
      return res.status(400).json({ 
        success: false, 
        error: `Booking is already marked as ${booking.status}` 
      });
    }
    
    // Mark as absent
    booking.status = 'absent';
    booking.absentReason = reason || 'Student did not enter classroom within 15 minutes of class start';
    booking.absentMarkedAt = new Date();
    
    await booking.save();
    
    console.log('✅ Student marked as absent successfully');
    
    res.json({
      success: true,
      message: 'Student marked as absent',
      booking: {
        id: booking._id,
        status: booking.status,
        absentReason: booking.absentReason,
        absentMarkedAt: booking.absentMarkedAt
      }
    });
    
  } catch (error) {
    console.error('❌ Error marking student as absent:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to mark student as absent'
    });
  }
});

// Get student dashboard statistics
router.get('/dashboard-stats', verifyToken, requireStudent, async (req, res) => {
  try {
    const studentUsername = req.user.username;
    
    console.log('🔍 Dashboard stats request for student:', studentUsername);
    console.log('🔍 User object:', req.user);
    
    // Get all bookings for this student
    const allBookings = await Booking.find({ studentId: studentUsername });
    console.log('📚 Found bookings:', allBookings.length);
    
    // Get all feedback submitted by this student
    const Feedback = require('./models/Feedback');
    // Use the studentId from the token (MongoDB ObjectId) since that's what's stored in feedback
    const allFeedback = await Feedback.find({ studentId: req.user.studentId });
    console.log('⭐ Found feedback entries:', allFeedback.length);
    console.log('⭐ Feedback details:', allFeedback.map(f => ({ studentId: f.studentId, rating: f.rating, bookingId: f.bookingId })));
    
    // Also try searching by username as fallback
    const feedbackByUsername = await Feedback.find({ studentId: req.user.username });
    console.log('🔍 Alternative feedback search by username:', feedbackByUsername.length);
    
    // Use the feedback with the most results
    const finalFeedback = allFeedback.length > 0 ? allFeedback : feedbackByUsername;
    
    console.log('✅ Using feedback with most results:', finalFeedback.length, 'entries');
    
    // Calculate total classes booked
    const totalClasses = allBookings.length;
    
    // Calculate completed classes
    const completedClasses = allBookings.filter(booking => booking.status === 'completed').length;
    
    // Calculate cancellations
    const totalCancellations = allBookings.filter(booking => booking.status === 'cancelled').length;
    
    // Calculate total stars given (from feedback submissions)
    const totalStars = finalFeedback.reduce((sum, feedback) => sum + (feedback.rating || 0), 0);
    
    // Calculate average rating from feedback
    const averageRating = finalFeedback.length > 0 ? 
      Math.round((totalStars / finalFeedback.length) * 10) / 10 : 0;
    
    // Calculate upcoming classes
    const today = new Date().toISOString().split('T')[0];
    const upcomingClasses = allBookings.filter(booking => 
      booking.date >= today && 
      ['booked', 'confirmed'].includes(booking.status)
    ).length;
    
    // Calculate monthly changes (current month vs last month)
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    const currentMonthBookings = allBookings.filter(booking => 
      new Date(booking.date) >= currentMonth
    );
    const lastMonthBookings = allBookings.filter(booking => 
      new Date(booking.date) >= lastMonth && new Date(booking.date) < currentMonth
    );
    
    // Calculate percentage changes
    const classesChange = lastMonthBookings.length > 0 ? 
      Math.round(((currentMonthBookings.length - lastMonthBookings.length) / lastMonthBookings.length) * 100) : 0;
    
    const completedChange = lastMonthBookings.filter(b => b.status === 'completed').length > 0 ? 
      Math.round(((currentMonthBookings.filter(b => b.status === 'completed').length - lastMonthBookings.filter(b => b.status === 'completed').length) / lastMonthBookings.filter(b => b.status === 'completed').length) * 100) : 0;
    
    const cancellationsChange = lastMonthBookings.filter(b => b.status === 'cancelled').length > 0 ? 
      Math.round(((currentMonthBookings.filter(b => b.status === 'cancelled').length - lastMonthBookings.filter(b => b.status === 'cancelled').length) / lastMonthBookings.filter(b => b.status === 'cancelled').length) * 100) : 0;
    
    // Calculate stars change based on feedback submissions
    const currentMonthFeedback = finalFeedback.filter(feedback => 
      new Date(feedback.submittedAt) >= currentMonth
    );
    const lastMonthFeedback = finalFeedback.filter(feedback => 
      new Date(feedback.submittedAt) >= lastMonth && new Date(feedback.submittedAt) < currentMonth
    );
    
    const currentMonthStars = currentMonthFeedback.reduce((sum, f) => sum + (f.rating || 0), 0);
    const lastMonthStars = lastMonthFeedback.reduce((sum, f) => sum + (f.rating || 0), 0);
    
    const starsChange = lastMonthStars > 0 ? 
      Math.round(((currentMonthStars - lastMonthStars) / lastMonthStars) * 100) : 0;
    
    const responseData = {
      totalClasses,
      completedClasses,
      totalCancellations,
      totalStars,
      averageRating,
      upcomingClasses,
      classesChange,
      completedChange,
      cancellationsChange,
      starsChange
    };
    
    console.log('📊 Student Dashboard Stats:', responseData);
    console.log('⭐ Feedback Data:', {
      totalFeedback: allFeedback.length,
      feedbackRatings: allFeedback.map(f => f.rating),
      totalStars,
      averageRating
    });
    
    res.json(responseData);
    
  } catch (error) {
    console.error('Error fetching student dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// ===== RESCHEDULE FUNCTIONALITY ENDPOINTS =====

// GET reschedule issues for student
router.get('/reschedule-issues', verifyToken, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.studentId;
    
    const IssueReport = require('./models/IssueReport');
    const issues = await IssueReport.find({
      studentId: studentId,
      canReschedule: true,
      rescheduleRequested: { $ne: true },
      rescheduleDeadline: { $gt: new Date() }
    })
    .populate('teacherId', 'firstName lastName')
    .populate('studentId', 'firstName lastName')
    .sort({ rescheduleDeadline: 1 });
    
    // Get booking details for each issue
    const issuesWithBookings = await Promise.all(issues.map(async (issue) => {
      const booking = await Booking.findById(issue.bookingId);
      return {
        ...issue.toObject(),
        teacherName: `${issue.teacherId.firstName} ${issue.teacherId.lastName}`,
        booking: booking
      };
    }));
    
    res.json({
      success: true,
      issues: issuesWithBookings
    });
  } catch (error) {
    console.error('Error fetching reschedule issues:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reschedule issues'
    });
  }
});

// GET issue details for reschedule
router.get('/issues/:issueId', verifyToken, requireStudent, async (req, res) => {
  try {
    const { issueId } = req.params;
    const studentId = req.user.studentId;
    
    const IssueReport = require('./models/IssueReport');
    const issue = await IssueReport.findById(issueId)
      .populate('teacherId', 'firstName lastName')
      .populate('studentId', 'firstName lastName');
    
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found'
      });
    }
    
    // Verify the issue belongs to this student
    if (issue.studentId._id.toString() !== studentId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Get booking details
    const booking = await Booking.findById(issue.bookingId);
    
    res.json({
      success: true,
      issue: {
        ...issue.toObject(),
        booking: booking
      }
    });
  } catch (error) {
    console.error('Error fetching issue details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching issue details'
    });
  }
});

// POST reschedule class
router.post('/reschedule-class', verifyToken, requireStudent, async (req, res) => {
  try {
    const { issueId, bookingId, newDate, newTime, reason } = req.body;
    const studentId = req.user.studentId;
    
    if (!issueId || !bookingId || !newDate || !newTime) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    const IssueReport = require('./models/IssueReport');
    const issue = await IssueReport.findById(issueId);
    
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found'
      });
    }
    
    // Verify the issue belongs to this student and can be rescheduled
    if (issue.studentId.toString() !== studentId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    if (!issue.canReschedule) {
      return res.status(400).json({
        success: false,
        message: 'This issue does not allow rescheduling'
      });
    }
    
    // Check if deadline has passed
    if (new Date() > new Date(issue.rescheduleDeadline)) {
      return res.status(400).json({
        success: false,
        message: 'Reschedule deadline has expired'
      });
    }
    
    // Get the original booking
    const originalBooking = await Booking.findById(bookingId);
    if (!originalBooking) {
      return res.status(404).json({
        success: false,
        message: 'Original booking not found'
      });
    }
    
    // Create new booking with new date/time
    const newBooking = new Booking({
      studentId: originalBooking.studentId,
      teacherId: originalBooking.teacherId,
      date: newDate,
      time: newTime,
      level: originalBooking.level,
      lesson: originalBooking.lesson,
      status: 'confirmed',
      originalBookingId: bookingId, // Reference to original booking
      rescheduleReason: reason
    });
    
    await newBooking.save();
    
    // Update the original booking status
    originalBooking.status = 'cancelled';
    originalBooking.cancellationReason = 'Rescheduled due to teacher technical issues';
    await originalBooking.save();
    
    // Update issue to mark reschedule as requested
    issue.rescheduleRequested = true;
    issue.rescheduleRequestedAt = new Date();
    issue.status = 'resolved';
    await issue.save();
    
    // Create notification for teacher
    const notificationMessage = `Your class has been rescheduled by the student due to technical issues. New date: ${newDate} at ${newTime}`;
    await createStudentNotification(originalBooking.teacherId, 'reschedule', notificationMessage);
    
    res.json({
      success: true,
      message: 'Class rescheduled successfully',
      newBooking: newBooking
    });
  } catch (error) {
    console.error('Error rescheduling class:', error);
    res.status(500).json({
      success: false,
      message: 'Error rescheduling class'
    });
  }
});

// POST decline reschedule
router.post('/decline-reschedule', verifyToken, requireStudent, async (req, res) => {
  try {
    const { issueId } = req.body;
    const studentId = req.user.studentId;
    
    const IssueReport = require('./models/IssueReport');
    const issue = await IssueReport.findById(issueId);
    
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found'
      });
    }
    
    // Verify the issue belongs to this student
    if (issue.studentId.toString() !== studentId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }
    
    // Update issue to mark reschedule as declined
    issue.rescheduleRequested = false;
    issue.canReschedule = false;
    issue.status = 'resolved';
    await issue.save();
    
    // Get the original booking and mark it as completed
    const originalBooking = await Booking.findById(issue.bookingId);
    if (originalBooking) {
      originalBooking.status = 'completed';
      originalBooking.finishedAt = new Date();
      await originalBooking.save();
    }
    
    res.json({
      success: true,
      message: 'Reschedule declined successfully'
    });
  } catch (error) {
    console.error('Error declining reschedule:', error);
    res.status(500).json({
      success: false,
      message: 'Error declining reschedule'
    });
  }
});

function studentPeerCanonicalId(req) {
  return String(req.user.username || '').trim() || String(req.user.studentId || '').trim();
}

/** Inbox: only peers with at least one message (same aggregation as teacher portal). */
router.get('/peer-chats', verifyToken, requireStudent, async (req, res) => {
  try {
    const me = studentPeerCanonicalId(req);
    if (!me) return res.status(400).json({ success: false, error: 'Missing user identity' });

    const rows = await aggregateActiveChats(me);
    const peerIds = rows.map((r) => r.peerId);

    const teachers = await Teacher.find({ teacherId: { $in: peerIds } })
      .select('teacherId fullname firstName lastName profilePicture')
      .lean();
    const teacherMap = new Map(teachers.map((t) => [t.teacherId, t]));

    const chats = rows.map((c) => {
      const t = teacherMap.get(c.peerId);
      const name =
        t?.fullname || `${t?.firstName || ''} ${t?.lastName || ''}`.trim() || c.peerId;
      return {
        peerId: c.peerId,
        name,
        profilePicture: t?.profilePicture || null,
        lastMessage: c.lastMessage,
        lastAt: c.lastAt,
        unreadCount: c.unreadCount,
      };
    });

    res.json({ success: true, chats });
  } catch (err) {
    console.error('student peer-chats:', err);
    res.status(500).json({ success: false, error: 'Failed to load chats' });
  }
});

/** Contact search disabled — students cannot start DMs with teachers. */
router.get('/peer-chats/user-search', verifyToken, requireStudent, async (req, res) => {
  res.json({ success: true, users: [] });
});

router.get('/peer-messages/:peerId', verifyToken, requireStudent, async (req, res) => {
  try {
    const me = studentPeerCanonicalId(req);
    if (!me) return res.status(400).json({ success: false, error: 'Missing user identity' });
    const peerId = String(req.params.peerId || '');
    if (!peerId) return res.status(400).json({ success: false, error: 'Missing peerId' });

    const { messages, hasMore, nextBefore } = await fetchPeerMessagesPage({
      me,
      peerId,
      before: req.query.before || null,
      limit: req.query.limit,
    });

    await PeerMessage.updateMany(
      { senderId: peerId, recipientId: me, readAt: null },
      { $set: { readAt: new Date() } }
    );

    res.json({ success: true, messages, hasMore, nextBefore });
  } catch (err) {
    console.error('student peer-messages:', err);
    res.status(500).json({ success: false, error: 'Failed to load messages' });
  }
});

router.post('/peer-message', verifyToken, requireStudent, async (req, res) => {
  return res.status(403).json({
    success: false,
    error: 'Direct messaging between teachers and students is disabled.',
  });
});

/** Library videos uploaded by admins — watchable in live classroom (student token). */
router.get('/portal-videos', verifyToken, requireStudent, async (req, res) => {
  try {
    const list = await PortalVideo.find({ active: true }).sort({ createdAt: -1 }).lean();
    res.json({
      success: true,
      videos: list.map((v) => ({
        id: String(v._id),
        title: v.title,
        description: v.description || '',
        url: v.relativeUrl,
        mimeType: v.mimeType || 'video/mp4',
        createdAt: v.createdAt,
      })),
    });
  } catch (err) {
    console.error('portal-videos list:', err);
    res.status(500).json({ success: false, message: 'Failed to load videos' });
  }
});

module.exports = router; 