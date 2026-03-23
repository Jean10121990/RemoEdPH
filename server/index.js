require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const { db, connectDB } = require('./db');

// Import route files
const authRoutes = require('./auth');
const teacherRoutes = require('./teacher');
const studentRoutes = require('./student');
const adminRoutes = require('./admin');
const fileRoutes = require('./fileRoutes');
const announcementRoutes = require('./announcement');
const lessonRoutes = require('./lessons');
const classroomRecordingRouter = require('./classroomRecordingApi');
const applicationRoutes = require('./applications');
const Booking = require('./models/Booking');
const LessonMaterial = require('./models/LessonMaterial');
const InvitationToken = require('./models/InvitationToken');
const Application = require('./models/Application');
const { DateTime } = require('luxon');
// LessonSlides model removed - PPTX conversion still works but slides are not saved to database
const fs = require('fs');
const fsp = require('fs').promises;
// AdmZip removed - no longer needed for file conversion
const FormData = require('form-data');
const axios = require('axios');
const { verifyToken, requireTeacher } = require('./authMiddleware');

const app = express();
const http = require('http').createServer(app);
const { Server } = require('socket.io');
// Keep the connection alive
const io = new Server(http, {
  cors: {
    origin: ["*", "https://*.devtunnels.ms", "https://*.ngrok.io", "http://localhost:5000"],
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['polling', 'websocket'],
  maxHttpBufferSize: 15 * 1024 * 1024, // 15 MB limit (accounts for base64 encoding overhead: 10MB raw ≈ 13.3MB base64)
  pingInterval: 25000,
  pingTimeout: 60000
});
const realtime = require('./realtime');
realtime.setIo(io);
// Do NOT hardcode 5000 or 3000
const PORT = process.env.PORT || 8080;

// Store chat history for each room
const chatHistory = new Map();

// Store user information for attendance tracking
const userSessions = new Map(); // socketId -> { room, userType, userId, username }

// Store REST API signaling messages
const signalingMessages = new Map(); // room -> [messages]
const messageId = 0;

// Lesson materials are now stored in database (LessonMaterial model)
// Keep in-memory cache for quick access during active sessions
const lessonMaterialsByRoom = new Map(); // room -> [{ id, name, type, size, data, uploader, uploadedAt }]

// Add a minimal startup endpoint FIRST - responds immediately
app.get('/startup', (req, res) => {
  res.json({ 
    status: 'starting', 
    message: 'Server is initializing',
    timestamp: new Date().toISOString()
  });
});

// Middleware
app.use(cors({
  origin: ["*", "https://*.devtunnels.ms", "https://*.ngrok.io", "http://localhost:5000"],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Ensure PDF.js assets are available under public/vendor/pdfjs
const ensurePdfjsAssets = () => {
  const pdfjsSourceDirs = [
    path.join(__dirname, '../node_modules/pdfjs-dist/build'),
    path.join(__dirname, '../node_modules/pdfjs-dist/legacy/build')
  ];
  const pdfjsDestDir = path.join(__dirname, '../public/vendor/pdfjs');
  const assetNames = ['pdf.min.mjs', 'pdf.worker.min.mjs'];

  try {
    if (!fs.existsSync(pdfjsDestDir)) {
      fs.mkdirSync(pdfjsDestDir, { recursive: true });
    }

    assetNames.forEach((assetName) => {
      const destPath = path.join(pdfjsDestDir, assetName);
      if (fs.existsSync(destPath)) {
        return;
      }

      const sourceDir = pdfjsSourceDirs.find((dir) => fs.existsSync(path.join(dir, assetName)));
      if (!sourceDir) {
        console.warn(`⚠️ PDF.js asset not found: ${assetName}`);
        return;
      }

      fs.copyFileSync(path.join(sourceDir, assetName), destPath);
    });
  } catch (error) {
    console.warn('⚠️ Failed to prepare PDF.js assets:', error);
  }
};

ensurePdfjsAssets();

// Serve PDF.js assets from node_modules to avoid third-party CDN warnings
app.use('/vendor/pdfjs', express.static(path.join(__dirname, '../node_modules/pdfjs-dist/build')));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/student', studentRoutes);
// Must be before /api/admin: same path prefix /api/admin/... is otherwise swallowed by adminRoutes → 404
app.use('/api', classroomRecordingRouter);
app.use('/api/admin', adminRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/upload', fileRoutes); // Add alias for upload endpoint
app.use('/api', announcementRoutes); // Mount announcement routes directly under /api
app.use('/api', fileRoutes); // Add direct access to file routes (moved after announcement routes)
app.use('/api/lessons', lessonRoutes);
app.use('/api', applicationRoutes);

/**
 * WebRTC ICE servers for live-classroom.html
 * STUN helps with NAT; TURN relays traffic when P2P fails (common on strict networks / dev tunnels).
 * Set TURN_URLS + TURN_USERNAME + TURN_CREDENTIAL in .env for production reliability.
 */
app.get('/api/rtc-config', (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];
  const turnUrls = process.env.TURN_URLS || process.env.TURN_URI;
  if (turnUrls) {
    const urls = turnUrls.split(',').map((s) => s.trim()).filter(Boolean);
    if (urls.length) {
      const turnEntry = urls.length === 1 ? { urls: urls[0] } : { urls };
      if (process.env.TURN_USERNAME) {
        turnEntry.username = process.env.TURN_USERNAME;
        turnEntry.credential = process.env.TURN_CREDENTIAL || '';
      }
      iceServers.push(turnEntry);
    }
  }
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.json({ iceServers });
});

// Protected teacher signup route: requires a valid invitation token in URL.
app.get('/teacher-signup', async (req, res) => {
  try {
    const token = String(req.query.invitation || '').trim();
    if (!token) {
      return res.redirect('/');
    }

    const invitation = await InvitationToken.findOne({ token, isUsed: false }).lean();
    if (!invitation) {
      return res.redirect('/');
    }

    if (!invitation.expiresAt || new Date(invitation.expiresAt) <= new Date()) {
      return res.redirect('/');
    }

    const application = await Application.findById(invitation.applicationId).lean();
    if (!application || application.currentStage !== 'passed') {
      return res.redirect('/');
    }

    return res.sendFile(path.join(__dirname, '../public/teacher-signup.html'));
  } catch (error) {
    console.error('Protected /teacher-signup route failed:', error);
    return res.redirect('/');
  }
});

// Prevent bypassing invitation checks via direct file URL.
app.get('/teacher-signup.html', (req, res) => res.redirect('/'));

// Public teacher application form (React build output).
const applicationFormDist = path.join(__dirname, '../application-form/dist');
const applicationFormAssets = path.join(applicationFormDist, 'assets');
app.use('/assets', express.static(applicationFormAssets));
app.get('/application-form', (req, res) => {
  return res.sendFile(path.join(applicationFormDist, 'index.html'));
});

// Static files after core /api mounts so API paths are never shadowed by public files
app.use(express.static(path.join(__dirname, '../public')));

// Email diagnostic endpoint (for debugging)
app.get('/api/email/status', (req, res) => {
  const { getEmailConfigStatus } = require('./emailService');
  const status = getEmailConfigStatus();
  res.json({
    success: true,
    email: status,
    environment: {
      hasSendGridKey: !!process.env.SENDGRID_API_KEY,
      sendGridKeyLength: process.env.SENDGRID_API_KEY ? process.env.SENDGRID_API_KEY.length : 0,
      emailServiceType: process.env.EMAIL_SERVICE_TYPE || '(not set)',
      sendGridFromEmail: process.env.SENDGRID_FROM_EMAIL || '(not set)'
    }
  });
});

// Email test endpoint (for debugging - requires email parameter)
app.post('/api/email/test', async (req, res) => {
  try {
    const { testEmailSending } = require('./emailService');
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email address is required' 
      });
    }
    
    const result = await testEmailSending(email);
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
}); // Lesson tracker and curriculum routes

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

// Get already-converted slides for a booking (students and teachers can access)
app.get('/api/slides/:bookingId', verifyToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const userType = req.user.userType || (req.user.studentId ? 'student' : req.user.teacherId ? 'teacher' : 'unknown');
    
    console.log(`📚 Fetching slides for booking ${bookingId} (user: ${userType})`);
    
    // LessonSlides collection removed - this endpoint is no longer functional
    console.log(`⚠️ LessonSlides collection removed - slides endpoint disabled`);
    return res.status(404).json({ 
      success: false, 
      error: 'LessonSlides collection removed. Slides are no longer stored in the database.' 
    });
    
    /* Old code removed - LessonSlides collection no longer exists
    const lessonSlides = await LessonSlides.findOne({ 
      bookingId, 
      isActive: true 
    }).sort({ uploadedAt: -1 });
    
    if (!lessonSlides) {
      console.log(`⚠️ No slides document found for booking ${bookingId}`);
      return res.status(404).json({ 
        success: false, 
        error: 'No slides found for this booking. Teacher needs to convert the PPTX file first.' 
      });
    }
    
    if (!lessonSlides.slides || lessonSlides.slides.length === 0) {
      console.log(`⚠️ Slides document found but empty for booking ${bookingId}`);
      return res.status(404).json({ 
        success: false, 
        error: 'No slides found for this booking. Teacher needs to convert the PPTX file first.' 
      });
    }
    
    console.log(`✅ Found ${lessonSlides.slides.length} slides for booking ${bookingId}`);
    
    // Ensure imageUrl is absolute if it's relative
    const slides = lessonSlides.slides.map(slide => ({
      ...slide.toObject ? slide.toObject() : slide,
      imageUrl: slide.imageUrl || slide.originalFile,
      // Make sure URLs are accessible
      originalFile: slide.originalFile || slide.imageUrl
    }));
    
    res.json({
      success: true,
      slides,
      totalSlides: lessonSlides.totalSlides || slides.length,
      title: lessonSlides.title
    });
    */
  } catch (error) {
    console.error('❌ Error fetching slides:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch slides: ' + error.message });
  }
});

// File conversion endpoint removed - files are now displayed directly without conversion
app.post('/api/convert-pptx', verifyToken, requireTeacher, (req, res) => {
  return res.status(410).json({ 
    success: false, 
    error: 'File conversion has been removed. Files are now displayed directly without conversion.' 
  });
});

// Add legacy routes for frontend compatibility
// These routes are needed because the frontend calls them directly
const Feedback = require('./models/Feedback');
const IssueReport = require('./models/IssueReport');

// Mark student as absent (legacy route)
app.post('/api/booking/:bookingId/mark-student-absent', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const teacherId = req.user.teacherId;
    
    console.log('🚫 Marking student as absent for booking:', bookingId, 'by teacher:', teacherId);
    
    // Find the booking and verify it belongs to this teacher
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        error: 'Booking not found' 
      });
    }
    
    if (booking.teacherId !== teacherId) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied. This booking does not belong to you.' 
      });
    }
    
    // Check if booking is already marked as absent or completed
    if (booking.status === 'completed' || booking.absentMarkedAt) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot mark student as absent for a completed or already absent-marked class' 
      });
    }
    
    // Mark as absent
    booking.absentMarkedAt = new Date();
    booking.absentType = 'student';
    booking.absentReason = 'Marked as absent by teacher';
    
    await booking.save();
    
    console.log('✅ Student marked as absent successfully');
    
    res.json({
      success: true,
      message: 'Student marked as absent successfully',
      booking: {
        id: booking._id,
        absentMarkedAt: booking.absentMarkedAt,
        absentType: booking.absentType
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

// Complete a class (legacy route)
app.post('/api/booking/:bookingId/complete', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const teacherId = req.user.teacherId;
    
    console.log('✅ Completing class:', bookingId, 'for teacher:', teacherId);
    
    // Find the booking and verify it belongs to this teacher
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        error: 'Booking not found' 
      });
    }
    
    if (booking.teacherId !== teacherId) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied. This booking does not belong to you.' 
      });
    }
    
    // Check if class is already completed
    if (booking.status === 'completed') {
      return res.status(400).json({ 
        success: false, 
        error: 'Class is already completed' 
      });
    }
    
    // Update booking status to completed
    booking.status = 'completed';
    booking.finishedAt = new Date();
    
    // Set attendance.classCompleted to true for service fee calculation
    if (!booking.attendance) {
      booking.attendance = {};
    }
    booking.attendance.classCompleted = true;
    
    await booking.save();
    
    console.log('✅ Class completed successfully:', bookingId);

    try {
      realtime.emitAll('bookingsUpdated', {
        teacherId,
        bookingId: booking._id.toString(),
        date: booking.date,
        time: booking.time,
        status: booking.status,
        ts: Date.now()
      });
    } catch (emitErr) {
      console.warn('bookingsUpdated emit (complete):', emitErr);
    }
    
    res.json({
      success: true,
      message: 'Class completed successfully',
      booking: {
        id: booking._id,
        status: booking.status,
        finishedAt: booking.finishedAt,
        classCompleted: booking.attendance.classCompleted
      }
    });
    
  } catch (error) {
    console.error('❌ Error completing class:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to complete class: ' + error.message 
    });
  }
});

// Check if feedback exists for a booking
app.get('/api/feedback/check/:bookingId', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    // Check if feedback already exists for this booking
    const existingFeedback = await Feedback.findOne({ bookingId });
    
    res.json({
      success: true,
      exists: !!existingFeedback,
      feedback: existingFeedback ? {
        id: existingFeedback._id,
        rating: existingFeedback.rating,
        comment: existingFeedback.comment,
        submittedAt: existingFeedback.submittedAt
      } : null
    });
    
  } catch (error) {
    console.error('❌ Error checking feedback:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check feedback: ' + error.message 
    });
  }
});

// Submit feedback (legacy route)
app.post('/api/feedback/submit', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { bookingId, teacherId, studentId, rating, comment, submittedAt } = req.body;
    
    if (!bookingId || !rating || rating < 1 || rating > 5) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields or invalid rating' 
      });
    }
    
    console.log('📝 Teacher feedback submission:', {
      bookingId,
      teacherId,
      studentId,
      rating,
      comment: comment ? comment.substring(0, 50) + '...' : 'No comment',
      submittedAt
    });
    
    // Find the booking and verify it belongs to this teacher
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        error: 'Booking not found' 
      });
    }
    
    if (booking.teacherId !== teacherId) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied. This booking does not belong to you.' 
      });
    }
    
    // Check if feedback already exists for this booking
    const existingFeedback = await Feedback.findOne({ bookingId });
    if (existingFeedback) {
      // Check if the class was actually completed
      const booking = await Booking.findById(bookingId);
      if (booking && booking.status === 'completed') {
        return res.status(400).json({ 
          success: false, 
          error: 'Feedback already submitted for this class' 
        });
      } else {
        // Class wasn't completed, allow feedback update
        console.log('⚠️ Feedback exists but class not completed, allowing update');
      }
    }
    
    // Create or update feedback
    let feedback;
    if (existingFeedback) {
      // Update existing feedback
      existingFeedback.rating = rating;
      existingFeedback.comment = comment || '';
      existingFeedback.submittedAt = submittedAt || new Date();
      feedback = await existingFeedback.save();
      console.log('✅ Teacher feedback updated successfully');
    } else {
      // Create new feedback
      feedback = new Feedback({
        bookingId,
        teacherId,
        studentId,
        rating,
        comment: comment || '',
        submittedAt: submittedAt || new Date(),
        lessonDate: new Date(booking.date + 'T' + booking.time + ':00') // Convert booking date/time to lesson date
      });
      
      await feedback.save();
      console.log('✅ Teacher feedback submitted successfully');
    }
    
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
    console.error('❌ Error submitting teacher feedback:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to submit feedback: ' + error.message 
    });
  }
});

// API base endpoint - returns API status (for Cloud Run health checks)
app.get('/api', (req, res) => {
  try {
    res.json({ 
      status: 'OK', 
      message: 'API is running',
      version: '1.0.0',
      endpoints: {
        health: '/api/health',
        auth: '/api/auth',
        teacher: '/api/teacher',
        student: '/api/student',
        admin: '/api/admin'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint - MUST respond quickly for Cloud Run
app.get('/api/health', (req, res) => {
  try {
    res.json({ 
      status: 'OK', 
      message: 'Server is running',
      database: db.readyState === 1 ? 'Connected' : 'Disconnected',
      port: PORT,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Manual trigger for absent student check (for testing)
app.post('/api/admin/check-absent-students', async (req, res) => {
  try {
    console.log('🔍 Manual absent student check triggered');
    await checkAndMarkAbsentStudents();
    res.json({ 
      success: true, 
      message: 'Absent student check completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error in manual absent check:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check absent students: ' + error.message 
    });
  }
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!' });
});

// REST API Signaling endpoints
app.post('/api/signaling/send', (req, res) => {
  try {
    const { room, userType, type, data, timestamp } = req.body;
    
    if (!room || !userType || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Initialize room if it doesn't exist
    if (!signalingMessages.has(room)) {
      signalingMessages.set(room, []);
    }
    
    const message = {
      id: Date.now() + Math.random(),
      room,
      userType,
      type,
      data,
      timestamp: timestamp || Date.now(),
      createdAt: new Date().toISOString()
    };
    
    // Add message to room
    signalingMessages.get(room).push(message);
    
    // Keep only last 100 messages per room to prevent memory issues
    const roomMessages = signalingMessages.get(room);
    if (roomMessages.length > 100) {
      roomMessages.splice(0, roomMessages.length - 100);
    }
    
    console.log(`🌐 REST: Message stored for room ${room}:`, type);
    
    res.json({ success: true, messageId: message.id });
  } catch (error) {
    console.error('🌐 REST: Error storing message:', error);
    res.status(500).json({ error: 'Failed to store message' });
  }
});

app.get('/api/signaling/messages', (req, res) => {
  try {
    const { room, userType, timestamp } = req.query;
    
    if (!room || !userType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Get messages for the room
    const roomMessages = signalingMessages.get(room) || [];
    
    // Filter messages that are not from the current user and are newer than the timestamp
    const filteredMessages = roomMessages.filter(message => {
      const isFromOtherUser = message.userType !== userType;
      const isNewer = !timestamp || message.timestamp > parseInt(timestamp);
      return isFromOtherUser && isNewer;
    });
    
    console.log(`🌐 REST: Returning ${filteredMessages.length} messages for room ${room}`);
    
    res.json(filteredMessages);
  } catch (error) {
    console.error('🌐 REST: Error retrieving messages:', error);
    res.status(500).json({ error: 'Failed to retrieve messages' });
  }
});

app.get('/api/signaling/room-status', (req, res) => {
  try {
    const { room } = req.query;
    
    if (!room) {
      return res.status(400).json({ error: 'Missing room parameter' });
    }
    
    // Get messages for the room
    const roomMessages = signalingMessages.get(room) || [];
    
    // Check if there's a recent teacher message (within last 30 seconds)
    const thirtySecondsAgo = Date.now() - 30000;
    
    // Check if teacher has sent any recent messages
    const teacherMessagePresent = roomMessages.some(message => 
      message.userType === 'teacher' && message.timestamp > thirtySecondsAgo
    );
    
    // Check if teacher is connected via Socket.IO
    const roomExists = io.sockets.adapter.rooms.has(room);
    const roomClients = roomExists ? Array.from(io.sockets.adapter.rooms.get(room) || []) : [];
    
    console.log(`🔍 Socket.IO room check for ${room}:`);
    console.log(`  - Room exists: ${roomExists}`);
    console.log(`  - Clients in room: ${roomClients.length}`);
    
    const teacherSocketPresent = roomExists && roomClients.some(socketId => {
      const socket = io.sockets.sockets.get(socketId);
      const hasUserType = socket && socket.userType;
      const isTeacher = hasUserType && socket.userType === 'teacher';
      
      console.log(`  - Socket ${socketId}: userType=${socket?.userType}, isTeacher=${isTeacher}`);
      
      return isTeacher;
    });

    const teacherPresent = teacherMessagePresent || teacherSocketPresent;

    console.log(`🌐 REST: Room ${room} status check:`);
    console.log(`  - Room messages: ${roomMessages.length}`);
    console.log(`  - Teacher message present: ${teacherMessagePresent}`);
    console.log(`  - Teacher socket present: ${teacherSocketPresent}`);
    console.log(`  - Final result - Teacher present: ${teacherPresent}`);
    
    res.json({ 
      room, 
      teacherPresent,
      teacherMessagePresent,
      teacherSocketPresent,
      roomExists,
      clientCount: roomClients.length,
      lastActivity: roomMessages.length > 0 ? Math.max(...roomMessages.map(m => m.timestamp)) : null
    });
  } catch (error) {
    console.error('🌐 REST: Error checking room status:', error);
    res.status(500).json({ error: 'Failed to check room status' });
  }
});

// Manual teacher presence endpoint for testing
app.post('/api/signaling/teacher-present', (req, res) => {
  try {
    const { room, teacherId, username } = req.body;
    
    if (!room) {
      return res.status(400).json({ error: 'Missing room parameter' });
    }
    
    // Store a teacher presence message
    const message = {
      id: Date.now() + Math.random(),
      room: room,
      userType: 'teacher',
      type: 'teacher-present',
      data: { teacherId, username },
      timestamp: Date.now(),
      createdAt: new Date().toISOString()
    };
    
    if (!signalingMessages.has(room)) {
      signalingMessages.set(room, []);
    }
    signalingMessages.get(room).push(message);
    
    console.log(`👨‍🏫 Manual teacher presence message stored for room ${room}:`, message);
    
    res.json({ 
      success: true, 
      message: 'Teacher presence recorded',
      room,
      teacherId,
      username
    });
  } catch (error) {
    console.error('🌐 REST: Error recording teacher presence:', error);
    res.status(500).json({ error: 'Failed to record teacher presence' });
  }
});

// Get all rooms for debugging
app.get('/api/signaling/all-rooms', (req, res) => {
  try {
    const rooms = Array.from(io.sockets.adapter.rooms.keys());
    const roomData = {};
    
    rooms.forEach(room => {
      const clients = Array.from(io.sockets.adapter.rooms.get(room) || []);
      roomData[room] = {
        clientCount: clients.length,
        clients: clients.map(socketId => {
          const socket = io.sockets.sockets.get(socketId);
          return {
            socketId,
            userType: socket?.userType || 'unknown',
            username: socket?.username || 'unknown'
          };
        })
      };
    });
    
    res.json({ 
      rooms: roomData,
      signalingMessages: Object.fromEntries(signalingMessages)
    });
  } catch (error) {
    console.error('🌐 REST: Error getting all rooms:', error);
    res.status(500).json({ error: 'Failed to get all rooms' });
  }
});

// Clear room data for debugging
app.post('/api/signaling/clear-room', (req, res) => {
  try {
    const { room } = req.body;
    
    if (!room) {
      return res.status(400).json({ error: 'Missing room parameter' });
    }
    
    // Clear signaling messages for the room
    signalingMessages.delete(room);
    
    // Disconnect all clients in the room
    const roomExists = io.sockets.adapter.rooms.has(room);
    if (roomExists) {
      const clients = Array.from(io.sockets.adapter.rooms.get(room) || []);
      clients.forEach(socketId => {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect();
        }
      });
    }
    
    console.log(`🧹 Cleared room data for ${room}`);
    
    res.json({ 
      success: true, 
      message: 'Room data cleared',
      room
    });
  } catch (error) {
    console.error('🌐 REST: Error clearing room data:', error);
    res.status(500).json({ error: 'Failed to clear room data' });
  }
});

// Check if class time allows access to live classroom
app.post('/api/class/check-time-access', async (req, res) => {
  try {
    const { bookingId } = req.body;
    
    if (!bookingId) {
      return res.status(400).json({ error: 'Missing booking ID' });
    }
    
    // Get booking from database
    const Booking = require('./models/Booking');
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    // Calculate class start and end times
    const classStartTime = new Date(booking.date + ' ' + booking.time);
    const classEndTime = new Date(classStartTime.getTime() + (25 * 60 * 1000)); // 25 minutes
    const currentTime = new Date();
    
    // Debug logging
    console.log(`⏰ Debug - Booking ${bookingId}:`);
    console.log(`  - Booking date: ${booking.date}`);
    console.log(`  - Booking time: ${booking.time}`);
    console.log(`  - Class start time: ${classStartTime.toLocaleString()}`);
    console.log(`  - Class end time: ${classEndTime.toLocaleString()}`);
    console.log(`  - Current time: ${currentTime.toLocaleString()}`);
    
    // Check if current time is within class time window
    const isBeforeClass = currentTime < classStartTime;
    const isAfterClass = currentTime > classEndTime;
    const isDuringClass = currentTime >= classStartTime && currentTime <= classEndTime;
    
    // Allow access during class time OR if class hasn't started yet (for waiting room)
    const accessAllowed = isDuringClass || isBeforeClass;
    
    console.log(`⏰ Class time check for booking ${bookingId}:`);
    console.log(`  - Class start: ${classStartTime.toLocaleString()}`);
    console.log(`  - Class end: ${classEndTime.toLocaleString()}`);
    console.log(`  - Current time: ${currentTime.toLocaleString()}`);
    console.log(`  - Access allowed: ${accessAllowed}`);
    
    res.json({
      accessAllowed,
      classStartTime: classStartTime.toISOString(),
      classEndTime: classEndTime.toISOString(),
      currentTime: currentTime.toISOString(),
      isBeforeClass,
      isAfterClass,
      isDuringClass,
      bookingId
    });
    
  } catch (error) {
    console.error('⏰ Error checking class time access:', error);
    res.status(500).json({ error: 'Failed to check class time access' });
  }
});

// Canonical scheduled start time for classroom timer (UTC ISO string). If string from DB doesn't end in 'Z', append 'Z' so it's treated as UTC.
function getScheduledStartTime(booking) {
  if (!booking) return null;
  if (booking.dateTimeUtc) {
    let utc = booking.dateTimeUtc;
    if (typeof utc === 'string') {
      utc = utc.trim();
      if (!/Z$/i.test(utc)) utc = utc + 'Z';
    }
    const d = utc instanceof Date ? utc : new Date(utc);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (booking.date && booking.time) {
    const zone = booking.teacherLocalZone || booking.studentLocalZone || 'Asia/Manila';
    const timeNorm = booking.time.length <= 5 ? booking.time + ':00' : booking.time;
    const dt = DateTime.fromISO(`${booking.date}T${timeNorm}`, { zone });
    if (!dt.isValid) return null;
    return dt.toUTC().toISO();
  }
  return null;
}

// Get student booking information
app.get('/api/student/booking/:bookingId', verifyToken, async (req, res) => {
  try {
    const { bookingId } = req.params;
    console.log('🔍 [STUDENT BOOKING] Fetching booking:', bookingId);
    
    if (!bookingId) {
      return res.status(400).json({ success: false, error: 'Missing booking ID' });
    }

    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      console.log('❌ [STUDENT BOOKING] Booking not found:', bookingId);
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    const bookingObj = booking.toObject ? booking.toObject() : { ...booking };
    bookingObj.scheduledStartTime = getScheduledStartTime(booking);
    console.log('✅ [STUDENT BOOKING] Booking found:', bookingId);
    res.json({ success: true, booking: bookingObj });
  } catch (error) {
    console.error('❌ [STUDENT BOOKING] Error fetching student booking:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch booking information: ' + error.message });
  }
});

// Mark attendance for live classroom
app.post('/api/attendance/mark', async (req, res) => {
  try {
    const { bookingId, userType, enteredAt } = req.body;
    
    if (!bookingId || !userType) {
      return res.status(400).json({ error: 'Missing booking ID or user type' });
    }

    const Booking = require('./models/Booking');
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Update attendance based on user type
    if (userType === 'teacher') {
      booking.attendance.teacherEntered = true;
      booking.attendance.teacherEnteredAt = new Date(enteredAt);
    } else if (userType === 'student') {
      booking.attendance.studentEntered = true;
      booking.attendance.studentEnteredAt = new Date(enteredAt);
    }

    await booking.save();
    
    console.log(`✅ Attendance marked for booking ${bookingId}: ${userType} entered at ${enteredAt}`);
    
    res.json({ 
      success: true, 
      message: 'Attendance marked successfully',
      booking: {
        id: booking._id,
        teacherEntered: booking.attendance.teacherEntered,
        studentEntered: booking.attendance.studentEntered,
        teacherEnteredAt: booking.attendance.teacherEnteredAt,
        studentEnteredAt: booking.attendance.studentEnteredAt
      }
    });
    
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ error: 'Failed to mark attendance' });
  }
});



// Serve the main HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/teachers', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/teachers.html'));
});

app.get('/teacher-login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/teacher-login.html'));
});

app.get('/student-login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/student-login.html'));
});

app.get('/student-waiting-room', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/student-waiting-room.html'));
});

app.get('/admin-login', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin-login.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Socket.IO signaling server functionality
io.on('connection', socket => {
    console.log('🔌 New client connected:', socket.id);

    // Teacher-to-teacher messaging room (for real-time inbox updates)
    socket.on('join-teacher-messages', (data = {}) => {
        try {
            const teacherId = String(data.teacherId || '').trim();
            if (!teacherId) return;
            const roomName = `teacher-msg:${teacherId}`;
            socket.join(roomName);
            console.log(`💬 Socket ${socket.id} joined teacher message room: ${roomName}`);
        } catch (e) {
            console.warn('join-teacher-messages error:', e.message);
        }
    });
    
    socket.on('join', async (data) => {
        const { room, userType, userId, username } = data;
        console.log('🚪 Client', socket.id, 'joining room:', room, 'as', userType, username);
        
        // Store user session information
        userSessions.set(socket.id, { room, userType, userId, username });
        
        // Set socket properties for room status detection
        socket.room = room;
        socket.userType = userType;
        socket.username = username;
        
        console.log(`🔧 Socket properties set for ${socket.id}:`);
        console.log(`  - room: ${socket.room}`);
        console.log(`  - userType: ${socket.userType}`);
        console.log(`  - username: ${socket.username}`);
        
        socket.join(room);
        const clients = io.sockets.adapter.rooms.get(room);
        console.log('👥 Room', room, 'now has', clients.size, 'clients');
        
        // Log all clients in the room for debugging
        if (clients) {
            console.log('👥 Clients in room', room, ':');
            clients.forEach(clientId => {
                const clientInfo = userSessions.get(clientId);
                console.log('  - Socket ID:', clientId, 'User:', clientInfo ? `${clientInfo.userType} ${clientInfo.username}` : 'Unknown');
            });
        }
        
        // Update booking attendance when user enters classroom
        await updateBookingAttendance(room, userType, userId, username);
        
        // Send existing chat history to the new user
        if (chatHistory.has(room)) {
            console.log('📜 Sending chat history to client:', chatHistory.get(room).length, 'messages');
            socket.emit('chat-history', chatHistory.get(room));
        } else {
            console.log('📜 No chat history for room:', room);
        }

        // Send any existing lesson materials to the new participant (from database)
        loadLessonMaterialsFromDB(room).then(materials => {
            if (materials && materials.length > 0) {
                console.log(`📚 [SERVER] Sending ${materials.length} shared lesson materials to ${socket.id} (${userType}) in room ${room}`);
                socket.emit('lesson-materials-sync', { materials });
            } else {
                console.log(`📚 [SERVER] No lesson materials found in database for room ${room} (sending empty to ${socket.id}, ${userType})`);
                // Always send response, even if empty, so client knows sync completed
                socket.emit('lesson-materials-sync', { materials: [] });
            }
        }).catch(err => {
            console.error('❌ [SERVER] Error loading lesson materials for new participant:', err);
            // Send empty array on error
            socket.emit('lesson-materials-sync', { materials: [] });
        });
        
        // Also send a signaling message to indicate teacher presence
        if (userType === 'teacher') {
            const message = {
                id: Date.now() + Math.random(),
                room: room,
                userType: 'teacher',
                type: 'teacher-joined',
                data: { username },
                timestamp: Date.now(),
                createdAt: new Date().toISOString()
            };
            
            if (!signalingMessages.has(room)) {
                signalingMessages.set(room, []);
            }
            signalingMessages.get(room).push(message);
            
            console.log(`👨‍🏫 Teacher joined message stored for room ${room}`);
        }
        
        if (clients.size === 1) {
            console.log('👤 First user in room, emitting joined');
            socket.emit('joined');
        } else if (clients.size === 2) {
            console.log('👥 Second user joined, both users ready for WebRTC');
            // Emit ready to both users in the room
            io.to(room).emit('ready');
            
            // Notify other users in the room that someone joined
            socket.to(room).emit('user-joined', { userType, userId, username, room });
            console.log('📢 Notified room about user join:', username);
        }
        
        // Send updated participant count to all users in the room
        io.to(room).emit('room-users', { count: clients.size });
        console.log('👥 Sent participant count update:', clients.size);
    });

    // Handle disconnect-call event
    socket.on('disconnect-call', (data) => {
        const { room, userType } = data;
        console.log('🔚 Disconnect call signal received from:', userType, 'in room:', room);
        
        // Forward the disconnect signal to other users in the room
        socket.to(room).emit('disconnect-call', { userType });
        
        // Also store as a signaling message for REST API
        const message = {
            id: Date.now() + Math.random(),
            room: room,
            userType: userType,
            type: 'disconnect-call',
            data: { userType },
            timestamp: Date.now(),
            createdAt: new Date().toISOString()
        };
        
        if (!signalingMessages.has(room)) {
            signalingMessages.set(room, []);
        }
        signalingMessages.get(room).push(message);
        
        console.log(`🔚 Disconnect call message stored for room ${room}`);
    });

    // Handle class-finished event
    socket.on('class-finished', (data) => {
        const { room, userType, teacherId } = data;
        console.log('🏁 Class finished signal received from:', userType, 'in room:', room);
        
        // Broadcast to all users in the room that the class is finished
        socket.to(room).emit('class-finished', { userType, teacherId, room });
        
        // Also store as a signaling message for REST API
        const message = {
            id: Date.now() + Math.random(),
            room: room,
            userType: userType,
            type: 'class-finished',
            data: { userType, teacherId },
            timestamp: Date.now(),
            createdAt: new Date().toISOString()
        };
        
        if (!signalingMessages.has(room)) {
            signalingMessages.set(room, []);
        }
        signalingMessages.get(room).push(message);
        
        console.log(`🏁 Class finished message stored for room ${room}`);
    });

    // Handle join-room event (for compatibility with client)
    socket.on('join-room', async (data) => {
        const { room, userType } = data;
        const username = userType === 'teacher' ? 'Teacher' : 'Student';
        const userId = socket.id;
        
        console.log('🚪 Client', socket.id, 'joining room:', room, 'as', userType, username);
        
        // Store user session information
        userSessions.set(socket.id, { room, userType, userId, username });
        
        // Set socket properties for room status detection
        socket.room = room;
        socket.userType = userType;
        socket.username = username;
        
        console.log(`🔧 Socket properties set for ${socket.id}:`);
        console.log(`  - room: ${socket.room}`);
        console.log(`  - userType: ${socket.userType}`);
        console.log(`  - username: ${socket.username}`);
        
        socket.join(room);
        const clients = io.sockets.adapter.rooms.get(room);
        console.log('👥 Room', room, 'now has', clients.size, 'clients');
        
        // Log all clients in the room for debugging
        if (clients) {
            console.log('👥 Clients in room', room, ':');
            clients.forEach(clientId => {
                const clientInfo = userSessions.get(clientId);
                console.log('  - Socket ID:', clientId, 'User:', clientInfo ? `${clientInfo.userType} ${clientInfo.username}` : 'Unknown');
            });
        }
        
        // Update booking attendance when user enters classroom
        await updateBookingAttendance(room, userType, userId, username);
        
        // Send existing chat history to the new user
        if (chatHistory.has(room)) {
            console.log('📜 Sending chat history to client:', chatHistory.get(room).length, 'messages');
            socket.emit('chat-history', chatHistory.get(room));
        } else {
            console.log('📜 No chat history for room:', room);
        }
        
        // Also send a signaling message to indicate teacher presence
        if (userType === 'teacher') {
            const message = {
                id: Date.now() + Math.random(),
                room: room,
                userType: 'teacher',
                type: 'teacher-joined',
                data: { username },
                timestamp: Date.now(),
                createdAt: new Date().toISOString()
            };
            
            if (!signalingMessages.has(room)) {
                signalingMessages.set(room, []);
            }
            signalingMessages.get(room).push(message);
            
            console.log(`👨‍🏫 Teacher joined message stored for room ${room}`);
        }
        
        if (clients.size === 1) {
            console.log('👤 First user in room, emitting joined');
            socket.emit('joined');
        } else if (clients.size === 2) {
            console.log('👥 Second user joined, both users ready for WebRTC');
            // Emit ready to both users in the room
            io.to(room).emit('ready');
            
            // Notify other users in the room that someone joined
            socket.to(room).emit('user-joined', { userType, userId, username, room });
            console.log('📢 Notified room about user join:', username);
        }
    });
    
    socket.on('offer', ({ room, offer }) => {
        console.log('📤 Forwarding offer to room:', room);
        console.log('📤 Offer type:', offer.type);
        console.log('📤 Offer SDP length:', offer.sdp ? offer.sdp.length : 'No SDP');
        console.log('📤 Sender socket ID:', socket.id);
        
        // Get the room to see how many clients are in it
        const clients = io.sockets.adapter.rooms.get(room);
        console.log('📤 Clients in room:', clients ? clients.size : 0);
        
        // Log all clients in the room for debugging
        if (clients) {
            console.log('📤 Clients in room', room, ':');
            clients.forEach(clientId => {
                const clientInfo = userSessions.get(clientId);
                console.log('  - Socket ID:', clientId, 'User:', clientInfo ? `${clientInfo.userType} ${clientInfo.username}` : 'Unknown');
            });
        }
        
        // Check if sender is in the room
        if (clients && clients.has(socket.id)) {
            console.log('📤 Sender is in the room');
        } else {
            console.log('❌ Sender is NOT in the room!');
        }
        
        socket.to(room).emit('offer', { offer });
        console.log('📤 Offer forwarded successfully');
    });

    // Handle room info broadcast for debugging
    socket.on('room-info-broadcast', (data) => {
        console.log('🏠 Room info broadcast received from:', data.userType, data.username);
        console.log('🏠 Room:', data.room);
        console.log('🏠 Socket ID:', data.socketId);
        console.log('🏠 Timestamp:', data.timestamp);
        
        // Broadcast this info to all other users in the same room
        socket.to(data.room).emit('room-info-received', {
            from: data.userType + ' ' + data.username,
            room: data.room,
            socketId: data.socketId,
            timestamp: data.timestamp
        });
    });
    
    socket.on('answer', ({ room, answer }) => {
        console.log('📤 Forwarding answer to room:', room);
        socket.to(room).emit('answer', { answer });
    });
    
    socket.on('ice-candidate', ({ room, candidate }) => {
        console.log('📤 Forwarding ICE candidate to room:', room);
        socket.to(room).emit('ice-candidate', { candidate });
    });

    socket.on('request-ice-restart', ({ room }) => {
        console.log('🔄 ICE restart requested in room:', room);
        socket.to(room).emit('request-ice-restart');
    });
    
    // Handle chat messages
    socket.on('chat-message', (messageData) => {
        const { room, message, username, timestamp } = messageData;
        console.log('💬 Received chat message from', username, 'in room', room, ':', message);
        
        // Store message in chat history
        if (!chatHistory.has(room)) {
            chatHistory.set(room, []);
        }
        
        const roomHistory = chatHistory.get(room);
        roomHistory.push(messageData);
        
        // Keep only last 50 messages to prevent memory issues
        if (roomHistory.length > 50) {
            roomHistory.shift();
        }
        
        // Broadcast message to all users in the room
        const clients = io.sockets.adapter.rooms.get(room);
        console.log('📤 Broadcasting message to', clients ? clients.size : 0, 'clients in room', room);
        io.to(room).emit('chat-message', messageData);
        
        console.log(`Chat message in room ${room}: ${username}: ${message}`);
    });

    // Handle reward giving
    socket.on('give-reward', (rewardData) => {
        const { type, teacherId, studentId, bookingId, reason } = rewardData;
        console.log('🏆 Teacher', teacherId, 'gave', type, 'reward to student', studentId);
        
        // Get user session info to verify it's a teacher
        const userInfo = userSessions.get(socket.id);
        if (!userInfo || userInfo.userType !== 'teacher') {
            console.log('❌ Non-teacher attempted to give reward:', userInfo ? userInfo.userType : 'unknown');
            return;
        }
        
        // Get room from user session
        const room = userInfo.room;
        
        // Broadcast reward to all users in the room
        const clients = io.sockets.adapter.rooms.get(room);
        console.log('🏆 Broadcasting reward to', clients ? clients.size : 0, 'clients in room', room);
        
        // Send reward to all users in the room
        io.to(room).emit('reward-received', {
            type: type,
            teacherId: teacherId,
            studentId: studentId,
            bookingId: bookingId,
            reason: reason,
            timestamp: new Date().toISOString()
        });
        
        // Also add reward as a system message to chat history
        const rewardMessage = {
            username: 'System',
            message: `🏆 Teacher gave a ${type === 'cookie' ? '🍪 Cookie' : '⭐ Star'} reward to the student!`,
            timestamp: new Date().toLocaleTimeString(),
            isReward: true,
            rewardType: type
        };
        
        // Store in chat history
        if (!chatHistory.has(room)) {
            chatHistory.set(room, []);
        }
        const roomHistory = chatHistory.get(room);
        roomHistory.push(rewardMessage);
        
        // Keep only last 50 messages
        if (roomHistory.length > 50) {
            roomHistory.shift();
        }
        
        console.log(`🏆 Reward given in room ${room}: ${teacherId} -> ${studentId} (${type})`);
    });
    
    // Handle student absent notification
    socket.on('student-absent', (data) => {
        const { room, studentId, bookingId } = data;
        console.log('🚫 Student absent notification:', data);
        
        // Get user session info to verify it's a student
        const userInfo = userSessions.get(socket.id);
        if (!userInfo || userInfo.userType !== 'student') {
            console.log('❌ Non-student attempted to send absent notification:', userInfo ? userInfo.userType : 'unknown');
            return;
        }
        
        // Notify teacher about student absence
        socket.to(room).emit('student-absent-notification', {
            studentId: studentId,
            studentName: userInfo.username,
            bookingId: bookingId,
            timestamp: new Date().toISOString()
        });
        
        console.log(`🚫 Student absent notification sent for room ${room}: ${studentId}`);
    });
    
    // Handle typing indicators
    socket.on('typing', (data) => {
        socket.to(data.room).emit('user-typing', data);
    });
    
    socket.on('stop-typing', (data) => {
        socket.to(data.room).emit('user-stop-typing', data);
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Get user info before cleanup
        const userInfo = userSessions.get(socket.id);
        if (userInfo) {
            const { room, userType, username } = userInfo;
            console.log(`👋 ${userType} ${username} left room ${room}`);
            
            // Notify other users in the room that someone left
            socket.to(room).emit('user-left', {
                userType: userType,
                username: username,
                message: `${username} has left the classroom`
            });
            
            // Get updated participant count after user leaves
            const clients = io.sockets.adapter.rooms.get(room);
            const updatedCount = clients ? clients.size - 1 : 0; // Subtract 1 because socket hasn't left yet
            
            // Send updated participant count to remaining users in the room
            if (updatedCount > 0) {
                socket.to(room).emit('room-users', { count: updatedCount });
                console.log('👥 Sent updated participant count after user left:', updatedCount);
            }
        }
        
        // Clean up user session
        userSessions.delete(socket.id);
    });
    
    // Presentation events
    socket.on('presentation-started', (data) => {
        console.log('🎬 Presentation started in room:', data.room);
        socket.to(data.room).emit('presentation-started', {
            slides: data.slides,
            currentSlideIndex: data.currentSlideIndex
        });
    });
    
    socket.on('presentation-slide-changed', (data) => {
        console.log('🎬 Presentation slide changed in room:', data.room);
        socket.to(data.room).emit('presentation-slide-changed', {
            currentSlideIndex: data.currentSlideIndex
        });
    });
    
    socket.on('presentation-ended', (data) => {
        console.log('🎬 Presentation ended in room:', data.room);
        socket.to(data.room).emit('presentation-ended', {});
    });
    
    // Presenter Mode Handlers for PDF synchronization
    socket.on('presenter-mode-start', (data) => {
        const { room } = data;
        console.log('📺 [SERVER] Presenter mode started in room:', room, 'by socket:', socket.id);
        // Broadcast to all students in the room
        socket.to(room).emit('presenter-mode-start', { room });
    });
    
    socket.on('presenter-mode-stop', (data) => {
        const { room } = data;
        console.log('⏹️ [SERVER] Presenter mode stopped in room:', room, 'by socket:', socket.id);
        // Broadcast to all students in the room
        socket.to(room).emit('presenter-mode-stop', { room });
    });
    
    socket.on('presenter-sync-update', (data = {}) => {
        const { room, page, scrollTop, scrollLeft, materialId } = data;
        if (!room) {
            console.warn('⚠️ [SERVER] presenter-sync-update missing room', data);
            return;
        }
        // Forward sync updates to everyone in the room (including sender for visibility)
        io.to(room).emit('presenter-sync-update', data);
        console.log('📄 [SERVER] presenter-sync-update broadcast', {
            room,
            page,
            scrollTop,
            scrollLeft,
            materialId
        });
    });

    // Reward animation handler (teacher sends reward to students)
    socket.on('reward-animation', (data) => {
        const { room, type } = data;
        console.log('🎁 [SERVER] Reward animation received:', type, 'in room:', room, 'from socket:', socket.id);
        // Get user session to verify it's a teacher
        const userInfo = userSessions.get(socket.id);
        console.log('🎁 [SERVER] User info:', userInfo);
        
        if (userInfo && userInfo.userType === 'teacher') {
            // Get all clients in the room
            const clients = io.sockets.adapter.rooms.get(room);
            const clientCount = clients ? clients.size : 0;
            console.log('🎁 [SERVER] Broadcasting reward animation to', clientCount, 'clients in room:', room);
            
            // Log all clients that will receive the event
            if (clients) {
                clients.forEach(clientId => {
                    const clientInfo = userSessions.get(clientId);
                    console.log('  - Broadcasting to:', clientId, 'User:', clientInfo ? `${clientInfo.userType} ${clientInfo.username}` : 'Unknown');
                });
            }
            
            // Broadcast reward animation to ALL users in the room (including sender for consistency)
            io.to(room).emit('reward-animation', { type, room });
            console.log('✅ [SERVER] Reward animation broadcasted to room:', room);
        } else {
            console.warn('⚠️ [SERVER] Non-teacher attempted to send reward animation:', userInfo ? userInfo.userType : 'unknown');
        }
    });

    // Lesson material sharing
    // Helper function to load materials from database
    async function loadLessonMaterialsFromDB(room) {
        try {
            console.log(`📚 [SERVER] Loading lesson materials from DB for room: ${room}`);
            const materials = await LessonMaterial.find({ room }).sort({ uploadedAt: -1 }).lean();
            console.log(`📚 [SERVER] Found ${materials.length} materials in DB for room ${room}`);
            
            const mapped = materials.map(m => ({
                id: m.materialId,
                name: m.name,
                type: m.type,
                size: m.size,
                data: m.data,
                uploader: m.uploader,
                uploadedAt: m.uploadedAt.getTime()
            })).filter(m => {
                // Only include materials with valid data (at least 100 bytes)
                const hasValidData = m.data && m.data.length >= 100;
                if (!hasValidData) {
                    console.warn(`⚠️ [SERVER] Filtering out material ${m.name} - missing or invalid data (length: ${m.data?.length || 0})`);
                }
                return hasValidData;
            });
            
            console.log(`📚 [SERVER] Mapped ${mapped.length} valid materials (filtered ${materials.length - mapped.length} invalid), data present:`, mapped.map(m => ({ name: m.name, hasData: !!m.data, dataLength: m.data?.length })));
            
            return mapped;
        } catch (err) {
            console.error('❌ [SERVER] Error loading lesson materials from DB:', err);
            return [];
        }
    }

    socket.on('lesson-upload', async (data = {}) => {
        try {
            const { room, material } = data;
            if (!room || !material || !material.data) {
                console.warn('⚠️ Invalid lesson-upload request:', { room, hasMaterial: !!material, hasData: !!(material && material.data) });
                return;
            }

            console.log(`📤 [SERVER] ========== lesson-upload RECEIVED ==========`);
            console.log(`📤 [SERVER] Room: "${room}"`);
            console.log(`📤 [SERVER] Material: ${material.name}`);
            console.log(`📤 [SERVER] Type: ${material.type}`);
            console.log(`📤 [SERVER] Data length: ${material.data?.length || 0} bytes`);
            console.log(`📤 [SERVER] Size: ${material.size || 'unknown'} bytes`);

            const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB cap to match Socket.IO buffer size
            if (material.size && material.size > MAX_FILE_SIZE) {
                console.warn(`⚠️ File ${material.name} is too large: ${material.size} bytes (max ${MAX_FILE_SIZE})`);
                socket.emit('lesson-upload-error', {
                    message: `File "${material.name}" is too large to share (max 10 MB). File size: ${(material.size / 1024 / 1024).toFixed(2)} MB`
                });
                return;
            }
            
            // Log file type for debugging
            if (material.type && material.type.includes('pdf')) {
                console.log(`📄 [SERVER] Processing PDF file: ${material.name}, size: ${(material.data?.length || 0) / 1024} KB`);
            }

            const materialId = material.id || material.materialId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
            const uploader = material.uploader || socket.username || 'Unknown';

            // Check if material already exists for this room
            let lessonMaterial;
            const existing = await LessonMaterial.findOne({ room, materialId });
            if (existing) {
                console.log(`📚 Material ${materialId} already exists in room ${room}, updating...`);
                existing.name = material.name || existing.name;
                existing.type = material.type || existing.type;
                existing.size = material.size || existing.size;
                existing.data = material.data;
                existing.uploader = uploader;
                await existing.save();
                lessonMaterial = existing; // Use existing document
                console.log(`💾 [SERVER] Updated lesson material in database:`);
                console.log(`   - Name: ${material.name}`);
                console.log(`   - Room: "${room}"`);
                console.log(`   - Material ID: ${materialId}`);
                console.log(`   - Size: ${material.size || 0} bytes`);
                console.log(`   - Data length: ${material.data?.length || 0} bytes`);
            } else {
                // Save to database
                lessonMaterial = new LessonMaterial({
                    room: room,
                    materialId: materialId,
                    name: material.name || 'Untitled material',
                    type: material.type || 'application/octet-stream',
                    size: material.size || 0,
                    data: material.data,
                    uploader: uploader,
                    uploadedAt: material.uploadedAt ? new Date(material.uploadedAt) : new Date()
                });

                await lessonMaterial.save();
                console.log(`💾 [SERVER] Saved lesson material to database:`);
                console.log(`   - Name: ${material.name}`);
                console.log(`   - Room: "${room}"`);
                console.log(`   - Material ID: ${materialId}`);
                console.log(`   - Size: ${material.size || 0} bytes`);
                console.log(`   - Data length: ${material.data?.length || 0} bytes`);
                
                // Verify the save by checking database
                const verifySave = await LessonMaterial.findOne({ room, materialId });
                if (verifySave) {
                    console.log(`✅ [SERVER] Verified: Material saved successfully in room "${room}"`);
                } else {
                    console.error(`❌ [SERVER] ERROR: Material save verification failed! Material not found in database!`);
                }
            }

            // Also update in-memory cache for quick access
            const entry = {
                id: materialId,
                name: lessonMaterial.name,
                type: lessonMaterial.type,
                size: lessonMaterial.size,
                data: lessonMaterial.data,
                uploader: lessonMaterial.uploader,
                uploadedAt: lessonMaterial.uploadedAt.getTime()
            };

            const materials = lessonMaterialsByRoom.get(room) || [];
            const existingIndex = materials.findIndex(item => item.id === entry.id);
            if (existingIndex >= 0) {
                materials[existingIndex] = entry;
            } else {
                materials.push(entry);
            }
            lessonMaterialsByRoom.set(room, materials);

            // Get all clients in the room to verify broadcast
            const clients = io.sockets.adapter.rooms.get(room);
            const clientCount = clients ? clients.size : 0;
            console.log(`📚 ${entry.name} shared in room ${room} by ${entry.uploader} (${clientCount} clients in room)`);
            
            // Broadcast to all clients in the room (including sender for consistency)
            io.in(room).emit('lesson-uploaded', { material: entry });
            console.log(`📤 Broadcasted lesson-uploaded to room ${room} (${clientCount} clients should receive it)`);
            
            // Also trigger a materials sync for all clients in the room to ensure they have all materials
            const allMaterials = await loadLessonMaterialsFromDB(room);
            
            // Reuse existing clients variable for logging
            console.log(`📚 [SERVER] Broadcasting lesson-materials-sync to room "${room}" with ${allMaterials.length} materials to ${clientCount} clients`);
            
            if (allMaterials.length > 0) {
                console.log(`📚 [SERVER] Materials being broadcasted:`, allMaterials.map(m => ({
                    id: m.id,
                    name: m.name,
                    type: m.type,
                    hasData: !!m.data,
                    dataLength: m.data?.length || 0
                })));
            } else {
                console.warn(`⚠️ [SERVER] WARNING: No materials found for room "${room}"! This means students will receive empty array.`);
                console.log(`💡 [SERVER] Possible reasons:`);
                console.log(`  1. Materials were not saved to database`);
                console.log(`  2. Room ID mismatch (teacher room: "${room}")`);
                console.log(`  3. Database query failed`);
            }
            
            io.in(room).emit('lesson-materials-sync', { materials: allMaterials });
            console.log(`✅ [SERVER] lesson-materials-sync broadcasted to room ${room}`);
        } catch (err) {
            console.error('Error handling lesson-upload:', err);
            socket.emit('lesson-upload-error', {
                message: 'Failed to share lesson material.'
            });
        }
    });

    socket.on('lesson-materials-request', async (data = {}) => {
        try {
            const { room } = data;
            if (!room) {
                console.warn('⚠️ [SERVER] lesson-materials-request: missing room');
                return;
            }
            
            const userInfo = userSessions.get(socket.id);
            const userType = userInfo ? userInfo.userType : 'unknown';
            
            console.log(`📚 [SERVER] ========== lesson-materials-request RECEIVED ==========`);
            console.log(`📚 [SERVER] From: ${socket.id} (${userType})`);
            console.log(`📚 [SERVER] Requested room: "${room}"`);
            
            // Load from database first, then sync cache
            const materials = await loadLessonMaterialsFromDB(room);
            
            console.log(`📚 [SERVER] Loaded ${materials.length} materials from DB for room "${room}"`);
            
            if (materials.length === 0) {
                console.warn(`⚠️ [SERVER] WARNING: No materials found in database for room "${room}"`);
                console.log(`💡 [SERVER] Checking if room exists in database...`);
                
                // Check if any materials exist in database at all
                const allMaterials = await LessonMaterial.find({}).select('room materialId name').limit(5);
                if (allMaterials.length > 0) {
                    console.log(`📚 [SERVER] Found materials in database for these rooms:`, [...new Set(allMaterials.map(m => m.room))]);
                    console.log(`💡 [SERVER] Possible room mismatch! Teacher might be using a different room ID.`);
                } else {
                    console.log(`📚 [SERVER] No materials found in database at all. Teacher may not have uploaded any files yet.`);
                }
            } else {
                console.log(`📚 [SERVER] Materials found:`, materials.map(m => ({
                    id: m.id,
                    name: m.name,
                    type: m.type,
                    hasData: !!m.data,
                    dataLength: m.data?.length || 0
                })));
            }
            
            // Update cache
            if (materials.length > 0) {
                lessonMaterialsByRoom.set(room, materials);
                console.log(`📚 [SERVER] Updated cache for room ${room} with ${materials.length} materials`);
            }
            
            socket.emit('lesson-materials-sync', { materials });
            console.log(`✅ [SERVER] Sent ${materials.length} lesson materials to ${socket.id} (${userType}) for room "${room}"`);
        } catch (err) {
            console.error('❌ [SERVER] Error handling lesson-materials-request:', err);
            // Fallback to cache if DB fails
            const materials = lessonMaterialsByRoom.get(data.room) || [];
            console.log(`📚 [SERVER] Using cache fallback: ${materials.length} materials`);
            socket.emit('lesson-materials-sync', { materials });
        }
    });

    // Handle lesson file selection (teacher selects a file to display)
    socket.on('lesson-file-select', (data = {}) => {
        try {
            const { room, materialId, material } = data;
            if (!room) {
                console.warn('⚠️ [SERVER] lesson-file-select: missing room');
                return;
            }
            
            // Get sender info
            const senderInfo = userSessions.get(socket.id);
            const senderType = senderInfo ? senderInfo.userType : 'unknown';
            
            // Get all clients in the room to verify broadcast
            const clients = io.sockets.adapter.rooms.get(room);
            const clientCount = clients ? clients.size : 0;
            
            console.log(`📚 [SERVER] ========== lesson-file-select RECEIVED ==========`);
            console.log(`📚 [SERVER] From: ${socket.id} (${senderType})`);
            console.log(`📚 [SERVER] Room: ${room}`);
            console.log(`📚 [SERVER] Material: ${material ? material.name : 'clear'}`);
            console.log(`📚 [SERVER] Material data:`, { 
                hasMaterial: !!material, 
                hasId: !!(material?.id), 
                hasData: !!(material?.data),
                dataLength: material?.data?.length || 0,
                materialName: material?.name,
                materialId: material?.id
            });
            
            // List all clients in the room
            if (clients && clients.size > 0) {
                console.log(`📚 [SERVER] Clients in room ${room} (${clientCount} total):`);
                clients.forEach(clientId => {
                    const clientInfo = userSessions.get(clientId);
                    console.log(`  - ${clientId}: ${clientInfo ? `${clientInfo.userType} ${clientInfo.username}` : 'Unknown'}`);
                });
            } else {
                console.warn(`⚠️ [SERVER] No clients found in room ${room}!`);
            }
            
            // Check if material data is within size limits (base64 encoded can be larger)
            const dataSize = material?.data?.length || 0;
            const maxDataSize = 15 * 1024 * 1024; // 15 MB (accounts for base64 encoding)
            
            if (material && dataSize > maxDataSize) {
                console.error(`❌ [SERVER] Material data too large: ${(dataSize / 1024 / 1024).toFixed(2)} MB (max ${maxDataSize / 1024 / 1024} MB)`);
                socket.emit('lesson-upload-error', {
                    message: `File "${material.name}" is too large to share. Please compress it or use a smaller file.`
                });
                return;
            }
            
            // Broadcast to all clients in the room (including sender for consistency)
            io.in(room).emit('lesson-file-select', { materialId, material });
            console.log(`✅ [SERVER] lesson-file-select broadcasted to ${clientCount} clients in room ${room}, data size: ${(dataSize / 1024 / 1024).toFixed(2)} MB`);
        } catch (err) {
            console.error('❌ [SERVER] Error handling lesson-file-select:', err);
        }
    });

    // Handle PDF navigation synchronization (teacher scrolls/changes pages)
    socket.on('pdf-navigation', (data = {}) => {
        try {
            const { room, scrollTop, scrollLeft, page, materialId } = data;
            if (!room) {
                console.warn('⚠️ [SERVER] pdf-navigation: missing room');
                return;
            }
            
            const senderInfo = userSessions.get(socket.id);
            const senderType = senderInfo ? senderInfo.userType : 'unknown';
            
            // Only teachers can control navigation
            if (senderType !== 'teacher') {
                console.warn('⚠️ [SERVER] pdf-navigation: only teachers can control navigation');
                return;
            }
            
            // Forward to all students in the room (but not back to teacher)
            socket.to(room).emit('pdf-navigation', { scrollTop, scrollLeft, page, materialId });
            console.log(`📄 [SERVER] PDF navigation forwarded from teacher to students in room ${room}`, { scrollTop, scrollLeft, page, materialId });
        } catch (err) {
            console.error('❌ [SERVER] Error handling pdf-navigation:', err);
        }
    });

  // Whiteboard / Annotation forwarding
  socket.on('whiteboard-draw', (data) => {
    try {
      const { room } = data || {};
      if (!room) return;
      // Forward to other clients in the room
      socket.to(room).emit('whiteboard-draw', data);
    } catch (err) {
      console.error('Error forwarding whiteboard-draw:', err);
    }
  });

  socket.on('whiteboard-clear', (data) => {
    try {
      const { room } = data || {};
      if (!room) return;
      socket.to(room).emit('whiteboard-clear', data);
    } catch (err) {
      console.error('Error forwarding whiteboard-clear:', err);
    }
  });

  // Teacher can enable/disable annotations for students
  socket.on('annotation-enable', (data) => {
    try {
      const { room } = data || {};
      if (!room) return;
      socket.to(room).emit('annotation-enable', data);
    } catch (err) {
      console.error('Error forwarding annotation-enable:', err);
    }
  });

  socket.on('annotation-disable', (data) => {
    try {
      const { room } = data || {};
      if (!room) return;
      socket.to(room).emit('annotation-disable', data);
    } catch (err) {
      console.error('Error forwarding annotation-disable:', err);
    }
  });

  // Optional: send a full annotation snapshot (base64/png) to sync late joiners
  socket.on('annotation-sync', (data) => {
    try {
      const { room } = data || {};
      if (!room) return;
      socket.to(room).emit('annotation-sync', data);
    } catch (err) {
      console.error('Error forwarding annotation-sync:', err);
    }
  });
});

// Function to check and mark absent students
async function checkAndMarkAbsentStudents() {
  try {
    // Check if database is connected before attempting queries
    if (db.readyState !== 1) {
      console.warn('⚠️  Database not connected, skipping absent student check');
      return;
    }
    
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    // Find all booked classes for today
    const todayBookings = await Booking.find({
      status: 'booked',
      date: today
    });
    
    console.log(`🔍 Checking ${todayBookings.length} bookings for absent students...`);
    
    for (const booking of todayBookings) {
      if (!booking.time) continue;
      
      // Parse the class start time
      const [hours, minutes] = booking.time.split(':').map(Number);
      const classStartTime = new Date(today);
      classStartTime.setHours(hours, minutes, 0, 0);
      
      // Calculate 15 minutes after class start
      const absentDeadline = new Date(classStartTime.getTime() + 15 * 60 * 1000);
      
      // If it's past the 15-minute deadline and student hasn't entered
      if (now > absentDeadline && !booking.attendance?.studentEntered) {
        console.log(`🚫 Marking student as absent for booking ${booking._id} (class started at ${booking.time})`);
        
        booking.status = 'absent';
        booking.absentReason = 'Student did not enter classroom within 15 minutes of class start';
        booking.absentMarkedAt = new Date();
        
        await booking.save();
        console.log(`✅ Student marked as absent for booking ${booking._id}`);
      }
    }
  } catch (error) {
    console.error('❌ Error checking for absent students:', error);
  }
}

// Function to update booking attendance when user enters classroom
async function updateBookingAttendance(room, userType, userId, username) {
    try {
        // Check if database is connected before attempting queries
        if (db.readyState !== 1) {
            console.warn(`⚠️  Database not connected, skipping attendance update for ${userType} ${username} in room ${room}`);
            return;
        }
        
        console.log(`📊 Updating attendance for ${userType} ${username} in room ${room}`);
        
        // Find the booking by classroomId
        const booking = await Booking.findOne({ classroomId: room });
        if (!booking) {
            console.log(`❌ No booking found for classroom ${room}`);
            return;
        }
        
        const now = new Date();
        
        if (userType === 'teacher') {
            // Update teacher attendance
            if (!booking.attendance.teacherEntered) {
                booking.attendance.teacherEntered = true;
                booking.attendance.teacherEnteredAt = now;
                console.log(`✅ Teacher ${username} entered classroom at ${now.toLocaleTimeString()}`);
            }
        } else if (userType === 'student') {
            // Update student attendance
            if (!booking.attendance.studentEntered) {
                booking.attendance.studentEntered = true;
                booking.attendance.studentEnteredAt = now;
                console.log(`✅ Student ${username} entered classroom at ${now.toLocaleTimeString()}`);
            }
        }
        
        // Save the updated booking
        await booking.save();
        console.log(`💾 Updated attendance for booking ${booking._id}`);
        
    } catch (error) {
        console.error('❌ Error updating booking attendance:', error);
    }
}

// Cleanup job: Delete expired lesson materials (runs every hour)
async function cleanupExpiredMaterials() {
    try {
        const result = await LessonMaterial.deleteMany({
            expiresAt: { $lt: new Date() }
        });
        if (result.deletedCount > 0) {
            console.log(`🧹 Cleaned up ${result.deletedCount} expired lesson materials`);
        }
    } catch (err) {
        console.error('Error cleaning up expired materials:', err);
    }
}

// Run cleanup after database is connected (not at startup to avoid blocking)
// This will be scheduled after DB connection in startServer()
let cleanupInterval = null;


// Start server - listen immediately, connect DB in background
const startServer = () => {
  try {
    console.log(`🔧 Starting server on port ${PORT}...`);
    console.log(`📦 Environment: PORT=${PORT}, NODE_ENV=${process.env.NODE_ENV || 'not set'}`);
    
    // You MUST listen on 0.0.0.0 (not localhost or 127.0.0.1)
    // Start listening IMMEDIATELY - don't wait for anything
    console.log(`🌐 Attempting to listen on 0.0.0.0:${PORT}...`);
    
    // Start listening FIRST - this is critical for Cloud Run health checks
    http.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server is live on port ${PORT}`);
      console.log(`🌐 Listening on 0.0.0.0:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
      console.log(`🔗 API base: http://localhost:${PORT}/api`);
      console.log(`🔌 Socket.IO signaling server running on 0.0.0.0:${PORT}`);
      
      // Now that server is listening, do other initialization
      // Verify Cloudmersive API key configuration
      const cloudmersiveKey = process.env.CLOUDMERSIVE_API_KEY;
      if (cloudmersiveKey && cloudmersiveKey.trim() && cloudmersiveKey !== 'your-api-key-here') {
        const cleanKey = cloudmersiveKey.trim().replace(/^["']|["']$/g, '');
        console.log(`✅ Cloudmersive API key configured (${cleanKey.length} chars, starts with: ${cleanKey.substring(0, 8)}...)`);
      } else {
        console.warn(`⚠️  Cloudmersive API key not configured. PPTX conversion will fail. Set CLOUDMERSIVE_API_KEY in .env file.`);
      }
      
      // Connect to database in background (non-blocking)
      connectDB().then((connected) => {
        if (connected) {
          // Start periodic check for absent students (every minute) only if DB connected
          setInterval(checkAndMarkAbsentStudents, 60 * 1000);
          console.log(`⏰ Absent student check scheduled (every minute)`);
          
          // Run initial check for any students who should already be marked as absent
          setTimeout(checkAndMarkAbsentStudents, 5000); // Run after 5 seconds
          console.log(`⏰ Initial absent student check scheduled (in 5 seconds)`);
          
          // Schedule cleanup jobs only after DB is connected
          cleanupExpiredMaterials(); // Run once immediately
          cleanupInterval = setInterval(cleanupExpiredMaterials, 60 * 60 * 1000); // Every hour
          console.log(`🧹 Cleanup jobs scheduled (every hour)`);

          try {
            if (typeof classroomRecordingRouter.purgeExpiredClassroomRecordings === 'function') {
              // How long files stay before expiresAt (see CLASSROOM_RECORDING_RETENTION_DAYS in classroomRecordingApi).
              // How often we *scan* for expired rows (not daily — default weekly).
              const purgeEveryDays = Math.max(
                1,
                Number(process.env.CLASSROOM_RECORDING_PURGE_INTERVAL_DAYS || 7)
              );
              const purgeMs = purgeEveryDays * 24 * 60 * 60 * 1000;
              classroomRecordingRouter.purgeExpiredClassroomRecordings();
              setInterval(() => {
                classroomRecordingRouter.purgeExpiredClassroomRecordings().catch((e) =>
                  console.warn('Classroom recording purge:', e.message)
                );
              }, purgeMs);
              console.log(
                `🧹 Classroom QA recording purge scheduled (every ${purgeEveryDays} day(s), not daily)`
              );
            }
          } catch (e) {
            console.warn('Classroom recording purge init:', e.message);
          }
          
        }
      }).catch((err) => {
        console.error('❌ Database connection failed in background:', err.message);
      });
    }).on('error', (err) => {
      console.error(`❌ Failed to start server on port ${PORT}:`, err);
      console.error(`Error code: ${err.code}, Error message: ${err.message}`);
      if (err.code === 'EADDRINUSE') {
        console.error(`⚠️  Port ${PORT} is already in use.`);
      } else if (err.code === 'EACCES') {
        console.error(`⚠️  Permission denied. Cannot bind to port ${PORT}.`);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
};

// Handle uncaught exceptions to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  console.error('Stack:', error.stack);
  // Don't exit - let the server try to continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - let the server try to continue
});

// Start the server immediately - wrap in try-catch to catch any startup errors
console.log('🚀 Initializing RemoEdPH server...');
console.log(`📦 Node version: ${process.version}`);
console.log(`📦 Platform: ${process.platform}`);

try {
  startServer();
} catch (error) {
  console.error('❌ CRITICAL: Failed to initialize server:', error);
  console.error('Stack trace:', error.stack);
  // Try to start a minimal server anyway
  try {
    const minimalApp = require('express')();
    minimalApp.get('/', (req, res) => {
      res.json({ error: 'Server initialization failed', message: error.message });
    });
    const minimalHttp = require('http').createServer(minimalApp);
    minimalHttp.listen(PORT, '0.0.0.0', () => {
      console.log(`⚠️  Minimal error server started on port ${PORT} for debugging`);
    });
  } catch (minimalError) {
    console.error('❌ Even minimal server failed:', minimalError);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  try {
    await db.close();
    console.log('📊 Database connection closed.');
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server...');
  try {
    await db.close();
    console.log('📊 Database connection closed.');
  } catch (error) {
    console.error('Error closing database connection:', error);
  }
  process.exit(0);
});

module.exports = { app, io };
