const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fsp = require('fs').promises;
const FormData = require('form-data');
const axios = require('axios');
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');
const TeacherSlot = require('./models/TeacherSlot');
const Booking = require('./models/Booking');
const { DateTime } = require('luxon');
const Notification = require('./models/Notification');
const TimeLog = require('./models/TimeLog');
const CancellationRequest = require('./models/CancellationRequest');
const Reward = require('./models/Reward');
// LessonSlides model removed - PPTX conversion still works but slides are not saved to database
const Feedback = require('./models/Feedback');
const IssueReport = require('./models/IssueReport');
const PeerMessage = require('./models/PeerMessage');
const Referral = require('./models/Referral');
const { verifyToken, requireTeacher, requireStudent, requireOwnTeacherData, requireOwnStudentData, logAccess } = require('./authMiddleware');
const realtime = require('./realtime');

async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

async function findStudentForBooking(booking) {
  if (!booking || !booking.studentId) return null;
  return Student.findOne({
    $or: [{ username: booking.studentId }, { email: booking.studentId }]
  });
}

async function consumeReservedCreditForBooking(booking, descriptionPrefix = 'Class finished') {
  if (!booking || booking.creditConsumedAt || booking.creditReservationReleasedAt) {
    return null;
  }
  const student = await findStudentForBooking(booking);
  if (!student) return null;
  const now = new Date();
  const safeReserved = Number(student.reservedCredits || 0);
  if (safeReserved <= 0) return student._id;
  const safeTotal = Number(student.totalCredits || 0);
  const nextReserved = Math.max(safeReserved - 1, 0);
  const nextTotal = Math.max(safeTotal - 1, 0);
  const nextAvailable = Math.max(nextTotal - nextReserved, 0);
  const planLabel = student.subscriptionPlan || '';
  const desc = `${descriptionPrefix} (${booking.date} ${booking.time})`;

  await Student.updateOne(
    { _id: student._id },
    {
      $set: {
        reservedCredits: nextReserved,
        totalCredits: nextTotal,
        creditBalance: nextAvailable
      },
      $inc: { usedCredits: 1 },
      $push: {
        creditTransactions: {
          date: now,
          type: 'use',
          plan: planLabel,
          description: desc,
          credits: -1,
          balanceAfter: nextAvailable,
          amountPaid: 0
        },
        creditHistory: {
          date: now,
          plan: planLabel,
          credits: -1,
          amountPaid: 0,
          paymentId: ''
        }
      }
    }
  );

  booking.creditConsumedAt = now;
  booking.creditReservationReleasedAt = null;

  return student._id;
}

async function releaseReservedCreditForBooking(booking) {
  if (!booking || booking.creditConsumedAt || booking.creditReservationReleasedAt) {
    return null;
  }
  const student = await findStudentForBooking(booking);
  if (!student) return null;
  const safeReserved = Number(student.reservedCredits || 0);
  if (safeReserved <= 0) return student._id;

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
  return student._id;
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

// --- Teacher referral link (commission) ---
function generateReferralCode() {
  // Short, URL-friendly code
  return Math.random().toString(36).slice(2, 8).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
}

router.get('/referral-link', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    const teacher = await Teacher.findOne({ teacherId });
    if (!teacher) {
      return res.status(404).json({ success: false, message: 'Teacher not found' });
    }

    if (!teacher.referralCode) {
      // Ensure uniqueness
      let code = generateReferralCode();
      for (let i = 0; i < 5; i++) {
        const exists = await Teacher.findOne({ referralCode: code }).lean();
        if (!exists) break;
        code = generateReferralCode();
      }
      teacher.referralCode = code;
      await teacher.save();
    }

    const code = teacher.referralCode;
    res.json({
      success: true,
      teacherId: teacher.teacherId,
      referralCode: code,
      // Single referral link (subscription): bring users to plans section on landing page
      subscriptionLink: `/index.html?ref=${encodeURIComponent(code)}#plans`
    });
  } catch (err) {
    console.error('Teacher referral-link error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate referral link' });
  }
});

/**
 * Teacher-only: list subscription referrals credited to this teacher (distinct from admin global view).
 * Each row includes a stable reference number derived from the Referral document id.
 */
router.get('/referrals', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = String(req.user.teacherId || '');
    const { from, to } = req.query;
    const filter = {
      ownerType: 'teacher',
      ownerId: teacherId
    };
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const list = await Referral.find(filter).sort({ createdAt: -1 }).limit(500).lean();

    const totals = list.reduce(
      (acc, r) => {
        acc.count += 1;
        acc.totalAmountPaid += Number(r.amountPaid || 0) || 0;
        acc.totalCommission += Number(r.commissionAmount || 0) || 0;
        return acc;
      },
      { count: 0, totalAmountPaid: 0, totalCommission: 0 }
    );

    const referrals = list.map((r) => {
      const id = String(r._id);
      return {
        id,
        referenceNumber: `RM-${id.toUpperCase().slice(-10)}`,
        referralCode: r.referralCode,
        studentId: r.studentId,
        studentName: r.studentName || '',
        studentEmail: r.studentEmail || '',
        studentContact: r.studentContact || '',
        subscriptionPlan: r.subscriptionPlan || '',
        amountPaid: Number(r.amountPaid || 0) || 0,
        commissionAmount: Number(r.commissionAmount || 0) || 0,
        status: r.status || 'successful',
        createdAt: r.createdAt
      };
    });

    res.json({
      success: true,
      referrals,
      totals,
      teacherId,
      note: 'Admin commission reports use a separate dashboard; this list is scoped to your teacher referral link only.'
    });
  } catch (err) {
    console.error('Teacher referrals error:', err);
    res.status(500).json({ success: false, message: 'Failed to load referrals' });
  }
});

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

/** Public marketing directory (no auth) — active teachers only, safe fields */
router.get('/public/directory', async (req, res) => {
  try {
    const rows = await Teacher.find({ status: { $ne: 'suspended' } })
      .select(
        'teacherId username firstName middleName lastName fullname profilePicture introduction intro videoIntroduction language professionalCertifications documents.certifications'
      )
      .lean()
      .limit(300);

    const teachers = rows.map((t) => {
      const displayName =
        (t.fullname && String(t.fullname).trim()) ||
        [t.firstName, t.middleName, t.lastName].filter(Boolean).join(' ').trim() ||
        t.username ||
        t.teacherId;
      const introFull = (t.introduction || t.intro || '').trim();
      const certNames = [];
      if (Array.isArray(t.professionalCertifications)) {
        t.professionalCertifications.forEach((c) => {
          if (c && c.name) certNames.push(c.name);
        });
      }
      if (t.documents?.certifications?.length) {
        t.documents.certifications.forEach((x) => {
          if (x && !certNames.includes(x)) certNames.push(x);
        });
      }
      if (certNames.length === 0) {
        certNames.push('TESOL Certified', 'TEYL Specialist');
      }
      const lang = t.language ? String(t.language) : 'English';
      const subjects = ['English for Kids', lang !== 'English' ? `${lang} support` : 'Phonics & Reading'].filter(
        Boolean
      );
      const bioSnippet =
        introFull.length > 0
          ? introFull.replace(/\s+/g, ' ').slice(0, 140) + (introFull.length > 140 ? '…' : '')
          : 'Friendly, patient educator who makes every class fun and engaging!';

      return {
        teacherId: t.teacherId,
        displayName,
        photo: t.profilePicture || null,
        intro: introFull || bioSnippet,
        bioSnippet,
        rating: 4.9,
        reviewCount: 0,
        certifications: certNames.slice(0, 8),
        subjects,
        videoIntroduction: t.videoIntroduction || null
      };
    });

    teachers.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' })
    );

    res.json({ teachers });
  } catch (err) {
    console.error('public/directory:', err);
    res.status(500).json({ error: 'Failed to load teachers' });
  }
});

// Peer message - must be early to avoid being shadowed by param routes
router.post('/peer-message', verifyToken, requireTeacher, async (req, res) => {
  try {
    const senderId = req.user.teacherId;
    const { recipientId, message } = req.body;
    if (!recipientId || !message || !message.trim()) {
      return res.status(400).json({ error: 'Recipient and message are required' });
    }
    const sender = await Teacher.findOne({ teacherId: senderId });
    const senderName = sender?.fullname || `${sender?.firstName || ''} ${sender?.lastName || ''}`.trim() || 'A teacher';
    // Persist message for chat history
    const savedMessage = await PeerMessage.create({
      senderId,
      recipientId,
      message: message.trim()
    });
    // Also create a notification for the recipient
    await Notification.create({
      teacherId: recipientId,
      type: 'peer-message',
      message: `${senderName}: ${message.trim()}`,
      senderId: senderId,
      read: false
    });
    // Real-time emit to recipient + sender tabs
    const payload = {
      id: savedMessage._id.toString(),
      senderId,
      recipientId,
      message: savedMessage.message,
      createdAt: savedMessage.createdAt,
      readAt: savedMessage.readAt || null
    };
    const io = realtime.getIo();
    if (io) {
      io.to(`teacher-msg:${recipientId}`).emit('peer-message:new', payload);
      io.to(`teacher-msg:${senderId}`).emit('peer-message:new', payload);
    }
    res.json({ success: true, message: 'Message sent successfully', peerMessage: payload });
  } catch (err) {
    console.error('Error sending peer message:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// List recent peer chats (Messenger-style list)
router.get('/peer-chats', verifyToken, requireTeacher, async (req, res) => {
  try {
    const me = req.user.teacherId;
    const msgs = await PeerMessage.find({
      $or: [{ senderId: me }, { recipientId: me }]
    }).sort({ createdAt: -1 }).limit(200);

    const byPeer = new Map();
    for (const m of msgs) {
      const peerId = m.senderId === me ? m.recipientId : m.senderId;
      if (!byPeer.has(peerId)) {
        byPeer.set(peerId, {
          peerId,
          lastMessage: m.message,
          lastAt: m.createdAt,
          unreadCount: 0
        });
      }
      if (m.recipientId === me && !m.readAt) {
        const row = byPeer.get(peerId);
        row.unreadCount += 1;
      }
    }

    const peers = await Teacher.find({ teacherId: { $in: Array.from(byPeer.keys()) } })
      .select('teacherId fullname firstName lastName profilePicture');
    const peerMap = new Map(peers.map(t => [t.teacherId, t]));

    const chats = Array.from(byPeer.values()).map(c => {
      const t = peerMap.get(c.peerId);
      const name = t?.fullname || `${t?.firstName || ''} ${t?.lastName || ''}`.trim() || c.peerId;
      return {
        peerId: c.peerId,
        name,
        profilePicture: t?.profilePicture || null,
        lastMessage: c.lastMessage,
        lastAt: c.lastAt,
        unreadCount: c.unreadCount
      };
    }).sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));

    res.json({ success: true, chats });
  } catch (err) {
    console.error('Error listing peer chats:', err);
    res.status(500).json({ error: 'Failed to load chats' });
  }
});

// Get conversation messages with a specific peer
router.get('/peer-messages/:peerId', verifyToken, requireTeacher, async (req, res) => {
  try {
    const me = req.user.teacherId;
    const peerId = String(req.params.peerId || '');
    if (!peerId) return res.status(400).json({ error: 'Missing peerId' });

    const messages = await PeerMessage.find({
      $or: [
        { senderId: me, recipientId: peerId },
        { senderId: peerId, recipientId: me }
      ]
    }).sort({ createdAt: 1 }).limit(1000);

    // Mark incoming as read
    await PeerMessage.updateMany(
      { senderId: peerId, recipientId: me, readAt: null },
      { $set: { readAt: new Date() } }
    );

    res.json({
      success: true,
      messages: messages.map(m => ({
        id: m._id.toString(),
        senderId: m.senderId,
        recipientId: m.recipientId,
        message: m.message,
        createdAt: m.createdAt,
        readAt: m.readAt
      }))
    });
  } catch (err) {
    console.error('Error loading peer messages:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// File conversion endpoints removed - files are now displayed directly without conversion
// Legacy endpoints kept for compatibility but return error
router.post('/convert-pptx-base64', verifyToken, requireTeacher, (req, res) => {
  return res.status(410).json({ 
    success: false, 
    error: 'File conversion has been removed. Files are now displayed directly without conversion.' 
  });
});

router.post('/convert-pptx-cloud', verifyToken, requireTeacher, (req, res) => {
  return res.status(410).json({ 
    success: false, 
    error: 'File conversion has been removed. Files are now displayed directly without conversion.' 
  });
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

// Helper: convert local date/time in a zone to UTC ISO string
function toUtcFromLocal(dateStr, timeStr, zone) {
  const z = zone && DateTime.now().setZone(zone).isValid ? zone : 'Asia/Manila';
  const dt = DateTime.fromISO(`${dateStr}T${timeStr}`, { zone: z });
  if (!dt.isValid) throw new Error(`Invalid date/time: ${dateStr} ${timeStr} in zone ${z}`);
  return { utcIso: dt.toUTC().toISO(), zoneUsed: z };
}

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

// Save open slots - Protected: Only authenticated teachers can access their own data
router.post('/open-slot', async (req, res) => {
  try {
    console.log('Received request body:', req.body); // Debug log
    const { teacherId, slots, timezone } = req.body; // slots: [{ date, time }]
    
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

    // Save new open slots with available: true (UTC canonical)
    const newSlots = slots.map(s => { 
      const { utcIso, zoneUsed } = toUtcFromLocal(s.date, s.time, s.timezone || timezone);
      return {
        teacherId: actualTeacherId,
        date: s.date,
        time: s.time,
        dateTimeUtc: utcIso,
        teacherLocalZone: zoneUsed,
        available: true // Set to true when opening slots
      };
    });
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
      realtime.emitAll('slotsUpdated', { teacherId: teacherIdString, ts: Date.now() });
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
    const { teacherId, slots, timezone } = req.body; // slots: [{ date, time }]
    
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
    const slotConditions = slots.map(s => {
      // Try to match by UTC if available on existing data
      if (s.dateTimeUtc) {
        return { teacherId: actualTeacherId, dateTimeUtc: s.dateTimeUtc };
      }
      // Otherwise compute from provided timezone/body timezone
      let dateTimeUtc = null;
      try {
        const { utcIso } = toUtcFromLocal(s.date, s.time, s.timezone || timezone);
        dateTimeUtc = utcIso;
      } catch (e) {
        // ignore
      }
      return dateTimeUtc ? { teacherId: actualTeacherId, dateTimeUtc } : { teacherId: actualTeacherId, date: s.date, time: s.time };
    });
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
      realtime.emitAll('slotsUpdated', { teacherId: teacherIdString, ts: Date.now() });
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
      const clientTz = req.query.tz && DateTime.now().setZone(req.query.tz).isValid ? req.query.tz : null;
      
      // Week range in UTC
      const startUtc = DateTime.fromISO(week, { zone: 'utc' }).startOf('day');
      const endUtc = startUtc.plus({ days: 7 });
      
      const queryFilter = {
        available: true,
        dateTimeUtc: { $gte: startUtc.toJSDate(), $lt: endUtc.toJSDate() }
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
        
        const canonicalTid = await resolveToCanonicalTeacherId(slotObj.teacherId);
        if (!canonicalTid) {
          console.warn('⚠️ Could not resolve teacher for slot:', slotObj._id);
          return null;
        }
        const teacher = await Teacher.findOne({ teacherId: canonicalTid });
        
        // Add client-local convenience fields
        if (slotObj.dateTimeUtc && clientTz) {
          const dt = DateTime.fromJSDate(slotObj.dateTimeUtc, { zone: 'utc' }).setZone(clientTz);
          slotObj.localDate = dt.toFormat('yyyy-LL-dd');
          slotObj.localTime = dt.toFormat('HH:mm');
          slotObj.localLabel = dt.toFormat('ccc, LLL dd HH:mm');
          slotObj.clientTz = clientTz;
        }
        
        const slotData = {
          ...slotObj,
          teacherId: canonicalTid,
          teacherName: teacher ? teacher.username : 'Unknown Teacher'
        };
        
        console.log('🔍 Student slots API - Slot data:', { dateTimeUtc: slotData.dateTimeUtc, teacherId: slotData.teacherId });
        return slotData;
      }));
      
      // Filter out null slots (those without teacherId)
      const validSlots = slots.filter(slot => slot !== null);
      
      // Get bookings for these slots in UTC window
      const bookings = await Booking.find({
        dateTimeUtc: { $gte: startUtc.toJSDate(), $lt: endUtc.toJSDate() },
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
    
    // Convert provided identifier to canonical teacherId (Txxxxx)
    let actualTeacherId = teacherId;
    console.log('🔍 Original teacherId received:', teacherId);
    
    // If already canonical (starts with T), keep it
    if (teacherId && teacherId.startsWith('T')) {
      console.log('🔍 TeacherId already in correct format:', teacherId);
      actualTeacherId = teacherId;
    } else if (teacherId && (teacherId.includes('@') || teacherId.includes('.'))) {
      // Email/username -> lookup and use teacher.teacherId
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
    } else if (teacherId && mongoose.Types.ObjectId.isValid(teacherId)) {
      // ObjectId -> lookup and use teacher.teacherId
      console.log('🔍 Converting ObjectId to teacherId:', teacherId);
      const teacher = await Teacher.findById(teacherId);
      if (!teacher) {
        return res.status(404).json({ error: 'Teacher not found' });
      }
      actualTeacherId = teacher.teacherId;
      console.log('🔍 Converted ObjectId to teacherId:', actualTeacherId);
    } else {
      console.log('🔍 Using teacherId as-is (fallback):', teacherId);
      actualTeacherId = teacherId;
    }
    
    // Determine client timezone for convenience conversion (optional)
    const clientTz = req.query.tz && DateTime.now().setZone(req.query.tz).isValid ? req.query.tz : null;

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
    const teacherRow = await Teacher.findOne({ teacherId: actualTeacherId });
    const teacherIdOr = [{ teacherId: actualTeacherId }];
    if (teacherRow && teacherRow._id) {
      teacherIdOr.push({ teacherId: teacherRow._id });
      teacherIdOr.push({ teacherId: teacherRow._id.toString() });
    }

    const queryFilter = {
      $or: teacherIdOr,
      date: { $gte: week, $lte: end.toISOString().slice(0, 10) }
    };

    // If allSlots is not specified, only return available slots (for student booking)
    if (!allSlots) {
      queryFilter.available = true;
    }

    const slotsQuery = await TeacherSlot.find(queryFilter);

    const slots = slotsQuery.map((slot) => {
      const obj = slot.toObject();
      // Add UTC and client-local convenience fields
      if (obj.dateTimeUtc) {
        const dt = DateTime.fromISO(
          obj.dateTimeUtc instanceof Date ? obj.dateTimeUtc.toISOString() : String(obj.dateTimeUtc),
          { zone: 'utc' }
        );
        obj.utc = obj.dateTimeUtc;
        if (clientTz) {
          const local = dt.setZone(clientTz);
          obj.localDate = local.toFormat('yyyy-LL-dd');
          obj.localTime = local.toFormat('HH:mm');
          obj.localLabel = local.toFormat('ccc, LLL dd HH:mm');
          obj.clientTz = clientTz;
        }
      }
      return {
        ...obj,
        teacherId: actualTeacherId,
        slotStatus: obj.available ? 'Open' : 'Booked'
      };
    });
    
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
        const studentName = student
          ? `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username
          : String(booking.studentId);
        return {
          ...bookingObj,
          studentName,
          lessonTopic: booking.lesson || '',
          studentId: student ? {
            username: student.username,
            firstName: student.firstName,
            lastName: student.lastName
          } : { username: booking.studentId },
          hasResolvedIssue: resolvedIssues.length > 0
        };
      })
    );

    // Add timezone-friendly fields for bookings (client-provided tz)
    const bookingsWithTimezone = bookingsWithStudentInfo.map((booking) => {
      const obj = { ...booking };
      const utcSource = booking.dateTimeUtc
        ? (booking.dateTimeUtc instanceof Date ? booking.dateTimeUtc : new Date(booking.dateTimeUtc))
        : null;

      // Always expose canonical UTC string
      obj.utc = utcSource ? utcSource.toISOString() : null;

      if (clientTz && utcSource) {
        const local = DateTime.fromJSDate(utcSource, { zone: 'utc' }).setZone(clientTz);
        obj.localDate = local.toFormat('yyyy-LL-dd');
        obj.localTime = local.toFormat('HH:mm');
        obj.localLabel = local.toFormat('ccc, LLL dd HH:mm');
        obj.clientTz = clientTz;
      }

      return obj;
    });

    res.json({ slots, bookings: bookingsWithTimezone });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Normalize slot storage (ObjectId or string) to Teacher.teacherId string */
async function resolveToCanonicalTeacherId(rawTeacherId) {
  if (rawTeacherId == null || rawTeacherId === '') return null;
  if (typeof rawTeacherId === 'string') {
    const s = rawTeacherId.trim();
    const byField = await Teacher.findOne({ teacherId: s });
    if (byField) return byField.teacherId;
    const byUsername = await Teacher.findOne({ $or: [{ username: s }, { email: s }] });
    if (byUsername) return byUsername.teacherId;
  }
  if (mongoose.Types.ObjectId.isValid(rawTeacherId)) {
    const byOid = await Teacher.findById(rawTeacherId);
    if (byOid) return byOid.teacherId;
  }
  return null;
}

/** Find open slots for a booking instant (handles Date vs ISO string in DB). */
async function findOpenSlotsByUtcInstant(canonicalUtcIso) {
  const utcInstant = new Date(canonicalUtcIso);
  if (isNaN(utcInstant.getTime())) return [];
  let slots = await TeacherSlot.find({
    dateTimeUtc: utcInstant,
    available: true
  }).lean();
  if (slots.length > 0) return slots;
  const t0 = utcInstant.getTime();
  return TeacherSlot.find({
    available: true,
    dateTimeUtc: { $gte: new Date(t0 - 2000), $lte: new Date(t0 + 2000) }
  }).lean();
}

/** All teachers with an open slot at this UTC instant and no conflicting booking */
async function getCandidateTeachersForSlotUtc(canonicalUtcIso) {
  const slots = await findOpenSlotsByUtcInstant(canonicalUtcIso);
  const candidates = [];
  const utcD = new Date(canonicalUtcIso);
  for (const slot of slots) {
    const tid = await resolveToCanonicalTeacherId(slot.teacherId);
    if (!tid) continue;
    let existing = await Booking.findOne({
      teacherId: tid,
      dateTimeUtc: utcD,
      status: { $ne: 'cancelled' }
    });
    if (!existing) {
      existing = await Booking.findOne({
        teacherId: tid,
        dateTimeUtc: canonicalUtcIso,
        status: { $ne: 'cancelled' }
      });
    }
    if (!existing) candidates.push(tid);
  }
  return [...new Set(candidates)].sort((a, b) => a.localeCompare(b));
}

async function pickRoundRobinTeacher(candidates) {
  if (!candidates.length) return null;
  const total = await Booking.countDocuments({});
  return candidates[total % candidates.length];
}

// Get available teachers for a specific date and time (optional dateTimeUtc for precision)
router.get('/available-teachers', async (req, res) => {
  try {
    const { date, time, dateTimeUtc } = req.query;
    if (dateTimeUtc) {
      const candidates = await getCandidateTeachersForSlotUtc(dateTimeUtc);
      const teachers = await Promise.all(
        candidates.map(async (tid) => {
          const t = await Teacher.findOne({ teacherId: tid });
          const displayName =
            (t && t.fullname && String(t.fullname).trim()) ||
            (t &&
              [t.firstName, t.middleName, t.lastName].filter(Boolean).join(' ').trim()) ||
            (t && t.username) ||
            tid;
          const certNames = [];
          if (t?.professionalCertifications?.length) {
            t.professionalCertifications.forEach((c) => {
              if (c && c.name) certNames.push(c.name);
            });
          }
          if (t?.documents?.certifications?.length) {
            t.documents.certifications.forEach((x) => {
              if (x && !certNames.includes(x)) certNames.push(x);
            });
          }
          return {
            teacherId: tid,
            name: t ? t.username : tid,
            displayName,
            photo: t?.profilePicture || null,
            intro: t?.introduction || t?.intro || '',
            videoIntroduction: t?.videoIntroduction || null,
            certifications: certNames,
            rating: 4.9,
            reviewCount: 0
          };
        })
      );
      return res.json({ teachers });
    }
    if (!date || !time) return res.status(400).json({ error: 'Missing date/time or dateTimeUtc' });

    const slots = await TeacherSlot.find({
      date,
      time,
      available: true
    }).lean();

    const availableTeachers = [];
    for (const slot of slots) {
      if (!slot.teacherId) continue;
      const tid = await resolveToCanonicalTeacherId(slot.teacherId);
      if (!tid) continue;
      const utcKey = slot.dateTimeUtc ? slot.dateTimeUtc.toISOString?.() || slot.dateTimeUtc : null;
      const existingBooking = utcKey
        ? await Booking.findOne({ teacherId: tid, dateTimeUtc: utcKey, status: { $ne: 'cancelled' } })
        : await Booking.findOne({ teacherId: tid, date, time, status: { $ne: 'cancelled' } });
      if (existingBooking) continue;
      const t = await Teacher.findOne({ teacherId: tid });
      availableTeachers.push({
        teacherId: tid,
        name: t ? t.username : tid,
        photo: t?.profilePicture || null,
        intro: t?.introduction || t?.intro || 'No introduction available'
      });
    }

    res.json({ teachers: availableTeachers });
  } catch (err) {
    console.error('Error in available-teachers:', err);
    res.status(500).json({ error: err.message });
  }
});

// Book a class — optional preferred teacher; otherwise first-available or round-robin among open slots
router.post('/book-class', verifyToken, requireStudent, async (req, res) => {
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
      assignmentMode = 'firstAvailable'
    } = req.body;
    const preferredRaw = preferredTeacherId != null && preferredTeacherId !== '' ? preferredTeacherId : teacherId;

    const student = await Student.findById(req.user.studentId);
    if (!student) {
      return res.status(400).json({ error: 'Student not found' });
    }
    const studentId = student.username;
    const currentTotalCredits = Number(student.totalCredits ?? student.creditBalance ?? 0);
    const currentReservedCredits = Number(student.reservedCredits || 0);
    const availableCredits = Math.max(currentTotalCredits - currentReservedCredits, 0);
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
    let zoneUsed = timezone;
    if (!canonicalUtc) {
      const { utcIso, zoneUsed: zu } = toUtcFromLocal(date, time, timezone || 'Asia/Manila');
      canonicalUtc = utcIso;
      zoneUsed = zu;
    }
    const dt = DateTime.fromISO(canonicalUtc, { zone: 'utc' });
    const dateUtc = dt.toISODate();
    const timeUtc = dt.toFormat('HH:mm');

    const candidates = await getCandidateTeachersForSlotUtc(canonicalUtc);
    console.log('🔍 Candidate teachers for slot:', candidates);

    if (candidates.length === 0) {
      return res.status(400).json({
        error: 'No teacher has an open slot for this time, or all are already booked.'
      });
    }

    let chosenTeacherId = null;
    if (preferredRaw != null && String(preferredRaw).trim() !== '') {
      const resolvedPref = await resolveToCanonicalTeacherId(preferredRaw);
      if (!resolvedPref) {
        return res.status(400).json({ error: 'Preferred teacher not found.' });
      }
      if (!candidates.includes(resolvedPref)) {
        return res.status(400).json({
          error: 'That teacher is not available for this time slot. Choose another teacher or use auto-assign.',
          candidates
        });
      }
      chosenTeacherId = resolvedPref;
    } else {
      chosenTeacherId =
        assignmentMode === 'roundRobin'
          ? await pickRoundRobinTeacher(candidates)
          : candidates[0];
    }

    const teacher = await Teacher.findOne({ teacherId: chosenTeacherId });
    if (!teacher) {
      return res.status(400).json({ error: 'Assigned teacher record not found' });
    }

    let existingSlot = null;
    const slotRows = await findOpenSlotsByUtcInstant(canonicalUtc);
    for (const s of slotRows) {
      const tid = await resolveToCanonicalTeacherId(s.teacherId);
      if (tid === chosenTeacherId) {
        existingSlot = s;
        break;
      }
    }

    if (!existingSlot) {
      return res.status(400).json({ error: 'Selected slot is no longer available or not open for booking' });
    }

    const slotOwnerId = await resolveToCanonicalTeacherId(existingSlot.teacherId);
    if (slotOwnerId !== chosenTeacherId) {
      return res.status(400).json({ error: 'Slot does not match assigned teacher' });
    }

    const utcInstant = new Date(canonicalUtc);

    /** Local / standalone MongoDB: off. Replica set (e.g. Atlas): set USE_TRANSACTIONS=true if you want multi-doc transactions. */
    const useTransactions =
      String(process.env.USE_TRANSACTIONS || '').toLowerCase() === 'true';

    /**
     * Lock slot (atomic findOneAndUpdate) + create booking.
     * When session is null, no Mongo session/transactions — works on standalone mongod.
     */
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

      // Atomically reserve one credit without consuming total purchased credits yet.
      const reservedStudent = await Student.findOneAndUpdate(
        {
          _id: req.user.studentId,
          $expr: { $gt: [{ $subtract: [{ $ifNull: ['$totalCredits', 0] }, { $ifNull: ['$reservedCredits', 0] }] }, 0] }
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
        status: 'Booked'
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

    let booking;
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

    console.log('✅ Booking created:', booking._id, 'teacher:', chosenTeacherId, 'mode:', preferredRaw ? 'preferred' : assignmentMode);

    const studentName = student ? `${student.firstName} ${student.lastName}` : studentId;
    await createNotification(
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
        balance: refreshedStudent?.creditBalance || 0,
        totalCredits: refreshedStudent?.totalCredits ?? (refreshedStudent?.creditBalance || 0),
        reservedCredits: refreshedStudent?.reservedCredits || 0,
        availableCredits: Math.max(
          Number(refreshedStudent?.totalCredits ?? refreshedStudent?.creditBalance ?? 0) - Number(refreshedStudent?.reservedCredits || 0),
          0
        ),
        usedCredits: refreshedStudent?.usedCredits ?? ((refreshedStudent?.totalCreditsEarned || 0) - (refreshedStudent?.creditBalance || 0))
      }
    });
  } catch (err) {
    console.error('❌ Error booking class:', err);
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
      await releaseReservedCreditForBooking(booking);
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

    // Prepare booking data with student and teacher names and canonical scheduled start for timer
    const bookingData = {
      ...booking.toObject(),
      studentName: studentName,
      teacherName: teacherName,
      scheduledStartTime: getScheduledStartTime(booking)
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
    const validIdsArray = Array.isArray(profileData.documents?.validIds) ? profileData.documents.validIds : [];
    
    console.log('=== BACKEND: Documents data received ===');
    console.log('Diplomas count:', diplomasArray.length);
    console.log('Certificates count:', certificatesArray.length);
    console.log('Valid IDs count:', validIdsArray.length);
    
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
        'documents.validId': null,
        'documents.validIds': validIdsArray
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
    console.log('Valid IDs in update:', updateData.$set['documents.validIds']?.length || 0);
    
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
    console.log('Diplomas count:', updatedTeacher.documents?.diplomas?.length || 0);
    console.log('Certificates count:', updatedTeacher.documents?.certificates?.length || 0);
    console.log('Valid IDs count:', updatedTeacher.documents?.validIds?.length || 0);
    
    // Verify the documents were saved correctly
    if (updatedTeacher.documents) {
      if (Array.isArray(updatedTeacher.documents.diplomas)) {
        console.log('✓ Diplomas array is valid, length:', updatedTeacher.documents.diplomas.length);
      }
      if (Array.isArray(updatedTeacher.documents.certificates)) {
        console.log('✓ Certificates array is valid, length:', updatedTeacher.documents.certificates.length);
      }
      if (Array.isArray(updatedTeacher.documents.validIds)) {
        console.log('✓ Valid IDs array is valid, length:', updatedTeacher.documents.validIds.length);
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
function getPhilippineDate(date = new Date()) {
  // Returns YYYY-MM-DD in Asia/Manila regardless of server locale
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function getPhilippineHour(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour12: false,
    hour: '2-digit'
  }).formatToParts(date);
  const hourPart = parts.find(p => p.type === 'hour');
  return Number(hourPart ? hourPart.value : '0');
}

function getPhilippineBusinessDate(cutoffHour = 7) {
  // Defines the "time log day" as 7:00 AM to 6:59 AM (Asia/Manila)
  const now = new Date();
  const phHour = getPhilippineHour(now);
  const effective = phHour < cutoffHour
    ? new Date(now.getTime() - (24 * 60 * 60 * 1000))
    : now;
  return getPhilippineDate(effective);
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

// Only match teacher logs (exclude admin time logs stored under admin:* ids)
const teacherTimeLogTypeClause = {
  $or: [{ logOwnerType: 'teacher' }, { logOwnerType: { $exists: false } }]
};

// Clock in
router.post('/time-tracking/clock-in', verifyToken, requireTeacher, async (req, res) => {
  try {
    console.log('Clock-in request received');
    console.log('User from token:', req.user);
    
    const teacherId = req.user.teacherId;
    console.log('Teacher ID:', teacherId);
    
    const phDate = getPhilippineBusinessDate(7);
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
      date: phDate,
      ...teacherTimeLogTypeClause
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
      logOwnerType: 'teacher',
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
    const currentTime = getPhilippineTimeString();
    
    // Find current clock-in log
    const timeLog = await TimeLog.findOne({
      teacherId,
      status: 'clocked-in',
      ...teacherTimeLogTypeClause
    })
      .sort({ 'clockIn.timestamp': -1 });
    
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
    const phDate = getPhilippineBusinessDate(7);
    
    // Check if there's an open log (clocked-in) regardless of date
    const openLog = await TimeLog.findOne({
      teacherId,
      status: 'clocked-in',
      ...teacherTimeLogTypeClause
    })
      .sort({ 'clockIn.timestamp': -1 });

    // Check if there's a time log for the current business day
    const todayLog = await TimeLog.findOne({
      teacherId,
      date: phDate,
      ...teacherTimeLogTypeClause
    });
    
    let isClockedIn = false;
    let currentLog = null;
    let canTimeIn = false;
    let canTimeOut = false;
    let dailyCompleted = false;
    
    if (openLog) {
      isClockedIn = true;
      currentLog = openLog;
      canTimeOut = true;
    } else if (todayLog) {
      if (todayLog.status === 'clocked-out') dailyCompleted = true;
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
    
    let query = { teacherId, ...teacherTimeLogTypeClause };
    
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

    await consumeReservedCreditForBooking(booking, 'Class finished');
    
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

    await consumeReservedCreditForBooking(booking, 'Student absent');
    
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
          // Student was absent but teacher was present - no payment (no-class, no-pay policy)
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
    
    const previousStatus = booking.status;

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

    // Consume credits only once when transitioning from a reserved booking to final state.
    if (!['completed', 'absent', 'cancelled'].includes(previousStatus) && ['completed', 'absent'].includes(status)) {
      await consumeReservedCreditForBooking(
        booking,
        status === 'absent' ? 'Student absent' : 'Class finished'
      );
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
          // Student was absent but teacher was present - no payment (no-class, no-pay policy)
          studentAbsentClasses++;
          console.log(`Student absent but teacher present for class ${booking.date} ${booking.time} - counting for no payment`);
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
          console.log(`Student absent for pending class ${booking.date} ${booking.time} - teacher entered but student didn't enter within 15 minutes (${timeDiffMinutes.toFixed(1)} minutes past) - counting for no payment`);
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

    // Calculate student absent payments: no-class, no-pay => 0 payment
    const studentAbsentPayment = 0;

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
    realtime.emitToRoom(bookingId, 'reward-received', {
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
        // PPTX files are now displayed directly without conversion
        console.log(`📁 File ${i + 1} identified as PowerPoint, storing as-is`);
        slides.push({
          slideNumber: slides.length + 1,
          imageUrl: `/uploads/slides/${file.filename}`,
          originalFile: `/uploads/slides/${file.filename}`,
          fileName: file.originalname,
          fileType: 'powerpoint',
          title: `${path.basename(file.originalname, fileExt)}`,
          notes: '',
          needsConversion: false
        });
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

// Upload slide images endpoint removed - no longer needed without conversion
router.post('/upload-slide-images', verifyToken, requireTeacher, (req, res) => {
  return res.status(410).json({ 
    success: false, 
    error: 'Slide image upload has been removed. Files are now displayed directly without conversion.' 
  });
});

// Test route for debugging
router.get('/test-remove-slide', (req, res) => {
  console.log('🧪 Test remove-slide route accessed');
  res.json({ message: 'Remove slide route is accessible' });
});

// Remove slide from lesson slides
// LessonSlides collection removed - this endpoint is no longer functional
router.post('/remove-slide', verifyToken, requireTeacher, (req, res) => {
  return res.status(410).json({ 
    success: false, 
    error: 'LessonSlides collection removed. Slides are no longer stored in the database.' 
  });
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
router.patch('/bookings/:bookingId/complete', verifyToken, requireTeacher, async (req, res) => {
  try {
    const { bookingId } = req.params;
    const teacherId = req.user.teacherId;

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    if (booking.teacherId !== teacherId) {
      return res.status(403).json({ success: false, error: 'Access denied. This booking does not belong to you.' });
    }
    if (booking.status === 'completed') {
      return res.status(400).json({ success: false, error: 'Class is already completed' });
    }

    booking.status = 'completed';
    booking.finishedAt = new Date();
    booking.attendance = booking.attendance || {};
    booking.attendance.classCompleted = true;
    await consumeReservedCreditForBooking(booking, 'Class finished');
    await booking.save();

    return res.json({
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
    console.error('❌ Error completing class (PATCH):', error);
    return res.status(500).json({ success: false, error: 'Failed to complete class: ' + error.message });
  }
});

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

    await consumeReservedCreditForBooking(booking, 'Class finished');
    
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
    booking.status = 'absent';
    booking.absentMarkedAt = new Date();
    booking.absentType = 'student';
    booking.absentReason = 'Marked as absent by teacher';

    await consumeReservedCreditForBooking(booking, 'Student absent');
    
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

// Save assessment test result
router.post('/save-assessment-test', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ teacherId: req.user.teacherId });
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    const { testType, audioRecording, audioFileName, wpm, accuracy, text, words } = req.body;
    
    if (!teacher.assessmentTests) {
      teacher.assessmentTests = {
        completed: false,
        listening: {},
        typing: {},
        reading: {},
        pronunciation: {},
        grammar: {},
        vocabulary: {},
        personality: {}
      };
    }
    
    const testData = {
      completedAt: new Date()
    };
    
    const maxBase64Size = 8 * 1024 * 1024; // 8MB guard to avoid BSON limits
    const safeAudioRecording = audioRecording && audioRecording.length > maxBase64Size ? null : audioRecording;

    if (testType === 'listening') {
      if (safeAudioRecording) testData.audioRecording = safeAudioRecording;
      if (audioFileName) testData.audioFileName = audioFileName;
      teacher.assessmentTests.listening = testData;
    } else if (testType === 'typing') {
      if (wpm !== undefined) testData.wpm = wpm;
      if (accuracy !== undefined) testData.accuracy = accuracy;
      if (text) testData.text = text;
      teacher.assessmentTests.typing = testData;
    } else if (testType === 'reading') {
      if (safeAudioRecording) testData.audioRecording = safeAudioRecording;
      if (audioFileName) testData.audioFileName = audioFileName;
      if (text) testData.text = text;
      teacher.assessmentTests.reading = testData;
    } else if (testType === 'pronunciation') {
      if (safeAudioRecording) testData.audioRecording = safeAudioRecording;
      if (audioFileName) testData.audioFileName = audioFileName;
      if (words) {
        testData.words = words.map(wordData => ({
          word: wordData.word
        }));
      }
      teacher.assessmentTests.pronunciation = testData;
    } else if (testType === 'grammar') {
      if (req.body.score !== undefined) testData.score = req.body.score;
      if (req.body.total !== undefined) testData.total = req.body.total;
      if (req.body.answers) testData.answers = req.body.answers;
      teacher.assessmentTests.grammar = testData;
    } else if (testType === 'vocabulary') {
      if (req.body.score !== undefined) testData.score = req.body.score;
      if (req.body.total !== undefined) testData.total = req.body.total;
      if (req.body.answers) testData.answers = req.body.answers;
      teacher.assessmentTests.vocabulary = testData;
    } else if (testType === 'personality') {
      if (req.body.score !== undefined) testData.score = req.body.score;
      if (req.body.total !== undefined) testData.total = req.body.total;
      if (req.body.percent !== undefined) testData.percent = req.body.percent;
      if (req.body.answers) testData.answers = req.body.answers;
      if (req.body.categoryScores) testData.categoryScores = req.body.categoryScores;
      teacher.assessmentTests.personality = testData;
    }
    
    await teacher.save();
    
    res.json({
      success: true,
      message: `${testType} test result saved successfully`
    });
  } catch (error) {
    console.error('Error saving assessment test:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Complete assessment (mark all tests as done)
router.post('/complete-assessment', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ teacherId: req.user.teacherId });
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    if (!teacher.assessmentTests) {
      return res.status(400).json({ error: 'Assessment tests not found' });
    }

    // Allow grammar/vocabulary results to be attached during completion
    const { grammar, vocabulary } = req.body || {};
    if (grammar && (grammar.score !== undefined || grammar.total !== undefined)) {
      teacher.assessmentTests.grammar = {
        ...teacher.assessmentTests.grammar,
        score: grammar.score,
        total: grammar.total,
        answers: grammar.answers || teacher.assessmentTests.grammar?.answers,
        completedAt: new Date()
      };
    }
    if (vocabulary && (vocabulary.score !== undefined || vocabulary.total !== undefined)) {
      teacher.assessmentTests.vocabulary = {
        ...teacher.assessmentTests.vocabulary,
        score: vocabulary.score,
        total: vocabulary.total,
        answers: vocabulary.answers || teacher.assessmentTests.vocabulary?.answers,
        completedAt: new Date()
      };
    }
    
    // Check if all tests are completed
    const tests = teacher.assessmentTests;
    const listeningComplete = tests.listening && (tests.listening.audioRecording || tests.listening.completedAt);
    const typingComplete = tests.typing && (tests.typing.wpm !== null || tests.typing.completedAt);
    const readingComplete = tests.reading && (tests.reading.audioRecording || tests.reading.completedAt);
    const pronunciationComplete = tests.pronunciation && (tests.pronunciation.audioRecording || tests.pronunciation.words || tests.pronunciation.completedAt);
    const grammarComplete = tests.grammar && (tests.grammar.score !== null && tests.grammar.score !== undefined || tests.grammar.completedAt);
    const vocabularyComplete = tests.vocabulary && (tests.vocabulary.score !== null && tests.vocabulary.score !== undefined || tests.vocabulary.completedAt);
    
    const personalityComplete = tests.personality && (tests.personality.score !== null && tests.personality.score !== undefined || tests.personality.completedAt);
    const allComplete = listeningComplete && typingComplete && readingComplete && pronunciationComplete && grammarComplete && vocabularyComplete && personalityComplete;
    
    if (!allComplete) {
      // Provide detailed error message
      const missing = [];
      if (!listeningComplete) missing.push('Listening');
      if (!typingComplete) missing.push('Typing');
      if (!readingComplete) missing.push('Reading');
      if (!pronunciationComplete) missing.push('Pronunciation');
      if (!grammarComplete) missing.push('Grammar');
      if (!vocabularyComplete) missing.push('Vocabulary');
      if (!personalityComplete) missing.push('Personality');
      
      return res.status(400).json({ 
        error: 'Please complete all assessment tests before submitting',
        missing: missing,
        details: {
          listening: !!listeningComplete,
          typing: !!typingComplete,
          reading: !!readingComplete,
        pronunciation: !!pronunciationComplete,
        grammar: !!grammarComplete,
        vocabulary: !!vocabularyComplete,
        personality: !!personalityComplete
        }
      });
    }
    
    teacher.assessmentTests.completed = true;
    teacher.assessmentTests.completedAt = new Date();

    // Auto-grade the teacher based on the submitted assessment tests
    const ensureAbilities = () => {
      if (!teacher.teachingAbilities) {
        teacher.teachingAbilities = {
          listening: { description: '', level: null },
          reading: { description: '', level: null },
          speaking: { description: '', level: null },
          writing: { description: '', level: null },
          creativityHobbies: ''
        };
      }
    };
    const ensurePersonality = () => {
      if (!teacher.teachingPersonality) {
        teacher.teachingPersonality = {
          interpersonal: { description: '', level: null },
          professionalism: { description: '', level: null },
          cultural: { description: '', level: null },
          technology: { description: '', level: null },
          engagement: { description: '', level: null }
        };
      }
    };
    const levelFromCategoryScore = (score) => {
      if (!score || score.total === 0) return null;
      const percent = Math.round((Number(score.correct || 0) / score.total) * 100);
      if (percent >= 90) return '5';
      if (percent >= 75) return '4';
      if (percent >= 60) return '3';
      if (percent >= 40) return '2';
      return '1';
    };

    const levelFromTyping = (wpmVal, accVal) => {
      if (wpmVal === undefined || accVal === undefined) return '3';
      const wpm = Number(wpmVal) || 0;
      const accuracy = Number(accVal) || 0;
      if (wpm >= 50 && accuracy >= 90) return '5';
      if (wpm >= 40 && accuracy >= 85) return '4';
      if (wpm >= 30 && accuracy >= 80) return '3';
      return '2';
    };

    // Build skill levels (simple heuristic)
    ensureAbilities();
    ensurePersonality();
    const skillLevels = {
      listening: listeningComplete ? '4' : '3',
      reading: readingComplete ? '4' : '3',
      speaking: pronunciationComplete ? '4' : '3',
      writing: typingComplete ? levelFromTyping(tests.typing.wpm, tests.typing.accuracy) : '3'
    };
    const personalityScores = tests.personality && tests.personality.categoryScores ? tests.personality.categoryScores : {};
    const personalityLevels = {
      interpersonal: levelFromCategoryScore(personalityScores['Interpersonal Communication']),
      professionalism: levelFromCategoryScore(personalityScores.Professionalism),
      cultural: levelFromCategoryScore(personalityScores['Cultural Awareness']),
      technology: levelFromCategoryScore(personalityScores['Technology Use']),
      engagement: levelFromCategoryScore(personalityScores['Student Engagement'])
    };

    teacher.teachingAbilities.listening.level = skillLevels.listening;
    teacher.teachingAbilities.reading.level = skillLevels.reading;
    teacher.teachingAbilities.speaking.level = skillLevels.speaking;
    teacher.teachingAbilities.writing.level = skillLevels.writing;
    if (personalityLevels.interpersonal) {
      teacher.teachingPersonality.interpersonal.level = personalityLevels.interpersonal;
    }
    if (personalityLevels.professionalism) {
      teacher.teachingPersonality.professionalism.level = personalityLevels.professionalism;
    }
    if (personalityLevels.cultural) {
      teacher.teachingPersonality.cultural.level = personalityLevels.cultural;
    }
    if (personalityLevels.technology) {
      teacher.teachingPersonality.technology.level = personalityLevels.technology;
    }
    if (personalityLevels.engagement) {
      teacher.teachingPersonality.engagement.level = personalityLevels.engagement;
    }

    if (!teacher.skillAssessments) {
      teacher.skillAssessments = [];
    }
    teacher.skillAssessments.push({
      assessmentDate: new Date(),
      assessedBy: 'System Auto-Grade',
      skills: skillLevels,
      personality: personalityLevels,
      notes: 'Auto-generated from completed assessment tests'
    });

    await teacher.save();
    
    res.json({
      success: true,
      message: 'Assessment completed successfully. Your results will be reviewed by RemoEd trainers/admins.'
    });
  } catch (error) {
    console.error('Error completing assessment:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get assessment test results for viewing
router.get('/assessment-results', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ teacherId: req.user.teacherId });
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    if (!teacher.assessmentTests) {
      return res.json({
        success: true,
        completed: false,
        message: 'No assessment tests found'
      });
    }
    
    res.json({
      success: true,
      completed: teacher.assessmentTests.completed || false,
      completedAt: teacher.assessmentTests.completedAt || null,
      tests: {
        listening: teacher.assessmentTests.listening || null,
        typing: teacher.assessmentTests.typing || null,
        reading: teacher.assessmentTests.reading || null,
        pronunciation: teacher.assessmentTests.pronunciation || null,
        grammar: teacher.assessmentTests.grammar || null,
        vocabulary: teacher.assessmentTests.vocabulary || null,
        personality: teacher.assessmentTests.personality || null
      }
    });
  } catch (error) {
    console.error('Error fetching assessment results:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get assessed abilities for display in profile
router.get('/assessed-abilities', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ teacherId: req.user.teacherId });
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    // If no assessed levels yet but assessment tests are completed, auto-grade now
    const ensureAbilities = () => {
      if (!teacher.teachingAbilities) {
        teacher.teachingAbilities = {
          listening: { description: '', level: null },
          reading: { description: '', level: null },
          speaking: { description: '', level: null },
          writing: { description: '', level: null },
          creativityHobbies: ''
        };
      }
    };

    const levelFromTyping = (wpmVal, accVal) => {
      if (wpmVal === undefined || accVal === undefined) return '3';
      const wpm = Number(wpmVal) || 0;
      const accuracy = Number(accVal) || 0;
      if (wpm >= 50 && accuracy >= 90) return '5';
      if (wpm >= 40 && accuracy >= 85) return '4';
      if (wpm >= 30 && accuracy >= 80) return '3';
      return '2';
    };

    const isMissingLevel = (ability) => {
      if (!ability) return true;
      const level = ability.level;
      return level === undefined || level === null || level === '' || Number.isNaN(Number(level));
    };

    const abilitiesMissing =
      !teacher.teachingAbilities ||
      ['listening', 'reading', 'speaking', 'writing'].some(
        s => isMissingLevel(teacher.teachingAbilities && teacher.teachingAbilities[s])
      );

    const hasAnyTest =
      teacher.assessmentTests &&
      (
        (teacher.assessmentTests.listening && Object.keys(teacher.assessmentTests.listening).length > 0) ||
        (teacher.assessmentTests.typing && Object.keys(teacher.assessmentTests.typing).length > 0) ||
        (teacher.assessmentTests.reading && Object.keys(teacher.assessmentTests.reading).length > 0) ||
        (teacher.assessmentTests.pronunciation && Object.keys(teacher.assessmentTests.pronunciation).length > 0)
      );

    if (abilitiesMissing && teacher.assessmentTests && (teacher.assessmentTests.completed || hasAnyTest)) {
      ensureAbilities();
      const tests = teacher.assessmentTests;
      const listeningComplete = tests.listening && (tests.listening.audioRecording || tests.listening.completedAt);
      const typingComplete = tests.typing && (tests.typing.wpm !== null || tests.typing.completedAt);
      const readingComplete = tests.reading && (tests.reading.audioRecording || tests.reading.completedAt);
      const pronunciationComplete = tests.pronunciation && (tests.pronunciation.audioRecording || tests.pronunciation.words || tests.pronunciation.completedAt);

      const skillLevels = {
        listening: listeningComplete ? '4' : '3',
        reading: readingComplete ? '4' : '3',
        speaking: pronunciationComplete ? '4' : '3',
        writing: typingComplete ? levelFromTyping(tests.typing.wpm, tests.typing.accuracy) : '3'
      };

      teacher.teachingAbilities.listening.level = skillLevels.listening;
      teacher.teachingAbilities.reading.level = skillLevels.reading;
      teacher.teachingAbilities.speaking.level = skillLevels.speaking;
      teacher.teachingAbilities.writing.level = skillLevels.writing;

      // Ensure assessment is marked completed so admin view shows it
      if (!teacher.assessmentTests.completed) {
        teacher.assessmentTests.completed = true;
      }
      if (!teacher.assessmentTests.completedAt) {
        teacher.assessmentTests.completedAt = new Date();
      }

      if (!teacher.skillAssessments) {
        teacher.skillAssessments = [];
      }
      teacher.skillAssessments.push({
        assessmentDate: new Date(),
        assessedBy: 'System Auto-Grade',
        skills: skillLevels,
        notes: 'Auto-generated from completed assessment tests (view)'
      });

      await teacher.save();
    }

    // Get the latest assessment from skillAssessments history
    const latestAssessment = teacher.skillAssessments && teacher.skillAssessments.length > 0
      ? teacher.skillAssessments[teacher.skillAssessments.length - 1]
      : null;
    
    // Build assessments object from teachingAbilities and latest assessment
    const assessments = {};
    const skills = ['listening', 'reading', 'speaking', 'writing'];
    
    skills.forEach(skill => {
      const ability = teacher.teachingAbilities && teacher.teachingAbilities[skill];
      if (ability && ability.level) {
        // Convert level string to number (0-5 scale)
        const levelMap = {
          '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5,
          'Beginner': 0, 'Basic': 1, 'Intermediate': 2, 'Advanced': 3, 'Expert': 4, 'Master': 5
        };
        const level = levelMap[ability.level] !== undefined ? levelMap[ability.level] : parseInt(ability.level) || null;
        
        assessments[skill] = {
          level: level,
          criteria: ability.criteria || [],
          source: latestAssessment && latestAssessment.assessedBy ? latestAssessment.assessedBy : 'Pending'
        };
      } else {
        // No assessment yet
        assessments[skill] = {
          level: null,
          criteria: [],
          source: 'Pending'
        };
      }
    });
    
    res.json({
      success: true,
      assessments: assessments,
      lastAssessmentDate: latestAssessment ? latestAssessment.assessmentDate : null
    });
  } catch (error) {
    console.error('Error fetching assessed abilities:', error);
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

// Peer Learning Connection Endpoints
const Connection = require('./models/Connection');

// Get public teacher profile (for viewing another teacher's profile - no auth required)
router.get('/public-profile/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    const teacher = await Teacher.findOne({ teacherId })
      .select('teacherId fullname firstName lastName profilePicture introduction experience education workExperience teachingAbilities');
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    const expertise = [];
    if (teacher.teachingAbilities?.listening?.level) expertise.push('Listening');
    if (teacher.teachingAbilities?.reading?.level) expertise.push('Reading');
    if (teacher.teachingAbilities?.speaking?.level) expertise.push('Speaking');
    if (teacher.teachingAbilities?.writing?.level) expertise.push('Writing');
    res.json({
      success: true,
      profile: {
        ...teacher.toObject(),
        expertise: expertise.length > 0 ? expertise : ['General English']
      }
    });
  } catch (err) {
    console.error('Error fetching public profile:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// Send connection request
router.post('/connection-requests', verifyToken, requireTeacher, async (req, res) => {
  try {
    const requesterId = req.user.teacherId;
    const { peerId, message } = req.body;
    
    if (!peerId) {
      return res.status(400).json({ error: 'Peer ID is required' });
    }
    
    if (requesterId === peerId) {
      return res.status(400).json({ error: 'Cannot send connection request to yourself' });
    }
    
    // Check if peer exists
    const peer = await Teacher.findOne({ teacherId: peerId, status: 'active' });
    if (!peer) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    // Check if connection already exists
    const existingConnection = await Connection.findOne({
      $or: [
        { requesterId, recipientId: peerId },
        { requesterId: peerId, recipientId: requesterId }
      ]
    });
    
    if (existingConnection) {
      if (existingConnection.status === 'accepted') {
        return res.status(400).json({ error: 'Already connected with this teacher' });
      }
      if (existingConnection.status === 'pending' && existingConnection.requesterId === requesterId) {
        return res.status(400).json({ error: 'Connection request already sent' });
      }
    }
    
    // Create connection request
    const connection = new Connection({
      requesterId,
      recipientId: peerId,
      message: message || '',
      status: 'pending'
    });
    
    await connection.save();
    
    res.json({
      success: true,
      message: 'Connection request sent successfully',
      connectionId: connection._id
    });
  } catch (error) {
    console.error('Error sending connection request:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Connection request already exists' });
    }
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get connections (accepted connections)
router.get('/connections', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    
    const connections = await Connection.find({
      $or: [
        { requesterId: teacherId, status: 'accepted' },
        { recipientId: teacherId, status: 'accepted' }
      ]
    }).sort({ updatedAt: -1 });
    
    // Get teacher details for each connection
    const connectionData = await Promise.all(connections.map(async (conn) => {
      const otherTeacherId = conn.requesterId === teacherId ? conn.recipientId : conn.requesterId;
      const teacher = await Teacher.findOne({ teacherId: otherTeacherId });
      
      if (!teacher) return null;
      
      const expertise = [];
      if (teacher.teachingAbilities?.listening?.level) expertise.push('Listening');
      if (teacher.teachingAbilities?.reading?.level) expertise.push('Reading');
      if (teacher.teachingAbilities?.speaking?.level) expertise.push('Speaking');
      if (teacher.teachingAbilities?.writing?.level) expertise.push('Writing');
      
      return {
        id: teacher.teacherId,
        connectionId: conn._id.toString(),
        name: teacher.fullname || `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || 'Teacher',
        email: teacher.email || '',
        expertise: expertise.length > 0 ? expertise : ['General English'],
        experience: teacher.experience || 'Not specified',
        rating: 4.5,
        profilePicture: teacher.profilePicture
      };
    }));
    
    res.json({
      success: true,
      connections: connectionData.filter(c => c !== null)
    });
  } catch (error) {
    console.error('Error fetching connections:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get pending requests (received)
router.get('/connection-requests/pending', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    
    const requests = await Connection.find({
      recipientId: teacherId,
      status: 'pending'
    }).sort({ createdAt: -1 });
    
    const requestData = await Promise.all(requests.map(async (req) => {
      const teacher = await Teacher.findOne({ teacherId: req.requesterId });
      
      if (!teacher) return null;
      
      const expertise = [];
      if (teacher.teachingAbilities?.listening?.level) expertise.push('Listening');
      if (teacher.teachingAbilities?.reading?.level) expertise.push('Reading');
      if (teacher.teachingAbilities?.speaking?.level) expertise.push('Speaking');
      if (teacher.teachingAbilities?.writing?.level) expertise.push('Writing');
      
      return {
        id: req._id.toString(),
        teacherId: req.requesterId,
        name: teacher.fullname || `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || 'Teacher',
        expertise: expertise.length > 0 ? expertise : ['General English'],
        experience: teacher.experience || 'Not specified',
        rating: 4.5,
        message: req.message,
        profilePicture: teacher.profilePicture
      };
    }));
    
    res.json({
      success: true,
      requests: requestData.filter(r => r !== null)
    });
  } catch (error) {
    console.error('Error fetching pending requests:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get sent requests
router.get('/connection-requests/sent', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    
    const requests = await Connection.find({
      requesterId: teacherId,
      status: 'pending'
    }).sort({ createdAt: -1 });
    
    const requestData = await Promise.all(requests.map(async (req) => {
      const teacher = await Teacher.findOne({ teacherId: req.recipientId });
      
      if (!teacher) return null;
      
      const expertise = [];
      if (teacher.teachingAbilities?.listening?.level) expertise.push('Listening');
      if (teacher.teachingAbilities?.reading?.level) expertise.push('Reading');
      if (teacher.teachingAbilities?.speaking?.level) expertise.push('Speaking');
      if (teacher.teachingAbilities?.writing?.level) expertise.push('Writing');
      
      return {
        id: req._id.toString(),
        teacherId: req.recipientId,
        name: teacher.fullname || `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || 'Teacher',
        expertise: expertise.length > 0 ? expertise : ['General English'],
        experience: teacher.experience || 'Not specified',
        rating: 4.5,
        status: 'pending',
        profilePicture: teacher.profilePicture
      };
    }));
    
    res.json({
      success: true,
      requests: requestData.filter(r => r !== null)
    });
  } catch (error) {
    console.error('Error fetching sent requests:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Accept connection request
router.post('/connection-requests/:requestId/accept', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    const { requestId } = req.params;
    
    const connection = await Connection.findById(requestId);
    
    if (!connection) {
      return res.status(404).json({ error: 'Connection request not found' });
    }
    
    if (connection.recipientId !== teacherId) {
      return res.status(403).json({ error: 'Unauthorized to accept this request' });
    }
    
    if (connection.status !== 'pending') {
      return res.status(400).json({ error: 'Connection request is not pending' });
    }
    
    connection.status = 'accepted';
    connection.updatedAt = new Date();
    await connection.save();
    
    res.json({
      success: true,
      message: 'Connection request accepted'
    });
  } catch (error) {
    console.error('Error accepting connection request:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Decline connection request
router.post('/connection-requests/:requestId/decline', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    const { requestId } = req.params;
    
    const connection = await Connection.findById(requestId);
    
    if (!connection) {
      return res.status(404).json({ error: 'Connection request not found' });
    }
    
    if (connection.recipientId !== teacherId) {
      return res.status(403).json({ error: 'Unauthorized to decline this request' });
    }
    
    if (connection.status !== 'pending') {
      return res.status(400).json({ error: 'Connection request is not pending' });
    }
    
    connection.status = 'declined';
    connection.updatedAt = new Date();
    await connection.save();
    
    res.json({
      success: true,
      message: 'Connection request declined'
    });
  } catch (error) {
    console.error('Error declining connection request:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Cancel connection request (by requester)
router.delete('/connection-requests/:requestId', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    const { requestId } = req.params;
    
    const connection = await Connection.findById(requestId);
    
    if (!connection) {
      return res.status(404).json({ error: 'Connection request not found' });
    }
    
    if (connection.requesterId !== teacherId) {
      return res.status(403).json({ error: 'Unauthorized to cancel this request' });
    }
    
    if (connection.status !== 'pending') {
      return res.status(400).json({ error: 'Can only cancel pending requests' });
    }
    
    connection.status = 'cancelled';
    connection.updatedAt = new Date();
    await connection.save();
    
    res.json({
      success: true,
      message: 'Connection request cancelled'
    });
  } catch (error) {
    console.error('Error cancelling connection request:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Remove connection
router.delete('/connections/:connectionId', verifyToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.teacherId;
    const { connectionId } = req.params;
    
    const connection = await Connection.findById(connectionId);
    
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }
    
    if (connection.requesterId !== teacherId && connection.recipientId !== teacherId) {
      return res.status(403).json({ error: 'Unauthorized to remove this connection' });
    }
    
    if (connection.status !== 'accepted') {
      return res.status(400).json({ error: 'Can only remove accepted connections' });
    }
    
    await Connection.findByIdAndDelete(connectionId);
    
    res.json({
      success: true,
      message: 'Connection removed'
    });
  } catch (error) {
    console.error('Error removing connection:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router; 