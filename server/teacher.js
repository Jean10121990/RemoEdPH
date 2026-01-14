const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const libre = require('libreoffice-convert');
const { fromPath: pdf2picFromPath } = require('pdf2pic');
const FormData = require('form-data');
const AdmZip = require('adm-zip');
const axios = require('axios');
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');
const TeacherSlot = require('./models/TeacherSlot');
const Booking = require('./models/Booking');
const Notification = require('./models/Notification');
const TimeLog = require('./models/TimeLog');
const CancellationRequest = require('./models/CancellationRequest');
const Reward = require('./models/Reward');
// LessonSlides model removed - PPTX conversion still works but slides are not saved to database
const Feedback = require('./models/Feedback');
const IssueReport = require('./models/IssueReport');
const { verifyToken, requireTeacher, requireStudent, requireOwnTeacherData, requireOwnStudentData, logAccess } = require('./authMiddleware');
const { io } = require('./index');

// Promisify libreoffice-convert
const libreConvertAsync = (inputBuffer, format) => new Promise((resolve, reject) => {
  libre.convert(inputBuffer, format, undefined, (err, done) => {
    if (err) return reject(err);
    resolve(done);
  });
});

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

// Convert PPTX -> PDF -> slide images (JPG) for web
async function convertPptxToSlides({ sourcePath, bookingId }) {
  const uploadBase = path.join(__dirname, '../uploads/slides', bookingId || 'general');
  await ensureDir(uploadBase);

  const pptBuffer = await fsp.readFile(sourcePath);
  const pdfBuffer = await libreConvertAsync(pptBuffer, '.pdf');

  const pdfPath = path.join(uploadBase, `converted-${Date.now()}.pdf`);
  await fsp.writeFile(pdfPath, pdfBuffer);

  // Convert PDF pages to images
  const converter = pdf2picFromPath(pdfPath, {
    density: 150,
    format: 'jpg',
    quality: 80,
    savePath: uploadBase,
    saveFilename: 'slide'
  });

  const results = await converter.bulk(-1, true); // all pages

  // Map to slide objects
  const slides = results.map((result, index) => {
    const filename = path.basename(result.path);
    return {
      slideNumber: index + 1,
      imageUrl: `/uploads/slides/${bookingId || 'general'}/${filename}`,
      originalFile: `/uploads/slides/${bookingId || 'general'}/${filename}`,
      fileName: filename,
      fileType: 'image',
      title: `Slide ${index + 1}`,
      notes: '',
      needsConversion: false
    };
  });

  return {
    slides,
    pdfPath
  };
}

// Convert PPTX via Cloudmersive API -> slide images (no local LibreOffice/Poppler needed)
async function convertPptxViaCloudmersive({ sourcePath, bookingId, fileName }) {
  const apiKey = process.env.CLOUDMERSIVE_API_KEY;
  if (!apiKey || apiKey.trim() === '' || apiKey === 'your-api-key-here') {
    throw new Error('CLOUDMERSIVE_API_KEY not set or invalid. Please set a valid API key in your .env file.');
  }
  
  // Validate API key format (Cloudmersive keys are typically UUIDs or long strings)
  const trimmedKey = apiKey.trim();
  if (trimmedKey.length < 20) {
    console.warn('⚠️ Cloudmersive API key seems too short. Please verify your API key.');
  }
  
  console.log('🔑 Using Cloudmersive API key (first 10 chars):', trimmedKey.substring(0, 10) + '...');

  const uploadBase = path.join(__dirname, '../uploads/slides', bookingId || 'general');
  await ensureDir(uploadBase);

  const form = new FormData();
  form.append('file', fs.createReadStream(sourcePath), {
    filename: fileName || path.basename(sourcePath)
  });

  // Endpoint: https://api.cloudmersive.com/convert/pptx/to/png
  const url = 'https://api.cloudmersive.com/convert/pptx/to/png';
  
  console.log('📤 Sending PPTX to Cloudmersive API:', {
    url,
    fileName: fileName || path.basename(sourcePath),
    fileSize: fs.statSync(sourcePath).size
  });

  let response;
  try {
    response = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        'Apikey': apiKey.trim() // Ensure no whitespace
      },
      responseType: 'arraybuffer',
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 180000
    });
  } catch (error) {
    // Better error handling for API responses
    if (error.response) {
      const errorData = error.response.data;
      let errorMessage = 'Cloudmersive API error';
      
      // Try to parse error message from response
      if (Buffer.isBuffer(errorData)) {
        try {
          const errorText = errorData.toString('utf-8');
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.Message || errorJson.message || errorText;
        } catch (e) {
          errorMessage = errorData.toString('utf-8') || `HTTP ${error.response.status}`;
        }
      } else if (typeof errorData === 'object') {
        errorMessage = errorData.Message || errorData.message || JSON.stringify(errorData);
      }
      
      console.error('❌ Cloudmersive API error:', {
        status: error.response.status,
        statusText: error.response.statusText,
        message: errorMessage,
        headers: error.response.headers
      });
      
      throw new Error(`Cloudmersive API error (${error.response.status}): ${errorMessage}`);
    }
    throw error;
  }

  // Response is a zip containing PNGs
  const zip = new AdmZip(response.data);
  const entries = zip
    .getEntries()
    .filter(e => !e.isDirectory)
    .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true, sensitivity: 'base' }));

  const slides = [];
  entries.forEach((entry, idx) => {
    const filename = `slide-${idx + 1}.png`;
    const outPath = path.join(uploadBase, filename);
    fs.writeFileSync(outPath, entry.getData());
    slides.push({
      slideNumber: idx + 1,
      imageUrl: `/uploads/slides/${bookingId || 'general'}/${filename}`,
      originalFile: `/uploads/slides/${bookingId || 'general'}/${filename}`,
      fileName: filename,
      fileType: 'image',
      title: `Slide ${idx + 1}`,
      notes: '',
      needsConversion: false
    });
  });

  return { slides };
}

// Helper function to create notifications
async function createNotification(teacherId, type, message) {
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

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/slides');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['.ppt', '.pptx', '.pdf', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PowerPoint, PDF, and image files are allowed.'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Test route to verify teacher routes are working
router.get('/test', (req, res) => {
  res.json({ message: 'Teacher routes are working!' });
});

// Convert PPTX (base64) to slides and persist for booking
router.post('/convert-pptx-base64', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { bookingId, fileName, data } = req.body || {};
    if (!data || !fileName || !bookingId) {
      return res.status(400).json({ success: false, error: 'Missing bookingId, fileName or data' });
    }

    // Decode base64 data URL
    const base64Match = data.match(/^data:.*;base64,(.*)$/);
    const base64String = base64Match ? base64Match[1] : data;
    const buffer = Buffer.from(base64String, 'base64');

    const uploadDir = path.join(__dirname, '../uploads/slides', bookingId);
    await ensureDir(uploadDir);
    const pptxPath = path.join(uploadDir, `${Date.now()}-${fileName.replace(/\s+/g, '-')}`);
    await fsp.writeFile(pptxPath, buffer);

    const { slides } = await convertPptxToSlides({ sourcePath: pptxPath, bookingId });

    // LessonSlides collection removed - slides are no longer saved to database
    console.log(`⚠️ LessonSlides collection removed - slides processed but not saved to database for booking ${bookingId}`);

    res.json({
      success: true,
      slides,
      totalSlides: slides.length,
      message: 'PPTX converted to slides'
    });
  } catch (err) {
    console.error('❌ PPTX base64 conversion failed:', err);
    res.status(500).json({ success: false, error: 'Conversion failed: ' + err.message });
  }
});

// Convert PPTX using Cloudmersive (no local tools)
router.post('/convert-pptx-cloud', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { bookingId, fileName, data } = req.body || {};
    if (!data || !fileName || !bookingId) {
      return res.status(400).json({ success: false, error: 'Missing bookingId, fileName or data' });
    }

    // Decode base64 data URL
    const base64Match = data.match(/^data:.*;base64,(.*)$/);
    const base64String = base64Match ? base64Match[1] : data;
    const buffer = Buffer.from(base64String, 'base64');

    const uploadDir = path.join(__dirname, '../uploads/slides', bookingId);
    await ensureDir(uploadDir);
    const pptxPath = path.join(uploadDir, `${Date.now()}-${fileName.replace(/\s+/g, '-')}`);
    await fsp.writeFile(pptxPath, buffer);

    const { slides } = await convertPptxViaCloudmersive({
      sourcePath: pptxPath,
      bookingId,
      fileName
    });

    // LessonSlides collection removed - slides are no longer saved to database
    console.log(`⚠️ LessonSlides collection removed - slides processed but not saved to database for booking ${bookingId}`);

    res.json({
      success: true,
      slides,
      totalSlides: slides.length,
      message: 'PPTX converted to slides via Cloudmersive'
    });
  } catch (err) {
    console.error('❌ PPTX cloud conversion failed:', err);
    res.status(500).json({ success: false, error: 'Cloud conversion failed: ' + err.message });
  }
});

// Timezone debug endpoint
router.get('/timezone-debug', (req, res) => {
  const now = new Date();
  const serverInfo = {
    serverTime: now.toISOString(),
    serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    serverTimezoneOffset: now.getTimezoneOffset(),
    serverDate: now.toISOString().split('T')[0],
    serverLocalDate: now.toLocaleDateString('en-CA'),
    serverLocalTime: now.toLocaleTimeString(),
    serverLocalDateTime: now.toLocaleString()
  };
  
  res.json({
    message: 'Timezone debug information',
    server: serverInfo,
    requestHeaders: req.headers,
    queryParams: req.query
  });
});

// Dashboard statistics endpoint
router.get('/dashboard-stats', verifyToken, async (req, res) => {
  try {
    const teacherId = req.query.teacherId;
    if (!teacherId) {
      return res.status(400).json({ error: 'Teacher ID is required' });
    }

    // Get current date and last month for comparison
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get all bookings for this teacher
    const allBookings = await Booking.find({ teacherId });
    console.log('📊 Dashboard Stats - All bookings found:', allBookings.length);
    
    // Get teacher's payment history for actual revenue
    const teacher = await Teacher.findOne({ teacherId });
    console.log('📊 Dashboard Stats - Teacher found:', !!teacher);
    
    const paymentHistory = teacher?.paymentHistory || [];
    console.log('📊 Dashboard Stats - Payment history records:', paymentHistory.length);
    console.log('📊 Dashboard Stats - Payment history structure:', JSON.stringify(paymentHistory, null, 2));
    
    // Calculate total revenue from actual payments received
    const totalRevenue = paymentHistory
      .filter(payment => {
        const status = payment?.status;
        const isValidStatus = status === 'Success' || status === 'Paid';
        console.log(`📊 Dashboard Stats - Payment status check: ${status} -> ${isValidStatus}`);
        return isValidStatus;
      })
      .reduce((sum, payment) => {
        const amount = payment?.amount || 0;
        const paymentId = payment?._id || 'unknown';
        console.log(`📊 Dashboard Stats - Payment ${paymentId}: amount=${amount}, status=${payment?.status}`);
        return sum + amount;
      }, 0);
    console.log('📊 Dashboard Stats - Total revenue calculated:', totalRevenue);

    // Calculate total classes booked
    const totalClasses = allBookings.length;
    console.log('📊 Dashboard Stats - Total classes booked:', totalClasses);

    // Calculate total cancellations
    const totalCancellations = allBookings.filter(booking => booking.status === 'cancelled').length;
    console.log('📊 Dashboard Stats - Total cancellations:', totalCancellations);

    // Calculate total stars received (from Feedback model, not bookings)
    const completedBookings = allBookings.filter(booking => booking.status === 'completed');
    const completedBookingIds = completedBookings.map(b => b._id.toString());
    
    // Get all feedback for this teacher's completed bookings
    const allFeedback = await Feedback.find({ 
      bookingId: { $in: completedBookingIds },
      teacherId: teacherId 
    });
    
    console.log('📊 Dashboard Stats - Completed bookings:', completedBookings.length);
    console.log('📊 Dashboard Stats - Feedback found:', allFeedback.length);
    
    const totalStars = allFeedback.reduce((sum, feedback) => {
      const rating = feedback.rating || 0;
      console.log(`📊 Dashboard Stats - Feedback ${feedback._id}: rating=${rating}`);
      return sum + rating;
    }, 0);
    console.log('📊 Dashboard Stats - Total stars calculated:', totalStars);

    // Calculate average rating from feedback
    const averageRating = allFeedback.length > 0 ? 
      Math.round((totalStars / allFeedback.length) * 10) / 10 : 0;
    console.log('📊 Dashboard Stats - Average rating calculated:', averageRating);

    // Calculate pending payments (payments with status other than Success/Paid)
    const pendingPayments = paymentHistory
      .filter(payment => {
        const status = payment?.status;
        const isPending = status !== 'Success' && status !== 'Paid' && status !== undefined;
        console.log(`📊 Dashboard Stats - Payment status check for pending: ${status} -> ${isPending}`);
        return isPending;
      })
      .reduce((sum, payment) => {
        const amount = payment?.amount || 0;
        console.log(`📊 Dashboard Stats - Pending payment amount: ${amount}`);
        return sum + amount;
      }, 0);
    console.log('📊 Dashboard Stats - Pending payments calculated:', pendingPayments);

    // Calculate monthly changes
    const currentMonthBookings = allBookings.filter(booking => 
      new Date(booking.date) >= currentMonth
    );
    const lastMonthBookings = allBookings.filter(booking => 
      new Date(booking.date) >= lastMonth && new Date(booking.date) < currentMonth
    );
    
    console.log('📊 Dashboard Stats - Current month bookings:', currentMonthBookings.length);
    console.log('📊 Dashboard Stats - Last month bookings:', lastMonthBookings.length);

    // Calculate monthly revenue from actual payments
    const currentMonthRevenue = paymentHistory
      .filter(payment => {
        try {
          const paymentDate = new Date(payment?.issueDate);
          const status = payment?.status;
          const isValidStatus = status === 'Success' || status === 'Paid';
          const isCurrentMonth = paymentDate >= currentMonth;
          console.log(`📊 Dashboard Stats - Current month payment check: date=${payment?.issueDate}, status=${status}, isCurrentMonth=${isCurrentMonth}, isValidStatus=${isValidStatus}`);
          return isCurrentMonth && isValidStatus;
        } catch (error) {
          console.log(`📊 Dashboard Stats - Error processing payment for current month:`, error);
          return false;
        }
      })
      .reduce((sum, payment) => sum + (payment?.amount || 0), 0);
    
    const lastMonthRevenue = paymentHistory
      .filter(payment => {
        try {
          const paymentDate = new Date(payment?.issueDate);
          const status = payment?.status;
          const isValidStatus = status === 'Success' || status === 'Paid';
          const isLastMonth = paymentDate >= lastMonth && paymentDate < currentMonth;
          console.log(`📊 Dashboard Stats - Last month payment check: date=${payment?.issueDate}, status=${status}, isLastMonth=${isLastMonth}, isValidStatus=${isValidStatus}`);
          return isLastMonth && isValidStatus;
        } catch (error) {
          console.log(`📊 Dashboard Stats - Error processing payment for last month:`, error);
          return false;
        }
      })
      .reduce((sum, payment) => sum + (payment?.amount || 0), 0);
    
    console.log('📊 Dashboard Stats - Current month revenue:', currentMonthRevenue);
    console.log('📊 Dashboard Stats - Last month revenue:', lastMonthRevenue);

    const revenueChange = lastMonthRevenue > 0 ? 
      Math.round(((currentMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;

    const classesChange = lastMonthBookings.length > 0 ? 
      Math.round(((currentMonthBookings.length - lastMonthBookings.length) / lastMonthBookings.length) * 100) : 0;

    const cancellationsChange = lastMonthBookings.filter(b => b.status === 'cancelled').length > 0 ? 
      Math.round(((currentMonthBookings.filter(b => b.status === 'cancelled').length - lastMonthBookings.filter(b => b.status === 'cancelled').length) / lastMonthBookings.filter(b => b.status === 'cancelled').length) * 100) : 0;

    // Calculate stars change from feedback
    const currentMonthCompletedIds = currentMonthBookings.filter(b => b.status === 'completed').map(b => b._id.toString());
    const lastMonthCompletedIds = lastMonthBookings.filter(b => b.status === 'completed').map(b => b._id.toString());
    
    const currentMonthFeedback = await Feedback.find({ 
      bookingId: { $in: currentMonthCompletedIds },
      teacherId: teacherId 
    });
    const lastMonthFeedback = await Feedback.find({ 
      bookingId: { $in: lastMonthCompletedIds },
      teacherId: teacherId 
    });
    
    const currentMonthStars = currentMonthFeedback.reduce((sum, f) => sum + (f.rating || 0), 0);
    const lastMonthStars = lastMonthFeedback.reduce((sum, f) => sum + (f.rating || 0), 0);
    
    const starsChange = lastMonthStars > 0 ? 
      Math.round(((currentMonthStars - lastMonthStars) / lastMonthStars) * 100) : 0;
    
    console.log('📊 Dashboard Stats - Changes calculated:', {
      revenueChange,
      classesChange,
      cancellationsChange,
      starsChange
    });

    const responseData = {
      totalRevenue,
      totalClasses,
      totalCancellations,
      totalStars,
      averageRating,
      pendingPayments,
      revenueChange,
      classesChange,
      cancellationsChange,
      starsChange
    };
    
    console.log('📊 Dashboard Stats - Final response data:', responseData);
    
    res.json(responseData);

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// Mark individual notification as read
router.patch('/notifications/:notificationId/mark-read', verifyToken, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    // Try multiple ways to get teacher ID
    let teacherId = req.user.teacherId || req.user.id || req.user._id;
    
    // If we still don't have a teacher ID, try to get it from the query parameter
    if (!teacherId) {
      teacherId = req.query.teacherId;
    }

    console.log('🔔 Mark notification as read request:', {
      notificationId,
      teacherId,
      user: req.user
    });

    if (!notificationId) {
      return res.status(400).json({ error: 'Notification ID is required' });
    }

    if (!teacherId) {
      return res.status(400).json({ error: 'Teacher ID is required' });
    }

    // First, let's find the notification to see what teacherId it has
    const existingNotification = await Notification.findById(notificationId);
    console.log('🔔 Existing notification:', existingNotification);

    if (!existingNotification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Update the notification - try with the stored teacherId first
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, teacherId: existingNotification.teacherId },
      { read: true },
      { new: true }
    );

    console.log('🔔 Notification update result:', notification);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found or access denied' });
    }

    res.json({ success: true, notification });

  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Simple test route for booking data
router.get('/booking-test/:classroomId', async (req, res) => {
  try {
    const { classroomId } = req.params;
    console.log('🔍 Test route: Looking for classroomId:', classroomId);
    
    const booking = await Booking.findOne({ classroomId });
    console.log('🔍 Test route: Booking found:', booking ? 'YES' : 'NO');
    
    if (booking) {
      // Get student information - studentId is stored as username/email string
      const student = await Student.findOne({ 
        $or: [
          { username: booking.studentId },
          { email: booking.studentId }
        ]
      });
      console.log('🔍 Test route: Student found:', student ? 'YES' : 'NO');
      console.log('🔍 Test route: Student data:', student ? {
        firstName: student.firstName,
        lastName: student.lastName,
        username: student.username
      } : 'No student data');
      
      let studentName = 'Unknown Student';
      if (student) {
        if (student.firstName) {
          studentName = student.firstName;
        } else if (student.username) {
          studentName = student.username;
        }
      }
      
      // Get teacher information
      const teacher = await Teacher.findOne({ teacherId: booking.teacherId });
      console.log('🔍 Test route: Teacher found:', teacher ? 'YES' : 'NO');
      console.log('🔍 Test route: Teacher data:', teacher ? {
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        username: teacher.username
      } : 'No teacher data');
      
      let teacherName = 'Unknown Teacher';
      if (teacher) {
        if (teacher.firstName) {
          teacherName = teacher.firstName;
        } else if (teacher.username) {
          teacherName = teacher.username;
        }
      }
      
      console.log('🔍 Test route: Final names - Student:', studentName, 'Teacher:', teacherName);
      
      res.json({ 
        success: true, 
        booking: {
          classroomId: booking.classroomId,
          date: booking.date,
          time: booking.time,
          lesson: booking.lesson,
          studentLevel: booking.studentLevel,
          studentName: studentName,
          teacherName: teacherName
        }
      });
    } else {
      res.json({ success: false, message: 'No booking found' });
    }
  } catch (err) {
    console.error('❌ Test route error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Save open slots - Protected: Only authenticated teachers can access their own data
router.post('/open-slot', async (req, res) => {
  try {
    console.log('Received request body:', req.body); // Debug log
    const { teacherId, slots } = req.body; // slots: [{ date, time }]
    
    console.log('Teacher ID from request:', teacherId); // Debug log
    console.log('Slots data:', slots); // Debug log
    
    if (!Array.isArray(slots)) {
      console.log('Slots is not an array:', typeof slots, slots); // Debug log
      return res.status(400).json({ error: 'Missing slots data' });
    }

    if (!teacherId) {
      return res.status(400).json({ error: 'Missing teacher ID' });
    }

    if (slots.length === 0) {
      return res.status(400).json({ error: 'No slots selected' });
    }

    // Convert email to teacher ObjectId
    let actualTeacherId = teacherId;
    if (teacherId.includes('@')) {
      const teacher = await Teacher.findOne({ 
        $or: [
          { email: teacherId },
          { username: teacherId }
        ]
      });
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }
      actualTeacherId = teacher._id;
      console.log('Converted email to teacher ObjectId:', actualTeacherId);
    }

    // Remove existing OPEN slots for this teacher on these dates/times
    // Note: This only affects TeacherSlot (open slots), not Booking (finished/absent classes)
    const slotConditions = slots.map(s => ({ teacherId: actualTeacherId, date: s.date, time: s.time }));
    console.log('Slot conditions for deletion:', slotConditions);
    
    // First, get all existing slots for this teacher in the date range to ensure we remove everything
    const weekStart = new Date(slots[0].date);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    
    // Remove ALL existing slots for this teacher in this week, then add only the selected ones
    const deleteAllResult = await TeacherSlot.deleteMany({
      teacherId: actualTeacherId,
      date: { $gte: weekStart.toISOString().split('T')[0], $lt: weekEnd.toISOString().split('T')[0] }
    });
    console.log(`Deleted ${deleteAllResult.deletedCount} existing open slots for the week`);

    // Save new open slots with available: true
    const newSlots = slots.map(s => ({ 
      teacherId: actualTeacherId, 
      date: s.date, 
      time: s.time,
      available: true // Set to true when opening slots
    }));
    const insertResult = await TeacherSlot.insertMany(newSlots);
    console.log(`Inserted ${insertResult.length} new open slots`);

    // Create notification for salary/work activity (optional - could be monthly instead)
    if (newSlots.length > 0) {
      const weekStart = new Date(newSlots[0].date);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      await createNotification(actualTeacherId, 'salary', `${newSlots.length} slots opened for week of ${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}.`);
    }

    console.log('Successfully saved slots:', newSlots.length); // Debug log
    res.json({ success: true });
    try {
      // Get the teacher's teacherId string for the socket emission
      const teacher = await Teacher.findOne({ teacherId: actualTeacherId });
      const teacherIdString = teacher ? teacher.teacherId : actualTeacherId;
      io.emit('slotsUpdated', { teacherId: teacherIdString, ts: Date.now() });
      console.log('Emitted slotsUpdated for teacherId:', teacherIdString);
    } catch (error) {
      console.error('Error emitting slotsUpdated:', error);
    }
  } catch (err) {
    console.error('Error saving slots:', err); // Debug log
    res.status(500).json({ error: err.message });
  }
});

// Close specific slots - Protected: Only authenticated teachers can access their own data
router.post('/close-slot', async (req, res) => {
  try {
    console.log('Received close slot request body:', req.body);
    const { teacherId, slots } = req.body; // slots: [{ date, time }]
    
    console.log('Teacher ID from request:', teacherId);
    console.log('Slots to close:', slots);
    
    if (!Array.isArray(slots)) {
      console.log('Slots is not an array:', typeof slots, slots);
      return res.status(400).json({ error: 'Missing slots data' });
    }

    if (!teacherId) {
      return res.status(400).json({ error: 'Missing teacher ID' });
    }

    if (slots.length === 0) {
      return res.status(400).json({ error: 'No slots selected to close' });
    }

    // Convert email to teacher ObjectId
    let actualTeacherId = teacherId;
    if (teacherId.includes('@')) {
      const teacher = await Teacher.findOne({ 
        $or: [
          { email: teacherId },
          { username: teacherId }
        ]
      });
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }
      actualTeacherId = teacher._id;
      console.log('Converted email to teacher ObjectId:', actualTeacherId);
    }

    // Remove specific slots that are selected for closing
    const slotConditions = slots.map(s => ({ teacherId: actualTeacherId, date: s.date, time: s.time }));
    console.log('Slot conditions for deletion:', slotConditions);
    
    const deleteResult = await TeacherSlot.deleteMany({
      $or: slotConditions
    });
    console.log(`Deleted ${deleteResult.deletedCount} slots`);

    console.log('Successfully closed slots:', slots.length);
    res.json({ success: true, closedCount: deleteResult.deletedCount });
    
    try {
      // Get the teacher's teacherId string for the socket emission
      const teacher = await Teacher.findOne({ teacherId: actualTeacherId });
      const teacherIdString = teacher ? teacher.teacherId : actualTeacherId;
      io.emit('slotsUpdated', { teacherId: teacherIdString, ts: Date.now() });
      console.log('Emitted slotsUpdated for teacherId:', teacherIdString);
    } catch (error) {
      console.error('Error emitting slotsUpdated:', error);
    }
  } catch (err) {
    console.error('Error closing slots:', err);
    res.status(500).json({ error: err.message });
  }
});

// Fetch teacher's open slots and bookings for a week
router.get('/slots', async (req, res) => {
  try {
    const { teacherId, week, allSlots } = req.query; // week = Monday date (YYYY-MM-DD), allSlots = return all slots (not just available)
    
    // For students, allow getting all available slots without teacherId
    if (!week) return res.status(400).json({ error: 'Missing week parameter' });
    
    // If no teacherId is provided, return all available slots for the week (for students)
    if (!teacherId) {
      console.log('🔍 Student request: Getting all available slots for week:', week);
      
      // Get all available slots for the week - use local timezone instead of hardcoded +08:00
      const start = new Date(week + 'T00:00:00');
      const end = new Date(start);
      end.setDate(start.getDate() + 7);
      
      const queryFilter = {
        date: { $gte: week, $lte: end.toISOString().slice(0, 10) },
        available: true // Only available slots for students
      };
      
      const slotsQuery = await TeacherSlot.find(queryFilter);
      
      // Get teacher data for each slot
      const slots = await Promise.all(slotsQuery.map(async (slot) => {
        const slotObj = slot.toObject();
        
        // Ensure teacherId is present
        if (!slotObj.teacherId) {
          console.error('❌ Slot missing teacherId:', slotObj);
          return null; // Skip slots without teacherId
        }
        
        // Get teacher data using the teacherId string
        const teacher = await Teacher.findOne({ teacherId: slotObj.teacherId });
        
        const slotData = {
          ...slotObj,
          teacherId: slotObj.teacherId, // Keep the original teacherId string
          teacherName: teacher ? teacher.username : 'Unknown Teacher'
        };
        
        console.log('🔍 Student slots API - Slot data:', { date: slotData.date, time: slotData.time, teacherId: slotData.teacherId });
        return slotData;
      }));
      
      // Filter out null slots (those without teacherId)
      const validSlots = slots.filter(slot => slot !== null);
      
      // Get bookings for these slots
      const bookings = await Booking.find({
        date: { $gte: week, $lte: end.toISOString().slice(0, 10) },
        status: { $ne: 'cancelled' }
      });
      
      console.log('🔍 Student request: Found', validSlots.length, 'available slots and', bookings.length, 'bookings');
      console.log('🔍 Student request: Sample slot data:', validSlots.length > 0 ? validSlots[0] : 'No slots');
      
      return res.json({ slots: validSlots, bookings });
    }

    console.log('Fetching slots for teacherId:', teacherId, 'week:', week); // Debug log
    
    // Add cache-busting headers
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Last-Modified': new Date().toUTCString(),
      'ETag': `"${Date.now()}-${Math.random()}"`
    });
    
    // Convert username/email to teacher teacherId if needed
    let actualTeacherId = teacherId;
    console.log('🔍 Original teacherId received:', teacherId);
    
    // Check if this is already a valid teacherId format (starts with T)
    if (teacherId.startsWith('T')) {
      console.log('🔍 TeacherId already in correct format:', teacherId);
      actualTeacherId = teacherId;
    } else if (teacherId.includes('@') || teacherId.includes('.')) {
      // If it's an email, look up the teacher
      console.log('🔍 Converting email/username to teacherId:', teacherId);
      const teacher = await Teacher.findOne({ 
        $or: [
          { email: teacherId },
          { username: teacherId }
        ]
      });
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }
      actualTeacherId = teacher.teacherId;
      console.log('🔍 Converted to teacherId:', actualTeacherId);
    } else {
      console.log('🔍 Using teacherId as-is:', teacherId);
      actualTeacherId = teacherId;
    }
    
    // Get all slots for this teacher for the week - use local timezone instead of hardcoded +08:00
    const start = new Date(week + 'T00:00:00');
    const end = new Date(start);
    end.setDate(start.getDate() + 7);

    console.log('🔍 Date range for slots query:');
    console.log('  - Week start:', week);
    console.log('  - Week end:', end.toISOString().slice(0, 10));
    console.log('  - TeacherId being searched:', actualTeacherId);

    // Use inclusive end date to include the last day of the week
    // Return all slots or only available slots based on allSlots parameter
    const queryFilter = {
      teacherId: actualTeacherId,
      date: { $gte: week, $lte: end.toISOString().slice(0, 10) }
    };
    
    // If allSlots is not specified, only return available slots (for student booking)
    if (!allSlots) {
      queryFilter.available = true;
    }
    
    const slotsQuery = await TeacherSlot.find(queryFilter);
    
    const slots = slotsQuery.map(slot => ({
      ...slot.toObject(),
      teacherId: teacherId // Include the original teacherId (email/username) in response
    }));
    
    console.log('Found slots:', slots.length); // Debug log
    console.log('Slots data:', slots); // Debug log
    
    // Debug: Check all slots for this teacher (any date)
    const allTeacherSlots = await TeacherSlot.find({ teacherId: actualTeacherId });
    console.log('All slots for this teacher (any date):', allTeacherSlots.length);
    console.log('All teacher slots data:', allTeacherSlots);
    
    // Debug: Check if there are any slots for the specific date we're looking for
    const specificDateSlots = await TeacherSlot.find({ 
      teacherId: actualTeacherId,
      date: '2025-08-10'  // The date we know has slots
    });
    console.log('🔍 Slots for 2025-08-10:', specificDateSlots.length);
    console.log('🔍 Specific date slots data:', specificDateSlots);

    // Also get bookings for these slots
    const bookings = await Booking.find({
      teacherId: actualTeacherId,
      date: { $gte: week, $lte: end.toISOString().slice(0, 10) },
      status: { $ne: 'cancelled' }
    });

    // Get student information and resolved issues for each booking
    const IssueReport = require('./models/IssueReport');
    const bookingsWithStudentInfo = await Promise.all(
      bookings.map(async (booking) => {
        let student = null;
        
        // Try to find student by ID first (if studentId is an ObjectId)
        if (booking.studentId && booking.studentId.length === 24) {
          try {
            student = await Student.findById(booking.studentId);
          } catch (err) {
            console.log('Error finding student by ID:', err.message);
          }
        }
        
        // If not found by ID, try by username/email
        if (!student) {
          student = await Student.findOne({ 
            $or: [
              { username: booking.studentId },
              { email: booking.studentId }
            ]
          });
        }
        
        // Check for resolved issues for this booking
        const resolvedIssues = await IssueReport.find({
          bookingId: booking._id.toString(),
          status: 'resolved'
        });
        
        const bookingObj = booking.toObject();
        return {
          ...bookingObj,
          studentId: student ? {
            username: student.username,
            firstName: student.firstName,
            lastName: student.lastName
          } : { username: booking.studentId },
          hasResolvedIssue: resolvedIssues.length > 0,
          // Explicitly ensure recording field is included
          recording: bookingObj.recording || booking.recording || null
        };
      })
    );

    res.json({ slots, bookings: bookingsWithStudentInfo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get available teachers for a specific date and time
router.get('/available-teachers', async (req, res) => {
  try {
    const { date, time } = req.query;
    if (!date || !time) return res.status(400).json({ error: 'Missing date or time' });
    
    // Find available slots for this date/time
    const slots = await TeacherSlot.find({ 
      date, 
      time, 
      available: true // Only return available slots
    }).populate('teacherId', 'username photo intro');
    
    // Filter out teachers who already have bookings for this slot
    const availableTeachers = [];
    for (const slot of slots) {
      // Skip slots with null teacherId
      if (!slot.teacherId) {
        console.log('Skipping slot with null teacherId:', slot._id);
        continue;
      }
      
      const existingBooking = await Booking.findOne({ 
        teacherId: slot.teacherId._id, 
        date, 
        time, 
        status: { $ne: 'cancelled' } 
      });
      
      if (!existingBooking) {
        availableTeachers.push({
          teacherId: slot.teacherId._id,
          name: slot.teacherId.username,
          photo: slot.teacherId.photo || null,
          intro: slot.teacherId.intro || 'No introduction available'
        });
      }
    }
    
    console.log(`Found ${availableTeachers.length} available teachers for ${date} ${time}`);
    res.json({ teachers: availableTeachers });
  } catch (err) {
    console.error('Error in available-teachers:', err);
    res.status(500).json({ error: err.message });
  }
});

// Book a class
router.post('/book-class', verifyToken, requireStudent, async (req, res) => {
  try {
    console.log('🔍 ========== BOOKING REQUEST RECEIVED ==========');
    console.log('🔍 Booking API called with body:', JSON.stringify(req.body, null, 2));
    console.log('🔍 User from token:', JSON.stringify(req.user, null, 2));
    
    const { teacherId, date, time, lesson, lessonId, studentLevel } = req.body;
    
    console.log('🔍 Extracted fields from request body:', {
      teacherId: teacherId || 'MISSING',
      date: date || 'MISSING',
      time: time || 'MISSING',
      lesson: lesson || 'MISSING',
      lessonId: lessonId || 'MISSING',
      studentLevel: studentLevel || 'MISSING'
    });
    
    // Get student username from the authenticated user's ObjectId
    console.log('🔍 Looking for student with ID:', req.user.studentId);
    const student = await Student.findById(req.user.studentId);
    console.log('🔍 Student found:', student ? 'YES' : 'NO');
    
    if (!student) {
      console.log('❌ Student not found for ID:', req.user.studentId);
      return res.status(400).json({ error: 'Student not found' });
    }
    
    const studentId = student.username; // Use username/email as string
    console.log('🔍 Using studentId (username):', studentId);
    
    // Check all required fields
    const missingFields = [];
    if (!studentId) missingFields.push('studentId');
    if (!teacherId) missingFields.push('teacherId');
    if (!date) missingFields.push('date');
    if (!time) missingFields.push('time');
    if (!lesson) missingFields.push('lesson');
    if (!studentLevel) missingFields.push('studentLevel');
    
    if (missingFields.length > 0) {
      console.log('❌ Missing required fields:', missingFields);
      console.log('❌ Field values:', { 
        studentId: studentId || 'MISSING', 
        teacherId: teacherId || 'MISSING', 
        date: date || 'MISSING', 
        time: time || 'MISSING', 
        lesson: lesson || 'MISSING', 
        studentLevel: studentLevel || 'MISSING' 
      });
      return res.status(400).json({ 
        error: 'Missing required fields: ' + missingFields.join(', '), 
        details: {
          studentId: !!studentId,
          teacherId: !!teacherId,
          date: !!date,
          time: !!time,
          lesson: !!lesson,
          studentLevel: !!studentLevel
        },
        missingFields: missingFields
      });
    }
    
    // Payment is handled via subscription - no paymentMethod required

    // Convert teacher ID to teacher object
    console.log('🔍 Looking for teacher with teacherId:', teacherId);
    const teacher = await Teacher.findOne({ teacherId: teacherId });
    console.log('🔍 Teacher found:', teacher ? 'YES' : 'NO');
    
    if (!teacher) {
      console.log('❌ Teacher not found for teacherId:', teacherId);
      return res.status(400).json({ error: 'Teacher not found' });
    }
    
    const teacherObjectId = teacher.teacherId;
    console.log('🔍 Teacher teacherId:', teacherObjectId);

    // Check if slot is still available and open for booking
    console.log('🔍 Checking if slot is available:', { teacherId: teacherObjectId, date, time });
    const existingSlot = await TeacherSlot.findOne({ 
      teacherId: teacherObjectId, 
      date, 
      time,
      available: true // Must be available for booking
    });
    console.log('🔍 Existing slot found:', existingSlot ? 'YES' : 'NO');
    
    if (!existingSlot) {
      console.log('❌ Slot not available or not open for booking:', { teacherId: teacherObjectId, date, time });
      return res.status(400).json({ error: 'Selected slot is no longer available or not open for booking' });
    }

    // Check if slot is already booked
    console.log('🔍 Checking if slot is already booked');
    const existingBooking = await Booking.findOne({ teacherId: teacherObjectId, date, time, status: { $ne: 'cancelled' } });
    console.log('🔍 Existing booking found:', existingBooking ? 'YES' : 'NO');
    
    if (existingBooking) {
      console.log('❌ Slot already booked');
      return res.status(400).json({ error: 'Selected slot is already booked' });
    }

    // Count previous bookings for this student
    const studentBookingCount = await Booking.countDocuments({ studentId });
    console.log('🔍 Student booking count:', studentBookingCount);
    
    // Use only username part before @ if email
    const usernamePart = studentId.includes('@') ? studentId.split('@')[0] : studentId;
    // Format: YYYYMMDDHHMM-username-N
    const dateStr = date.replace(/-/g, '');
    const timeStr = time.replace(':', '');
    const classroomId = `${dateStr}${timeStr}${usernamePart}${studentBookingCount + 1}`;
    console.log('🔍 Generated classroomId:', classroomId);

    // Create booking with auto-generated classroomId
    console.log('🔍 Creating new booking...');
    const booking = new Booking({
      studentId, teacherId: teacherObjectId, date, time, lesson, lessonId: req.body.lessonId || null, studentLevel, classroomId
    });
    await booking.save();
    console.log('✅ Booking created successfully:', booking._id);

    // MARK THE SLOT AS UNAVAILABLE (CLOSED) WHEN BOOKED
    console.log('🔍 Marking slot as unavailable after booking...');
    const slotUpdateResult = await TeacherSlot.updateOne(
      { teacherId: teacherObjectId, date, time },
      { available: false }
    );
    console.log('✅ Slot marked as unavailable:', slotUpdateResult.modifiedCount > 0);

    // Create notification for new booking
    const studentName = student ? `${student.firstName} ${student.lastName}` : studentId;
    await createNotification(teacherObjectId, 'booking', `New class booked for ${date} at ${time} with ${studentName}.`);
    console.log('✅ Notification created');

    // Get the teacher's teacherId string for the socket emission
    try {
      const teacher = await Teacher.findOne({ teacherId: teacherObjectId });
      const teacherIdString = teacher ? teacher.teacherId : teacherObjectId;
      if (io) {
        io.emit('bookingsUpdated', { teacherId: teacherIdString, date, time, ts: Date.now() });
        console.log('✅ Emitted bookingsUpdated for teacherId:', teacherIdString);
      }
    } catch (socketError) {
      console.error('⚠️ Error emitting bookingsUpdated (non-critical):', socketError);
    }

    res.json({ success: true, bookingId: booking._id, message: 'Class booked successfully' });
  } catch (err) {
    console.error('❌ Error booking class:', err);
    console.error('❌ Error stack:', err.stack);
    res.status(500).json({ error: err.message });
  }
});

// Cancel a slot - Protected: Only authenticated teachers can cancel their own slots
router.post('/cancel-slot', verifyToken, requireTeacher, requireOwnTeacherData, logAccess, async (req, res) => {
  try {
    const { date, time } = req.body;
    const teacherId = req.user.teacherId;
    
    if (!date || !time) return res.status(400).json({ error: 'Missing date or time' });

    // Check if slot is booked
    const booking = await Booking.findOne({ teacherId, date, time, status: { $ne: 'cancelled' } });
    if (booking) {
      // Mark booking as cancelled and return penalty info
      booking.status = 'cancelled';
      await booking.save();
      
      // Create notification for cancelled class
      const student = await Student.findOne({ username: booking.studentId });
      const studentName = student ? `${student.firstName} ${student.lastName}` : booking.studentId;
      await createNotification(teacherId, 'cancel', `Class with ${studentName} on ${date} at ${time} was cancelled.`);
      
      // (You can add penalty logic here, e.g., increment a penalty counter)
      return res.json({ success: true, penalty: true, message: 'Slot was booked. Penalty applied.' });
    } else {
      // Just delete the slot
      await TeacherSlot.deleteOne({ teacherId, date, time });
      return res.json({ success: true, penalty: false, message: 'Slot cancelled.' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch student's bookings for a week - Protected: Only authenticated students can access their own data
router.get('/student/bookings', verifyToken, requireStudent, logAccess, async (req, res) => {
  try {
    const { week } = req.query;
    const studentId = req.user.studentId;
    
    if (!week) return res.status(400).json({ error: 'Missing week parameter' });

    const start = new Date(week + 'T00:00:00');
    const end = new Date(start);
    end.setDate(start.getDate() + 7);

    const bookings = await Booking.find({
      studentId,
      date: { $gte: week, $lt: end.toISOString().slice(0, 10) },
      status: { $ne: 'cancelled' }
    }).populate('teacherId', 'username photo intro');

    res.json({ bookings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove teacher's open slots
router.post('/remove-slot', async (req, res) => {
  try {
    const { teacherId, slots } = req.body;
    
    console.log('Received remove request body:', req.body);
    console.log('Teacher ID from request:', teacherId);
    console.log('Slots to remove:', slots);
    
    if (!teacherId) {
      return res.status(400).json({ error: 'Missing teacher ID' });
    }
    
    if (!slots || !Array.isArray(slots) || slots.length === 0) {
      return res.status(400).json({ error: 'Missing or invalid slots data' });
    }

    // Convert email to teacher ObjectId if needed
    let actualTeacherId = teacherId;
    if (teacherId.includes('@')) {
      const teacher = await Teacher.findOne({ 
        $or: [
          { email: teacherId },
          { username: teacherId }
        ]
      });
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }
      actualTeacherId = teacher._id;
      console.log('Converted email to teacher ObjectId for removal:', actualTeacherId);
    }
    
    // Remove each slot
    const removePromises = slots.map(slot => 
      TeacherSlot.deleteOne({ 
        teacherId: actualTeacherId, 
        date: slot.date, 
        time: slot.time 
      })
    );
    
    await Promise.all(removePromises);
    
    console.log('Successfully removed slots:', slots.length);
    res.json({ success: true, message: `Successfully removed ${slots.length} slots` });
  } catch (error) {
    console.error('Error removing slots:', error);
    res.status(500).json({ error: 'Failed to remove slots' });
  }
});

// Update class details (code and classroom) for a booking
router.post('/update-class-details', async (req, res) => {
  try {
    const { bookingId, classCode, classroomId } = req.body;
    
    console.log('Updating class details for booking:', bookingId, 'code:', classCode, 'classroom:', classroomId);
    
    if (!bookingId || !classCode || !classroomId) {
      return res.status(400).json({ error: 'Missing booking ID, class code, or classroom ID' });
    }
    
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    booking.classCode = classCode;
    booking.classroomId = classroomId;
    await booking.save();
    
    console.log('Class details updated successfully');
    res.json({ success: true, message: 'Class details updated successfully' });
  } catch (error) {
    console.error('Error updating class details:', error);
    res.status(500).json({ error: 'Failed to update class details' });
  }
});

// Get booking details by ID (removed duplicate - using authenticated version below)

// Get booking by ID for class information
router.get('/booking/:bookingId', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const teacherId = req.user.teacherId;
    
    console.log('🔍 Fetching booking by ID:', bookingId);
    
    const booking = await Booking.findById(bookingId);
    console.log('🔍 Booking found:', booking ? 'YES' : 'NO');
    
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        error: 'Booking not found' 
      });
    }
    
    // Verify the booking belongs to this teacher
    if (booking.teacherId.toString() !== teacherId) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied. This booking does not belong to you.' 
      });
    }
    
    console.log('🔍 Booking data:', {
      teacherId: booking.teacherId,
      studentId: booking.studentId,
      classroomId: booking.classroomId,
      date: booking.date,
      time: booking.time
    });
    
    // Get student information - studentId is stored as username/email string
    const student = await Student.findOne({ 
      $or: [
        { username: booking.studentId },
        { email: booking.studentId }
      ]
    });
    console.log('🔍 Student found:', student ? 'YES' : 'NO');
    console.log('🔍 Student data:', student ? {
      firstName: student.firstName,
      lastName: student.lastName,
      username: student.username
    } : 'No student data');
    
    let studentName = 'Unknown Student';
    if (student) {
      if (student.firstName) {
        studentName = student.firstName;
      } else if (student.username) {
        studentName = student.username;
      }
    }
    
    // Get teacher information
    const teacher = await Teacher.findOne({ teacherId: booking.teacherId });
    console.log('🔍 Teacher found:', teacher ? 'YES' : 'NO');
    console.log('🔍 Teacher data:', teacher ? {
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      username: teacher.username
    } : 'No teacher data');
    
    let teacherName = 'Unknown Teacher';
    if (teacher) {
      if (teacher.firstName) {
        teacherName = teacher.firstName;
      } else if (teacher.username) {
        teacherName = teacher.username;
      }
    }
    
    console.log('🔍 Final names - Student:', studentName, 'Teacher:', teacherName);
    
    res.json({ 
      success: true, 
      booking: {
        _id: booking._id,
        classroomId: booking.classroomId,
        date: booking.date,
        time: booking.time,
        lesson: booking.lesson,
        studentLevel: booking.studentLevel,
        studentName: studentName,
        teacherName: teacherName,
        status: booking.status,
        recording: booking.recording || null, // Include recording field
        finishedAt: booking.finishedAt,
        attendance: booking.attendance
      }
    });
  } catch (err) {
    console.error('❌ Error fetching booking by ID:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get notifications for a teacher
router.get('/notifications', async (req, res) => {
  const { teacherId } = req.query;
  if (!teacherId) return res.status(400).json({ error: 'Missing teacherId' });
  try {
    const notifications = await Notification.find({ teacherId }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark all notifications as read for a teacher
router.patch('/notifications/mark-read', async (req, res) => {
  const { teacherId } = req.body;
  if (!teacherId) return res.status(400).json({ error: 'Missing teacherId' });
  try {
    await Notification.updateMany({ teacherId, read: false }, { $set: { read: true } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark individual notification as read
router.patch('/notifications/:notificationId/mark-read', verifyToken, async (req, res) => {
  try {
    const { notificationId } = req.params;
    
    // Try multiple ways to get teacher ID
    let teacherId = req.user.teacherId || req.user.id || req.user._id;
    
    // If we still don't have a teacher ID, try to get it from the query parameter
    if (!teacherId) {
      teacherId = req.query.teacherId;
    }

    console.log('🔔 Mark notification as read request:', {
      notificationId,
      teacherId,
      user: req.user
    });

    if (!notificationId) {
      return res.status(400).json({ error: 'Notification ID is required' });
    }

    if (!teacherId) {
      return res.status(400).json({ error: 'Teacher ID is required' });
    }

    // First, let's find the notification to see what teacherId it has
    const existingNotification = await Notification.findById(notificationId);
    console.log('🔔 Existing notification:', existingNotification);

    if (!existingNotification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Update the notification - try with the stored teacherId first
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, teacherId: existingNotification.teacherId },
      { read: true },
      { new: true }
    );

    console.log('🔔 Notification update result:', notification);

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found or access denied' });
    }

    res.json({ success: true, notification });

  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark student as absent - Protected: Only authenticated teachers can mark their own students as absent
router.post('/mark-absent', verifyToken, requireTeacher, requireOwnTeacherData, logAccess, async (req, res) => {
  try {
    const { bookingId, reason } = req.body;
    const teacherId = req.user.teacherId;
    
    if (!bookingId) return res.status(400).json({ error: 'Missing booking ID' });

    // Find the booking
    const booking = await Booking.findOne({ _id: bookingId, teacherId });
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Mark as absent (you can add an 'absent' field to the booking schema)
    booking.status = 'absent';
    await booking.save();

    // Create notification for absent student
    const student = await Student.findOne({ username: booking.studentId });
    const studentName = student ? `${student.firstName} ${student.lastName}` : booking.studentId;
    const absentMessage = reason ? 
      `Student ${studentName} was absent on ${booking.date} at ${booking.time}. Reason: ${reason}` :
      `Student ${studentName} was absent on ${booking.date} at ${booking.time}.`;
    
    await createNotification(teacherId, 'absent', absentMessage);

    res.json({ success: true, message: 'Student marked as absent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get teacher's completed classes for fee calculation
router.get('/teacher/completed-classes', async (req, res) => {
  try {
    const { teacherId, startDate, endDate } = req.query;
    
    if (!teacherId || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing teacherId, startDate, or endDate' });
    }

    // Find completed classes within the date range
    const completedClasses = await Booking.countDocuments({
      teacherId,
      date: { $gte: startDate, $lte: endDate },
      status: 'completed'
    });

    res.json({ 
      success: true, 
      completedClasses,
      period: { startDate, endDate }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get booking by classroom ID for live classroom
router.get('/booking/by-classroom/:classroomId', async (req, res) => {
  try {
    const { classroomId } = req.params;
    
    console.log('🔍 API: Looking for booking with classroomId:', classroomId);
    
    if (!classroomId) {
      console.log('❌ API: Missing classroom ID');
      return res.status(400).json({ error: 'Missing classroom ID' });
    }

    // Find booking by classroom ID
    const booking = await Booking.findOne({ classroomId });
    
    console.log('🔍 API: Booking found:', booking ? 'YES' : 'NO');
    if (booking) {
      console.log('📦 API: Booking data:', {
        _id: booking._id,
        classroomId: booking.classroomId,
        date: booking.date,
        time: booking.time
      });
    }
    
    if (!booking) {
      console.log('❌ API: No booking found for classroomId:', classroomId);
      
      // Let's also check what bookings exist in the database
      const allBookings = await Booking.find({}).limit(5);
      console.log('🔍 API: Sample of all bookings in database:', allBookings.map(b => ({
        _id: b._id,
        classroomId: b.classroomId,
        date: b.date,
        time: b.time
      })));
      
      return res.status(404).json({ error: 'Booking not found' });
    }

    // Get student information
    const student = await Student.findById(booking.studentId);
    const studentName = student ? `${student.firstName} ${student.lastName}` : 'Unknown Student';
    
    console.log('👤 API: Student found:', student ? 'YES' : 'NO');
    if (student) {
      console.log('👤 API: Student data:', {
        firstName: student.firstName,
        lastName: student.lastName
      });
    }

    // Get teacher information
    const teacher = await Teacher.findOne({ teacherId: booking.teacherId });
    const teacherName = teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Unknown Teacher';
    
    console.log('👨‍🏫 API: Teacher found:', teacher ? 'YES' : 'NO');
    if (teacher) {
      console.log('👨‍🏫 API: Teacher data:', {
        firstName: teacher.firstName,
        lastName: teacher.lastName
      });
    }

    // Prepare booking data with student and teacher names
    const bookingData = {
      ...booking.toObject(),
      studentName: studentName,
      teacherName: teacherName
    };

    console.log('✅ API: Sending booking data:', bookingData);

    res.json({ 
      success: true, 
      booking: bookingData 
    });
  } catch (err) {
    console.error('❌ API: Error fetching booking by classroom ID:', err);
    res.status(500).json({ error: 'Failed to fetch booking data' });
  }
});

// Get teacher profile data
router.get('/profile', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    // teacherId is a permanent string ID, not Mongo _id
    const teacher = await Teacher.findOne({ teacherId }).select('-password');
    
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    res.json({ 
      success: true, 
      profile: teacher 
    });
  } catch (err) {
    console.error('Error fetching teacher profile:', err);
    res.status(500).json({ error: 'Failed to fetch profile data' });
  }
});

// Save teacher profile data
router.post('/profile', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    const profileData = req.body;
    
    console.log('=== PROFILE UPDATE REQUEST ===');
    console.log('Saving profile data for teacher:', teacherId);
    console.log('Received documents data:', {
      hasDocuments: !!profileData.documents,
      diplomasCount: profileData.documents?.diplomas?.length || 0,
      certificatesCount: profileData.documents?.certificates?.length || 0,
      hasValidId: !!profileData.documents?.validId,
      documentsKeys: profileData.documents ? Object.keys(profileData.documents) : []
    });
    
    // Detailed logging of diplomas and certificates
    if (profileData.documents?.diplomas) {
      console.log('✓ Diplomas received:', profileData.documents.diplomas.length);
      profileData.documents.diplomas.forEach((diploma, index) => {
        console.log(`  Diploma ${index + 1}:`, {
          hasFileData: !!diploma.fileData,
          fileDataLength: diploma.fileData ? diploma.fileData.length : 0,
          fileDataStart: diploma.fileData ? diploma.fileData.substring(0, 50) : 'missing',
          fileName: diploma.fileName
        });
      });
    } else {
      console.log('⚠️ No diplomas array in request!');
    }
    
    if (profileData.documents?.certificates) {
      console.log('✓ Certificates received:', profileData.documents.certificates.length);
      profileData.documents.certificates.forEach((cert, index) => {
        console.log(`  Certificate ${index + 1}:`, {
          hasFileData: !!cert.fileData,
          fileDataLength: cert.fileData ? cert.fileData.length : 0,
          fileDataStart: cert.fileData ? cert.fileData.substring(0, 50) : 'missing',
          fileName: cert.fileName
        });
      });
    } else {
      console.log('⚠️ No certificates array in request!');
    }
    
    // Check if username is being changed and validate uniqueness
    if (profileData.username) {
      const existingTeacher = await Teacher.findOne({ 
        username: profileData.username,
        teacherId: { $ne: teacherId } // Exclude current teacher
      });
      
      if (existingTeacher) {
        return res.status(400).json({ 
          error: 'Username already exists. Please choose a different username.' 
        });
      }
    }
    
    // Prepare documents data - ensure arrays are properly formatted
    const diplomasArray = Array.isArray(profileData.documents?.diplomas) ? profileData.documents.diplomas : [];
    const certificatesArray = Array.isArray(profileData.documents?.certificates) ? profileData.documents.certificates : [];
    const validIdData = profileData.documents?.validId || null;
    
    console.log('=== BACKEND: Documents data received ===');
    console.log('Diplomas count:', diplomasArray.length);
    console.log('Certificates count:', certificatesArray.length);
    console.log('Valid ID:', validIdData ? `Present (${validIdData.length} chars, starts with: ${validIdData.substring(0, 50)}...)` : 'MISSING/NULL');
    console.log('Valid ID type:', typeof validIdData);
    console.log('Valid ID is string:', typeof validIdData === 'string');
    console.log('Valid ID starts with data:', validIdData ? validIdData.startsWith('data:') : false);
    
    if (diplomasArray.length > 0) {
      console.log('Diploma sample:', { fileData: diplomasArray[0].fileData?.substring(0, 50) + '...', fileName: diplomasArray[0].fileName });
    }
    if (certificatesArray.length > 0) {
      console.log('Certificate sample:', { fileData: certificatesArray[0].fileData?.substring(0, 50) + '...', fileName: certificatesArray[0].fileName });
    }
    
    // Update teacher profile - use $set with dot notation for nested arrays to ensure proper update
    const updateData = {
      $set: {
        fullname: profileData.fullname,
        firstName: profileData.firstName,
        middleName: profileData.middleName,
        lastName: profileData.lastName,
        birthday: profileData.birthday,
        gender: profileData.gender,
        language: profileData.language,
        hobbies: profileData.hobbies,
        address: profileData.address,
        contact: profileData.contact,
        email: profileData.email,
        username: profileData.username,
        emergencyContact: profileData.emergencyContact,
        introduction: profileData.introduction,
        experience: profileData.experience,
        profilePicture: profileData.profilePicture,
        education: profileData.education || [],
        workExperience: profileData.workExperience || [],
        // Use dot notation for nested document fields to ensure proper array replacement
        'documents.diploma': profileData.documents?.diploma || null,
        'documents.diplomas': diplomasArray,
        'documents.certifications': Array.isArray(profileData.documents?.certifications) ? profileData.documents.certifications : [],
        'documents.certificates': certificatesArray,
        'documents.validId': profileData.documents?.validId || null
      }
    };
    
    // Add teaching abilities if provided (preserve existing levels/criteria, only update descriptions)
    if (profileData.teachingAbilities) {
      console.log('Teaching abilities received:', profileData.teachingAbilities);
      if (profileData.teachingAbilities.listening) {
        updateData.$set['teachingAbilities.listening.description'] = profileData.teachingAbilities.listening.description || '';
      }
      if (profileData.teachingAbilities.reading) {
        updateData.$set['teachingAbilities.reading.description'] = profileData.teachingAbilities.reading.description || '';
      }
      if (profileData.teachingAbilities.speaking) {
        updateData.$set['teachingAbilities.speaking.description'] = profileData.teachingAbilities.speaking.description || '';
      }
      if (profileData.teachingAbilities.writing) {
        updateData.$set['teachingAbilities.writing.description'] = profileData.teachingAbilities.writing.description || '';
      }
      if (profileData.teachingAbilities.creativityHobbies !== undefined) {
        updateData.$set['teachingAbilities.creativityHobbies'] = profileData.teachingAbilities.creativityHobbies || '';
      }
    }
    
    console.log('=== BACKEND: Update data prepared ===');
    console.log('Diplomas in update:', updateData.$set['documents.diplomas']?.length || 0);
    console.log('Certificates in update:', updateData.$set['documents.certificates']?.length || 0);
    console.log('Valid ID in update:', updateData.$set['documents.validId'] ? `Present (${updateData.$set['documents.validId'].length} chars)` : 'MISSING/NULL');
    console.log('Diplomas is array:', Array.isArray(updateData.$set['documents.diplomas']));
    console.log('Certificates is array:', Array.isArray(updateData.$set['documents.certificates']));
    console.log('Valid ID type:', typeof updateData.$set['documents.validId']);
    
    const updatedTeacher = await Teacher.findOneAndUpdate(
      { teacherId },
      updateData,
      { new: true, runValidators: false }
    ).select('-password');
    
    if (!updatedTeacher) {
      console.log('Teacher not found for ID:', teacherId);
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    console.log('=== BACKEND: Profile updated successfully ===');
    console.log('Teacher ID:', teacherId);
    console.log('Updated documents object:', JSON.stringify(updatedTeacher.documents, null, 2));
    console.log('Diplomas count:', updatedTeacher.documents?.diplomas?.length || 0);
    console.log('Certificates count:', updatedTeacher.documents?.certificates?.length || 0);
    console.log('Valid ID:', updatedTeacher.documents?.validId ? `Present (${updatedTeacher.documents.validId.length} chars)` : 'MISSING/NULL');
    
    // Verify the documents were saved correctly
    if (updatedTeacher.documents) {
      if (Array.isArray(updatedTeacher.documents.diplomas)) {
        console.log('✓ Diplomas array is valid, length:', updatedTeacher.documents.diplomas.length);
      } else {
        console.error('✗ Diplomas is not an array:', typeof updatedTeacher.documents.diplomas);
      }
      if (Array.isArray(updatedTeacher.documents.certificates)) {
        console.log('✓ Certificates array is valid, length:', updatedTeacher.documents.certificates.length);
      } else {
        console.error('✗ Certificates is not an array:', typeof updatedTeacher.documents.certificates);
      }
      if (updatedTeacher.documents.validId) {
        console.log('✓ Valid ID is present, length:', updatedTeacher.documents.validId.length);
      } else {
        console.error('✗ Valid ID is MISSING in saved documents!');
      }
    } else {
      console.error('✗ Documents object is missing from updated teacher');
    }
    
    // Check if username was changed and generate new token
    let newToken = null;
    if (profileData.username && profileData.username !== req.user.username) {
      console.log('Username changed from', req.user.username, 'to', profileData.username);
      newToken = jwt.sign(
        { 
          username: profileData.username, 
          teacherId: teacherId 
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
    }
    
    // Ensure documents are properly included in response
    const responseProfile = updatedTeacher.toObject ? updatedTeacher.toObject() : updatedTeacher;
    
    console.log('=== BACKEND: Response data ===');
    console.log('Response profile documents:', responseProfile.documents);
    console.log('Response profile documents type:', typeof responseProfile.documents);
    console.log('Response diplomas:', responseProfile.documents?.diplomas?.length || 0);
    console.log('Response certificates:', responseProfile.documents?.certificates?.length || 0);
    console.log('Response validId:', responseProfile.documents?.validId ? `Present (${responseProfile.documents.validId.length} chars)` : 'MISSING/NULL');
    
    res.json({ 
      success: true, 
      message: 'Profile updated successfully',
      profile: responseProfile,
      newToken: newToken // Include new token if username was changed
    });
  } catch (err) {
    console.error('Error updating teacher profile:', err);
    console.error('Error details:', err.message);
    if (err.name === 'ValidationError') {
      console.error('Validation errors:', err.errors);
    }
    res.status(500).json({ error: 'Failed to update profile: ' + err.message });
  }
});

// Upload document files
router.post('/upload-document', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    const { documentType, fileData } = req.body;
    
    console.log('Document upload request received');
    console.log('Teacher ID:', teacherId);
    console.log('Document type:', documentType);
    console.log('File data length:', fileData ? fileData.length : 'No data');
    
    if (!documentType || !fileData) {
      console.log('Missing document type or file data');
      return res.status(400).json({ error: 'Missing document type or file data' });
    }
    
    // Check file size (16MB limit) - more accurate calculation
    const fileSizeInBytes = Buffer.byteLength(fileData, 'base64');
    const fileSizeInMB = fileSizeInBytes / 1024 / 1024;
    console.log('File size in MB:', fileSizeInMB);
    
    if (fileSizeInMB > 16) {
      return res.status(400).json({ 
        error: `File size too large. Your file is ${fileSizeInMB.toFixed(1)}MB. Maximum size is 16MB. Please compress your image or use a smaller file.` 
      });
    }
    
    // Update the specific document field
    const updateData = {};
    if (documentType === 'diploma' || documentType === 'validId') {
      updateData[`documents.${documentType}`] = fileData;
    } else if (documentType === 'certifications') {
      // For certifications, we might want to append to the array
      updateData.$push = { 'documents.certifications': fileData };
    }
    
    console.log('Document upload - About to update teacher with ID:', teacherId);
    console.log('Document upload - Update data keys:', Object.keys(updateData));
    
    const updatedTeacher = await Teacher.findOneAndUpdate(
      { teacherId },
      updateData,
      { new: true, runValidators: false }
    ).select('-password');
    
    if (!updatedTeacher) {
      console.log('Teacher not found for ID:', teacherId);
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    console.log('Document uploaded successfully for teacher:', teacherId);
    
    res.json({ 
      success: true, 
      message: 'Document uploaded successfully',
      profile: updatedTeacher 
    });
  } catch (err) {
    console.error('Error uploading document:', err);
    console.error('Error details:', err.message);
    if (err.name === 'ValidationError') {
      console.error('Validation errors:', err.errors);
    }
    res.status(500).json({ error: 'Failed to upload document: ' + err.message });
  }
});

// Upload video introduction
router.post('/upload-video', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    const { videoData, fileName } = req.body;
    
    if (!videoData) {
      return res.status(400).json({ error: 'Missing video data' });
    }
    
    // Update the video introduction fields
    const updateData = {
      videoIntroduction: videoData,
      videoIntroductionFileName: fileName || 'Video Introduction'
    };
    
    const updatedTeacher = await Teacher.findOneAndUpdate(
      { teacherId },
      updateData,
      { new: true }
    ).select('-password');
    
    res.json({ 
      success: true, 
      message: 'Video introduction uploaded successfully',
      profile: updatedTeacher 
    });
  } catch (err) {
    console.error('Error uploading video introduction:', err);
    res.status(500).json({ error: 'Failed to upload video introduction' });
  }
});

// Remove video introduction
router.post('/remove-video', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    
    // Clear the video introduction fields
    const updateData = {
      videoIntroduction: null,
      videoIntroductionFileName: null
    };
    
    const updatedTeacher = await Teacher.findOneAndUpdate(
      { teacherId },
      updateData,
      { new: true }
    ).select('-password');
    
    res.json({ 
      success: true, 
      message: 'Video introduction removed successfully',
      profile: updatedTeacher 
    });
  } catch (err) {
    console.error('Error removing video introduction:', err);
    res.status(500).json({ error: 'Failed to remove video introduction' });
  }
});

// Time Tracking Routes



// Timezone-safe helpers for Philippines (Asia/Manila)
function getPhilippineDate() {
  // Returns YYYY-MM-DD in Asia/Manila regardless of server locale
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function getPhilippineTimeString() {
  // Returns HH:MM:SS AM/PM in Asia/Manila
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour12: true,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date());
}

// Clock in
router.post('/time-tracking/clock-in', verifyToken, requireTeacher, async (req, res) => {
  try {
    console.log('Clock-in request received');
    console.log('User from token:', req.user);
    
    const teacherId = req.user.teacherId;
    console.log('Teacher ID:', teacherId);
    
    const phDate = getPhilippineDate();
    const currentTime = getPhilippineTimeString();
    
    console.log('Philippine Date:', phDate);
    console.log('Current time:', currentTime);
    
    // Ensure teacher exists (teacherId is a string ID, not _id)
    const teacher = await Teacher.findOne({ teacherId });
    if (!teacher) {
      console.log('Teacher not found for teacherId string:', teacherId);
      return res.status(404).json({ success: false, error: 'Teacher not found' });
    }

    // Check if already clocked in today
    const existingLog = await TimeLog.findOne({
      teacherId,
      date: phDate
    });
    
    if (existingLog) {
      console.log('Already has a time log for today');
      return res.status(400).json({ 
        success: false, 
        error: 'Already clocked in today. You can only time in once per day.' 
      });
    }
    
    // Create new time log
    const timeLog = await TimeLog.create({
      teacherId,
      date: phDate,
      clockIn: {
        time: currentTime,
        timestamp: new Date()
      },
      status: 'clocked-in'
    });
    
    console.log('Time log created:', timeLog);
    
    // Create notification
    await createNotification(teacherId, 'time-tracking', `Clocked in at ${currentTime}`);
    
    res.json({
      success: true,
      message: 'Successfully clocked in',
      timeLog: timeLog
    });
  } catch (err) {
    console.error('Error clocking in:', err && err.message ? err.message : err);
    res.status(500).json({ error: 'Failed to clock in', details: err && err.message ? err.message : undefined });
  }
});

// Clock out
router.post('/time-tracking/clock-out', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    const phDate = getPhilippineDate();
    const currentTime = getPhilippineTimeString();
    
    // Find current clock-in log
    const timeLog = await TimeLog.findOne({
      teacherId,
      date: phDate,
      status: 'clocked-in'
    });
    
    if (!timeLog) {
      return res.status(400).json({ 
        success: false, 
        error: 'Not currently clocked in' 
      });
    }
    
    // Calculate total hours
    const clockInTime = new Date(timeLog.clockIn.timestamp);
    const clockOutTime = new Date();
    const totalHours = (clockOutTime - clockInTime) / (1000 * 60 * 60); // Convert to hours
    
    // Update time log
    timeLog.clockOut = {
      time: currentTime,
      timestamp: clockOutTime
    };
    timeLog.totalHours = Math.round(totalHours * 100) / 100; // Round to 2 decimal places
    timeLog.status = 'clocked-out';
    
    await timeLog.save();
    
    // Create notification
    await createNotification(teacherId, 'time-tracking', `Clocked out at ${currentTime} (${timeLog.totalHours} hours worked)`);
    
    res.json({
      success: true,
      message: 'Successfully clocked out',
      timeLog: timeLog
    });
  } catch (err) {
    console.error('Error clocking out:', err);
    res.status(500).json({ error: 'Failed to clock out' });
  }
});

// Get current time tracking status
router.get('/time-tracking/status', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    const phDate = getPhilippineDate();
    
    // Check if there's a time log for today
    const todayLog = await TimeLog.findOne({
      teacherId,
      date: phDate
    });
    
    let isClockedIn = false;
    let currentLog = null;
    let canTimeIn = false;
    let canTimeOut = false;
    let dailyCompleted = false;
    
    if (todayLog) {
      if (todayLog.status === 'clocked-in') {
        isClockedIn = true;
        currentLog = todayLog;
        canTimeOut = true;
      } else if (todayLog.status === 'clocked-out') {
        dailyCompleted = true;
      }
    } else {
      // No log for today, can time in
      canTimeIn = true;
    }
    
    res.json({
      success: true,
      isClockedIn,
      currentLog,
      canTimeIn,
      canTimeOut,
      dailyCompleted,
      phDate
    });
  } catch (err) {
    console.error('Error fetching time tracking status:', err);
    res.status(500).json({ error: 'Failed to fetch time tracking status' });
  }
});

// Get time log history
router.get('/time-tracking/history', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    const { startDate, endDate } = req.query;
    
    let query = { teacherId };
    
    // Add date range filter if provided
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }
    
    const timeLogs = await TimeLog.find(query)
      .populate('teacherId', 'firstName lastName username email')
      .sort({ date: -1, 'clockIn.timestamp': -1 })
      .limit(50); // Limit to last 50 entries
    
    res.json({
      success: true,
      timeLogs: timeLogs
    });
  } catch (err) {
    console.error('Error fetching time log history:', err);
    res.status(500).json({ error: 'Failed to fetch time log history' });
  }
});

// Mark class as finished (15-25 minutes)
router.post('/mark-class-finished', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { bookingId } = req.body;
    const teacherId = req.user.teacherId;
    
    if (!bookingId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Booking ID is required' 
      });
    }
    
    // Find the booking and verify it belongs to this teacher
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        error: 'Booking not found' 
      });
    }
    
    if (booking.teacherId.toString() !== teacherId) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied. This booking does not belong to you.' 
      });
    }
    
    // Check if teacher has entered the classroom
    const teacherEntered = booking.attendance?.teacherEntered || false;
    const studentEntered = booking.attendance?.studentEntered || false;
    
    if (!teacherEntered) {
      return res.status(400).json({ 
        success: false, 
        error: 'Teacher must enter the classroom before marking as finished' 
      });
    }
    
    // If student hasn't entered, allow teacher to mark as finished with a note about technical issues
    if (!studentEntered) {
      console.log(`Student did not enter classroom for booking ${bookingId}. Allowing teacher to mark as finished due to potential technical issues.`);
      // Continue with marking as finished, but add a note about student technical issues
    }
    
    // Compute class duration and check if it meets the 15-25 minute requirement
    let durationMinutes = 0;
    let meetsDurationRequirement = false;
    
    try {
      if (booking.date && booking.time) {
        const classDate = new Date(booking.date);
        const [hours, minutes] = booking.time.split(':').map(Number);
        const classStartTime = new Date(classDate);
        classStartTime.setHours(hours, minutes, 0, 0);
        const now = new Date();
        durationMinutes = (now - classStartTime) / (1000 * 60);
        meetsDurationRequirement = durationMinutes >= 15 && durationMinutes <= 25;
        
        console.log(`Class duration: ${durationMinutes.toFixed(2)} minutes (requires 15-25 minutes)`);
        console.log(`Meets duration requirement: ${meetsDurationRequirement}`);
      }
    } catch (e) {
      console.log('Duration compute error:', e.message);
      meetsDurationRequirement = false;
    }
    
    // Only mark as completed if duration requirement is met
    if (meetsDurationRequirement) {
      booking.status = 'completed';
      booking.finishedAt = new Date();
      booking.attendance = booking.attendance || {};
      booking.attendance.classCompleted = true;
      
      // Add note if student had technical issues
      if (!studentEntered) {
        booking.studentTechnicalIssues = true;
        booking.technicalIssueNote = 'Student unable to access classroom due to technical difficulties (camera/microphone access issues)';
      }
      
      console.log(`✅ Class marked as completed - duration requirement met (${durationMinutes.toFixed(2)} minutes)`);
    } else {
      // Duration requirement not met - return error
      return res.status(400).json({ 
        success: false, 
        error: `Class cannot be marked as finished. Duration must be 15-25 minutes. Current duration: ${durationMinutes.toFixed(2)} minutes.` 
      });
    }
    
    await booking.save();
    
    // Create notification with technical issue note if applicable
    const notificationMessage = !studentEntered 
      ? `Class marked as finished for ${booking.date} at ${booking.time} (Student had technical issues)`
      : `Class marked as finished for ${booking.date} at ${booking.time}`;
    
    await createNotification(teacherId, 'class-completed', notificationMessage);
    
    res.json({
      success: true,
      message: 'Class marked as finished successfully',
      booking: booking
    });
  } catch (err) {
    console.error('Error marking class as finished:', err);
    res.status(500).json({ error: 'Failed to mark class as finished' });
  }
});

// Mark user as entered in classroom
router.post('/mark-user-entered', verifyToken, async (req, res) => {
  try {
    const { bookingId, userType, userId, room } = req.body;
    
    console.log('🔍 mark-user-entered API called with:', { bookingId, userType, userId, room });
    console.log('🔍 Request body:', req.body);
    
    if (!bookingId) {
      console.log('❌ No booking ID provided');
      return res.status(400).json({ 
        success: false, 
        error: 'Booking ID is required' 
      });
    }
    
    // Find the booking
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      console.log('❌ Booking not found:', bookingId);
      return res.status(404).json({ 
        success: false, 
        error: 'Booking not found' 
      });
    }
    
    console.log('✅ Booking found:', booking._id);
    console.log('🔍 Current booking state:', {
      teacherEntered: booking.attendance?.teacherEntered,
      studentEntered: booking.attendance?.studentEntered
    });
    
    // Calculate late minutes for teacher entry
    let lateMinutes = 0;
    let isLate = false;
    
    if (userType === 'teacher' && booking.date && booking.time) {
      // Create the scheduled class time
      const scheduledTime = new Date(`${booking.date}T${booking.time}:00`);
      const currentTime = new Date();
      
      // Calculate difference in minutes
      const timeDifferenceMs = currentTime - scheduledTime;
      lateMinutes = Math.max(0, Math.floor(timeDifferenceMs / (1000 * 60)));
      
      if (lateMinutes > 0) {
        isLate = true;
        console.log(`⚠️ Teacher entered ${lateMinutes} minutes late for class at ${booking.time}`);
      } else {
        console.log(`✅ Teacher entered on time for class at ${booking.time}`);
      }
    }
    
    // Update booking based on user type
    if (userType === 'teacher') {
      booking.attendance.teacherEntered = true;
      booking.attendance.teacherEnteredAt = new Date();
      booking.lateMinutes = lateMinutes; // Store late minutes
      console.log(`✅ Teacher ${userId} entered classroom for booking ${bookingId}${isLate ? ` (${lateMinutes} minutes late)` : ''}`);
    } else if (userType === 'student') {
      booking.attendance.studentEntered = true;
      booking.attendance.studentEnteredAt = new Date();
      console.log(`✅ Student ${userId} entered classroom for booking ${bookingId}`);
    }
    
    await booking.save();
    console.log('✅ Booking saved successfully');
    
    res.json({
      success: true,
      message: `${userType} marked as entered successfully${isLate ? ` (${lateMinutes} minutes late)` : ''}`,
      booking: booking,
      lateMinutes: lateMinutes,
      isLate: isLate
    });
  } catch (err) {
    console.error('❌ Error marking user as entered:', err);
    res.status(500).json({ error: 'Failed to mark user as entered' });
  }
});

// Mark student as absent
router.post('/mark-student-absent', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { bookingId } = req.body;
    const teacherId = req.user.teacherId;
    
    if (!bookingId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Booking ID is required' 
      });
    }
    
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
    
    // Check if teacher has entered the classroom
    const teacherEntered = booking.attendance?.teacherEntered || false;
    
    if (!teacherEntered) {
      return res.status(400).json({ 
        success: false, 
        error: 'Teacher must enter the classroom before marking student as absent' 
      });
    }
    
    // Check if class is already finished
    if (booking.status === 'completed') {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot mark student as absent for a class that has already been finished' 
      });
    }
    
    // Update booking status to absent
    booking.status = 'absent';
    booking.absentAt = new Date();
    booking.absentReason = 'Student did not attend the class';
    
    await booking.save();
    
    // Create notification
    const notificationMessage = `Student marked as absent for ${booking.date} at ${booking.time}`;
    await createNotification(teacherId, 'student-absent', notificationMessage);
    
    res.json({
      success: true,
      message: 'Student marked as absent successfully',
      booking: booking
    });
  } catch (err) {
    console.error('Error marking student as absent:', err);
    res.status(500).json({ error: 'Failed to mark student as absent' });
  }
});

// Get completed classes count for service fee calculation
router.get('/completed-classes', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ 
        success: false, 
        error: 'Start date and end date are required' 
      });
    }
    
    // Find completed classes within the date range
    const allCompletedClasses = await Booking.find({
      teacherId,
      status: 'completed',
      date: { $gte: startDate, $lte: endDate }
    });
    
    // Filter classes by new attendance.classCompleted flag first, fallback to duration
    const completedClasses = allCompletedClasses.filter(booking => {
      if (booking.attendance && typeof booking.attendance.classCompleted === 'boolean') {
        return booking.attendance.classCompleted === true;
      }
      if (!booking.finishedAt || !booking.date || !booking.time) return false;
      const classDate = new Date(booking.date);
      const [hours, minutes] = booking.time.split(':').map(Number);
      const classStartTime = new Date(classDate);
      classStartTime.setHours(hours, minutes, 0, 0);
      const classFinishTime = new Date(booking.finishedAt);
      const durationMinutes = (classFinishTime - classStartTime) / (1000 * 60);
      return durationMinutes >= 15 && durationMinutes <= 25;
    }).length;
    
    // Find absent classes and distinguish between teacher and student absences
    // Check both status: 'absent' and absentMarkedAt field
    const absentBookings = await Booking.find({
      teacherId,
      $or: [
        { status: 'absent' },
        { absentMarkedAt: { $exists: true, $ne: null } }
      ],
      date: { $gte: startDate, $lte: endDate }
    });
    
    let teacherAbsentClasses = 0;
    let studentAbsentClasses = 0;
    
    absentBookings.forEach(booking => {
      // If absentMarkedAt exists, it's a student absent (marked by teacher)
      if (booking.absentMarkedAt) {
        studentAbsentClasses++;
        console.log(`Student absent class found: ${booking.date} ${booking.time} (marked at: ${booking.absentMarkedAt})`);
      } else {
        // Check attendance for status: 'absent' bookings
        const teacherEntered = booking.attendance?.teacherEntered || false;
        if (!teacherEntered) {
          // Teacher was absent - count for deduction
          teacherAbsentClasses++;
        } else {
          // Student was absent but teacher was present - count for 50% payment
          studentAbsentClasses++;
        }
      }
    });
    
    // Debug: Get all classes to see what statuses exist
    const allClasses = await Booking.find({
      teacherId,
      date: { $gte: startDate, $lte: endDate }
    }).select('date time status teacherId finishedAt attendance');
    
    console.log('=== DEBUG: All classes in date range ===');
    console.log('Date range:', startDate, 'to', endDate);
    console.log('Teacher ID:', teacherId);
    console.log('Teacher ID type:', typeof teacherId);
    console.log('Teacher ID length:', teacherId ? teacherId.length : 'null');
    console.log('Total classes found:', allClasses.length);
    
    allClasses.forEach((cls, index) => {
      let durationInfo = 'N/A';
      if (cls.status === 'completed' && cls.finishedAt && cls.date && cls.time) {
        const classDate = new Date(cls.date);
        const [hours, minutes] = cls.time.split(':').map(Number);
        const classStartTime = new Date(classDate);
        classStartTime.setHours(hours, minutes, 0, 0);
        const classFinishTime = new Date(cls.finishedAt);
        const durationMinutes = (classFinishTime - classStartTime) / (1000 * 60);
        const meetsRequirement = durationMinutes >= 15 && durationMinutes <= 25;
        durationInfo = `${durationMinutes.toFixed(1)}min (${meetsRequirement ? 'COMPLETED' : 'FINISHED'})`;
      }
      console.log(`${index + 1}. ${cls.date} ${cls.time}: status = "${cls.status}", teacherId: "${cls.teacherId}", finishedAt: ${cls.finishedAt || 'null'}, classCompleted: ${cls.attendance?.classCompleted ?? 'n/a'}, duration: ${durationInfo}`);
    });
    
    // Count by status
    const statusCounts = {};
    allClasses.forEach(cls => {
      statusCounts[cls.status] = (statusCounts[cls.status] || 0) + 1;
    });
    console.log('Status breakdown:', statusCounts);
    
    console.log('Completed classes count:', completedClasses);
    console.log('Teacher absent classes count:', teacherAbsentClasses);
    console.log('Student absent classes count:', studentAbsentClasses);
    console.log('=== END DEBUG ===');
    
    res.json({
      success: true,
      completedClasses: completedClasses,
      teacherAbsentClasses: teacherAbsentClasses,
      studentAbsentClasses: studentAbsentClasses,
      debug: {
        dateRange: `${startDate} to ${endDate}`,
        teacherId: teacherId,
        totalClasses: allClasses.length,
        statusBreakdown: statusCounts,
        allClasses: allClasses.map(cls => {
          let durationInfo = null;
          if (cls.status === 'completed' && cls.finishedAt && cls.date && cls.time) {
            const classDate = new Date(cls.date);
            const [hours, minutes] = cls.time.split(':').map(Number);
            const classStartTime = new Date(classDate);
            classStartTime.setHours(hours, minutes, 0, 0);
            const classFinishTime = new Date(cls.finishedAt);
            const durationMinutes = (classFinishTime - classStartTime) / (1000 * 60);
            durationInfo = {
              durationMinutes: durationMinutes,
              meetsRequirement: durationMinutes >= 15 && durationMinutes <= 25
            };
          }
          return {
            date: cls.date,
            time: cls.time,
            status: cls.status,
            teacherId: cls.teacherId,
            finishedAt: cls.finishedAt,
            attendance: cls.attendance,
            durationInfo
          };
        })
      }
    });
  } catch (err) {
    console.error('Error getting completed classes:', err);
    res.status(500).json({ success: false, error: 'Failed to get completed classes' });
  }
});

// Cancellation request endpoints
router.post('/request-cancellation', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { bookingId, reason } = req.body;
    const teacherId = req.user.teacherId;
    
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
    
    // Find the booking and verify it belongs to this teacher
    const booking = await Booking.findById(bookingId);
    
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        error: 'Booking not found' 
      });
    }
    
    if (booking.teacherId.toString() !== teacherId) {
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
      requesterType: 'teacher',
      requesterId: teacherId,
      reason
    });
    
    await cancellationRequest.save();
    
    // Create notification for admin
    await createNotification(teacherId, 'cancellation-request', `Cancellation request submitted for ${booking.date} at ${booking.time}`);
    
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

// Get cancellation requests for teacher
router.get('/cancellation-requests', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    
    const requests = await CancellationRequest.find({
      requesterId: teacherId,
      requesterType: 'teacher'
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

// Get teacher classes for week (for frontend) - supports both authenticated and unauthenticated
router.get('/classes', async (req, res) => {
  try {
    const { teacherId, week, startDate, endDate } = req.query;
    
    // Check if this is an authenticated request
    const authHeader = req.headers.authorization;
    let isAuthenticated = false;
    let authenticatedTeacherId = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        isAuthenticated = true;
        authenticatedTeacherId = decoded.teacherId;
      } catch (error) {
        // Token verification failed, treat as unauthenticated
        console.log('Token verification failed, treating as unauthenticated request');
      }
    }
    
    // For authenticated requests, use startDate and endDate
    if (isAuthenticated && startDate && endDate) {
      console.log('Authenticated request - fetching classes for date range:', startDate, 'to', endDate);
      
      // Find all bookings for the teacher in the specified date range
      const bookings = await Booking.find({
        teacherId: authenticatedTeacherId,
        date: {
          $gte: startDate,
          $lte: endDate
        }
      })
      .populate('studentId', 'firstName lastName username')
      .populate('teacherId', 'firstName lastName email')
      .sort({ date: 1, time: 1 });
      
      // Get cancellation requests for these bookings
      const bookingIds = bookings.map(booking => booking._id.toString());
      const cancellationRequests = await CancellationRequest.find({
        bookingId: { $in: bookingIds.map(id => new mongoose.Types.ObjectId(id)) }
      });
      
      // Create a map of bookingId to cancellation request
      const cancellationMap = {};
      cancellationRequests.forEach(cancellation => {
        cancellationMap[cancellation.bookingId.toString()] = cancellation;
      });
      
      // Get resolved issues for all bookings
      const IssueReport = require('./models/IssueReport');
      const resolvedIssues = await IssueReport.find({
        bookingId: { $in: bookingIds },
        status: 'resolved'
      });
      
      // Create a map of bookingId to resolved issue
      const resolvedIssueMap = {};
      resolvedIssues.forEach(issue => {
        if (!resolvedIssueMap[issue.bookingId]) {
          resolvedIssueMap[issue.bookingId] = [];
        }
        resolvedIssueMap[issue.bookingId].push(issue);
      });
      
      // Process bookings to include deduction information
      const classes = bookings.map(booking => {
        const classData = {
          id: booking._id,
          date: booking.date,
          time: booking.time,
          status: booking.status,
          lesson: booking.lesson,
          studentLevel: booking.studentLevel,
          studentName: booking.studentId?.firstName || booking.studentId?.username || 'Unknown',
          teacherName: booking.teacherId?.firstName || booking.teacherId?.email || 'Unknown',
          lateMinutes: booking.lateMinutes || 0,
          attendance: booking.attendance || {},
          finishedAt: booking.finishedAt,
          absentMarkedAt: booking.absentMarkedAt,
          cancellationReason: null,
          cancellationTime: null,
          hasResolvedIssue: (resolvedIssueMap[booking._id.toString()] || []).length > 0
        };
        
        // Add cancellation information if status is cancelled
        if (booking.status === 'cancelled') {
          const cancellation = cancellationMap[booking._id.toString()];
          if (cancellation) {
            classData.cancellationReason = {
              reason: cancellation.reason,
              rejected: cancellation.rejected || false
            };
            classData.cancellationTime = cancellation.createdAt;
          }
        }
        
        return classData;
      });
      
      res.json({ success: true, classes });
      
    } else if (!isAuthenticated && teacherId && week) {
      // For unauthenticated requests, use teacherId and week
      console.log('Unauthenticated request - fetching classes for teacherId:', teacherId, 'week:', week);
      
      // Convert email to teacher ObjectId if needed
      let actualTeacherId = teacherId;
      if (teacherId.includes('@')) {
        const teacher = await Teacher.findOne({ 
          $or: [
            { email: teacherId },
            { username: teacherId }
          ]
        });
        if (!teacher) {
          return res.status(404).json({ error: 'Teacher not found' });
        }
        actualTeacherId = teacher._id;
      }
      
      // Get bookings for the week
      const start = new Date(week + 'T00:00:00');
      const end = new Date(start);
      end.setDate(start.getDate() + 7);

      const bookings = await Booking.find({
        teacherId: actualTeacherId,
        date: { $gte: week, $lt: end.toISOString().slice(0, 10) },
        status: { $ne: 'cancelled' }
      });

      res.json({ bookings });
      
    } else {
      return res.status(400).json({ 
        error: 'Invalid parameters. For authenticated requests, provide startDate and endDate. For unauthenticated requests, provide teacherId and week.' 
      });
    }
    
  } catch (err) {
    console.error('Error fetching teacher classes:', err);
    res.status(500).json({ error: 'Failed to fetch teacher classes' });
  }
});

// Update class status (completed/absent)
// Note: Completed classes cannot be changed - they are locked
router.post('/update-class-status', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { date, time, status } = req.body;
    const teacherId = req.user.teacherId;
    
    if (!date || !time || !status) {
      return res.status(400).json({
        success: false,
        error: 'Date, time, and status are required'
      });
    }
    
    if (!['completed', 'absent'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be either "completed" or "absent"'
      });
    }
    
    // Find the booking first to check current status
    const booking = await Booking.findOne({
      teacherId,
      date: date,
      time: time
    });
    
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: 'Booking not found for the specified date and time'
      });
    }
    
    // Prevent changing completed classes - they are locked
    if (booking.status === 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot change status of a completed class. Completed classes are locked.'
      });
    }
    
    // Allow marking as 'completed' from any status (except already completed)
    // This allows normal class completion as well as changing absent classes to completed
    // No additional validation needed - any non-completed status can become completed
    
    // Update the booking status
    booking.status = status;
    if (status === 'completed') {
      booking.finishedAt = new Date();
      // Set attendance.classCompleted to true for service fee calculation
      if (!booking.attendance) {
        booking.attendance = {};
      }
      booking.attendance.classCompleted = true;
    }
    
    await booking.save();
    
    console.log(`Updated booking ${booking._id} status to ${status}`);
    
    res.json({
      success: true,
      message: `Class status updated to ${status}`,
      booking: booking
    });
  } catch (err) {
    console.error('Error updating class status:', err);
    res.status(500).json({ error: 'Failed to update class status' });
  }
});

// Update slot status when booked or cancelled
router.post('/update-slot-status', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    const { date, time, action } = req.body; // action: 'booked' or 'cancelled'
    
    if (!date || !time || !action) {
      return res.status(400).json({ error: 'Missing date, time, or action' });
    }
    
    if (!['booked', 'cancelled'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be "booked" or "cancelled"' });
    }
    
    if (action === 'booked') {
      // When a slot is booked, remove it from open slots
      await TeacherSlot.deleteOne({ teacherId, date, time });
    } else if (action === 'cancelled') {
      // When a booking is cancelled, add the slot back to open slots
      const existingSlot = await TeacherSlot.findOne({ teacherId, date, time });
      if (!existingSlot) {
        await TeacherSlot.create({ teacherId, date, time });
      }
    }
    
    res.json({ success: true, message: `Slot status updated: ${action}` });
  } catch (err) {
    console.error('Error updating slot status:', err);
    res.status(500).json({ error: 'Failed to update slot status' });
  }
});

// Request admin edit for time log
router.post('/request-time-edit', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { logId, date, reason } = req.body;
    const teacherId = req.user.teacherId;
    
    if (!logId || !date) {
      return res.status(400).json({
        success: false,
        error: 'Log ID and date are required'
      });
    }
    
    // Verify the time log belongs to the requesting teacher
    const timeLog = await TimeLog.findById(logId);
    if (!timeLog) {
      return res.status(404).json({
        success: false,
        error: 'Time log not found'
      });
    }
    
    if (timeLog.teacherId.toString() !== teacherId) {
      return res.status(403).json({
        success: false,
        error: 'You can only request edits for your own time logs'
      });
    }
    
    // Create a time edit request (you might want to create a TimeEditRequest model)
    // For now, we'll create a notification for admin
    await createNotification(teacherId, 'time_edit', 
      `${logId} for ${date}: ${reason || 'No reason provided'}`
    );
    
    res.json({
      success: true,
      message: 'Time edit request submitted successfully'
    });
  } catch (err) {
    console.error('Error requesting time edit:', err);
    res.status(500).json({
      success: false,
      error: 'Failed to submit time edit request'
    });
  }
});

// Get teacher's time edit request statuses
router.get('/time-edit-requests', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    
    // Get all time edit related notifications for this teacher
    const notifications = await Notification.find({
      teacherId: teacherId,
      type: { $in: ['time_edit', 'time_edit_response'] }
    }).sort({ createdAt: -1 });
    
    const requests = [];
    
    notifications.forEach(notification => {
      if (notification.type === 'time_edit') {
        // This is a pending request
        const logId = notification.message.split(' ')[0];
        const date = notification.message.split('for ')[1]?.split(':')[0];
        const reason = notification.message.split(': ')[1];
        
        requests.push({
          logId: logId,
          date: date,
          reason: reason,
          status: notification.read ? 'processed' : 'pending',
          createdAt: notification.createdAt
        });
      } else if (notification.type === 'time_edit_response') {
        // This is a response (approved/rejected)
        const isApproved = notification.message.includes('approved');
        const isRejected = notification.message.includes('rejected');
        
        // Try to extract log ID from the response message
        // For approved requests, the message format is: "Your time log edit request has been approved. Time updated to: HH:MM - HH:MM"
        // We need to find the original request to get the log ID
        const originalRequest = notifications.find(n => 
          n.type === 'time_edit' && 
          n.createdAt < notification.createdAt &&
          !n.read
        );
        
        if (originalRequest) {
          const logId = originalRequest.message.split(' ')[0];
          const date = originalRequest.message.split('for ')[1]?.split(':')[0];
          
          requests.push({
            logId: logId,
            date: date,
            status: isApproved ? 'approved' : isRejected ? 'rejected' : 'processed',
            responseMessage: notification.message,
            createdAt: notification.createdAt
          });
        }
      }
    });
    
    res.json(requests);
  } catch (err) {
    console.error('Error fetching time edit requests:', err);
    res.status(500).json({ error: 'Failed to fetch time edit requests' });
  }
});

// Get weekly payment summary for a teacher (authenticated)
router.get('/weekly-payment-summary', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
    }

    console.log(`Fetching weekly payment summary for teacher ${teacherId} from ${startDate} to ${endDate}`);

    // Fetch all bookings for the teacher within the specified date range
    const bookings = await Booking.find({
      teacherId,
      date: { $gte: startDate, $lte: endDate }
    });

    // Fetch all cancellation requests related to these bookings
    const bookingIds = bookings.map(b => b._id);
    const cancellationRequests = await CancellationRequest.find({
      bookingId: { $in: bookingIds }
    });

    // Get the global rate from admin settings
    const GlobalSettings = require('./models/GlobalSettings');
    const globalSettings = await GlobalSettings.findOne();
    const ratePerClass = globalSettings ? globalSettings.globalRate : 100; // Default rate if not set

    let totalClasses = bookings.length;
    let completedClasses = 0;
    let cancelledClasses = 0;
    let absentClasses = 0;
    let studentAbsentClasses = 0;
    let lateDeductions = 0;
    let cancellationDeductions = 0;
    let absentDeductions = 0;

    bookings.forEach(booking => {
      if (booking.status === 'completed') {
        // Check if completed class meets duration requirement (15-25 minutes)
        // If not, count as teacher absence (less than 15 minutes)
        let meetsDurationRequirement = false;
        
        if (booking.attendance && typeof booking.attendance.classCompleted === 'boolean') {
          meetsDurationRequirement = booking.attendance.classCompleted === true;
          console.log(`Using attendance.classCompleted flag: ${meetsDurationRequirement}`);
        } else if (booking.finishedAt && booking.date && booking.time) {
          const classDate = new Date(booking.date);
          const [hours, minutes] = booking.time.split(':').map(Number);
          const classStartTime = new Date(classDate);
          classStartTime.setHours(hours, minutes, 0, 0);
          const classFinishTime = new Date(booking.finishedAt);
          const durationMinutes = (classFinishTime - classStartTime) / (1000 * 60);
          meetsDurationRequirement = durationMinutes >= 15 && durationMinutes <= 25;
          console.log(`Calculated duration: ${durationMinutes.toFixed(2)} minutes, meets requirement: ${meetsDurationRequirement}`);
        } else {
          // If we can't determine duration, assume it meets requirement (be conservative)
          meetsDurationRequirement = true;
          console.log(`Cannot determine duration for ${booking.date} ${booking.time}, assuming meets requirement`);
        }
        
        // Completed classes should be counted as completed regardless of duration
        // The 15-minute rule is for student entry, not class duration
        completedClasses++;
        console.log(`✅ Completed class: ${booking.date} ${booking.time} - counting as completed`);
      } else if (booking.status === 'cancelled') {
        cancelledClasses++;
        
        // Calculate cancellation deduction based on timing
        const cancellationRequest = cancellationRequests.find(req => 
          req.bookingId.toString() === booking._id.toString()
        );
        
        if (cancellationRequest && cancellationRequest.createdAt) {
          const classDateTime = new Date(`${booking.date}T${booking.time}:00`);
          const cancellationTime = new Date(cancellationRequest.createdAt);
          const timeDiffHours = (classDateTime.getTime() - cancellationTime.getTime()) / (1000 * 60 * 60);

          console.log(`Cancelled class: ${booking.date} ${booking.time}, cancelled at: ${cancellationTime}, hours difference: ${timeDiffHours}`);

          let deduction = 0;
          let penaltyType = '';
          let penaltyColor = '';

          if (timeDiffHours > 72) {
            // Green: >72h: 0% (no penalty)
            deduction = 0;
            penaltyType = 'No penalty';
            penaltyColor = 'Green';
            console.log(`Cancellation > 72 hours: no deduction (Green)`);
          } else if (timeDiffHours > 48) {
            // Teal: 48-72h: 12.5%
            deduction = ratePerClass * 0.125;
            penaltyType = '12.5% penalty';
            penaltyColor = 'Teal';
            console.log(`Cancellation 48-72 hours: 12.5% deduction (${deduction.toFixed(2)}) - Teal`);
          } else if (timeDiffHours > 24) {
            // Yellow: 24-48h: 25%
            deduction = ratePerClass * 0.25;
            penaltyType = '25% penalty';
            penaltyColor = 'Yellow';
            console.log(`Cancellation 24-48 hours: 25% deduction (${deduction.toFixed(2)}) - Yellow`);
          } else if (timeDiffHours > 3) {
            // Orange: 3-24h: 100%
            deduction = ratePerClass;
            penaltyType = '100% penalty';
            penaltyColor = 'Orange';
            console.log(`Cancellation 3-24 hours: 100% deduction (${deduction.toFixed(2)}) - Orange`);
          } else {
            // Red: <3h: 300% (highest penalty)
            deduction = ratePerClass * 3;
            penaltyType = '300% penalty';
            penaltyColor = 'Red';
            console.log(`Cancellation < 3 hours: 300% deduction (${deduction.toFixed(2)}) - Red`);
          }

          cancellationDeductions += deduction;
          console.log(`Final cancellation deduction: ₱${deduction.toFixed(2)} (${penaltyColor} - ${penaltyType})`);
        }
      } else if (booking.status === 'absent') {
        // Only count as absent if the TEACHER was absent, not the student
        // Check if teacher entered the classroom
        const teacherEntered = booking.attendance?.teacherEntered || false;
        if (!teacherEntered) {
          // Teacher was absent - count for deduction
          absentClasses++;
          console.log(`Teacher absent for class ${booking.date} ${booking.time} - counting for deduction`);
        } else {
          // Student was absent but teacher was present - count for 50% payment
          studentAbsentClasses++;
          console.log(`Student absent but teacher present for class ${booking.date} ${booking.time} - counting for 50% payment`);
        }
      } else if (booking.status === 'pending') {
        // Check if pending class should be counted as teacher absent
        // If neither teacher nor student entered and class time has passed, count as teacher absent
        const teacherEntered = booking.attendance?.teacherEntered || false;
        const studentEntered = booking.attendance?.studentEntered || false;
        
        // Check if class time has passed (more than 15 minutes past scheduled time)
        const classDateTime = new Date(`${booking.date}T${booking.time}:00`);
        const now = new Date();
        const timeDiffMinutes = (now - classDateTime) / (1000 * 60);
        
        if (timeDiffMinutes > 15 && !teacherEntered) {
          // Class is more than 15 minutes past scheduled time and teacher didn't enter
          // Count as teacher absent
          absentClasses++;
          console.log(`Teacher absent for pending class ${booking.date} ${booking.time} - teacher didn't enter (${timeDiffMinutes.toFixed(1)} minutes past)`);
        } else if (timeDiffMinutes > 15 && teacherEntered && !studentEntered) {
          // Class is more than 15 minutes past scheduled time, teacher entered but student didn't
          // This is student absent, not teacher absent (15-minute rule for student entry)
          studentAbsentClasses++;
          console.log(`Student absent for pending class ${booking.date} ${booking.time} - teacher entered but student didn't enter within 15 minutes (${timeDiffMinutes.toFixed(1)} minutes past) - counting for 50% payment`);
        } else {
          console.log(`Pending class ${booking.date} ${booking.time} - ${timeDiffMinutes.toFixed(1)} minutes past, teacher: ${teacherEntered}, student: ${studentEntered}`);
        }
      }

      // Late arrival deduction (1% of class rate per minute)
      if (booking.lateMinutes && booking.lateMinutes > 0) {
        const lateDeductionPerMinute = ratePerClass * 0.01; // 1% of class rate
        lateDeductions += booking.lateMinutes * lateDeductionPerMinute;
        console.log(`Late deduction: ${booking.lateMinutes} minutes × ${lateDeductionPerMinute.toFixed(2)} = ${(booking.lateMinutes * lateDeductionPerMinute).toFixed(2)}`);
      }
    });

    // Calculate absent deductions: absent count × rate
    absentDeductions = absentClasses * ratePerClass;

    // Calculate student absent payments: student absent count × 50% of rate
    const studentAbsentPayment = studentAbsentClasses * (ratePerClass * 0.5);

    const weeklyFee = completedClasses * ratePerClass;
    const totalDeductions = lateDeductions + cancellationDeductions + absentDeductions;
    const netAmount = weeklyFee + studentAbsentPayment - totalDeductions;

    // Check if this week has been dispersed by admin
    // For now, we'll use a simple logic: if net amount > 0, consider it as "success" (dispersed)
    // In a real system, this would come from an admin payment record
    const status = netAmount > 0 ? 'success' : 'pending';

    const salaryDateRange = `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;

    console.log(`Weekly payment summary calculated:`, {
      totalClasses,
      completedClasses,
      cancelledClasses,
      absentClasses,
      studentAbsentClasses,
      weeklyFee,
      studentAbsentPayment,
      lateDeductions,
      cancellationDeductions,
      absentDeductions,
      netAmount,
      status
    });

    res.json({
      success: true,
      weeklyFee,
      salaryDateRange,
      status,
      totalClasses,
      completedClasses,
      cancelledClasses,
      absentClasses,
      studentAbsentClasses,
      studentAbsentPayment,
      lateDeductions,
      cancellationDeductions,
      absentDeductions,
      netAmount,
      ratePerClass
    });

  } catch (error) {
    console.error('Error fetching weekly payment summary:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch weekly payment summary' });
  }
});

// Get payment history for teacher
router.get('/payment-history', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const teacherId = req.user.teacherId;
    
    console.log(`Fetching payment history for teacher ${teacherId}`);
    console.log(`Date range: ${startDate || 'all'} to ${endDate || 'all'}`);
    
    // Find the teacher to get their profile
    const teacher = await Teacher.findOne({ teacherId });
    if (!teacher) {
      return res.status(404).json({ success: false, error: 'Teacher not found' });
    }
    
    // Get payment history from teacher's profile
    const paymentHistory = teacher.paymentHistory || [];
    
    // Filter by date range if provided
    let filteredPayments = paymentHistory;
    if (startDate && endDate) {
      filteredPayments = paymentHistory.filter(payment => {
        const paymentDate = new Date(payment.issueDate);
        const start = new Date(startDate);
        const end = new Date(endDate);
        return paymentDate >= start && paymentDate <= end;
      });
    }
    
    // Sort by issue date (newest first)
    filteredPayments.sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate));
    
    console.log(`Found ${filteredPayments.length} payment records`);
    
    res.json({
      success: true,
      payments: filteredPayments
    });
    
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch payment history' });
  }
});

// Update teacher settings (email, username, password)
router.post('/update-settings', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { newEmail, newUsername, currentPassword, newPassword } = req.body;
    const teacherId = req.user.teacherId;
    
    console.log('Settings update request for teacher:', teacherId);
    console.log('Update data:', { newEmail: !!newEmail, newUsername: !!newUsername, hasPasswordChange: !!(currentPassword && newPassword) });
    
    // Find the teacher
    const teacher = await Teacher.findOne({ teacherId });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }
    
    // Validate current password if changing password
    if (currentPassword && newPassword) {
      const bcrypt = require('bcrypt');
      const passwordMatch = await bcrypt.compare(currentPassword, teacher.password);
      if (!passwordMatch) {
        return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      }
    }
    
    // Check if new email is already taken
    if (newEmail && newEmail !== teacher.email) {
      const existingEmail = await Teacher.findOne({ email: newEmail });
      if (existingEmail) {
        return res.status(400).json({ success: false, message: 'Email address is already in use' });
      }
    }
    
    // Check if new username is already taken
    if (newUsername && newUsername !== teacher.username) {
      const existingUsername = await Teacher.findOne({ username: newUsername });
      if (existingUsername) {
        return res.status(400).json({ success: false, message: 'Username is already taken' });
      }
    }
    
    // Update fields
    let hasChanges = false;
    
    if (newEmail && newEmail !== teacher.email) {
      teacher.email = newEmail;
      hasChanges = true;
      console.log('Email updated to:', newEmail);
    }
    
    if (newUsername && newUsername !== teacher.username) {
      teacher.username = newUsername;
      hasChanges = true;
      console.log('Username updated to:', newUsername);
    }
    
    if (currentPassword && newPassword) {
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      teacher.password = hashedPassword;
      hasChanges = true;
      console.log('Password updated');
    }
    
    if (hasChanges) {
      await teacher.save();
      console.log('Settings updated successfully for teacher:', teacherId);
      
      res.json({ 
        success: true, 
        message: 'Settings updated successfully',
        updatedFields: {
          email: newEmail || teacher.email,
          username: newUsername || teacher.username,
          passwordChanged: !!(currentPassword && newPassword)
        }
      });
    } else {
      res.json({ 
        success: true, 
        message: 'No changes were made' 
      });
    }
    
  } catch (error) {
    console.error('Error updating teacher settings:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
});



// Give reward to student
router.post('/give-reward', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { type, studentId, bookingId, reason } = req.body;
    const teacherId = req.user.teacherId;
    
    if (!type || !studentId || !bookingId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: type, studentId, bookingId' 
      });
    }
    
    if (!['cookie', 'star'].includes(type)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid reward type. Must be "cookie" or "star"' 
      });
    }
    
    // Verify booking exists and belongs to this teacher
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
        error: 'Not authorized to give rewards for this booking' 
      });
    }
    
    // Create reward record
    const reward = new Reward({
      bookingId,
      teacherId,
      studentId,
      type,
      reason: reason || 'Good performance during class'
    });
    
    await reward.save();
    
    // Emit reward to student via socket
    io.to(bookingId).emit('reward-received', {
      type,
      teacherId,
      studentId,
      bookingId,
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ Reward given: ${type} to student ${studentId} by teacher ${teacherId}`);
    
    res.json({
      success: true,
      message: `${type} reward given successfully`,
      reward: {
        id: reward._id,
        type: reward.type,
        reason: reward.reason,
        givenAt: reward.givenAt
      }
    });
    
  } catch (error) {
    console.error('Error giving reward:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to give reward: ' + error.message 
    });
  }
});

// Get lesson slides for a booking
router.get('/lesson-slides/:bookingId', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const teacherId = req.user.teacherId;
    
    // Verify booking exists and belongs to this teacher
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
        error: 'Not authorized to access slides for this booking' 
      });
    }
    
    // LessonSlides collection removed - this endpoint is no longer functional
    console.log('⚠️ LessonSlides collection removed - slides endpoint disabled');
    return res.json({
      success: true,
      slides: [],
      message: 'LessonSlides collection removed. Slides are no longer stored in the database.'
    });
    
    /* Old code removed - LessonSlides collection no longer exists
    const lessonSlides = await LessonSlides.findOne({ 
      bookingId,
      isActive: true 
    }).sort({ uploadedAt: -1 });
    
    if (!lessonSlides) {
      return res.json({
        success: true,
        slides: [],
        message: 'No slides uploaded for this lesson'
      });
    }
    
    const mappedSlides = lessonSlides.slides.map(slide => ({
      slideNumber: slide.slideNumber,
      url: slide.imageUrl,
      originalFile: slide.originalFile || slide.imageUrl,
      fileName: slide.fileName || `Slide ${slide.slideNumber}`,
      fileType: slide.fileType || 'image',
      title: slide.title,
      notes: slide.notes
    }));
    
    console.log('📚 Mapped slides for response:', mappedSlides);
    
    res.json({
      success: true,
      slides: mappedSlides,
      title: lessonSlides.title,
      description: lessonSlides.description,
      totalSlides: lessonSlides.totalSlides
    });
    */
    
  } catch (error) {
    console.error('Error fetching lesson slides:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch lesson slides: ' + error.message 
    });
  }
});

// Upload lesson slides
router.post('/upload-slides', verifyToken, requireTeacher, upload.array('slides', 10), async (req, res) => {
  try {
    const { bookingId, title, description } = req.body;
    const teacherId = req.user.teacherId;
    const files = req.files;
    
    if (!bookingId || !title || !files || files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: bookingId, title, and at least one slide file' 
      });
    }
    
    // Verify booking exists and belongs to this teacher
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
        error: 'Not authorized to upload slides for this booking' 
      });
    }
    
    // LessonSlides collection removed - slides are no longer saved to database
    console.log(`⚠️ LessonSlides collection removed - slides processing for booking ${bookingId}`);
    
    // Process uploaded files
    let slides = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExt = path.extname(file.originalname).toLowerCase();

      console.log(`📁 Processing file ${i + 1}:`, {
        originalname: file.originalname,
        fileExt: fileExt,
        filename: file.filename
      });

      if (['.ppt', '.pptx'].includes(fileExt)) {
        console.log(`📁 File ${i + 1} identified as PowerPoint, converting...`);
        try {
          const { slides: convertedSlides } = await convertPptxToSlides({
            sourcePath: file.path,
            bookingId
          });
          // Re-number if multiple files; append
          convertedSlides.forEach((s, idx) => {
            s.slideNumber = slides.length + idx + 1;
          });
          slides = slides.concat(convertedSlides);
          console.log(`✅ Converted PPTX to ${convertedSlides.length} slide images`);
        } catch (err) {
          console.error('❌ PPTX conversion failed:', err);
          // Fallback: store as PowerPoint placeholder
          slides.push({
            slideNumber: slides.length + 1,
            imageUrl: '/images/powerpoint-placeholder.svg',
            originalFile: `/uploads/slides/${file.filename}`,
            fileName: file.originalname,
            fileType: 'powerpoint',
            title: `${path.basename(file.originalname, fileExt)}`,
            notes: '',
            needsConversion: true
          });
        }
      } else if (fileExt === '.pdf') {
        console.log(`📁 File ${i + 1} identified as PDF`);
        slides.push({
          slideNumber: slides.length + 1,
          imageUrl: `/uploads/slides/${file.filename}`,
          originalFile: `/uploads/slides/${file.filename}`,
          fileName: file.originalname,
          fileType: 'pdf',
          title: `${path.basename(file.originalname, fileExt)}`,
          notes: '',
          needsConversion: false
        });
      } else {
        console.log(`📁 File ${i + 1} identified as image`);
        slides.push({
          slideNumber: slides.length + 1,
          imageUrl: `/uploads/slides/${file.filename}`,
          originalFile: `/uploads/slides/${file.filename}`,
          fileName: file.originalname,
          fileType: 'image',
          title: `${path.basename(file.originalname, fileExt)}`,
          notes: '',
          needsConversion: false
        });
      }
    }
    
    // LessonSlides collection removed - slides are no longer saved to database
    // Slides are still processed and returned in the response for immediate use
    console.log(`⚠️ LessonSlides collection removed - ${slides.length} slides processed but not saved to database for booking ${bookingId}`);
    
    res.json({
      success: true,
      message: 'Lesson slides processed successfully (not saved to database)',
      slides: {
        count: slides.length,
        title: title,
        totalSlides: slides.length,
        processedAt: new Date()
      }
    });
    
  } catch (error) {
    console.error('Error uploading lesson slides:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload lesson slides: ' + error.message 
    });
  }
});

// Upload slide images (for PowerPoint conversion)
router.post('/upload-slide-images', verifyToken, requireTeacher, upload.array('slideImages', 20), async (req, res) => {
  try {
    const { bookingId, slideIndex } = req.body;
    const teacherId = req.user.teacherId;
    const files = req.files;
    
    if (!bookingId || !slideIndex || !files || files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: bookingId, slideIndex, and slide images' 
      });
    }
    
    // LessonSlides collection removed - this endpoint is no longer functional
    console.log('⚠️ LessonSlides collection removed - slides endpoint disabled');
    return res.status(404).json({ 
      success: false, 
      error: 'LessonSlides collection removed. Slides are no longer stored in the database.' 
    });
    
    /* Old code removed - LessonSlides collection no longer exists
    // Update the specific slide with image versions
    const slideIndexNum = parseInt(slideIndex);
    if (slideIndexNum >= 0 && slideIndexNum < lessonSlides.slides.length) {
      const slideImages = files.map((file, index) => ({
        slideNumber: slideIndexNum + index + 1,
        imageUrl: `/uploads/slides/${file.filename}`,
        title: `Slide ${slideIndexNum + index + 1}`,
        notes: '',
        fileType: 'image'
      }));
      
      // Replace or add the slide images
      lessonSlides.slides.splice(slideIndexNum, slideImages.length, ...slideImages);
      lessonSlides.totalSlides = lessonSlides.slides.length;
      
      await lessonSlides.save();
      
      console.log(`✅ Slide images uploaded: ${slideImages.length} images for slide ${slideIndexNum + 1}`);
      
      res.json({
        success: true,
        message: 'Slide images uploaded successfully',
        slides: lessonSlides.slides
      });
    } else {
      res.status(400).json({ 
        success: false, 
        error: 'Invalid slide index' 
      });
    }
    
  } catch (error) {
    console.error('Error uploading slide images:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload slide images: ' + error.message 
    });
  }
});

// Test route for debugging
router.get('/test-remove-slide', (req, res) => {
  console.log('🧪 Test remove-slide route accessed');
  res.json({ message: 'Remove slide route is accessible' });
});

// Remove slide from lesson slides
router.post('/remove-slide', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { bookingId, slideIndex, slideId } = req.body;
    const teacherId = req.user.teacherId;
    
    if (!bookingId || slideIndex === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: bookingId and slideIndex' 
      });
    }
    
    console.log(`🗑️ Removing slide ${slideIndex} from booking ${bookingId}`);
    
    // LessonSlides collection removed - this endpoint is no longer functional
    console.log('⚠️ LessonSlides collection removed - slides endpoint disabled');
    return res.status(404).json({ 
      success: false, 
      error: 'LessonSlides collection removed. Slides are no longer stored in the database.' 
    });
    
    /* Old code removed - LessonSlides collection no longer exists
    // Verify the slide index is valid
    const slideIndexNum = parseInt(slideIndex);
    if (slideIndexNum < 0 || slideIndexNum >= lessonSlides.slides.length) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid slide index' 
      });
    }
    
    // Get the slide to be removed
    const slideToRemove = lessonSlides.slides[slideIndexNum];
    console.log(`🗑️ Removing slide:`, slideToRemove);
    
    // Remove the slide from the array
    lessonSlides.slides.splice(slideIndexNum, 1);
    lessonSlides.totalSlides = lessonSlides.slides.length;
    
    // Update slide numbers for remaining slides
    lessonSlides.slides.forEach((slide, index) => {
      slide.slideNumber = index + 1;
    });
    
    await lessonSlides.save();
    
    console.log(`✅ Slide removed successfully. Remaining slides: ${lessonSlides.slides.length}`);
    
    res.json({
      success: true,
      message: 'Slide removed successfully',
      remainingSlides: lessonSlides.slides.length,
      slides: lessonSlides.slides
    });
    */
    
  } catch (error) {
    console.error('Error removing slide:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to remove slide: ' + error.message 
    });
  }
});

// Submit teacher feedback for a class (legacy route for frontend compatibility)
router.post('/feedback/submit', verifyToken, requireTeacher, async (req, res) => {
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
    console.log('🔍 Request body:', req.body);
    
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
      return res.status(400).json({ 
        success: false, 
        error: 'Feedback already submitted for this class' 
      });
    }
    
    // Create new feedback
    const feedback = new Feedback({
      bookingId,
      teacherId,
      studentId,
      rating,
      comment: comment || '',
      submittedAt: submittedAt || new Date(),
      lessonDate: new Date(booking.date + 'T' + booking.time + ':00') // Convert booking date/time to lesson date
    });
    
    await feedback.save();
    
    // Save to StarReceived collection for student
    const StarReceived = require('./models/StarReceived');
    const starReceived = new StarReceived({
      recipientId: studentId,
      recipientType: 'student',
      giverId: teacherId,
      giverType: 'teacher',
      bookingId: bookingId,
      rating: rating,
      feedbackId: feedback._id,
      lessonDate: new Date(booking.date + 'T' + booking.time + ':00')
    });
    await starReceived.save();
    console.log('⭐ Star saved to StarReceived collection for student:', studentId);
    
    console.log('✅ Teacher feedback submitted successfully');
    
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

// Complete a class (mark as finished) (legacy route for frontend compatibility)
router.post('/booking/:bookingId/complete', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const teacherId = req.user.teacherId;
    
    console.log('✅ Completing class:', bookingId, 'for teacher:', teacherId);
    console.log('🔍 Request params:', req.params);
    
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
    
    // Create notification
    const notificationMessage = `Class completed for ${booking.date} at ${booking.time}`;
    await createNotification(teacherId, 'class-completed', notificationMessage);
    
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

// Mark student as absent for a specific booking (legacy route for frontend compatibility)
router.post('/booking/:bookingId/mark-student-absent', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const teacherId = req.user.teacherId;
    
    console.log('🚫 Marking student as absent for booking:', bookingId, 'by teacher:', teacherId);
    console.log('🔍 Request body:', req.body);
    console.log('🔍 Request params:', req.params);
    
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
    
    // Create notification for admin
    const notificationMessage = `Student marked as absent for class on ${booking.date} at ${booking.time}`;
    await createNotification('admin', 'student-absent', notificationMessage);
    
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

// Report class issue
router.post('/report-issue', verifyToken, requireTeacher, upload.single('screenshot'), async (req, res) => {
  try {
    const { bookingId, teacherId, studentId, issueType, description, submittedAt } = req.body;
    
    if (!bookingId || !issueType || !description) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: bookingId, issueType, or description' 
      });
    }
    
    console.log('📝 Teacher issue report submission:', {
      bookingId,
      teacherId,
      studentId,
      issueType,
      description: description.substring(0, 50) + '...',
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
    
    // Handle file upload if screenshot is provided
    let screenshotPath = null;
    if (req.file) {
      screenshotPath = req.file.path;
      console.log('📸 Screenshot uploaded:', req.file.filename);
    }
    
    // Determine payment impact based on issue type
    let teacherPaymentImpact = 'normal'; // normal, no_payment
    let studentPaymentImpact = 'normal'; // normal, full_payment
    
    if (issueType.includes('Technical Issue') || issueType.includes('Audio/Video problems')) {
      // Teacher technical issues - teacher doesn't get paid, student still pays
      teacherPaymentImpact = 'no_payment';
      studentPaymentImpact = 'normal';
    } else if (issueType.includes('Student Behavior Issue')) {
      // Student behavior issues - teacher gets paid, student still pays
      teacherPaymentImpact = 'normal';
      studentPaymentImpact = 'normal';
    } else if (issueType.includes('Lesson Issue') || issueType.includes('Payment Issue') || issueType.includes('Schedule Conflict')) {
      // Other issues - case by case basis, default to normal
      teacherPaymentImpact = 'normal';
      studentPaymentImpact = 'normal';
    }
    
    // Create issue report
    const issueReport = new IssueReport({
      bookingId,
      teacherId,
      studentId,
      issueType,
      description,
      screenshotPath,
      submittedAt: submittedAt || new Date(),
      status: 'pending',
      teacherPaymentImpact,
      studentPaymentImpact
    });
    
    await issueReport.save();
    
    console.log('✅ Issue report submitted successfully');
    
    // Create notification for admin
    const notificationMessage = `New issue report submitted for class on ${booking.date} at ${booking.time}`;
    await createNotification('admin', 'issue-report', notificationMessage);
    
    res.json({
      success: true,
      message: 'Issue report submitted successfully. Admin will review it.',
      issueReport: {
        id: issueReport._id,
        issueType,
        description: issueReport.description,
        submittedAt: issueReport.submittedAt,
        status: issueReport.status
      }
    });
    
  } catch (error) {
    console.error('❌ Error submitting issue report:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to submit issue report: ' + error.message 
    });
  }
});

// Check if a class has issues (pending, resolved, etc.)
router.get('/check-class-issues', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { bookingId } = req.query;
    const teacherId = req.user.teacherId;
    
    if (!bookingId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Booking ID is required' 
      });
    }
    
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
    
    // Check for all issue reports for this booking
    const issues = await IssueReport.find({
      bookingId: bookingId
    }).select('status resolutionType resolveNotes teacherFaultReason resolvedAt');
    
    const pendingIssues = issues.filter(issue => issue.status === 'pending');
    const resolvedIssues = issues.filter(issue => issue.status === 'resolved');
    
    console.log(`🔍 Class ${bookingId} has ${issues.length} total issues (${pendingIssues.length} pending, ${resolvedIssues.length} resolved)`);
    
    res.json({
      success: true,
      hasPendingIssues: pendingIssues.length > 0,
      hasResolvedIssues: resolvedIssues.length > 0,
      pendingIssuesCount: pendingIssues.length,
      resolvedIssuesCount: resolvedIssues.length,
      issues: issues
    });
    
  } catch (error) {
    console.error('❌ Error checking class issues:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check class issues: ' + error.message 
    });
  }
});

// Get resolved issue payments for teacher
router.get('/resolved-issue-payments', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const teacherId = req.user.teacherId;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
    }
    
    // Find resolved issues for this teacher within the date range
    const resolvedIssues = await IssueReport.find({
      teacherId: teacherId,
      status: 'resolved',
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate + 'T23:59:59.999Z')
      }
    }).populate('bookingId');
    
    // Count by resolution type
    let systemIssueCount = 0;
    let studentIssueCount = 0;
    let teacherFaultCount = 0;
    
    resolvedIssues.forEach(issue => {
      if (issue.resolutionType === 'system-issue') {
        systemIssueCount++;
      } else if (issue.resolutionType === 'student-issue') {
        studentIssueCount++;
      } else if (issue.resolutionType === 'teacher-fault') {
        teacherFaultCount++;
      }
    });
    
    res.json({
      success: true,
      systemIssueCount,
      studentIssueCount,
      teacherFaultCount,
      totalResolvedIssues: resolvedIssues.length,
      resolvedIssues: resolvedIssues
    });
  } catch (error) {
    console.error('Error fetching resolved issue payments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resolved issue payments'
    });
  }
});

// Get teacher attendance analysis
router.get('/attendance-analysis', verifyToken, requireTeacher, async (req, res) => {
  try {
    console.log('📊 Attendance analysis endpoint called');
    console.log('📊 req.user:', req.user);
    console.log('📊 req.query:', req.query);
    
    // Get teacherId from token or query (for backward compatibility)
    let teacherId = req.user.teacherId || req.user.id || req.user._id || req.query.teacherId;
    
    // If still no teacherId, try to get it from req.teacher (set by requireTeacher middleware)
    if (!teacherId && req.teacher) {
      teacherId = req.teacher.teacherId || req.teacher._id || req.teacher.id;
    }
    
    // Convert to string if it's an ObjectId
    if (teacherId && typeof teacherId.toString === 'function') {
      teacherId = teacherId.toString();
    }
    
    const { startDate, endDate, periodType = 'weekly' } = req.query;
    
    console.log('📊 Extracted teacherId:', teacherId);
    
    if (!teacherId) {
      console.error('❌ No teacherId found in request:', {
        user: req.user,
        teacher: req.teacher,
        query: req.query
      });
      return res.status(400).json({ success: false, error: 'Teacher ID is required' });
    }
    
    // Determine date range
    let periodStart, periodEnd;
    const now = new Date();
    
    if (startDate && endDate) {
      periodStart = new Date(startDate);
      periodEnd = new Date(endDate);
    } else if (periodType === 'weekly') {
      // Current week (Monday to Sunday)
      const dayOfWeek = now.getDay();
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() - daysToMonday);
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = new Date(periodStart);
      periodEnd.setDate(periodStart.getDate() + 6);
      periodEnd.setHours(23, 59, 59, 999);
    } else if (periodType === 'monthly') {
      // Current month
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else {
      // Default to last 30 days
      periodEnd = new Date(now);
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() - 30);
    }
    
    console.log(`📊 Generating attendance analysis for teacher ${teacherId} from ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);
    
    // Get all bookings for this teacher in the period
    const bookings = await Booking.find({
      teacherId: teacherId,
      date: {
        $gte: periodStart.toISOString().split('T')[0],
        $lte: periodEnd.toISOString().split('T')[0]
      }
    }).sort({ date: 1, time: 1 });
    
    // Get issue reports for this teacher in the period
    const IssueReport = require('./models/IssueReport');
    const issues = await IssueReport.find({
      teacherId: teacherId,
      submittedAt: {
        $gte: periodStart,
        $lte: periodEnd
      }
    });
    
    // Initialize counters
    let completedClasses = 0;
    let teacherAbsences = 0;
    let studentAbsences = 0;
    let cancellations = 0;
    let lateArrivals = 0;
    let totalLateMinutes = 0;
    let systemIssues = 0;
    let teacherIssues = 0;
    let studentIssues = 0;
    
    // Detailed breakdown arrays
    const breakdown = {
      completed: [],
      teacherAbsent: [],
      studentAbsent: [],
      cancelled: [],
      late: [],
      systemIssues: [],
      teacherIssues: [],
      studentIssues: []
    };
    
    // Process bookings
    for (const booking of bookings) {
      const bookingDate = new Date(`${booking.date}T${booking.time}:00`);
      
      if (booking.status === 'completed') {
        completedClasses++;
        const entry = {
          bookingId: booking._id.toString(),
          date: bookingDate,
          time: booking.time,
          lateMinutes: booking.lateMinutes || 0
        };
        breakdown.completed.push(entry);
        
        if (booking.lateMinutes && booking.lateMinutes > 0) {
          lateArrivals++;
          totalLateMinutes += booking.lateMinutes;
          breakdown.late.push(entry);
        }
        
        // Check if student was absent (teacher entered but student didn't)
        if (booking.attendance && booking.attendance.teacherEntered && !booking.attendance.studentEntered) {
          studentAbsences++;
          breakdown.studentAbsent.push({
            bookingId: booking._id.toString(),
            date: bookingDate,
            time: booking.time
          });
        }
      } else if (booking.status === 'absent') {
        // Check if teacher was absent
        if (booking.attendance && !booking.attendance.teacherEntered) {
          teacherAbsences++;
          breakdown.teacherAbsent.push({
            bookingId: booking._id.toString(),
            date: bookingDate,
            time: booking.time,
            reason: booking.absentReason || 'No reason provided'
          });
        } else if (booking.attendance && booking.attendance.teacherEntered && !booking.attendance.studentEntered) {
          studentAbsences++;
          breakdown.studentAbsent.push({
            bookingId: booking._id.toString(),
            date: bookingDate,
            time: booking.time
          });
        }
      } else if (booking.status === 'cancelled') {
        cancellations++;
        breakdown.cancelled.push({
          bookingId: booking._id.toString(),
          date: bookingDate,
          time: booking.time,
          cancelledBy: booking.cancellationReason?.reason || 'Unknown',
          cancellationTime: booking.cancellationTime || bookingDate
        });
      }
    }
    
    // Process issues
    for (const issue of issues) {
      const booking = bookings.find(b => b._id.toString() === issue.bookingId);
      const issueDate = booking ? new Date(`${booking.date}T${booking.time}:00`) : issue.submittedAt;
      
      const issueEntry = {
        bookingId: issue.bookingId,
        issueId: issue._id.toString(),
        date: issueDate,
        description: issue.description.substring(0, 100) + (issue.description.length > 100 ? '...' : '')
      };
      
      if (issue.resolutionType === 'system-issue') {
        systemIssues++;
        breakdown.systemIssues.push(issueEntry);
      } else if (issue.resolutionType === 'teacher-fault') {
        teacherIssues++;
        breakdown.teacherIssues.push(issueEntry);
      } else if (issue.resolutionType === 'student-issue') {
        studentIssues++;
        breakdown.studentIssues.push(issueEntry);
      }
    }
    
    // Calculate metrics
    const totalScheduled = bookings.length;
    const attendanceRate = totalScheduled > 0 ? 
      Math.round((completedClasses / totalScheduled) * 100 * 10) / 10 : 0;
    const punctualityRate = completedClasses > 0 ? 
      Math.round(((completedClasses - lateArrivals) / completedClasses) * 100 * 10) / 10 : 0;
    
    const analysis = {
      teacherId,
      periodStart,
      periodEnd,
      periodType,
      completedClasses,
      teacherAbsences,
      studentAbsences,
      cancellations,
      lateArrivals,
      totalLateMinutes,
      systemIssues,
      teacherIssues,
      studentIssues,
      breakdown,
      attendanceRate,
      punctualityRate,
      totalScheduled,
      generatedAt: new Date()
    };
    
    // Save to database for historical tracking (optional - don't block response if it fails)
    try {
      const TeacherAttendanceAnalysis = require('./models/TeacherAttendanceAnalysis');
      const savedAnalysis = new TeacherAttendanceAnalysis({
        teacherId: teacherId.toString(),
        periodStart: periodStart,
        periodEnd: periodEnd,
        periodType: periodType,
        completedClasses,
        teacherAbsences,
        studentAbsences,
        cancellations,
        lateArrivals,
        totalLateMinutes,
        systemIssues,
        teacherIssues,
        studentIssues,
        breakdown,
        attendanceRate,
        punctualityRate
      });
      await savedAnalysis.save();
      console.log('✅ Attendance analysis saved to database');
    } catch (saveError) {
      console.error('⚠️ Failed to save attendance analysis to database:', saveError.message);
      // Continue even if save fails - we still want to return the analysis
    }
    
    console.log('✅ Attendance analysis generated:', {
      completedClasses,
      teacherAbsences,
      studentAbsences,
      cancellations,
      lateArrivals,
      attendanceRate: attendanceRate + '%',
      punctualityRate: punctualityRate + '%'
    });
    
    // Ensure response includes totalScheduledClasses for frontend compatibility
    const responseAnalysis = {
      ...analysis,
      totalScheduledClasses: analysis.totalScheduled || 0
    };
    
    res.json({
      success: true,
      analysis: responseAnalysis
    });
    
  } catch (error) {
    console.error('❌ Error generating attendance analysis:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate attendance analysis: ' + error.message 
    });
  }
});

// Token validation endpoint
router.get('/validate-token', verifyToken, requireTeacher, async (req, res) => {
  try {
    res.json({ 
      success: true, 
      message: 'Token is valid',
      teacher: {
        teacherId: req.teacher.teacherId,
        username: req.teacher.username,
        firstName: req.teacher.firstName,
        lastName: req.teacher.lastName
      }
    });
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(401).json({ 
      success: false, 
      error: 'Invalid token' 
    });
  }
});

// ========== PROFESSIONAL DEVELOPMENT ENDPOINTS ==========

// Get or add certifications
router.get('/certifications', verifyToken, requireTeacher, async (req, res) => {
  try {
    console.log('=== GET /certifications ===');
    console.log('Teacher ID:', req.user.teacherId);
    
    const teacher = await Teacher.findOne({ teacherId: req.user.teacherId });
    if (!teacher) {
      console.log('Teacher not found');
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    const certifications = teacher.professionalCertifications || [];
    console.log('Found certifications:', certifications.length);
    console.log('Certifications data:', JSON.stringify(certifications, null, 2));
    
    res.json({
      success: true,
      certifications: certifications
    });
  } catch (error) {
    console.error('Error fetching certifications:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Add certification
router.post('/certifications', verifyToken, requireTeacher, async (req, res) => {
  try {
    console.log('=== POST /certifications ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    console.log('Teacher ID:', req.user.teacherId);
    
    const { name, organization, issueDate, expiryDate, certificateNumber } = req.body;
    
    if (!name || !organization || !issueDate) {
      console.log('Validation failed: missing required fields');
      return res.status(400).json({ error: 'Name, organization, and issue date are required' });
    }
    
    const teacher = await Teacher.findOne({ teacherId: req.user.teacherId });
    if (!teacher) {
      console.log('Teacher not found');
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    console.log('Teacher found. Current certifications count:', teacher.professionalCertifications?.length || 0);
    
    const newCertification = {
      name,
      organization,
      issueDate: new Date(issueDate),
      expiryDate: expiryDate ? new Date(expiryDate) : null,
      certificateNumber: certificateNumber || null
    };
    
    if (!teacher.professionalCertifications) {
      teacher.professionalCertifications = [];
    }
    
    teacher.professionalCertifications.push(newCertification);
    console.log('Pushed new certification. New count:', teacher.professionalCertifications.length);
    
    await teacher.save();
    console.log('Teacher saved successfully');
    
    // Refresh teacher from database to get the _id
    await teacher.populate();
    const savedTeacher = await Teacher.findOne({ teacherId: req.user.teacherId });
    const savedCert = savedTeacher.professionalCertifications[savedTeacher.professionalCertifications.length - 1];
    
    console.log('Saved certification with _id:', savedCert._id);
    console.log('All certifications after save:', savedTeacher.professionalCertifications.length);
    
    res.json({
      success: true,
      message: 'Certification added successfully',
      certification: savedCert
    });
  } catch (error) {
    console.error('Error adding certification:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Update certification
router.put('/certifications/:certId', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { certId } = req.params;
    const { name, organization, issueDate, expiryDate, certificateNumber } = req.body;
    
    const teacher = await Teacher.findOne({ teacherId: req.user.teacherId });
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    const cert = teacher.professionalCertifications.id(certId);
    if (!cert) {
      return res.status(404).json({ error: 'Certification not found' });
    }
    
    if (name) cert.name = name;
    if (organization) cert.organization = organization;
    if (issueDate) cert.issueDate = new Date(issueDate);
    if (expiryDate !== undefined) cert.expiryDate = expiryDate ? new Date(expiryDate) : null;
    if (certificateNumber !== undefined) cert.certificateNumber = certificateNumber;
    
    await teacher.save();
    
    res.json({
      success: true,
      message: 'Certification updated successfully',
      certification: cert
    });
  } catch (error) {
    console.error('Error updating certification:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Delete certification
router.delete('/certifications/:certId', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { certId } = req.params;
    
    const teacher = await Teacher.findOne({ teacherId: req.user.teacherId });
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    teacher.professionalCertifications.pull(certId);
    await teacher.save();
    
    res.json({
      success: true,
      message: 'Certification deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting certification:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get skill assessments
router.get('/assessments', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ teacherId: req.user.teacherId });
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    res.json({
      success: true,
      assessments: teacher.skillAssessments || []
    });
  } catch (error) {
    console.error('Error fetching assessments:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Request assessment
router.post('/assessments/request', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ teacherId: req.user.teacherId });
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    // In production, this would create a notification for admins/trainers
    // For now, just log the request
    console.log(`Assessment requested by teacher: ${teacher.teacherId}`);
    
    res.json({
      success: true,
      message: 'Assessment request submitted. You will be notified when it\'s scheduled.'
    });
  } catch (error) {
    console.error('Error requesting assessment:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get peer teachers (for peer learning)
router.get('/peers', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { search } = req.query;
    const currentTeacherId = req.user.teacherId;
    
    // Find other active teachers
    let query = { 
      teacherId: { $ne: currentTeacherId },
      status: 'active'
    };
    
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { fullname: { $regex: search, $options: 'i' } },
        { experience: { $regex: search, $options: 'i' } }
      ];
    }
    
    const peers = await Teacher.find(query)
      .select('teacherId firstName lastName fullname experience teachingAbilities profilePicture')
      .limit(20);
    
    // Format peer data
    const peerData = peers.map(peer => {
      const expertise = [];
      if (peer.teachingAbilities?.listening?.level) expertise.push('Listening');
      if (peer.teachingAbilities?.reading?.level) expertise.push('Reading');
      if (peer.teachingAbilities?.speaking?.level) expertise.push('Speaking');
      if (peer.teachingAbilities?.writing?.level) expertise.push('Writing');
      
      return {
        id: peer.teacherId,
        name: peer.fullname || `${peer.firstName || ''} ${peer.lastName || ''}`.trim() || 'Teacher',
        expertise: expertise.length > 0 ? expertise : ['General English'],
        experience: peer.experience || 'Not specified',
        rating: 4.5, // In production, calculate from feedback
        profilePicture: peer.profilePicture
      };
    });
    
    res.json({
      success: true,
      peers: peerData
    });
  } catch (error) {
    console.error('Error fetching peer teachers:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router; 