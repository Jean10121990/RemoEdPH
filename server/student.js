const express = require('express');
const mongoose = require('mongoose');
const Student = require('./models/Student');
const Booking = require('./models/Booking');
const CancellationRequest = require('./models/CancellationRequest');
const Feedback = require('./models/Feedback');
const StudentNotification = require('./models/StudentNotification');
const { verifyToken, requireStudent } = require('./authMiddleware');

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
        documents: student.documents
      }
    });
  } catch (error) {
    console.error('❌ Error fetching student profile:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
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
      contact: contact || '',
      email: email || req.user.username, // Use username as fallback for email
      address: address || '',
      language: language || '',
      hobbies: hobbies || '',
      parentName: parentName || '',
      parentContact: parentContact || '',
      emergencyContact: emergencyContact || '',
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

    // Get teacher information for each booking
    const bookingsWithTeacherInfo = await Promise.all(
      bookings.map(async (booking) => {
        const bookingObj = booking.toObject();
        
        // Find teacher by teacherId string
        const Teacher = require('./models/Teacher');
        const teacher = await Teacher.findOne({ teacherId: bookingObj.teacherId });
        
        return {
          ...bookingObj,
          teacherId: teacher ? {
            _id: teacher._id,
            username: teacher.username,
            firstName: teacher.firstName,
            lastName: teacher.lastName,
            photo: teacher.photo,
            intro: teacher.intro
          } : null
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

// Submit feedback for a class
router.post('/feedback/submit', verifyToken, requireStudent, async (req, res) => {
  try {
    console.log('📝 Feedback submission request received');
    console.log('🔍 Student ID:', req.user.studentId);
    console.log('🔍 Request body:', req.body);
    
    const { bookingId, teacherId, rating, comment } = req.body;
    
    // Validate required fields
    if (!bookingId || !teacherId || !rating) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ error: 'Missing required fields: bookingId, teacherId, rating' });
    }
    
    // Validate rating
    if (rating < 1 || rating > 5) {
      console.log('❌ Invalid rating:', rating);
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    
    // Check if feedback already exists for this booking
    const existingFeedback = await Feedback.findOne({ bookingId, studentId: req.user.studentId });
    if (existingFeedback) {
      console.log('❌ Feedback already submitted for this booking');
      return res.status(400).json({ error: 'Feedback already submitted for this class' });
    }
    
    // Get booking information for lesson date
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      console.log('❌ Booking not found:', bookingId);
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    // Create new feedback
    const feedback = new Feedback({
      bookingId,
      teacherId,
      studentId: req.user.studentId,
      rating,
      comment: comment || '',
      lessonDate: new Date(booking.date)
    });
    
    await feedback.save();
    
    // Save to StarReceived collection for teacher
    const StarReceived = require('./models/StarReceived');
    const starReceived = new StarReceived({
      recipientId: teacherId,
      recipientType: 'teacher',
      giverId: req.user.studentId || req.user.username,
      giverType: 'student',
      bookingId: bookingId,
      rating: rating,
      feedbackId: feedback._id,
      lessonDate: new Date(booking.date + 'T' + booking.time + ':00')
    });
    await starReceived.save();
    console.log('⭐ Star saved to StarReceived collection for teacher:', teacherId);
    
    console.log('✅ Feedback submitted successfully');
    console.log('📊 Feedback details:', {
      bookingId,
      teacherId,
      studentId: req.user.studentId,
      rating,
      commentLength: comment ? comment.length : 0
    });
    
    res.json({
      success: true,
      message: 'Feedback submitted successfully',
      feedback: {
        id: feedback._id,
        rating,
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

module.exports = router; 