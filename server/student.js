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
const LessonProgress = require('./models/LessonProgress');
const {
  resolveLessonIdFromBooking,
  parseBookingLessonRef,
} = require('./lessonResolveFromBooking');
const { verifyToken, requireStudent } = require('./authMiddleware');
const studentController = require('./studentController');

/** Public teacher label for students — prefers nickname over legal name. */
const { publicTeacherLabel } = require('./utils/publicTeacherLabel');

/** Shape teacher fields for student UIs that still concatenate firstName/lastName. */
function studentFacingTeacherFields(teacher) {
  if (!teacher) return null;
  const label = publicTeacherLabel(teacher);
  const nick = teacher.nickname && String(teacher.nickname).trim();
  return {
    _id: teacher._id,
    teacherId: teacher.teacherId,
    username: teacher.username,
    nickname: nick || '',
    displayName: label,
    name: label,
    // Put the public label in firstName so legacy `${firstName} ${lastName}` UIs stay private
    firstName: label,
    lastName: '',
    photo: teacher.photo,
    intro: teacher.intro,
    profilePicture: teacher.profilePicture,
    email: teacher.email,
  };
}
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
  getClassroomEntryGate,
  EARLY_ENTRY_MINUTES,
} = require('./services/classroomEntryWindow');
const {
  processImage,
  extractImageBufferFromDataUrl,
  safeUnlinkPublicUpload,
} = require('./utils/imageOptimizer');
const { saveUpload, normalizeUploadReference } = require('./services/uploadStore');
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
async function createStudentNotification(studentId, type, message, extra = {}) {
  try {
    const { notifyStudent } = require('./services/notifyService');
    return await notifyStudent(studentId, type, message, extra);
  } catch (error) {
    console.error('❌ Error creating student notification:', error);
    return null;
  }
}

// Test route to verify student routes are working
router.get('/test', (req, res) => {
  res.json({ message: 'Student routes are working!' });
});

// Book a class (student portal). Same handler as POST /api/teacher/book-class.
router.post('/book-class', verifyToken, requireStudent, studentController.bookSlot);

// Test route to verify cancel-booking route exists
router.get('/test-cancel-route', (req, res) => {
  res.json({ message: 'Cancel booking route is registered!', route: '/api/student/cancel-booking' });
});

// Dev-only: create sample notifications
router.post('/create-test-notifications', verifyToken, requireStudent, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  try {
    const studentUsername = req.user.username;
    const sampleNotifications = [
      { type: 'booking', message: 'Your class has been confirmed for tomorrow at 9:00 AM with Teacher Sarah' },
      { type: 'reminder', message: "Don't forget your class today at 3:00 PM with Teacher John" },
      { type: 'announcement', message: 'New lesson materials are available for your upcoming class' },
      { type: 'booking', message: 'Your class request for Friday has been approved' },
    ];
    for (const notification of sampleNotifications) {
      await createStudentNotification(studentUsername, notification.type, notification.message);
    }
    res.json({ success: true, message: 'Test notifications created' });
  } catch (error) {
    console.error('Error creating test notifications:', error);
    res.status(500).json({ success: false, message: 'Failed to create test notifications' });
  }
});

// Get student profile
router.get('/profile', verifyToken, requireStudent, async (req, res) => {
  try {
    console.log('🔍 Profile fetch request for student ID:', req.user.studentId);
    console.log('🔍 User from token:', req.user);

    const cached = await studentController.getStudentProfileFromCache(req.user.studentId);
    if (cached) {
      const cachedEnd = cached.profile && cached.profile.subscriptionEndDate;
      const cacheExpired = cachedEnd && new Date(cachedEnd).getTime() <= Date.now();
      if (!cacheExpired) {
        scheduleTrialBookingReminderSideEffect(req.user.studentId);
        return res.json(cached);
      }
      await studentController.invalidateStudentProfileCache(req.user.studentId);
    }

    let student = await Student.findById(req.user.studentId);
    
    if (!student) {
      console.log('❌ Student not found with ID:', req.user.studentId);
      return res.status(404).json({ error: 'Student not found' });
    }

    const { applyExpiredCreditsIfNeeded, buildExpiryPayload } = require('./services/creditExpiry');
    const expiryApplied = await applyExpiredCreditsIfNeeded(student._id, student.toObject());
    if (expiryApplied.applied) {
      student = await Student.findById(req.user.studentId);
    }
    const creditExpiry = buildExpiryPayload(student);

    console.log('✅ Student found:', {
      id: student._id,
      username: student.username,
      email: student.email,
      firstName: student.firstName,
      lastName: student.lastName
    });

    const {
      resolveStudentCurriculumLevel,
      formatCurriculumLevelDisplay,
      DEFAULT_CURRICULUM_LEVEL,
    } = require('./config/curriculumLevels');
    const curriculumLevel =
      resolveStudentCurriculumLevel(student) || DEFAULT_CURRICULUM_LEVEL;

    const { studentClassroomLabel } = require('./utils/studentDisplayName');

    const body = {
      profile: {
        username: student.username,
        firstName: student.firstName,
        middleName: student.middleName,
        lastName: student.lastName,
        nickname: student.nickname || '',
        /** What the live classroom shows: nickname, or a stable "Student####". */
        classroomDisplayName: studentClassroomLabel(student),
        gender: student.gender,
        birthday: student.birthday,
        age: (() => {
          const { ageFromBirthday } = require('./utils/ageFromBirthday');
          const computed = ageFromBirthday(student.birthday);
          return computed != null ? computed : student.age;
        })(),
        contact: student.contact,
        email: student.email,
        address: student.address,
        language: student.language,
        hobbies: student.hobbies,
        parentName: student.parentName,
        parentContact: student.parentContact,
        parentEmail: student.parentEmail || '',
        emergencyContact: student.emergencyContact,
        emergencyContactPerson: student.emergencyContactPerson || '',
        emergencyContactNumber: student.emergencyContactNumber || '',
        aboutMe: student.aboutMe,
        profilePicture: student.profilePicture,
        education: student.education,
        documents: student.documents,
        cefrLevel: student.cefrLevel,
        leveling: student.leveling,
        level: student.level,
        curriculumLevel,
        curriculumLevelDisplay:
          formatCurriculumLevelDisplay(curriculumLevel, { fallbackDefault: true }) ||
          'Level 1 - Little Seeds',
        assessmentScore: student.assessmentScore,
        assessmentDate: student.assessmentDate,
        accountStatus: student.accountStatus || 'standard',
        trialCompletedAt: student.trialCompletedAt || null,
        subscriptionStatus: student.subscriptionStatus || 'pending',
        paymentStatus: student.paymentStatus || 'unpaid',
        hasFreeTrial: student.hasFreeTrial === true,
        assessmentTrialCreditActive: student.assessmentTrialCreditActive === true,
        hasSeenWelcomeTour: student.hasSeenWelcomeTour === true,
        isSubscribed:
          student.isSubscribed === true ||
          (student.paymentStatus === 'paid' && student.subscriptionStatus === 'active'),
        subscriptionEndDate: student.subscriptionEndDate || null,
        creditsExpireAt: creditExpiry.creditsExpireAt,
        daysUntilExpiry: creditExpiry.daysUntilExpiry,
        expiryCountdownLabel: creditExpiry.expiryCountdownLabel,
        creditsExpireOnLabel: creditExpiry.creditsExpireOnLabel || null,
        creditsExpired: creditExpiry.creditsExpired,
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
      nickname,
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
      parentEmail,
      emergencyContact,
      emergencyContactPerson,
      emergencyContactNumber,
      aboutMe,
      education
    } = req.body;

    const person = String(emergencyContactPerson || '').trim();
    const number = String(emergencyContactNumber || '').trim();
    const legacyEmergency = String(emergencyContact || '').trim();
    const combinedEmergency =
      person || number
        ? [person, number].filter(Boolean).join(' · ')
        : legacyEmergency;

    const { ageFromBirthday } = require('./utils/ageFromBirthday');
    const computedAge = ageFromBirthday(birthday);

    const updateData = {
      firstName: firstName || '',
      middleName: middleName || '',
      lastName: lastName || '',
      gender: gender || '',
      birthday: birthday || null,
      age: computedAge != null ? computedAge : (age != null && age !== '' ? Number(age) : null),
      // Raw updates skip Mongoose setters — encrypt here when PII_ENCRYPTION_KEY is set
      contact: encryptPiiString(contact || ''),
      email: email || req.user.username, // Use username as fallback for email
      address: address || '',
      language: language || '',
      hobbies: hobbies || '',
      parentName: parentName || '',
      parentContact: encryptPiiString(parentContact || ''),
      parentEmail: String(parentEmail || '').trim(),
      emergencyContact: encryptPiiString(combinedEmergency || ''),
      emergencyContactPerson: person,
      emergencyContactNumber: encryptPiiString(number),
      aboutMe: aboutMe || '',
      education: education || []
    };

    // Only touch the class nickname when the caller actually sent it
    if (Object.prototype.hasOwnProperty.call(req.body, 'nickname')) {
      updateData.nickname = String(nickname || '').trim().slice(0, 40);
    }

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
        const sid = String(req.user.studentId).replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = `${sid}-${Date.now()}.webp`;
        updateField.profilePicture = await saveUpload(`student-profiles/${filename}`, optimized, 'image/webp');
      } else {
        const t = normalizeUploadReference(String(fileData).trim());
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

    try {
      const { notifyAdmin, notifyStudent } = require('./services/notifyService');
      await notifyAdmin(
        'cancellation-request',
        `Student ${req.user.username} requested cancellation for ${booking.date} at ${booking.time}. Reason: ${reason}`,
        {
          bookingId: String(bookingId),
          actionUrl: '/admin-cancellations.html',
          importance: 'actionable',
          meta: { studentId: req.user.username, teacherId: booking.teacherId },
        }
      );
      await notifyStudent(
        req.user.username,
        'cancellation-request',
        `Your cancellation request for ${booking.date} at ${booking.time} was submitted and is pending admin review.`,
        {
          bookingId: String(bookingId),
          actionUrl: '/student-dashboard.html',
          importance: 'actionable',
        }
      );
    } catch (nErr) {
      console.warn('Student cancel-request notify failed:', nErr.message);
    }

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

    try {
      const { notifyTeacher, notifyStudent } = require('./services/notifyService');
      await notifyTeacher(
        booking.teacherId,
        'cancel',
        `Student ${studentUsername} emergency-cancelled the class on ${booking.date} at ${booking.time}. Reason: ${reasonText}.`,
        { bookingId: String(booking._id), actionUrl: '/teacher-class-table.html' }
      );
      await notifyStudent(
        studentUsername,
        'cancel',
        `Your emergency cancellation for ${booking.date} at ${booking.time} was recorded. Credit retained.`,
        { bookingId: String(booking._id), actionUrl: '/student-dashboard.html' }
      );
    } catch (notifErr) {
      console.warn('Emergency cancel notify failed:', notifErr.message);
    }

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
    teacherQuery = teacherQuery.select('teacherId username firstName lastName nickname');
  } else {
    teacherQuery = teacherQuery.select(
      'teacherId username firstName lastName nickname photo intro profilePicture'
    );
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

    const teacherPayload = studentFacingTeacherFields(teacher);

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
      { lightTeacher: true, skipFeedback: false }
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

function isBookingLessonCompleted(b) {
  const st = String(b.status || '').toLowerCase();
  if (st === 'cancelled' || st === 'canceled' || st.indexOf('cancelled') === 0 || st === 'absent') {
    return false;
  }
  if (st === 'completed' || st === 'pending_feedback') return true;
  if (b.attendance && b.attendance.classCompleted) return true;
  if (b.sessionEndedAt || b.finishedAt) return true;
  return false;
}

/**
 * All non-cancelled bookings + LessonProgress records → completed lesson keys
 * for the progress sidebar / learning journey.
 * (4 levels × 10 batches × 22 lessons). Keys: "Little Seeds:1:1" … "Young Stewards:10:22"
 * (legacy age-labeled keys still accepted via normalizeCurriculumLevel).
 */
router.get('/lesson-progress', verifyToken, requireStudent, async (req, res) => {
  try {
    let uniqueIdentifiers = collectStudentIdentifiers(req);
    if (uniqueIdentifiers.length === 0) {
      return res.status(400).json({ error: 'Student identifier missing' });
    }
    try {
      const studentBadgeService = require('./services/studentBadgeService');
      const extra = await studentBadgeService.resolveStudentIdAliases(uniqueIdentifiers[0]);
      if (extra && extra.length) {
        uniqueIdentifiers = [...new Set(uniqueIdentifiers.concat(extra))];
      }
    } catch (aliasErr) {
      console.warn('lesson-progress aliases:', aliasErr && aliasErr.message);
    }

    const { cancelledStatusValues } = require('./utils/bookingStatus');
    const { resolveStudentCurriculumLevel } = require('./config/curriculumLevels');
    const bookings = await Booking.find({
      studentId: { $in: uniqueIdentifiers },
      status: { $nin: cancelledStatusValues() },
    })
      .select('lesson studentLevel status attendance lessonId classroomId finishedAt sessionEndedAt')
      .lean();

    const completed = bookings.filter(isBookingLessonCompleted);
    const lessonProgressDocs = await LessonProgress.find({
      studentId: { $in: uniqueIdentifiers },
      status: 'completed',
    })
      .select('lessonId curriculumId completedAt status')
      .lean();

    async function hydrateLessonMap(ids) {
      const uniqueIds = [...new Set(ids.filter(Boolean).map(String))];
      if (!uniqueIds.length) return {};
      const lessons = await Lesson.find({ _id: { $in: uniqueIds } })
        .select('lessonNumber order curriculumId')
        .lean();
      const curIds = [...new Set(lessons.map((l) => l.curriculumId).filter(Boolean).map(String))];
      const curricula =
        curIds.length > 0
          ? await Curriculum.find({ _id: { $in: curIds } }).select('level').lean()
          : [];
      const curById = Object.fromEntries(curricula.map((c) => [String(c._id), c]));
      return Object.fromEntries(
        lessons.map((l) => [String(l._id), { ...l, curriculum: curById[String(l.curriculumId)] }])
      );
    }

    let lessonMap = await hydrateLessonMap([
      ...completed.map((b) => b.lessonId),
      ...lessonProgressDocs.map((p) => p.lessonId),
    ]);

    const completedKeys = new Set();

    function addKeyFromLessonId(lessonId, fallbackLevel) {
      if (!lessonId || !lessonMap[String(lessonId)]) return false;
      const l = lessonMap[String(lessonId)];
      let level = normalizeProgressLevel(l.curriculum && l.curriculum.level) || fallbackLevel;
      const num = Number(l.lessonNumber || l.order || 0);
      if (!level || !(num >= 1 && num <= 220)) return false;
      const batch = Math.ceil(num / 22);
      const lessonNum = ((num - 1) % 22) + 1;
      if (batch < 1 || batch > 10 || lessonNum < 1 || lessonNum > 22) return false;
      completedKeys.add(`${level}:${batch}:${lessonNum}`);
      return true;
    }

    const unresolved = [];
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
        const parsed = parseBookingLessonRef(b.lesson);
        if (parsed && parsed.batch != null && parsed.lessonNum != null) {
          batch = parsed.batch;
          lessonNum = parsed.lessonNum;
          if (!level && parsed.level) level = parsed.level;
        }
      }

      if (!level) {
        const parsed = parseBookingLessonRef(b.lesson);
        if (parsed && parsed.level) level = parsed.level;
      }
      if (!level) level = normalizeProgressLevel(b.studentLevel);
      if (!level || batch == null || lessonNum == null) {
        unresolved.push(b);
        continue;
      }
      if (batch < 1 || batch > 10 || lessonNum < 1 || lessonNum > 22) {
        unresolved.push(b);
        continue;
      }

      completedKeys.add(`${level}:${batch}:${lessonNum}`);
    }

    if (unresolved.length) {
      const extraIds = [];
      const resolvedPairs = [];
      for (const b of unresolved) {
        try {
          const lid = await resolveLessonIdFromBooking(b);
          if (lid) {
            extraIds.push(lid);
            resolvedPairs.push({ booking: b, lessonId: lid });
          }
        } catch (resolveErr) {
          console.warn('lesson-progress resolveLessonId:', resolveErr && resolveErr.message);
        }
      }
      if (extraIds.length) {
        const extraMap = await hydrateLessonMap(extraIds);
        lessonMap = { ...lessonMap, ...extraMap };
        for (const pair of resolvedPairs) {
          addKeyFromLessonId(pair.lessonId, normalizeProgressLevel(pair.booking.studentLevel));
        }
      }
    }

    // Merge LessonProgress model completions (written on class finish / finalize)
    for (const p of lessonProgressDocs) {
      addKeyFromLessonId(p.lessonId, null);
    }

    const inProgressCount = await LessonProgress.countDocuments({
      studentId: { $in: uniqueIdentifiers },
      status: 'in_progress',
    });

    const profileLevel = resolveStudentCurriculumLevel(req.student) || null;

    res.json({
      success: true,
      completedKeys: [...completedKeys],
      completedCount: completedKeys.size,
      inProgressCount,
      profileLevel,
      levels: require('./config/curriculumLevels').CURRICULUM_LEVELS,
      batchesPerLevel: 10,
      lessonsPerBatch: 22,
      lessonsPerLevel: 220,
    });
  } catch (err) {
    console.error('GET /student/lesson-progress:', err);
    res.status(500).json({ error: 'Failed to load lesson progress' });
  }
});

/**
 * Lesson title/description for learning-journey node detail.
 * Query: level + lessonNumber (1–220), or level + batch + lesson (1–22).
 */
router.get('/journey-lesson', verifyToken, requireStudent, async (req, res) => {
  try {
    const {
      CANONICAL_TO_LEGACY,
    } = require('./config/curriculumLevels');
    const level = normalizeLevelKey(req.query.level);
    let lessonNumber = parseInt(String(req.query.lessonNumber || ''), 10);
    if (!Number.isFinite(lessonNumber) || lessonNumber < 1) {
      const batch = parseInt(String(req.query.batch || ''), 10);
      const lesson = parseInt(String(req.query.lesson || ''), 10);
      if (
        Number.isFinite(batch) &&
        batch >= 1 &&
        batch <= 10 &&
        Number.isFinite(lesson) &&
        lesson >= 1 &&
        lesson <= 22
      ) {
        lessonNumber = (batch - 1) * 22 + lesson;
      }
    }
    if (!level || !Number.isFinite(lessonNumber) || lessonNumber < 1 || lessonNumber > 220) {
      return res.status(400).json({
        success: false,
        error: 'Valid level and lessonNumber (1–220) or batch+lesson are required',
      });
    }

    const legacy = CANONICAL_TO_LEGACY[level];
    const levelMatchers = [{ level }, { level: 'all' }];
    if (legacy) levelMatchers.push({ level: legacy });

    const curricula = await Curriculum.find({
      isActive: { $ne: false },
      $or: levelMatchers,
    })
      .select('_id title level')
      .lean();

    if (!curricula.length) {
      return res.status(404).json({ success: false, error: 'No curriculum for this level' });
    }

    const curIds = curricula.map((c) => c._id);
    const lessonDoc = await Lesson.findOne({
      curriculumId: { $in: curIds },
      lessonNumber,
      isActive: { $ne: false },
    })
      .select('_id title description lessonNumber estimatedDuration curriculumId')
      .lean();

    const batch = Math.ceil(lessonNumber / 22);
    const lessonInBatch = ((lessonNumber - 1) % 22) + 1;
    const cur =
      lessonDoc &&
      curricula.find((c) => String(c._id) === String(lessonDoc.curriculumId));

    res.json({
      success: true,
      level,
      lessonNumber,
      batch,
      lesson: lessonInBatch,
      lessonId: lessonDoc ? String(lessonDoc._id) : null,
      title: lessonDoc
        ? lessonDoc.title
        : `Lesson ${lessonNumber}`,
      description: lessonDoc ? lessonDoc.description || '' : '',
      estimatedDuration: lessonDoc ? lessonDoc.estimatedDuration || 30 : 30,
      curriculumTitle: cur ? cur.title : null,
      found: !!lessonDoc,
    });
  } catch (error) {
    console.error('GET /student/journey-lesson:', error);
    res.status(500).json({
      success: false,
      error:
        process.env.NODE_ENV === 'production'
          ? 'Server error'
          : String(error && error.message ? error.message : 'Server error'),
    });
  }
});

// Get student notifications (last 31 days only)
router.get('/notifications', verifyToken, requireStudent, async (req, res) => {
  try {
    const {
      resolveStudentNotificationKeys,
      enrichNotificationList,
      countActionableUnread,
      RETENTION_DAYS,
      mergePrefs,
      DEFAULT_PREFS,
    } = require('./services/notifyService');
    const studentKeys = await resolveStudentNotificationKeys(req.user);
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const raw = studentKeys.length
      ? await StudentNotification.find({
          studentId: { $in: studentKeys },
          createdAt: { $gte: cutoff },
        })
          .sort({ createdAt: -1 })
          .limit(50)
          .lean()
      : [];
    const notifications = enrichNotificationList(raw);
    const unreadCount = notifications.filter((n) => !n.read).length;
    const actionableUnreadCount = countActionableUnread(notifications);
    let prefs = DEFAULT_PREFS;
    try {
      const me = await Student.findById(req.user.studentId).select('notificationPrefs').lean();
      prefs = mergePrefs(me && me.notificationPrefs);
    } catch (_e) { /* ignore */ }

    res.json({
      success: true,
      notifications,
      unreadCount,
      actionableUnreadCount,
      retentionDays: RETENTION_DAYS,
      prefs,
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
    const { resolveStudentNotificationKeys } = require('./services/notifyService');
    const studentKeys = await resolveStudentNotificationKeys(req.user);

    const notification = await StudentNotification.findOneAndUpdate(
      { _id: notificationId, studentId: { $in: studentKeys } },
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
    const { resolveStudentNotificationKeys } = require('./services/notifyService');
    const studentKeys = await resolveStudentNotificationKeys(req.user);

    const result = await StudentNotification.updateMany(
      { studentId: { $in: studentKeys }, read: false },
      { read: true }
    );

    res.json({
      success: true,
      message: `Marked ${result.modifiedCount} notifications as read`,
    });
  } catch (err) {
    console.error('Error marking all notifications as read:', err);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// Dismiss / delete a student notification
router.delete('/notifications/:notificationId', verifyToken, requireStudent, async (req, res) => {
  try {
    const { resolveStudentNotificationKeys } = require('./services/notifyService');
    const studentKeys = await resolveStudentNotificationKeys(req.user);
    const result = await StudentNotification.deleteOne({
      _id: req.params.notificationId,
      studentId: { $in: studentKeys },
    });
    if (!result.deletedCount) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting student notification:', err);
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Notification preferences
router.get('/notification-prefs', verifyToken, requireStudent, async (req, res) => {
  try {
    const { mergePrefs, DEFAULT_PREFS } = require('./services/notifyService');
    const me = await Student.findById(req.user.studentId).select('notificationPrefs').lean();
    res.json({ success: true, prefs: mergePrefs(me && me.notificationPrefs) || DEFAULT_PREFS });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load preferences' });
  }
});

router.patch('/notification-prefs', verifyToken, requireStudent, async (req, res) => {
  try {
    const { mergePrefs } = require('./services/notifyService');
    const allowed = [
      'reminders',
      'announcements',
      'credits',
      'digestEmail',
      'quietHoursEnabled',
      'quietHoursStart',
      'quietHoursEnd',
    ];
    const patch = {};
    for (const key of allowed) {
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) {
        patch[`notificationPrefs.${key}`] = req.body[key];
      }
    }
    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: 'No preference fields provided' });
    }
    const me = await Student.findByIdAndUpdate(req.user.studentId, { $set: patch }, { new: true })
      .select('notificationPrefs')
      .lean();
    res.json({ success: true, prefs: mergePrefs(me && me.notificationPrefs) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Snooze a class reminder (once → re-fire after N minutes)
router.post('/notifications/:notificationId/snooze', verifyToken, requireStudent, async (req, res) => {
  try {
    const { resolveStudentNotificationKeys } = require('./services/notifyService');
    const studentKeys = await resolveStudentNotificationKeys(req.user);
    const minutes = Math.min(30, Math.max(5, Number(req.body && req.body.minutes) || 5));
    const notif = await StudentNotification.findOne({
      _id: req.params.notificationId,
      studentId: { $in: studentKeys },
      type: 'reminder',
    });
    if (!notif) return res.status(404).json({ error: 'Reminder notification not found' });
    if (!notif.bookingId) return res.status(400).json({ error: 'No booking linked' });

    const until = new Date(Date.now() + minutes * 60 * 1000);
    await Booking.updateOne(
      { _id: notif.bookingId },
      { $set: { classReminderSentAt: null, reminderSnoozeUntil: until } }
    );
    notif.read = true;
    notif.meta = { ...(notif.meta && typeof notif.meta === 'object' ? notif.meta : {}), snoozedUntil: until };
    await notif.save();
    res.json({ success: true, snoozeUntil: until, minutes });
  } catch (err) {
    console.error('Snooze reminder failed:', err);
    res.status(500).json({ error: 'Failed to snooze reminder' });
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
    .populate('teacherId', 'firstName lastName nickname email')
    .sort({ date: 1, time: 1 })
    .limit(5); // Limit to 5 upcoming classes
    
    const formattedClasses = upcomingClasses.map(booking => ({
      id: booking._id,
      date: booking.date,
      time: booking.time,
      teacherName: publicTeacherLabel(booking.teacherId, booking.teacherId?.email || 'Unknown Teacher'),
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
    
    // Update assessment data (CEFR stays on cefrLevel — do not overwrite RemoEdKids curriculum `level`)
    student.cefrLevel = cefrLevel;
    student.assessmentScore = score;
    student.assessmentDate = date ? new Date(date) : new Date();

    const { normalizeCurriculumLevel, DEFAULT_CURRICULUM_LEVEL } = require('./config/curriculumLevels');
    // Keep RemoEdKids track on `level` (Little Seeds / Sprouts / …). Migrate legacy ESL labels once.
    if (!normalizeCurriculumLevel(student.level)) {
      const fromEducation =
        Array.isArray(student.education) &&
        student.education.map((e) => e && e.level).find((l) => normalizeCurriculumLevel(l));
      student.level = normalizeCurriculumLevel(fromEducation) || DEFAULT_CURRICULUM_LEVEL;
    }
    
    await student.save();
    
    console.log('✅ Assessment result saved successfully:', {
      cefrLevel: student.cefrLevel,
      level: student.level,
      score: student.assessmentScore,
      date: student.assessmentDate
    });
    
    res.json({
      success: true,
      message: 'Assessment result saved successfully',
      assessment: {
        cefrLevel: student.cefrLevel,
        leveling: student.leveling,
        level: student.level,
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

/**
 * Legacy manual payment flow retired (student-payment.html + pendingCheckout).
 * Credits are applied only via PayMongo webhooks and verified confirm-checkout.
 */
const LEGACY_PAYMENT_GONE = {
  success: false,
  error:
    'Manual payment confirmation has been retired. Purchase credits via PayMongo on the Credits page.',
  next: '/student-credits.html',
};

router.post('/subscribe', (req, res) => {
  res.status(410).json({
    ...LEGACY_PAYMENT_GONE,
    error:
      'Legacy subscribe flow retired. Use PayMongo checkout via /api/payments/create-link (Credits page).',
  });
});

router.get('/checkout-session', (req, res) => {
  res.status(410).json(LEGACY_PAYMENT_GONE);
});

router.post('/confirm-payment', (req, res) => {
  res.status(410).json(LEGACY_PAYMENT_GONE);
});

// Get credit summary + history for logged-in student
router.get('/credits', verifyToken, requireStudent, async (req, res) => {
  try {
    let student = await Student.findById(req.user.studentId).lean();
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const { applyExpiredCreditsIfNeeded } = require('./services/creditExpiry');
    const expiryApplied = await applyExpiredCreditsIfNeeded(req.user.studentId, student);
    if (expiryApplied.applied) {
      student = await Student.findById(req.user.studentId).lean();
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
    const ratingNum = Number(rating);

    function normalizeTeacherId(raw) {
      if (raw == null) return '';
      if (typeof raw === 'object') {
        return String(raw.teacherId || raw._id || raw.id || raw.username || raw.email || '').trim();
      }
      const s = String(raw).trim();
      if (!s || s === '[object Object]') return '';
      return s;
    }

    if (!bookingIdStr || !Number.isFinite(ratingNum)) {
      console.log('❌ Missing required fields', { bookingIdStr, rating });
      return res.status(400).json({
        error:
          'Missing required fields: bookingId and a star rating (1–5). Select stars before submitting.',
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
    
    // Get booking information for lesson date + authoritative teacherId
    const booking = await Booking.findById(bookingIdStr);
    if (!booking) {
      console.log('❌ Booking not found:', bookingIdStr);
      return res.status(404).json({ error: 'Booking not found' });
    }

    const teacherIdStr =
      normalizeTeacherId(booking.teacherId) || normalizeTeacherId(teacherId);
    if (!teacherIdStr) {
      return res.status(400).json({
        error: 'Could not resolve teacher for this booking. Please refresh and try again.',
      });
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

    try {
      const { rebuildMonth, currentMonthKey } = require('./services/leaderboardService');
      rebuildMonth(currentMonthKey()).catch(() => {});
    } catch (_lbErr) {
      /* non-blocking */
    }
    
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

// Check class access status (same gate as live classroom / teacher entry)
router.get('/class-access/:bookingId', verifyToken, requireStudent, async (req, res) => {
  try {
    const { bookingId } = req.params;
    console.log('🔍 Checking class access for booking:', bookingId);

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      console.log('❌ Booking not found:', bookingId);
      return res.status(404).json({
        allowed: false,
        message: 'Booking not found',
      });
    }

    // Check if student is authorized for this booking
    if (booking.studentId !== req.user.studentId) {
      console.log('❌ Student not authorized for this booking');
      return res.status(403).json({
        allowed: false,
        message: 'Not authorized for this class',
      });
    }

    const gate = getClassroomEntryGate(booking, Date.now());
    if (!gate.allowed) {
      return res.json({
        allowed: false,
        code: gate.code || null,
        message: gate.message || 'Classroom entry is not allowed.',
        opensAt: gate.opensAt || null,
        scheduledStart: gate.scheduledStart || null,
        accessStartTime: gate.opensAt || null,
        classStartTime: gate.scheduledStart || null,
        earlyEntryMinutes: EARLY_ENTRY_MINUTES,
      });
    }

    console.log('✅ Class access allowed');
    res.json({
      allowed: true,
      message: 'Class access allowed',
      code: null,
      opensAt: gate.opensAt || null,
      scheduledStart: gate.scheduledStart || null,
      accessStartTime: gate.opensAt || null,
      classStartTime: gate.scheduledStart || null,
      earlyEntryMinutes: EARLY_ENTRY_MINUTES,
      booking: {
        id: booking._id,
        date: booking.date,
        time: booking.time,
        teacherId: booking.teacherId,
        studentId: booking.studentId,
        status: booking.status,
      },
    });
  } catch (error) {
    console.error('❌ Error checking class access:', error);
    res.status(500).json({
      allowed: false,
      message:
        process.env.NODE_ENV === 'production'
          ? 'Server error'
          : String(error && error.message ? error.message : 'Server error'),
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
    const studentMongoId = req.user.studentId != null ? String(req.user.studentId) : '';
    
    console.log('🔍 Dashboard stats request for student:', studentUsername);
    
    const studentIdCandidates = [...new Set([studentUsername, studentMongoId].filter(Boolean))];

    // Bookings store studentId as username/email (sometimes mongo id in older rows)
    const allBookings = await Booking.find({
      studentId: { $in: studentIdCandidates },
    });
    console.log('📚 Found bookings:', allBookings.length);
    
    const Feedback = require('./models/Feedback');
    // Stars given = student → teacher feedback only
    const givenFeedback = await Feedback.find({
      feedbackRole: 'student_to_teacher',
      studentId: { $in: studentIdCandidates },
    });
    
    function isCompletedBooking(booking) {
      const st = String(booking.status || '').toLowerCase();
      return (
        st === 'completed' ||
        st === 'pending_feedback' ||
        !!(booking.attendance && booking.attendance.classCompleted) ||
        !!booking.sessionEndedAt ||
        !!booking.finishedAt
      );
    }

    function isCancelledBooking(booking) {
      const st = String(booking.status || '').toLowerCase();
      return st === 'cancelled' || st === 'canceled' || st.indexOf('cancelled') === 0;
    }

    function isUpcomingBooking(booking, today) {
      const st = String(booking.status || '').toLowerCase();
      if (isCompletedBooking(booking) || isCancelledBooking(booking) || st === 'absent') return false;
      return booking.date >= today && ['booked', 'confirmed', 'pending'].includes(st);
    }

    const totalClasses = allBookings.length;
    const completedClasses = allBookings.filter(isCompletedBooking).length;
    const totalCancellations = allBookings.filter(isCancelledBooking).length;
    
    const totalStars = givenFeedback.reduce((sum, feedback) => sum + (Number(feedback.rating) || 0), 0);
    const averageRating =
      givenFeedback.length > 0
        ? Math.round((totalStars / givenFeedback.length) * 10) / 10
        : 0;
    
    const today = new Date().toISOString().split('T')[0];
    const upcomingClasses = allBookings.filter((booking) => isUpcomingBooking(booking, today)).length;
    
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    const currentMonthBookings = allBookings.filter(
      (booking) => booking.date && new Date(booking.date + 'T12:00:00') >= currentMonth
    );
    const lastMonthBookings = allBookings.filter((booking) => {
      if (!booking.date) return false;
      const d = new Date(booking.date + 'T12:00:00');
      return d >= lastMonth && d < currentMonth;
    });
    
    const classesChange =
      lastMonthBookings.length > 0
        ? Math.round(
            ((currentMonthBookings.length - lastMonthBookings.length) / lastMonthBookings.length) * 100
          )
        : 0;
    
    const lastCompleted = lastMonthBookings.filter(isCompletedBooking).length;
    const completedChange =
      lastCompleted > 0
        ? Math.round(
            ((currentMonthBookings.filter(isCompletedBooking).length - lastCompleted) / lastCompleted) *
              100
          )
        : 0;
    
    const lastCancelled = lastMonthBookings.filter(isCancelledBooking).length;
    const cancellationsChange =
      lastCancelled > 0
        ? Math.round(
            ((currentMonthBookings.filter(isCancelledBooking).length - lastCancelled) / lastCancelled) *
              100
          )
        : 0;
    
    const currentMonthFeedback = givenFeedback.filter(
      (feedback) => feedback.submittedAt && new Date(feedback.submittedAt) >= currentMonth
    );
    const lastMonthFeedback = givenFeedback.filter((feedback) => {
      if (!feedback.submittedAt) return false;
      const d = new Date(feedback.submittedAt);
      return d >= lastMonth && d < currentMonth;
    });
    
    const currentMonthStars = currentMonthFeedback.reduce((sum, f) => sum + (Number(f.rating) || 0), 0);
    const lastMonthStars = lastMonthFeedback.reduce((sum, f) => sum + (Number(f.rating) || 0), 0);
    
    const starsChange =
      lastMonthStars > 0
        ? Math.round(((currentMonthStars - lastMonthStars) / lastMonthStars) * 100)
        : 0;
    
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
      starsChange,
    };
    
    console.log('📊 Student Dashboard Stats:', responseData);
    res.json(responseData);
    
  } catch (error) {
    console.error('Error fetching student dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// ===== RESCHEDULE FUNCTIONALITY ENDPOINTS =====

async function studentOwnsIssueReport(issue, user) {
  if (!issue) return false;
  const { resolveStudentNotificationKeys, resolveStudentUsername } = require('./services/notifyService');
  const keys = await resolveStudentNotificationKeys(user);
  const sid = String(issue.studentId || '').trim();
  if (keys.includes(sid)) return true;
  // Issue may store Mongo id while keys have username (or vice versa).
  const resolved = await resolveStudentUsername(sid);
  return !!(resolved && keys.includes(String(resolved)));
}

// GET reschedule issues for student
router.get('/reschedule-issues', verifyToken, requireStudent, async (req, res) => {
  try {
    const { resolveStudentNotificationKeys } = require('./services/notifyService');
    const studentKeys = await resolveStudentNotificationKeys(req.user);

    const IssueReport = require('./models/IssueReport');
    const issues = await IssueReport.find({
      studentId: { $in: studentKeys },
      canReschedule: true,
      rescheduleRequested: { $ne: true },
      rescheduleDeadline: { $gt: new Date() },
    }).sort({ rescheduleDeadline: 1 });

    // Get booking details for each issue
    const issuesWithBookings = await Promise.all(
      issues.map(async (issue) => {
        const booking = await Booking.findById(issue.bookingId);
        const obj = issue.toObject();
        const teacherPublic = studentFacingTeacherFields(obj.teacherId);
        return {
          ...obj,
          teacherId: teacherPublic,
          teacher: teacherPublic,
          teacherName: publicTeacherLabel(obj.teacherId),
          booking: booking,
        };
      })
    );

    res.json({
      success: true,
      issues: issuesWithBookings,
    });
  } catch (error) {
    console.error('Error fetching reschedule issues:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching reschedule issues',
    });
  }
});

// GET issue details for reschedule
router.get('/issues/:issueId', verifyToken, requireStudent, async (req, res) => {
  try {
    const { issueId } = req.params;

    const IssueReport = require('./models/IssueReport');
    const issue = await IssueReport.findById(issueId);

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found',
      });
    }

    if (!(await studentOwnsIssueReport(issue, req.user))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Get booking details
    const booking = await Booking.findById(issue.bookingId);
    const obj = issue.toObject();
    const teacherPublic = studentFacingTeacherFields(obj.teacherId);

    res.json({
      success: true,
      issue: {
        ...obj,
        teacherId: teacherPublic,
        teacher: teacherPublic,
        teacherName: publicTeacherLabel(obj.teacherId),
        booking: booking,
      },
    });
  } catch (error) {
    console.error('Error fetching issue details:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching issue details',
    });
  }
});

// POST reschedule class
router.post('/reschedule-class', verifyToken, requireStudent, async (req, res) => {
  try {
    const { issueId, bookingId, newDate, newTime, reason } = req.body;

    if (!issueId || !bookingId || !newDate || !newTime) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
      });
    }

    const IssueReport = require('./models/IssueReport');
    const issue = await IssueReport.findById(issueId);

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found',
      });
    }

    if (!(await studentOwnsIssueReport(issue, req.user))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
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
    
    // Notify teacher (correct collection) + confirm to student
    const notificationMessage = `Your class has been rescheduled by the student due to technical issues. New date: ${newDate} at ${newTime}`;
    try {
      const { notifyTeacher } = require('./services/notifyService');
      await notifyTeacher(originalBooking.teacherId, 'reschedule', notificationMessage, {
        bookingId: String(newBooking._id),
        actionUrl: '/teacher-class-table.html',
      });
      await createStudentNotification(
        originalBooking.studentId,
        'schedule-change',
        `Your class was rescheduled to ${newDate} at ${newTime}.`,
        { bookingId: String(newBooking._id), actionUrl: '/student-dashboard.html', importance: 'actionable' }
      );
    } catch (notifErr) {
      console.warn('Reschedule notify failed:', notifErr.message);
    }
    
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

    const IssueReport = require('./models/IssueReport');
    const issue = await IssueReport.findById(issueId);

    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found',
      });
    }

    if (!(await studentOwnsIssueReport(issue, req.user))) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
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
      try {
        const { notifyTeacher, notifyStudent } = require('./services/notifyService');
        await notifyTeacher(
          originalBooking.teacherId,
          'reschedule-declined',
          `Student declined reschedule for class on ${originalBooking.date} at ${originalBooking.time}.`,
          { bookingId: String(originalBooking._id), actionUrl: '/teacher-class-table.html' }
        );
        await notifyStudent(
          originalBooking.studentId,
          'reschedule-declined',
          `You declined the reschedule offer for ${originalBooking.date} at ${originalBooking.time}.`,
          { bookingId: String(originalBooking._id), actionUrl: '/student-dashboard.html' }
        );
      } catch (nErr) {
        console.warn('Decline-reschedule notify failed:', nErr.message);
      }
    }

    res.json({
      success: true,
      message: 'Reschedule declined successfully',
    });
  } catch (error) {
    console.error('Error declining reschedule:', error);
    res.status(500).json({
      success: false,
      message: 'Error declining reschedule',
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
      .select('teacherId fullname firstName lastName nickname profilePicture')
      .lean();
    const teacherMap = new Map(teachers.map((t) => [t.teacherId, t]));

    const chats = rows.map((c) => {
      const t = teacherMap.get(c.peerId);
      const name = publicTeacherLabel(t, c.peerId);
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

// ——— RemoEdKids growth badges & quarterly progress ———
const studentBadgeService = require('./services/studentBadgeService');
const ProgressReport = require('./models/ProgressReport');

router.get('/badges', verifyToken, requireStudent, async (req, res) => {
  try {
    const studentId = req.user.studentId || req.user.username;
    const cabinet = await studentBadgeService.getStudentBadgeCabinet(studentId);
    res.json({ success: true, ...cabinet });
  } catch (error) {
    console.error('GET /api/student/badges:', error);
    res.status(500).json({ success: false, error: 'Failed to load badges' });
  }
});

router.get('/progress-reports', verifyToken, requireStudent, async (req, res) => {
  try {
    const studentId = String(req.user.studentId || req.user.username || '');
    const aliases = await studentBadgeService.resolveStudentIdAliases(studentId);
    const rows = await ProgressReport.find(
      aliases.length ? { studentId: { $in: aliases } } : { studentId }
    )
      .sort({ year: -1, quarter: -1 })
      .lean();
    res.json({
      success: true,
      reports: rows.map((r) => ({
        id: String(r._id),
        studentId: r.studentId,
        quarter: r.quarter,
        year: r.year,
        skillsAssessment: r.skillsAssessment,
        teacherSummary: r.teacherSummary,
        attendanceRate: r.attendanceRate,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
    });
  } catch (error) {
    console.error('GET /api/student/progress-reports:', error);
    res.status(500).json({ success: false, error: 'Failed to load progress reports' });
  }
});

router.get('/progress-reports/:year/:quarter', verifyToken, requireStudent, async (req, res) => {
  try {
    const studentId = String(req.user.studentId || req.user.username || '');
    const year = Number(req.params.year);
    const quarter = String(req.params.quarter || '').toUpperCase();
    if (!['Q1', 'Q2', 'Q3', 'Q4'].includes(quarter) || !Number.isFinite(year)) {
      return res.status(400).json({ success: false, error: 'Invalid year or quarter' });
    }

    const aliases = await studentBadgeService.resolveStudentIdAliases(studentId);
    const report = await ProgressReport.findOne({
      studentId: { $in: aliases.length ? aliases : [studentId] },
      year,
      quarter,
    }).lean();
    const badges = await studentBadgeService.getBadgesInQuarter(studentId, year, quarter);
    const student = await studentBadgeService.findStudentByAnyId(studentId);

    const displayName =
      (student &&
        [student.firstName, student.lastName].filter(Boolean).join(' ').trim()) ||
      (student && student.username) ||
      'Student';

    res.json({
      success: true,
      report: report
        ? {
            id: String(report._id),
            studentId: report.studentId,
            quarter: report.quarter,
            year: report.year,
            skillsAssessment: report.skillsAssessment,
            teacherSummary: report.teacherSummary,
            attendanceRate: report.attendanceRate,
            createdAt: report.createdAt,
            updatedAt: report.updatedAt,
          }
        : null,
      badges,
      student: {
        id: studentId,
        displayName,
        profilePicture: (student && (student.profilePicture || student.photo)) || null,
      },
      periodLabel: `${quarter} ${year}`,
    });
  } catch (error) {
    console.error('GET /api/student/progress-reports/:year/:quarter:', error);
    res.status(500).json({ success: false, error: 'Failed to load progress report' });
  }
});

module.exports = router; 