const express = require('express');
const mongoose = require('mongoose');
const Student = require('./models/Student');
const Booking = require('./models/Booking');
const CancellationRequest = require('./models/CancellationRequest');
const Feedback = require('./models/Feedback');
const StudentNotification = require('./models/StudentNotification');
const AssessmentTrial = require('./models/AssessmentTrial');
const Teacher = require('./models/Teacher');
const Referral = require('./models/Referral');
const PortalVideo = require('./models/PortalVideo');
const { verifyToken, requireStudent } = require('./authMiddleware');
const {
  buildStudentCreditApiResponse,
  reconcileStudentCreditBalanceIfDrifted,
} = require('./services/studentCreditSummary');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { encryptPiiString } = require('./utils/piiCrypto');

const router = express.Router();

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

async function releaseReservedCreditForBooking(booking) {
  if (!booking || booking.creditConsumedAt || booking.creditReservationReleasedAt) return;
  if (!booking || !booking.studentId) return;
  const student = await Student.findOne({
    $or: [{ username: booking.studentId }, { email: booking.studentId }]
  });
  if (!student) return;

  const safeReserved = Number(student.reservedCredits || 0);
  if (safeReserved <= 0) return;
  const safeTotal = Number(student.totalCredits || 0);
  const nextReserved = safeReserved - 1;
  const nextAvailable = Math.max(safeTotal - nextReserved, 0);

  await Student.updateOne(
    { _id: student._id },
    {
      $set: {
        reservedCredits: nextReserved,
        creditBalance: nextAvailable
      }
    }
  );
  booking.creditReservationReleasedAt = new Date();
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

    res.json({
      profile: {
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
    });

    setImmediate(async () => {
      try {
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
  } catch (error) {
    console.error('❌ Error fetching student profile:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Mark welcome tour completed (first-login onboarding)
router.post('/welcome-tour/dismiss', verifyToken, requireStudent, async (req, res) => {
  try {
    await Student.updateOne({ _id: req.user.studentId }, { $set: { hasSeenWelcomeTour: true } });
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
    res.json({ message: 'Profile updated successfully', student });
  } catch (error) {
    console.error('Error updating student profile:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
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
    
    // Handle different document types
    if (documentType === 'profilePicture') {
      updateField.profilePicture = fileData;
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

    res.json({ message: 'Document uploaded successfully' });
  } catch (error) {
    console.error('Error uploading student document:', error);
    res.status(500).json({ error: 'Server error' });
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
    
    // Check if class has already started
    const classDateTime = new Date(`${booking.date}T${booking.time}:00`);
    const now = new Date();
    
    if (classDateTime <= now) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot cancel a class that has already started' 
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

// Direct cancellation endpoint for students (no admin approval needed)
// Route: POST /api/student/cancel-booking
router.post('/cancel-booking', verifyToken, requireStudent, async (req, res) => {
  console.log('📞 [SERVER] /api/student/cancel-booking endpoint called');
  console.log('📞 [SERVER] Request body:', req.body);
  console.log('📞 [SERVER] Student username:', req.user?.username);
  try {
    const { bookingId } = req.body;
    const studentUsername = req.user.username;
    
    if (!bookingId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Booking ID is required' 
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
    
    if (booking.studentId !== studentUsername) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied. This booking does not belong to you.' 
      });
    }
    
    // Check if booking is already cancelled
    if (booking.status === 'cancelled') {
      return res.status(400).json({ 
        success: false, 
        error: 'This booking is already cancelled' 
      });
    }
    
    // Check if class has already started or completed
    const classDateTime = new Date(`${booking.date}T${booking.time}:00`);
    const now = new Date();
    
    if (classDateTime <= now) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot cancel a class that has already started or completed' 
      });
    }
    
    // Update booking status to cancelled
    booking.status = 'cancelled';
    booking.cancellationTime = new Date();
    booking.cancellationReason = {
      reason: 'Cancelled by student',
      rejected: false
    };

    await releaseReservedCreditForBooking(booking);
    
    await booking.save();
    
    console.log(`✅ [STUDENT] Booking ${bookingId} cancelled by student ${studentUsername}`);
    
    res.json({
      success: true,
      message: 'Booking cancelled successfully',
      booking
    });
  } catch (err) {
    console.error('❌ Error cancelling booking:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to cancel booking' 
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

// Get student bookings for a week
router.get('/bookings', verifyToken, requireStudent, async (req, res) => {
  try {
    const { week } = req.query;
    const studentIdentifiers = [];
    if (req.student && req.student.username) {
      studentIdentifiers.push(req.student.username);
    }
    if (req.student && req.student.email) {
      studentIdentifiers.push(req.student.email);
    }
    if (req.user && req.user.username) {
      studentIdentifiers.push(req.user.username);
    }
    const uniqueIdentifiers = [...new Set(studentIdentifiers)];

    if (uniqueIdentifiers.length === 0) {
      console.log('❌ No student identifiers available for bookings query', { user: req.user });
      return res.status(400).json({ error: 'Student identifier missing' });
    }

    const studentIdentifierForLog = uniqueIdentifiers[0];
    
    if (!week) {
      return res.status(400).json({ error: 'Missing week parameter' });
    }

    // Parse week start date (Monday)
    const start = new Date(week + 'T00:00:00');
    // Calculate end date (next Monday, exclusive) - this ensures we include all 7 days (Mon-Sun)
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    // Format end date as YYYY-MM-DD (use local date to avoid timezone issues)
    const endDateString = end.getFullYear() + '-' + 
                         String(end.getMonth() + 1).padStart(2, '0') + '-' + 
                         String(end.getDate()).padStart(2, '0');

    console.log(`🔍 Looking for bookings for student identifiers: ${uniqueIdentifiers.join(', ')} in week: ${week}`);
    console.log(`🔍 Date range: ${week} to ${endDateString} (exclusive)`);
    console.log(`🔍 Student from req.student:`, req.student ? { username: req.student.username, email: req.student.email, _id: req.student._id } : 'null');
    console.log(`🔍 User from token:`, req.user ? { username: req.user.username, studentId: req.user.studentId } : 'null');

    const bookings = await Booking.find({
      studentId: { $in: uniqueIdentifiers },
      date: { $gte: week, $lt: endDateString },
      status: { $ne: 'cancelled' }
    });
    
    console.log(`🔍 Raw bookings query result count: ${bookings.length}`);
    if (bookings.length > 0) {
      console.log(`🔍 Sample booking studentId: ${bookings[0].studentId}, date: ${bookings[0].date}, time: ${bookings[0].time}`);
    }

    // Get teacher information + teacher→student feedback per booking
    const bookingsWithTeacherInfo = await Promise.all(
      bookings.map(async (booking) => {
        const bookingObj = booking.toObject();
        const logicalTeacherId = bookingObj.teacherId;

        const Teacher = require('./models/Teacher');
        const teacher = await Teacher.findOne({ teacherId: logicalTeacherId });

        const bookingIdStr = String(bookingObj._id);
        // Teacher→student feedback uses student username/email on the document, not Mongo _id
        // (student→teacher feedback uses studentId = ObjectId and would wrongly match if included).
        const teacherFeedbackDoc = await Feedback.findOne({
          bookingId: bookingIdStr,
          teacherId: logicalTeacherId,
          studentId: { $in: uniqueIdentifiers },
        }).lean();

        let teacherFeedback = null;
        if (teacherFeedbackDoc) {
          teacherFeedback = {
            rating: teacherFeedbackDoc.rating,
            comment: teacherFeedbackDoc.comment || '',
            submittedAt: teacherFeedbackDoc.submittedAt,
          };
        }

        return {
          ...bookingObj,
          teacherLogicalId: logicalTeacherId,
          teacherFeedback,
          teacherId: teacher
            ? {
                _id: teacher._id,
                teacherId: teacher.teacherId,
                username: teacher.username,
                firstName: teacher.firstName,
                lastName: teacher.lastName,
                photo: teacher.photo,
                intro: teacher.intro,
              }
            : null,
        };
      })
    );

    console.log(`✅ Found ${bookingsWithTeacherInfo.length} bookings for student ${studentIdentifierForLog} in week ${week}`);
    console.log('🔍 Bookings found:', bookingsWithTeacherInfo.map(b => ({
      id: b._id,
      date: b.date,
      time: b.time,
      studentId: b.studentId,
      teacherId: b.teacherId
    })));
    
    res.json({ bookings: bookingsWithTeacherInfo });
  } catch (err) {
    console.error('❌ Error fetching student bookings:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get student notifications
router.get('/notifications', verifyToken, requireStudent, async (req, res) => {
  try {
    const studentUsername = req.user.username;
    
    // Get notifications for the student from database
    const notifications = await StudentNotification.find({ studentId: studentUsername })
      .sort({ createdAt: -1 })
      .limit(50); // Limit to 50 most recent notifications
    
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
    res.status(500).json({ error: 'Server error: ' + error.message });
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
    res.status(500).json({ error: 'Server error: ' + error.message });
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
    res.status(500).json({ error: 'Server error: ' + error.message });
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
    res.status(500).json({ success: false, error: 'Server error: ' + error.message });
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
      const newBalance = (student.creditBalance || 0) + creditsToAdd;
      student.creditBalance = newBalance;
      student.totalCreditsEarned = (student.totalCreditsEarned || 0) + creditsToAdd;
      student.creditTransactions = student.creditTransactions || [];
      student.creditTransactions.push({
        date: new Date(),
        type: 'purchase',
        plan: planLabel,
        description: `Subscription purchase (${planLabel})`,
        credits: creditsToAdd,
        balanceAfter: newBalance,
        amountPaid: priceNumber
      });
    }

    await student.save();

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
                commissionAmount: 25,
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
    res.status(500).json({ success: false, error: 'Server error: ' + error.message });
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
    res.status(500).json({ success: false, error: 'Server error: ' + error.message });
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
    res.status(500).json({ error: 'Server error: ' + error.message });
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
    res.status(500).json({ error: 'Server error: ' + error.message });
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
    
    // Check if feedback already exists for this booking
    const existingFeedback = await Feedback.findOne({
      bookingId: bookingIdStr,
      studentId: req.user.studentId,
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
      lessonDate: new Date(booking.date)
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
    res.status(500).json({ error: 'Server error: ' + error.message });
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
    res.status(500).json({ error: 'Server error: ' + error.message });
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
      message: 'Server error: ' + error.message 
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
      error: 'Failed to mark student as absent: ' + error.message 
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