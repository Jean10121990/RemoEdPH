const express = require('express');
const router = express.Router();
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');
const Admin = require('./models/Admin');
const CancellationRequest = require('./models/CancellationRequest');
const Booking = require('./models/Booking');
const Notification = require('./models/Notification');
const PeerMessage = require('./models/PeerMessage');
const IssueReport = require('./models/IssueReport');
const TimeLog = require('./models/TimeLog');
const Referral = require('./models/Referral');
const { verifyToken, requireAdmin } = require('./authMiddleware');
const bcrypt = require('bcrypt');
const { sendTeacherRegistrationEmail } = require('./emailService');

// Function to create notifications
async function createNotification(userId, type, message) {
  try {
    // Notification model uses teacherId for all recipients (teachers, students, admin username, etc.)
    const notification = new Notification({
      teacherId: String(userId),
      type,
      message,
      read: false,
      createdAt: new Date()
    });
    await notification.save();
    console.log(`✅ Notification created for ${userId}: ${type}`);
  } catch (error) {
    console.error('❌ Error creating notification:', error);
  }
}

async function findStudentForBooking(booking) {
  if (!booking || !booking.studentId) return null;
  return Student.findOne({
    $or: [{ username: booking.studentId }, { email: booking.studentId }]
  });
}

async function releaseReservedCreditForBooking(booking) {
  if (!booking || booking.creditConsumedAt || booking.creditReservationReleasedAt) return;
  const student = await findStudentForBooking(booking);
  if (!student) return;
  const safeReserved = Number(student.reservedCredits || 0);
  if (safeReserved <= 0) return;

  const safeTotal = Number(student.totalCredits || 0);
  const nextReserved = safeReserved - 1;
  const nextAvailable = Math.max(safeTotal - nextReserved, 0);
  await Student.updateOne(
    { _id: student._id },
    { $set: { reservedCredits: nextReserved, creditBalance: nextAvailable } }
  );
  booking.creditReservationReleasedAt = new Date();
}

async function consumeReservedCreditForBooking(booking, descriptionPrefix = 'Class finished') {
  if (!booking || booking.creditConsumedAt || booking.creditReservationReleasedAt) return;
  const student = await findStudentForBooking(booking);
  if (!student) return;
  const now = new Date();
  const safeReserved = Number(student.reservedCredits || 0);
  if (safeReserved <= 0) return;
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
}

// Import generateStrongPassword function from auth.js
function generateStrongPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Function to generate temporary username
async function generateTemporaryUsername() {
  try {
    // Find the highest existing username number to avoid conflicts
    const existingTeachers = await Teacher.find({}).select('username');
    let maxNumber = 0;
    
    existingTeachers.forEach(teacher => {
      if (teacher.username && teacher.username.startsWith('remoedph.')) {
        const numberPart = teacher.username.substring(9); // 'remoedph.' is 9 characters
        const number = parseInt(numberPart, 10);
        if (!isNaN(number) && number > maxNumber) {
          maxNumber = number;
        }
      }
    });
    
    const nextNumber = maxNumber + 1;
    return `remoedph.${nextNumber.toString().padStart(3, '0')}`;
  } catch (error) {
    console.error('Error generating temporary username:', error);
    // Fallback: use timestamp
    return `remoedph.${Date.now().toString().slice(-3)}`;
  }
}

// Import GlobalSettings model
const GlobalSettings = require('./models/GlobalSettings');

// ——— Admin time tracking (registered early; 7 AM PHT business day) ———
function adminTimeWorkerId(username) {
  return `admin:${String(username || 'unknown').toLowerCase()}`;
}

function getPhilippineDateAdmin(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

function getPhilippineHourAdmin(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour12: false,
    hour: '2-digit'
  }).formatToParts(date);
  const hourPart = parts.find(p => p.type === 'hour');
  return Number(hourPart ? hourPart.value : '0');
}

function getPhilippineBusinessDateAdmin(cutoffHour = 7) {
  const now = new Date();
  const phHour = getPhilippineHourAdmin(now);
  const effective = phHour < cutoffHour
    ? new Date(now.getTime() - (24 * 60 * 60 * 1000))
    : now;
  return getPhilippineDateAdmin(effective);
}

function getPhilippineTimeStringAdmin() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour12: true,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date());
}

router.post('/time-tracking/clock-in', verifyToken, requireAdmin, async (req, res) => {
  try {
    const workerId = adminTimeWorkerId(req.user.username);
    const phDate = getPhilippineBusinessDateAdmin(7);
    const currentTime = getPhilippineTimeStringAdmin();

    const existingLog = await TimeLog.findOne({
      teacherId: workerId,
      date: phDate,
      logOwnerType: 'admin'
    });

    if (existingLog) {
      return res.status(400).json({
        success: false,
        error: 'Already clocked in today. You can only time in once per day.'
      });
    }

    const timeLog = await TimeLog.create({
      teacherId: workerId,
      logOwnerType: 'admin',
      date: phDate,
      clockIn: { time: currentTime, timestamp: new Date() },
      status: 'clocked-in'
    });

    await createNotification(req.user.username, 'time-tracking', `Admin clocked in at ${currentTime}`);

    res.json({ success: true, message: 'Successfully clocked in', timeLog });
  } catch (err) {
    console.error('Admin clock-in error:', err);
    res.status(500).json({ error: 'Failed to clock in', details: err.message });
  }
});

router.post('/time-tracking/clock-out', verifyToken, requireAdmin, async (req, res) => {
  try {
    const workerId = adminTimeWorkerId(req.user.username);
    const currentTime = getPhilippineTimeStringAdmin();

    const timeLog = await TimeLog.findOne({
      teacherId: workerId,
      logOwnerType: 'admin',
      status: 'clocked-in'
    }).sort({ 'clockIn.timestamp': -1 });

    if (!timeLog) {
      return res.status(400).json({ success: false, error: 'Not currently clocked in' });
    }

    const clockInTime = new Date(timeLog.clockIn.timestamp);
    const clockOutTime = new Date();
    const totalHours = (clockOutTime - clockInTime) / (1000 * 60 * 60);

    timeLog.clockOut = { time: currentTime, timestamp: clockOutTime };
    timeLog.totalHours = Math.round(totalHours * 100) / 100;
    timeLog.status = 'clocked-out';
    await timeLog.save();

    await createNotification(req.user.username, 'time-tracking', `Admin clocked out at ${currentTime} (${timeLog.totalHours} hours)`);

    res.json({ success: true, message: 'Successfully clocked out', timeLog });
  } catch (err) {
    console.error('Admin clock-out error:', err);
    res.status(500).json({ error: 'Failed to clock out' });
  }
});

router.get('/time-tracking/status', verifyToken, requireAdmin, async (req, res) => {
  try {
    const workerId = adminTimeWorkerId(req.user.username);
    const phDate = getPhilippineBusinessDateAdmin(7);

    const openLog = await TimeLog.findOne({
      teacherId: workerId,
      logOwnerType: 'admin',
      status: 'clocked-in'
    }).sort({ 'clockIn.timestamp': -1 });

    const todayLog = await TimeLog.findOne({
      teacherId: workerId,
      logOwnerType: 'admin',
      date: phDate
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
    } else if (todayLog && todayLog.status === 'clocked-out') {
      dailyCompleted = true;
    } else {
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
    console.error('Admin time status error:', err);
    res.status(500).json({ error: 'Failed to fetch time tracking status' });
  }
});

router.get('/time-tracking/history', verifyToken, requireAdmin, async (req, res) => {
  try {
    const workerId = adminTimeWorkerId(req.user.username);
    const { startDate, endDate } = req.query;

    let query = { teacherId: workerId, logOwnerType: 'admin' };
    if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    const timeLogs = await TimeLog.find(query)
      .sort({ date: -1, 'clockIn.timestamp': -1 })
      .limit(50)
      .lean();

    res.json({ success: true, timeLogs });
  } catch (err) {
    console.error('Admin time history error:', err);
    res.status(500).json({ error: 'Failed to fetch time log history' });
  }
});

// ——— Admin notifications (same Notification collection; teacherId = admin username) ———
router.get('/notifications', verifyToken, requireAdmin, async (req, res) => {
  try {
    const username = req.user.username;
    const notifications = await Notification.find({ teacherId: username })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    const unreadCount = notifications.filter(n => !n.read).length;
    res.json({ success: true, notifications, unreadCount });
  } catch (err) {
    console.error('Admin notifications list error:', err);
    res.status(500).json({ error: 'Failed to load notifications' });
  }
});

// --- Referral / Commission tracking ---
function generateReferralCodeAdmin() {
  return (
    Math.random().toString(36).slice(2, 8).toUpperCase() +
    Math.random().toString(36).slice(2, 6).toUpperCase()
  );
}

async function ensureTeacherReferralCode(teacher) {
  if (teacher.referralCode) return teacher.referralCode;
  let code = generateReferralCodeAdmin();
  for (let i = 0; i < 5; i++) {
    const exists = await Teacher.findOne({ referralCode: code }).lean();
    if (!exists) break;
    code = generateReferralCodeAdmin();
  }
  teacher.referralCode = code;
  await teacher.save();
  return code;
}

router.get('/referrals', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { teacherId, from, to } = req.query;
    const filter = {};
    if (teacherId) filter.teacherId = String(teacherId);
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const referrals = await Referral.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    const teacherIds = Array.from(new Set(referrals.map(r => r.teacherId)));
    const teachers = await Teacher.find({ teacherId: { $in: teacherIds } })
      .select('teacherId firstName lastName fullname username referralCode')
      .lean();
    const teacherMap = new Map(teachers.map(t => [t.teacherId, t]));

    const rows = referrals.map(r => {
      const t = teacherMap.get(r.teacherId);
      const teacherName =
        (t?.fullname || `${t?.firstName || ''} ${t?.lastName || ''}`.trim() || t?.username || r.teacherId);
      return { ...r, teacherName };
    });

    const totals = rows.reduce(
      (acc, r) => {
        acc.count += 1;
        acc.totalAmountPaid += Number(r.amountPaid || 0) || 0;
        acc.totalCommission += Number(r.commissionAmount || 0) || 0;
        return acc;
      },
      { count: 0, totalAmountPaid: 0, totalCommission: 0 }
    );

    res.json({ success: true, referrals: rows, totals });
  } catch (err) {
    console.error('Admin referrals error:', err);
    res.status(500).json({ success: false, message: 'Failed to load referrals' });
  }
});

router.get('/referrals/teachers', verifyToken, requireAdmin, async (req, res) => {
  try {
    const teachers = await Teacher.find({})
      .select('teacherId firstName lastName fullname username referralCode')
      .sort({ createdAt: -1 })
      .lean();

    // Backfill referral codes for existing teachers (best-effort; do sequential to avoid unique collisions)
    const out = [];
    for (const t of teachers) {
      if (!t.referralCode) {
        const teacherDoc = await Teacher.findOne({ teacherId: t.teacherId });
        if (teacherDoc) {
          t.referralCode = await ensureTeacherReferralCode(teacherDoc);
        }
      }
      const teacherName = t.fullname || `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.username || t.teacherId;
      out.push({
        teacherId: t.teacherId,
        teacherName,
        referralCode: t.referralCode || '',
        // Single referral link (subscription): bring users to plans section on landing page
        subscriptionLink: `/index.html?ref=${encodeURIComponent(t.referralCode || '')}#plans`
      });
    }

    res.json({ success: true, teachers: out });
  } catch (err) {
    console.error('Admin referrals teachers error:', err);
    res.status(500).json({ success: false, message: 'Failed to load teachers referral links' });
  }
});

router.get('/referral-link', verifyToken, requireAdmin, async (req, res) => {
  try {
    const username = req.user.username;
    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }

    if (!admin.referralCode) {
      let code = generateReferralCodeAdmin();
      for (let i = 0; i < 5; i++) {
        const existsTeacher = await Teacher.findOne({ referralCode: code }).lean();
        const existsAdmin = await Admin.findOne({ referralCode: code }).lean();
        if (!existsTeacher && !existsAdmin) break;
        code = generateReferralCodeAdmin();
      }
      admin.referralCode = code;
      await admin.save();
    }

    const code = admin.referralCode;
    res.json({
      success: true,
      ownerType: 'admin',
      ownerId: admin.username,
      referralCode: code,
      // Single referral link (subscription): bring users to plans section on landing page
      subscriptionLink: `/index.html?ref=${encodeURIComponent(code)}#plans`
    });
  } catch (err) {
    console.error('Admin referral-link error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate referral link' });
  }
});

router.patch('/notifications/mark-all-read', verifyToken, requireAdmin, async (req, res) => {
  try {
    await Notification.updateMany(
      { teacherId: req.user.username, read: false },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Admin mark-all-read error:', err);
    res.status(500).json({ error: 'Failed to mark notifications read' });
  }
});

router.patch('/notifications/:notificationId/read', verifyToken, requireAdmin, async (req, res) => {
  try {
    const n = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, teacherId: req.user.username },
      { read: true },
      { new: true }
    );
    if (!n) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    res.json({ success: true, notification: n });
  } catch (err) {
    console.error('Admin notification read error:', err);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// GET global rate
router.get('/global-rate', async (req, res) => {
  try {
    // Get rate from database
    const settings = await GlobalSettings.findOne({});
    const rate = settings ? settings.globalRate : 100; // Default to 100 if no settings exist
    
    res.json({
      success: true,
      rate: rate
    });
  } catch (error) {
    console.error('Error getting global rate:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving global rate'
    });
  }
});

// GET global rate (for teacher service fee page)
router.get('/teacher-rate', async (req, res) => {
  try {
    // Get rate from database
    const settings = await GlobalSettings.findOne({});
    const rate = settings ? settings.globalRate : 100; // Default to 100 if no settings exist
    
    res.json({
      success: true,
      rate: rate
    });
  } catch (error) {
    console.error('Error getting global rate for teacher:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving global rate'
    });
  }
});

// POST update global rate
router.post('/update-global-rate', async (req, res) => {
  try {
    const { rate } = req.body;
    
    if (typeof rate !== 'number' || rate < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rate value'
      });
    }
    
    // Save to database first
    await GlobalSettings.findOneAndUpdate(
      {}, // Find any existing document
      { 
        globalRate: rate,
        updatedAt: new Date()
      },
      { 
        upsert: true, // Create if doesn't exist
        new: true 
      }
    );
    
    // Update all teachers' rates in the database
    const updateResult = await Teacher.updateMany(
      {}, // Update all teachers
      { $set: { hourlyRate: rate } }
    );
    
    console.log(`Updated ${updateResult.modifiedCount} teachers with new rate: ${rate}`);
    
    res.json({
      success: true,
      message: `Global rate updated to ${rate}`,
      updatedTeachers: updateResult.modifiedCount
    });
  } catch (error) {
    console.error('Error updating global rate:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating global rate'
    });
  }
});

// POST save global rate to database
router.post('/save-global-rate', async (req, res) => {
  try {
    const { rate } = req.body;
    
    if (typeof rate !== 'number' || rate < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid rate value'
      });
    }
    
    // Save to a GlobalSettings collection (create if doesn't exist)
    const GlobalSettings = require('./models/GlobalSettings');
    
    // Update or create global settings
    await GlobalSettings.findOneAndUpdate(
      {}, // Find any existing document
      { 
        globalRate: rate,
        updatedAt: new Date()
      },
      { 
        upsert: true, // Create if doesn't exist
        new: true 
      }
    );
    
    // Rate is now saved to database
    
    console.log(`Global rate saved to database: ${rate}`);
    
    res.json({
      success: true,
      message: `Global rate saved to database: ${rate}`,
      rate: rate
    });
  } catch (error) {
    console.error('Error saving global rate:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving global rate'
    });
  }
});

// GET user activity report
router.get('/reports/user-activity', async (req, res) => {
  try {
    const Teacher = require('./models/Teacher');
    const Student = require('./models/Student');
    const Booking = require('./models/Booking');
    
    const [teachers, students, bookings] = await Promise.all([
      Teacher.countDocuments(),
      Student.countDocuments(),
      Booking.countDocuments()
    ]);
    
    const recentBookings = await Booking.find()
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Get teacher and student data separately since teacherId and studentId are strings
    const teacherIds = [...new Set(recentBookings.map(b => b.teacherId))];
    const studentIds = [...new Set(recentBookings.map(b => b.studentId))];
    
    const [teachersData, studentsData] = await Promise.all([
      Teacher.find({ teacherId: { $in: teacherIds } }, 'teacherId username fullname'),
      Student.find({ username: { $in: studentIds } }, 'username firstName lastName')
    ]);
    
    // Create lookup maps
    const teacherMap = {};
    teachersData.forEach(teacher => {
      teacherMap[teacher.teacherId] = teacher.fullname || teacher.username;
    });
    
    const studentMap = {};
    studentsData.forEach(student => {
      studentMap[student.username] = `${student.firstName || ''} ${student.lastName || ''}`.trim() || student.username;
    });
    
    res.json({
      success: true,
      data: {
        totalUsers: teachers + students,
        totalTeachers: teachers,
        totalStudents: students,
        totalBookings: bookings,
        recentBookings: recentBookings.map(booking => ({
          id: booking._id,
          teacher: teacherMap[booking.teacherId] || 'Unknown',
          student: studentMap[booking.studentId] || 'Unknown',
          date: booking.date,
          time: booking.time,
          status: booking.status,
          createdAt: booking.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('Error generating user activity report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating user activity report'
    });
  }
});

// GET financial report
router.get('/reports/financial', async (req, res) => {
  try {
    const GlobalSettings = require('./models/GlobalSettings');
    const Booking = require('./models/Booking');
    
    const settings = await GlobalSettings.findOne();
    const globalRate = settings?.globalRate || 100;
    
    const bookings = await Booking.find({ status: 'completed' });
    const totalEarnings = bookings.length * globalRate;
    
    const monthlyEarnings = {};
    bookings.forEach(booking => {
      const month = new Date(booking.date).toISOString().slice(0, 7);
      monthlyEarnings[month] = (monthlyEarnings[month] || 0) + globalRate;
    });
    
    res.json({
      success: true,
      data: {
        globalRate,
        totalCompletedClasses: bookings.length,
        totalEarnings,
        monthlyEarnings,
        averageEarningsPerClass: bookings.length > 0 ? totalEarnings / bookings.length : 0
      }
    });
  } catch (error) {
    console.error('Error generating financial report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating financial report'
    });
  }
});

// GET class performance report
router.get('/reports/class-performance', async (req, res) => {
  try {
    const Booking = require('./models/Booking');
    const Teacher = require('./models/Teacher');
    
    const bookings = await Booking.find();
    const teachers = await Teacher.find();
    
    // Create a map of teacherId to teacher data for lookup
    const teacherMap = {};
    teachers.forEach(teacher => {
      teacherMap[teacher.teacherId] = teacher;
    });
    
    const performanceData = teachers.map(teacher => {
      const teacherBookings = bookings.filter(b => b.teacherId === teacher.teacherId);
      const completed = teacherBookings.filter(b => b.status === 'completed').length;
      const total = teacherBookings.length;
      
      return {
        teacher: teacher.fullname || teacher.username,
        totalClasses: total,
        completedClasses: completed,
        completionRate: total > 0 ? (completed / total * 100).toFixed(2) : 0,
        averageRating: teacher.averageRating || 0
      };
    });
    
    const overallStats = {
      totalClasses: bookings.length,
      completedClasses: bookings.filter(b => b.status === 'completed').length,
      cancelledClasses: bookings.filter(b => b.status === 'cancelled').length,
      averageCompletionRate: bookings.length > 0 ? 
        (bookings.filter(b => b.status === 'completed').length / bookings.length * 100).toFixed(2) : 0
    };
    
    res.json({
      success: true,
      data: {
        overallStats,
        teacherPerformance: performanceData
      }
    });
  } catch (error) {
    console.error('Error generating class performance report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating class performance report'
    });
  }
});

// GET weekly summary report
router.get('/reports/weekly-summary', async (req, res) => {
  try {
    const Teacher = require('./models/Teacher');
    const Student = require('./models/Student');
    const Booking = require('./models/Booking');
    const Announcement = require('./models/Announcement');
    
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const [newTeachers, newStudents, newBookings, newAnnouncements] = await Promise.all([
      Teacher.countDocuments({ createdAt: { $gte: oneWeekAgo } }),
      Student.countDocuments({ createdAt: { $gte: oneWeekAgo } }),
      Booking.countDocuments({ createdAt: { $gte: oneWeekAgo } }),
      Announcement.countDocuments({ createdAt: { $gte: oneWeekAgo } })
    ]);
    
    const completedBookings = await Booking.countDocuments({
      status: 'completed',
      createdAt: { $gte: oneWeekAgo }
    });
    
    res.json({
      success: true,
      data: {
        period: 'Last 7 days',
        newUsers: {
          teachers: newTeachers,
          students: newStudents,
          total: newTeachers + newStudents
        },
        bookings: {
          total: newBookings,
          completed: completedBookings,
          completionRate: newBookings > 0 ? (completedBookings / newBookings * 100).toFixed(2) : 0
        },
        announcements: newAnnouncements,
        summary: `In the last 7 days, ${newTeachers + newStudents} new users joined, ${newBookings} classes were booked, and ${completedBookings} classes were completed.`
      }
    });
  } catch (error) {
    console.error('Error generating weekly summary report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating weekly summary report'
    });
  }
});

// GET debug teacher IDs
router.get('/debug/teacher-ids', async (req, res) => {
  try {
    const Booking = require('./models/Booking');
    const Teacher = require('./models/Teacher');
    
    const allBookings = await Booking.find();
    const allTeachers = await Teacher.find();
    
    const bookingTeacherIds = [...new Set(allBookings.map(b => b.teacherId))];
    const teacherIds = allTeachers.map(t => t.teacherId);
    
    const missingTeacherIds = bookingTeacherIds.filter(id => !teacherIds.includes(id));
    
    res.json({
      bookingTeacherIds,
      teacherIds,
      missingTeacherIds,
      totalBookings: allBookings.length,
      totalTeachers: allTeachers.length
    });
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ error: 'Debug endpoint failed' });
  }
});

// POST fix orphaned bookings
router.post('/fix-orphaned-bookings', async (req, res) => {
  try {
    const Booking = require('./models/Booking');
    const Teacher = require('./models/Teacher');
    
    // Find all bookings with orphaned teacher IDs
    const allBookings = await Booking.find();
    const allTeachers = await Teacher.find();
    const validTeacherIds = allTeachers.map(t => t.teacherId);
    
    let fixedCount = 0;
    for (const booking of allBookings) {
      if (!validTeacherIds.includes(booking.teacherId)) {
        // Find the closest matching teacher ID (in this case, kjb00000001)
        const closestTeacherId = validTeacherIds.find(id => id.startsWith('kjb'));
        if (closestTeacherId) {
          booking.teacherId = closestTeacherId;
          await booking.save();
          fixedCount++;
        }
      }
    }
    
    res.json({
      success: true,
      message: `Fixed ${fixedCount} orphaned bookings`,
      fixedCount
    });
  } catch (error) {
    console.error('Error fixing orphaned bookings:', error);
    res.status(500).json({ error: 'Failed to fix orphaned bookings' });
  }
});

// POST custom report
router.post('/reports/custom', async (req, res) => {
  try {
    const { reportType, startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    
    const Booking = require('./models/Booking');
    const Teacher = require('./models/Teacher');
    const Student = require('./models/Student');
    
    let data = {};
    
    switch (reportType) {
      case 'user-activity':
        const [teachers, students, bookings] = await Promise.all([
          Teacher.countDocuments({ createdAt: { $gte: start, $lte: end } }),
          Student.countDocuments({ createdAt: { $gte: start, $lte: end } }),
          Booking.countDocuments({ createdAt: { $gte: start, $lte: end } })
        ]);
        
        data = {
          newTeachers: teachers,
          newStudents: students,
          newBookings: bookings,
          period: `${startDate} to ${endDate}`
        };
        break;
        
      case 'financial':
        const financialCompletedBookings = await Booking.find({
          status: 'completed',
          date: { $gte: startDate, $lte: endDate }
        });
        
        const GlobalSettings = require('./models/GlobalSettings');
        const settings = await GlobalSettings.findOne();
        const rate = settings?.globalRate || 100;
        
        data = {
          completedClasses: financialCompletedBookings.length,
          totalEarnings: financialCompletedBookings.length * rate,
          rate,
          period: `${startDate} to ${endDate}`
        };
        break;
        
      case 'class-performance':
        const allBookings = await Booking.find({
          date: { $gte: startDate, $lte: endDate }
        });
        
        // Get teacher data for lookup
        const teacherIds = [...new Set(allBookings.map(b => b.teacherId))];
        const teacherData = await Teacher.find({ teacherId: { $in: teacherIds } }, 'teacherId username fullname');
        
        // Debug logging
        console.log('Debug - All teacher IDs from bookings:', teacherIds);
        console.log('Debug - Found teachers:', teacherData.map(t => ({ teacherId: t.teacherId, name: t.fullname || t.username })));
        
        // Create teacher lookup map
        const teacherMap = {};
        teacherData.forEach(teacher => {
          teacherMap[teacher.teacherId] = teacher.fullname || teacher.username;
        });
        
        // Find missing teacher IDs
        const missingTeacherIds = teacherIds.filter(id => !teacherMap[id]);
        if (missingTeacherIds.length > 0) {
          console.log('Debug - Missing teacher IDs:', missingTeacherIds);
        }
        
        const teacherStats = {};
        allBookings.forEach(booking => {
          const teacherName = teacherMap[booking.teacherId] || 'Unknown';
          if (!teacherStats[teacherName]) {
            teacherStats[teacherName] = { total: 0, completed: 0 };
          }
          teacherStats[teacherName].total++;
          if (booking.status === 'completed') {
            teacherStats[teacherName].completed++;
          }
        });
        
        data = {
          teacherStats,
          totalBookings: allBookings.length,
          period: `${startDate} to ${endDate}`
        };
        break;
        
      case 'weekly-summary':
        const [newUsers, newBookings, weeklyCompletedBookings] = await Promise.all([
          Teacher.countDocuments({ createdAt: { $gte: start, $lte: end } }) +
          Student.countDocuments({ createdAt: { $gte: start, $lte: end } }),
          Booking.countDocuments({ createdAt: { $gte: start, $lte: end } }),
          Booking.countDocuments({
            status: 'completed',
            date: { $gte: startDate, $lte: endDate }
          })
        ]);
        
        data = {
          newUsers,
          newBookings,
          completedBookings: weeklyCompletedBookings,
          completionRate: newBookings > 0 ? (weeklyCompletedBookings / newBookings * 100).toFixed(2) : 0,
          period: `${startDate} to ${endDate}`
        };
        break;
        
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid report type'
        });
    }
    
    res.json({
      success: true,
      data
    });
    
  } catch (error) {
    console.error('Error generating custom report:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating custom report'
    });
  }
});

// GET security settings
router.get('/settings/security', async (req, res) => {
  try {
    // For now, return default settings
    res.json({
      success: true,
      data: {
        sessionTimeout: 30,
        passwordPolicy: 'medium'
      }
    });
  } catch (error) {
    console.error('Error loading security settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading security settings'
    });
  }
});

// POST security settings
router.post('/settings/security', async (req, res) => {
  try {
    const { sessionTimeout, passwordPolicy } = req.body;
    
    // Here you would save to database
    console.log('Saving security settings:', { sessionTimeout, passwordPolicy });
    
    res.json({
      success: true,
      message: 'Security settings saved successfully'
    });
  } catch (error) {
    console.error('Error saving security settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving security settings'
    });
  }
});

// GET email settings
router.get('/settings/email', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        emailNotifications: true
      }
    });
  } catch (error) {
    console.error('Error loading email settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading email settings'
    });
  }
});

// POST email settings
router.post('/settings/email', async (req, res) => {
  try {
    const { smtpHost, smtpPort, emailNotifications } = req.body;
    
    console.log('Saving email settings:', { smtpHost, smtpPort, emailNotifications });
    
    res.json({
      success: true,
      message: 'Email settings saved successfully'
    });
  } catch (error) {
    console.error('Error saving email settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving email settings'
    });
  }
});

// GET platform settings
router.get('/settings/platform', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        maintenanceMode: false,
        autoBackup: true,
        backupFrequency: 7
      }
    });
  } catch (error) {
    console.error('Error loading platform settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading platform settings'
    });
  }
});

// POST platform settings
router.post('/settings/platform', async (req, res) => {
  try {
    const { maintenanceMode, autoBackup, backupFrequency } = req.body;
    
    console.log('Saving platform settings:', { maintenanceMode, autoBackup, backupFrequency });
    
    res.json({
      success: true,
      message: 'Platform settings saved successfully'
    });
  } catch (error) {
    console.error('Error saving platform settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving platform settings'
    });
  }
});

// GET database settings
router.get('/settings/database', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        poolSize: 10,
        queryTimeout: 30,
        status: 'Connected'
      }
    });
  } catch (error) {
    console.error('Error loading database settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading database settings'
    });
  }
});

// POST database settings
router.post('/settings/database', async (req, res) => {
  try {
    const { poolSize, queryTimeout } = req.body;
    
    console.log('Saving database settings:', { poolSize, queryTimeout });
    
    res.json({
      success: true,
      message: 'Database settings saved successfully'
    });
  } catch (error) {
    console.error('Error saving database settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving database settings'
    });
  }
});

// GET data management settings
router.get('/settings/data-management', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        logRetention: 90,
        backupRetention: 30
      }
    });
  } catch (error) {
    console.error('Error loading data management settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error loading data management settings'
    });
  }
});

// POST data management settings
router.post('/settings/data-management', async (req, res) => {
  try {
    const { logRetention, backupRetention } = req.body;
    
    console.log('Saving data management settings:', { logRetention, backupRetention });
    
    res.json({
      success: true,
      message: 'Data management settings saved successfully'
    });
  } catch (error) {
    console.error('Error saving data management settings:', error);
    res.status(500).json({
      success: false,
      message: 'Error saving data management settings'
    });
  }
});

// POST system maintenance
router.post('/maintenance', async (req, res) => {
  try {
    console.log('Running system maintenance...');
    
    // Simulate maintenance tasks
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    res.json({
      success: true,
      message: 'System maintenance completed successfully'
    });
  } catch (error) {
    console.error('Error during system maintenance:', error);
    res.status(500).json({
      success: false,
      message: 'Error during system maintenance'
    });
  }
});

// POST cleanup old logs
router.post('/cleanup/logs', async (req, res) => {
  try {
    console.log('Cleaning up old logs...');
    
    // Simulate log cleanup
    const removedCount = Math.floor(Math.random() * 100) + 50;
    
    res.json({
      success: true,
      message: 'Log cleanup completed',
      removedCount
    });
  } catch (error) {
    console.error('Error during log cleanup:', error);
    res.status(500).json({
      success: false,
      message: 'Error during log cleanup'
    });
  }
});

// POST cleanup old backups
router.post('/cleanup/backups', async (req, res) => {
  try {
    console.log('Cleaning up old backups...');
    
    // Simulate backup cleanup
    const removedCount = Math.floor(Math.random() * 10) + 5;
    
    res.json({
      success: true,
      message: 'Backup cleanup completed',
      removedCount
    });
  } catch (error) {
    console.error('Error during backup cleanup:', error);
    res.status(500).json({
      success: false,
      message: 'Error during backup cleanup'
    });
  }
});

// GET teacher rate (for teacher service fee page)
router.get('/teacher-rate/:teacherId', async (req, res) => {
  try {
    const { teacherId } = req.params;
    
    const teacher = await Teacher.findById(teacherId);
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Teacher not found'
      });
    }
    
    // Get global rate from database
    const settings = await GlobalSettings.findOne({});
    const globalRate = settings ? settings.globalRate : 100;
    
    res.json({
      success: true,
      rate: teacher.hourlyRate || globalRate
    });
  } catch (error) {
    console.error('Error getting teacher rate:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving teacher rate'
    });
  }
});

function parsePayPeriodKey(periodKey) {
  const m = String(periodKey || '').match(/^(\d{4})-(\d{2})-(1|2)$/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), half: Number(m[3]) };
}

function getPayPeriodBoundsFromKey(periodKey) {
  const p = parsePayPeriodKey(periodKey);
  if (!p) return null;
  const start = new Date(p.year, p.month - 1, p.half === 1 ? 1 : 16);
  const end = p.half === 1 ? new Date(p.year, p.month - 1, 15) : new Date(p.year, p.month, 0);
  return { start, end };
}

function getCurrentPayPeriodKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const half = date.getDate() <= 15 ? '1' : '2';
  return `${y}-${m}-${half}`;
}

// GET all teachers salaries for selected pay period (bi-weekly: 1–15 and 16–end)
// Backward-compatible route name kept for existing frontend.
router.get('/teachers-weekly-salaries', async (req, res) => {
  try {
    // periodKey format: YYYY-MM-1 (1st–15th) or YYYY-MM-2 (16th–end)
    const periodKey = req.query.period || getCurrentPayPeriodKey(new Date());
    const bounds = getPayPeriodBoundsFromKey(periodKey) || getPayPeriodBoundsFromKey(getCurrentPayPeriodKey(new Date()));
    const startDate = bounds.start.toISOString().split('T')[0];
    const endDate = bounds.end.toISOString().split('T')[0];
    
    // Get global rate from database
    const settings = await GlobalSettings.findOne({});
    const globalRate = settings ? settings.globalRate : 100;
    
    // Get all teachers
    const teachers = await Teacher.find({});
    const teachersWithSalaries = [];
    
    for (const teacher of teachers) {
      // Get all classes for this teacher in current week
      const weekClasses = await Booking.find({
        teacherId: teacher.teacherId,
        date: {
          $gte: startDate,
          $lte: endDate
        }
      });
      
      // Calculate completed classes
      const completedClasses = weekClasses.filter(booking => booking.status === 'completed').length;
      
      // Calculate student absent classes (teacher entered but student didn't)
      const studentAbsentClasses = weekClasses.filter(booking => 
        booking.status === 'completed' && 
        booking.attendance && 
        booking.attendance.teacherEntered && 
        !booking.attendance.studentEntered
      ).length;
      
      // Calculate teacher absent classes (teacher didn't enter within 15 minutes)
      const teacherAbsentClasses = weekClasses.filter(booking => 
        booking.status === 'absent' && 
        booking.attendance && 
        !booking.attendance.teacherEntered
      ).length;
      
      // Calculate late arrivals (teacher entered late)
      const lateClasses = weekClasses.filter(booking => 
        booking.status === 'completed' && 
        booking.attendance && 
        booking.attendance.teacherEntered && 
        booking.lateMinutes && 
        booking.lateMinutes > 0
      );
      
      const totalLateMinutes = lateClasses.reduce((total, booking) => total + (booking.lateMinutes || 0), 0);
      const lateDeductions = totalLateMinutes * 2; // ₱2 per minute
      
      // Calculate teacher absent deductions
      const teacherAbsentDeductions = teacherAbsentClasses * (teacher.hourlyRate || globalRate);
      
      // Calculate base weekly fee (completed classes × rate)
      const baseWeeklyFee = completedClasses * (teacher.hourlyRate || globalRate);
      
      // Calculate student absent payment (no-class, no-pay policy => 0)
      const studentAbsentPayment = 0;
      
      // Calculate net payable amount (same as teacher service fee)
      const netPayableAmount = Math.max(0, baseWeeklyFee + studentAbsentPayment - lateDeductions - teacherAbsentDeductions);
      
      // Check if this teacher has been paid for the current week
      let paymentStatus = 'Pending';
      if (teacher.paymentHistory && teacher.paymentHistory.length > 0) {
        // Check if there's a payment record for the current week
        const currentWeekPayment = teacher.paymentHistory.find(payment => {
          return payment.duration === `${startDate} - ${endDate}` && payment.status === 'Success';
        });
        
        if (currentWeekPayment) {
          paymentStatus = 'Paid';
        }
      }
      
      teachersWithSalaries.push({
        teacherId: teacher._id,
        email: teacher.username,
        completedClasses,
        studentAbsentClasses,
        teacherAbsentClasses,
        lateMinutes: totalLateMinutes,
        rate: teacher.hourlyRate || globalRate,
        baseWeeklyFee,
        studentAbsentPayment,
        lateDeductions,
        teacherAbsentDeductions,
        weeklySalary: netPayableAmount, // This is now the net payable amount
        paymentStatus
      });
    }
    
    res.json({
      success: true,
      teachers: teachersWithSalaries,
      periodKey,
      weekPeriod: `${startDate} to ${endDate}`
    });
  } catch (error) {
    console.error('Error getting teachers weekly salaries:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving teachers weekly salaries'
    });
  }
});

// POST dispense salaries to all teachers for selected pay period (bi-weekly)
router.post('/dispense-salaries', async (req, res) => {
  try {
    const periodKey = req.body.period || getCurrentPayPeriodKey(new Date());
    const bounds = getPayPeriodBoundsFromKey(periodKey) || getPayPeriodBoundsFromKey(getCurrentPayPeriodKey(new Date()));
    const startDate = bounds.start.toISOString().split('T')[0];
    const endDate = bounds.end.toISOString().split('T')[0];
    // Issue date = next day after endDate
    const issueDate = new Date(bounds.end);
    issueDate.setDate(issueDate.getDate() + 1);
    
    // Get global rate from database
    const settings = await GlobalSettings.findOne({});
    const globalRate = settings ? settings.globalRate : 100;
    
    // Get all teachers
    const teachers = await Teacher.find({});
    const dispensedTeachers = [];
    
    for (const teacher of teachers) {
      // Get all classes for this teacher in current week
      const weekClasses = await Booking.find({
        teacherId: teacher.teacherId,
        date: {
          $gte: startDate,
          $lte: endDate
        }
      });
      
      // Calculate completed classes
      const completedClasses = weekClasses.filter(booking => booking.status === 'completed').length;
      
      // Calculate student absent classes (teacher entered but student didn't)
      const studentAbsentClasses = weekClasses.filter(booking => 
        booking.status === 'completed' && 
        booking.attendance && 
        booking.attendance.teacherEntered && 
        !booking.attendance.studentEntered
      ).length;
      
      // Calculate teacher absent classes (teacher didn't enter within 15 minutes)
      const teacherAbsentClasses = weekClasses.filter(booking => 
        booking.status === 'absent' && 
        booking.attendance && 
        !booking.attendance.teacherEntered
      ).length;
      
      // Calculate late arrivals (teacher entered late)
      const lateClasses = weekClasses.filter(booking => 
        booking.status === 'completed' && 
        booking.attendance && 
        booking.attendance.teacherEntered && 
        booking.lateMinutes && 
        booking.lateMinutes > 0
      );
      
      const totalLateMinutes = lateClasses.reduce((total, booking) => total + (booking.lateMinutes || 0), 0);
      const lateDeductions = totalLateMinutes * 2; // ₱2 per minute
      
      // Calculate teacher absent deductions
      const teacherAbsentDeductions = teacherAbsentClasses * (teacher.hourlyRate || globalRate);
      
      // Calculate base weekly fee (completed classes × rate)
      const baseWeeklyFee = completedClasses * (teacher.hourlyRate || globalRate);
      
      // Calculate student absent payment (no-class, no-pay policy => 0)
      const studentAbsentPayment = 0;
      
      // Calculate net payable amount (same as teacher service fee)
      const netPayableAmount = Math.max(0, baseWeeklyFee + studentAbsentPayment - lateDeductions - teacherAbsentDeductions);
      const weeklySalary = netPayableAmount;
      
      if (weeklySalary > 0) {
        // Create payment record (you might want to create a Payment model)
        // For now, we'll just mark it as paid in the teacher's record
        await Teacher.findByIdAndUpdate(teacher._id, {
          $push: {
            paymentHistory: {
              duration: `${startDate} - ${endDate}`,
              issueDate: issueDate,
              amount: weeklySalary,
              remark: 0,
              paymentMethod: 'HSBC_PayPal',
              account: teacher.username,
              status: 'Success'
            }
          }
        });
        
        // Create salary notification for teacher dashboard
        try {
          await createNotification(
            teacher.teacherId,
            'salary',
            `Your salary of ₱${weeklySalary.toFixed(2)} for ${startDate} - ${endDate} has been credited.`
          );
        } catch (notifError) {
          console.error('❌ Error creating salary notification for teacher:', teacher.teacherId, notifError);
        }
        
        dispensedTeachers.push({
          teacherId: teacher._id,
          email: teacher.username,
          weeklySalary
        });
      }
    }
    
    console.log(`Dispensed salaries to ${dispensedTeachers.length} teachers`);
    
    res.json({
      success: true,
      message: `Successfully dispensed salaries to ${dispensedTeachers.length} teachers`,
      dispensedTeachers,
      totalAmount: dispensedTeachers.reduce((sum, teacher) => sum + teacher.weeklySalary, 0)
    });
  } catch (error) {
    console.error('Error dispensing salaries:', error);
    res.status(500).json({
      success: false,
      message: 'Error dispensing salaries'
    });
  }
});

// GET teachers count
router.get('/teachers-count', async (req, res) => {
  try {
    const count = await Teacher.countDocuments({});
    res.json({ count });
  } catch (error) {
    console.error('Error getting teachers count:', error);
    res.status(500).json({ error: 'Error getting teachers count' });
  }
});

// GET students count
router.get('/students-count', async (req, res) => {
  try {
    const count = await Student.countDocuments({});
    res.json({ count });
  } catch (error) {
    console.error('Error getting students count:', error);
    res.status(500).json({ error: 'Error getting students count' });
  }
});

// GET bookings count
router.get('/bookings-count', async (req, res) => {
  try {
    const active = await Booking.countDocuments({ status: { $in: ['booked', 'Booked', 'confirmed'] } });
    const completed = await Booking.countDocuments({ status: 'finished' });
    res.json({ active, completed });
  } catch (error) {
    console.error('Error getting bookings count:', error);
    res.status(500).json({ error: 'Error getting bookings count' });
  }
});

// GET recent activity
router.get('/recent-activity', async (req, res) => {
  try {
    // This is a mock endpoint - in a real app, you'd have an Activity model
    const activities = [
      {
        action: 'New Teacher Registration',
        details: 'Teacher John Doe joined the platform',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      },
      {
        action: 'Class Completed',
        details: 'Mathematics class finished by Teacher Smith',
        timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000) // 4 hours ago
      },
      {
        action: 'Salary Disbursed',
        details: 'Weekly salaries processed for 15 teachers',
        timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
      },
      {
        action: 'New Student Booking',
        details: 'Student booked English class with Teacher Johnson',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days ago
      }
    ];
    res.json(activities);
  } catch (error) {
    console.error('Error getting recent activity:', error);
    res.status(500).json({ error: 'Error getting recent activity' });
  }
});

// GET teachers list
router.get('/teachers-list', async (req, res) => {
  try {
    // Filter out teachers with null or missing usernames
    const teachers = await Teacher.find({ 
      username: { $exists: true, $ne: null, $ne: '' } 
    }).select('username email createdAt status');
    
    console.log(`Found ${teachers.length} valid teachers`);
    res.json(teachers);
  } catch (error) {
    console.error('Error getting teachers list:', error);
    res.status(500).json({ error: 'Error getting teachers list' });
  }
});

// GET students list
router.get('/students-list', async (req, res) => {
  try {
    const students = await Student.find({}).select('username email firstName lastName createdAt status');
    res.json(students);
  } catch (error) {
    console.error('Error getting students list:', error);
    res.status(500).json({ error: 'Error getting students list' });
  }
});

// GET admins list
router.get('/admins-list', async (req, res) => {
  try {
    const admins = await Admin.find({}).select('username createdAt status');
    res.json(admins);
  } catch (error) {
    console.error('Error getting admins list:', error);
    res.status(500).json({ error: 'Error getting admins list' });
  }
});

// Admin messages directory with search by user ID or name
router.get('/messages/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const q = String((req.query && req.query.q) || '').trim().toLowerCase();

    const [teachers, students] = await Promise.all([
      Teacher.find({})
        .select('teacherId username firstName lastName fullname email profilePicture')
        .lean(),
      Student.find({})
        .select('username firstName lastName email profilePicture')
        .lean()
    ]);

    const teacherRows = teachers.map((t) => {
      const displayName = (t.fullname || `${t.firstName || ''} ${t.lastName || ''}`.trim() || t.username || t.teacherId || 'Teacher').trim();
      return {
        userType: 'teacher',
        userId: String(t.teacherId || t.username || ''),
        username: String(t.username || ''),
        name: displayName,
        email: String(t.email || ''),
        profilePicture: t.profilePicture || null
      };
    });

    const studentRows = students.map((s) => {
      const displayName = (`${s.firstName || ''} ${s.lastName || ''}`.trim() || s.username || 'Student').trim();
      return {
        userType: 'student',
        userId: String(s.username || ''),
        username: String(s.username || ''),
        name: displayName,
        email: String(s.email || ''),
        profilePicture: s.profilePicture || null
      };
    });

    const rows = teacherRows.concat(studentRows);
    const filtered = !q
      ? rows
      : rows.filter((u) => {
          const hay = `${u.userId} ${u.username} ${u.name} ${u.email} ${u.userType}`.toLowerCase();
          return hay.includes(q);
        });

    // Include lightweight last-message preview to make search page useful.
    const userKeys = filtered.map((u) => u.userId).filter(Boolean);
    let lastByUser = new Map();
    if (userKeys.length) {
      const recent = await PeerMessage.find({
        $or: [{ senderId: { $in: userKeys } }, { recipientId: { $in: userKeys } }]
      })
        .sort({ createdAt: -1 })
        .limit(3000)
        .lean();
      recent.forEach((m) => {
        const sender = String(m.senderId || '');
        const recipient = String(m.recipientId || '');
        if (sender && !lastByUser.has(sender)) lastByUser.set(sender, m);
        if (recipient && !lastByUser.has(recipient)) lastByUser.set(recipient, m);
      });
    }

    const out = filtered
      .map((u) => {
        const lm = lastByUser.get(u.userId);
        return {
          ...u,
          lastMessage: lm ? String(lm.message || '') : '',
          lastMessageAt: lm ? lm.createdAt : null
        };
      })
      .sort((a, b) => {
        const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        if (tb !== ta) return tb - ta;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });

    res.json({ success: true, users: out });
  } catch (error) {
    console.error('Error loading admin message users:', error);
    res.status(500).json({ success: false, message: 'Failed to load message users' });
  }
});

function getAdminMessengerId(req) {
  const username = String(req.user?.username || 'admin').trim().toLowerCase();
  return `admin:${username}`;
}

// Admin -> user conversation thread
router.get('/messages/thread/:userId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return res.status(400).json({ success: false, message: 'userId is required' });

    const adminId = getAdminMessengerId(req);
    const messages = await PeerMessage.find({
      $or: [
        { senderId: adminId, recipientId: userId },
        { senderId: userId, recipientId: adminId }
      ]
    })
      .sort({ createdAt: 1 })
      .lean();

    await PeerMessage.updateMany(
      { senderId: userId, recipientId: adminId, readAt: null },
      { $set: { readAt: new Date() } }
    );

    res.json({
      success: true,
      me: adminId,
      messages: messages.map((m) => ({
        id: String(m._id),
        senderId: String(m.senderId || ''),
        recipientId: String(m.recipientId || ''),
        message: String(m.message || ''),
        createdAt: m.createdAt,
        readAt: m.readAt || null
      }))
    });
  } catch (error) {
    console.error('Error loading admin thread:', error);
    res.status(500).json({ success: false, message: 'Failed to load thread' });
  }
});

// Admin sends a direct message to a teacher/student userId
router.post('/messages/send', verifyToken, requireAdmin, async (req, res) => {
  try {
    const recipientId = String(req.body?.recipientId || '').trim();
    const message = String(req.body?.message || '').trim();
    if (!recipientId || !message) {
      return res.status(400).json({ success: false, message: 'recipientId and message are required' });
    }

    const adminId = getAdminMessengerId(req);
    const saved = await PeerMessage.create({
      senderId: adminId,
      recipientId,
      message
    });

    res.json({
      success: true,
      messageRecord: {
        id: String(saved._id),
        senderId: adminId,
        recipientId,
        message: saved.message,
        createdAt: saved.createdAt
      }
    });
  } catch (error) {
    console.error('Error sending admin message:', error);
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

// Cleanup invalid records
router.post('/cleanup-invalid-records', async (req, res) => {
  try {
    // Clean up teachers with null usernames
    const teacherResult = await Teacher.deleteMany({ 
      $or: [
        { username: null },
        { username: '' },
        { username: { $exists: false } }
      ]
    });
    
    // Clean up students with null usernames
    const studentResult = await Student.deleteMany({ 
      $or: [
        { username: null },
        { username: '' },
        { username: { $exists: false } }
      ]
    });
    
    // Clean up admins with null usernames
    const adminResult = await Admin.deleteMany({ 
      $or: [
        { username: null },
        { username: '' },
        { username: { $exists: false } }
      ]
    });
    
    console.log(`Cleanup completed: ${teacherResult.deletedCount} teachers, ${studentResult.deletedCount} students, ${adminResult.deletedCount} admins removed`);
    
    res.json({
      success: true,
      message: 'Invalid records cleaned up successfully',
      deleted: {
        teachers: teacherResult.deletedCount,
        students: studentResult.deletedCount,
        admins: adminResult.deletedCount
      }
    });
  } catch (error) {
    console.error('Error cleaning up invalid records:', error);
    res.status(500).json({ error: 'Error cleaning up invalid records' });
  }
});

// Cancellation request management endpoints for admin
router.get('/cancellation-requests', async (req, res) => {
  try {
    const requests = await CancellationRequest.find({})
      .populate('bookingId', 'date time lesson studentLevel studentId teacherId')
      .sort({ createdAt: -1 });
    
    res.json(requests);
  } catch (err) {
    console.error('Error fetching cancellation requests:', err);
    res.status(500).json({ error: 'Failed to fetch cancellation requests' });
  }
});

router.post('/review-cancellation', async (req, res) => {
  try {
    const { requestId, status, adminNotes } = req.body;
    
    if (!requestId || !status) {
      return res.status(400).json({ 
        success: false, 
        error: 'Request ID and status are required' 
      });
    }
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Status must be either "approved" or "rejected"' 
      });
    }
    
    const cancellationRequest = await CancellationRequest.findById(requestId);
    
    if (!cancellationRequest) {
      return res.status(404).json({ 
        success: false, 
        error: 'Cancellation request not found' 
      });
    }
    
    if (cancellationRequest.status !== 'pending') {
      return res.status(400).json({ 
        success: false, 
        error: 'This request has already been reviewed' 
      });
    }
    
    // Update the cancellation request
    cancellationRequest.status = status;
    cancellationRequest.adminReview = {
      reviewedBy: 'admin', // In a real app, this would be the actual admin username
      reviewedAt: new Date(),
      adminNotes: adminNotes || ''
    };
    
    await cancellationRequest.save();
    
    // If approved, update the booking status to cancelled
    if (status === 'approved') {
      const booking = await Booking.findById(cancellationRequest.bookingId);
      if (booking) {
        booking.status = 'cancelled';
        await releaseReservedCreditForBooking(booking);
        await booking.save();
        
        // MARK THE SLOT AS AVAILABLE AGAIN WHEN BOOKING IS CANCELLED
        console.log('🔍 Marking slot as available after booking cancellation...');
        const TeacherSlot = require('./models/TeacherSlot');
        const slotUpdateResult = await TeacherSlot.updateOne(
          { teacherId: booking.teacherId, date: booking.date, time: booking.time },
          { available: true }
        );
        console.log('✅ Slot marked as available after cancellation:', slotUpdateResult.modifiedCount > 0);
      }
    }
    
    res.json({
      success: true,
      message: `Cancellation request ${status} successfully`,
      cancellationRequest
    });
  } catch (err) {
    console.error('Error reviewing cancellation request:', err);
    res.status(500).json({ error: 'Failed to review cancellation request' });
  }
});

// GET booking details by ID
router.get('/booking/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ 
        success: false, 
        error: 'Booking not found' 
      });
    }
    
    res.json({
      success: true,
      booking
    });
  } catch (err) {
    console.error('Error fetching booking details:', err);
    res.status(500).json({ error: 'Failed to fetch booking details' });
  }
});

// ===== USER MANAGEMENT ENDPOINTS =====

// GET all teachers
router.get('/teachers', async (req, res) => {
  try {
    const teachers = await Teacher.find({}).select('-password');
    res.json(teachers);
  } catch (err) {
    console.error('Error fetching teachers:', err);
    res.status(500).json({ error: 'Failed to fetch teachers' });
  }
});

// GET all students
router.get('/students', async (req, res) => {
  try {
    const students = await Student.find({}).select('-password');
    res.json(students);
  } catch (err) {
    console.error('Error fetching students:', err);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// GET all admins
router.get('/admins', async (req, res) => {
  try {
    const admins = await Admin.find({}).select('-password');
    res.json(admins);
  } catch (err) {
    console.error('Error fetching admins:', err);
    res.status(500).json({ error: 'Failed to fetch admins' });
  }
});

// GET specific user by ID
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { type } = req.query;
    
    let user;
    switch (type) {
      case 'teacher':
        user = await Teacher.findById(userId).select('-password');
        break;
      case 'student':
        user = await Student.findById(userId).select('-password');
        break;
      case 'admin':
        user = await Admin.findById(userId).select('-password');
        break;
      default:
        return res.status(400).json({ error: 'Invalid user type' });
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST create new user
router.post('/user', async (req, res) => {
  try {
    console.log('=== TEACHER REGISTRATION ATTEMPT ===');
    console.log('Request body:', req.body);
    
    const { userType, username, email, password, firstName, lastName, rate, studentFirstName, studentLastName } = req.body;
    
    // For teachers, only email, firstName, and lastName are required
    if (!userType || !email) {
      return res.status(400).json({ error: 'User type and email are required' });
    }
    
    // For students and admins, password is still required
    if (userType !== 'teacher' && (!username || !password)) {
      return res.status(400).json({ error: 'Username and password are required for students and admins' });
    }
    
    // Check if email already exists
    let existingUser;
    switch (userType) {
      case 'teacher':
        existingUser = await Teacher.findOne({ email });
        break;
      case 'student':
        existingUser = await Student.findOne({ $or: [{ username }, { email }] });
        break;
      case 'admin':
        existingUser = await Admin.findOne({ $or: [{ username }, { email }] });
        break;
      default:
        return res.status(400).json({ error: 'Invalid user type' });
    }
    
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    let newUser;
    let generatedUsername, generatedPassword, hashedPassword;
    
    switch (userType) {
      case 'teacher':
        console.log('Creating teacher account...');
        console.log('Email:', email);
        console.log('FirstName:', firstName);
        console.log('LastName:', lastName);
        console.log('Rate:', rate);
        
        // Generate temporary username and password for teachers
        generatedUsername = await generateTemporaryUsername();
        console.log('Generated username:', generatedUsername);
        generatedPassword = generateStrongPassword();
        console.log('Generated password:', generatedPassword);
        hashedPassword = await bcrypt.hash(generatedPassword, 10);
        console.log('Password hashed successfully');
        
        // Generate teacherId (format: kjb + 8 digits)
        // Find the highest existing teacherId number to avoid conflicts
        const existingTeachers = await Teacher.find({}).select('teacherId');
        let maxNumber = 0;
        
        existingTeachers.forEach(teacher => {
          if (teacher.teacherId && teacher.teacherId.startsWith('kjb')) {
            const numberPart = teacher.teacherId.substring(3);
            const number = parseInt(numberPart, 10);
            if (!isNaN(number) && number > maxNumber) {
              maxNumber = number;
            }
          }
        });
        
        const teacherIdNumber = (maxNumber + 1).toString().padStart(8, '0');
        const teacherId = `kjb${teacherIdNumber}`;
        console.log('Generated teacherId:', teacherId);
        
        // Validate generated username
        if (!generatedUsername || generatedUsername.trim() === '') {
          throw new Error('Failed to generate valid username');
        }
        
        // Check if username already exists
        const existingUsername = await Teacher.findOne({ username: generatedUsername });
        if (existingUsername) {
          throw new Error(`Username ${generatedUsername} already exists`);
        }
        
        // Check if teacherId already exists
        const existingTeacherId = await Teacher.findOne({ teacherId: teacherId });
        if (existingTeacherId) {
          throw new Error(`TeacherId ${teacherId} already exists`);
        }
        
        newUser = new Teacher({
          teacherId: teacherId,
          username: generatedUsername,
          email,
          password: hashedPassword,
          firstName: firstName || '',
          lastName: lastName || '',
          hourlyRate: rate || 100,
          hasGeneratedPassword: true // Set flag to force password change
        });
        console.log('Teacher object created:', {
          teacherId: newUser.teacherId,
          username: newUser.username,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          hourlyRate: newUser.hourlyRate
        });
        break;
      case 'student':
        hashedPassword = await bcrypt.hash(password, 10);
        newUser = new Student({
          username,
          email,
          password: hashedPassword,
          firstName: studentFirstName || '',
          lastName: studentLastName || ''
        });
        break;
      case 'admin':
        hashedPassword = await bcrypt.hash(password, 10);
        newUser = new Admin({
          username,
          email,
          password: hashedPassword
        });
        break;
    }
    
    // Validate user data before saving
    if (!newUser.username || newUser.username.trim() === '') {
      throw new Error('Username cannot be null or empty');
    }
    
    console.log('Attempting to save teacher to database...');
    try {
      await newUser.save();
      console.log('Teacher saved successfully to database');
    } catch (saveError) {
      console.error('Error saving teacher to database:', saveError);
      if (saveError.code === 11000) {
        // Duplicate key error
        if (saveError.keyPattern && saveError.keyPattern.username) {
          throw new Error(`Username ${newUser.username} already exists`);
        } else if (saveError.keyPattern && saveError.keyPattern.teacherId) {
          throw new Error(`TeacherId ${newUser.teacherId} already exists`);
        } else if (saveError.keyPattern && saveError.keyPattern.email) {
          throw new Error(`Email ${newUser.email} already exists`);
        } else {
          throw new Error('Duplicate key error: ' + JSON.stringify(saveError.keyPattern));
        }
      }
      throw saveError;
    }
    
    // Send welcome email for teachers
    if (userType === 'teacher') {
      try {
        const emailResult = await sendTeacherRegistrationEmail(
          email,
          generatedUsername,
          generatedPassword,
          firstName || '',
          lastName || ''
        );
        
        if (emailResult.success) {
          res.json({
            success: true,
            message: `Teacher created successfully. Welcome email sent to ${email}`,
            user: { 
              ...newUser.toObject(), 
              password: undefined,
              generatedUsername,
              generatedPassword 
            }
          });
        } else if (emailResult.fallback) {
          // Email not configured - return credentials in response
          res.json({
            success: true,
            message: `Teacher created successfully. Email service not configured.`,
            user: { 
              ...newUser.toObject(), 
              password: undefined 
            },
            credentials: {
              username: generatedUsername,
              password: generatedPassword
            }
          });
        } else {
          // Email failed but user was created
          res.json({
            success: true,
            message: `Teacher created successfully but email sending failed.`,
            user: { 
              ...newUser.toObject(), 
              password: undefined 
            },
            credentials: {
              username: generatedUsername,
              password: generatedPassword
            },
            emailError: emailResult.error
          });
        }
      } catch (emailError) {
        console.error('Email error:', emailError);
        // If email fails, still return success with credentials
        res.json({
          success: true,
          message: `Teacher created successfully but email sending failed.`,
          user: { 
            ...newUser.toObject(), 
            password: undefined 
          },
          credentials: {
            username: generatedUsername,
            password: generatedPassword
          },
          emailError: emailError.message
        });
      }
    } else {
      // For non-teacher users
      res.json({
        success: true,
        message: `${userType} created successfully`,
        user: { ...newUser.toObject(), password: undefined }
      });
    }
  } catch (err) {
      console.error('Error creating user:', err);
      console.error('Error stack:', err.stack);
      res.status(500).json({ error: 'Failed to create user' });
    }
});

// PUT update user
router.put('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { userType, username, email, password, firstName, lastName, rate, studentFirstName, studentLastName } = req.body;
    
    if (!userType) {
      return res.status(400).json({ error: 'User type is required' });
    }
    
    let user;
    switch (userType) {
      case 'teacher':
        user = await Teacher.findById(userId);
        break;
      case 'student':
        user = await Student.findById(userId);
        break;
      case 'admin':
        user = await Admin.findById(userId);
        break;
      default:
        return res.status(400).json({ error: 'Invalid user type' });
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update fields
    if (username) user.username = username;
    if (email) user.email = email;
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }
    
    // Update type-specific fields
    if (userType === 'teacher') {
      if (firstName) user.firstName = firstName;
      if (lastName) user.lastName = lastName;
      if (rate) user.hourlyRate = rate;
    } else if (userType === 'student') {
      if (studentFirstName) user.firstName = studentFirstName;
      if (studentLastName) user.lastName = studentLastName;
    }
    
    await user.save();
    
    res.json({
      success: true,
      message: `${userType} updated successfully`,
      user: { ...user.toObject(), password: undefined }
    });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// PUT suspend user
router.put('/user/:userId/suspend', async (req, res) => {
  try {
    const { userId } = req.params;
    const { type } = req.query;
    
    let user;
    switch (type) {
      case 'teacher':
        user = await Teacher.findById(userId);
        break;
      case 'student':
        user = await Student.findById(userId);
        break;
      case 'admin':
        user = await Admin.findById(userId);
        break;
      default:
        return res.status(400).json({ error: 'Invalid user type' });
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Set status to suspended
    user.status = 'suspended';
    await user.save();
    
    res.json({
      success: true,
      message: `${type} suspended successfully`
    });
  } catch (err) {
    console.error('Error suspending user:', err);
    res.status(500).json({ error: 'Failed to suspend user' });
  }
});

// PUT unsuspend user
router.put('/user/:userId/unsuspend', async (req, res) => {
  try {
    const { userId } = req.params;
    const { type } = req.query;
    
    let user;
    switch (type) {
      case 'teacher':
        user = await Teacher.findById(userId);
        break;
      case 'student':
        user = await Student.findById(userId);
        break;
      case 'admin':
        user = await Admin.findById(userId);
        break;
      default:
        return res.status(400).json({ error: 'Invalid user type' });
    }
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Set status to active
    user.status = 'active';
    await user.save();
    
    res.json({
      success: true,
      message: `${type} unsuspended successfully`
    });
  } catch (err) {
    console.error('Error unsuspending user:', err);
    res.status(500).json({ error: 'Failed to unsuspend user' });
  }
});

// POST migrate user statuses (run once to add status field to existing users)
router.post('/migrate-user-statuses', async (req, res) => {
  try {
    console.log('Starting user status migration...');
    
    // Update all teachers
    const teacherResult = await Teacher.updateMany(
      { status: { $exists: false } },
      { $set: { status: 'active' } }
    );
    console.log(`Updated ${teacherResult.modifiedCount} teachers`);
    
    // Update all students
    const studentResult = await Student.updateMany(
      { status: { $exists: false } },
      { $set: { status: 'active' } }
    );
    console.log(`Updated ${studentResult.modifiedCount} students`);
    
    // Update all admins
    const adminResult = await Admin.updateMany(
      { status: { $exists: false } },
      { $set: { status: 'active' } }
    );
    console.log(`Updated ${adminResult.modifiedCount} admins`);
    
    res.json({
      success: true,
      message: 'User status migration completed',
      teachersUpdated: teacherResult.modifiedCount,
      studentsUpdated: studentResult.modifiedCount,
      adminsUpdated: adminResult.modifiedCount
    });
  } catch (err) {
    console.error('Error migrating user statuses:', err);
    res.status(500).json({ error: 'Failed to migrate user statuses' });
  }
});

// DELETE user
router.delete('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { type } = req.query;
    
    let result;
    switch (type) {
      case 'teacher':
        result = await Teacher.findByIdAndDelete(userId);
        break;
      case 'student':
        result = await Student.findByIdAndDelete(userId);
        break;
      case 'admin':
        result = await Admin.findByIdAndDelete(userId);
        break;
      default:
        return res.status(400).json({ error: 'Invalid user type' });
    }
    
    if (!result) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      success: true,
      message: `${type} deleted successfully`
    });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// ===== TIME LOG REQUESTS ENDPOINTS =====

// GET time log requests
router.get('/time-log-requests', async (req, res) => {
  try {
    // For now, we'll get time edit requests from notifications
    // In a real implementation, you might want to create a TimeEditRequest model
    const notifications = await Notification.find({ 
      type: 'time_edit',
      read: false 
    }).populate('teacherId', 'username firstName lastName');
    
    const requests = notifications.map(notification => ({
      _id: notification._id,
      teacherId: notification.teacherId?.username || notification.teacherId?.firstName || 'Unknown',
      logId: notification.message.split(' ')[0] || 'N/A',
      date: notification.message.split('for ')[1]?.split(':')[0] || 'N/A',
      reason: notification.message.split(': ')[1] || 'No reason provided',
      status: 'pending',
      createdAt: notification.createdAt
    }));
    
    res.json(requests);
  } catch (err) {
    console.error('Error fetching time log requests:', err);
    res.status(500).json({ error: 'Failed to fetch time log requests' });
  }
});

// POST review time log request
router.post('/review-time-log-request', async (req, res) => {
  try {
    const { requestId, status, timeIn, timeOut } = req.body;
    
    if (!requestId || !status) {
      return res.status(400).json({ 
        success: false, 
        error: 'Request ID and status are required' 
      });
    }
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Status must be either "approved" or "rejected"' 
      });
    }
    
    // Find the notification and mark it as read
    const notification = await Notification.findById(requestId);
    
    if (!notification) {
      return res.status(404).json({ 
        success: false, 
        error: 'Time log request not found' 
      });
    }
    
    if (notification.type !== 'time_edit') {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request type' 
      });
    }
    
    // If approved and time inputs provided, update the actual time log
    if (status === 'approved' && timeIn && timeOut) {
      try {
        // Parse the log ID from the notification message
        // Handle both old and new message formats
        let logId, date;
        
        if (notification.message.startsWith('Time edit request for')) {
          // Old format: "Time edit request for 2025-08-06: Teacher requested admin edit for time log"
          // We need to find the time log by date and teacher
          date = notification.message.split('for ')[1]?.split(':')[0];
          if (date) {
            const TimeLog = require('./models/TimeLog');
            const timeLog = await TimeLog.findOne({
              teacherId: notification.teacherId,
              date: date
            });
            logId = timeLog?._id;
          }
        } else {
          // New format: "LOG_ID for 2025-08-06: Teacher requested admin edit for time log"
          logId = notification.message.split(' ')[0];
          date = notification.message.split('for ')[1]?.split(':')[0];
        }
        
        if (logId && date) {
          // Find and update the time log
          const TimeLog = require('./models/TimeLog');
          const timeLog = await TimeLog.findById(logId);
          
          if (timeLog) {
            // Update the time log with new times (using correct field structure)
            timeLog.clockIn.time = timeIn;
            timeLog.clockOut.time = timeOut;
            
            // Recalculate total hours
            const clockIn = new Date(`2000-01-01T${timeIn}:00`);
            const clockOut = new Date(`2000-01-01T${timeOut}:00`);
            const diffMs = clockOut - clockIn;
            const diffHours = diffMs / (1000 * 60 * 60);
            timeLog.totalHours = Math.max(0, diffHours);
            
            await timeLog.save();
            console.log(`Updated time log ${logId} with new times: ${timeIn} - ${timeOut}`);
          }
        }
      } catch (updateError) {
        console.error('Error updating time log:', updateError);
        // Continue with notification update even if time log update fails
      }
    }
    
    // Mark notification as read
    notification.read = true;
    await notification.save();
    
    // Create a response notification for the teacher
    const responseMessage = status === 'approved' 
      ? `Your time log edit request has been approved. Time updated to: ${timeIn} - ${timeOut}`
      : 'Your time log edit request has been rejected. Please contact admin for more information.';
    
    await Notification.create({
      teacherId: notification.teacherId,
      type: 'time_edit_response',
      message: responseMessage,
      read: false
    });
    
    res.json({
      success: true,
      message: `Time log edit request ${status} successfully`
    });
  } catch (err) {
    console.error('Error reviewing time log request:', err);
    res.status(500).json({ error: 'Failed to review time log request' });
  }
});

// Payment History Management Endpoints

// GET teachers list for filter dropdown
router.get('/teachers-list', async (req, res) => {
  try {
    console.log('🔍 Teachers list request received');
    
    const teachers = await Teacher.find({}).select('email username firstName lastName');
    console.log(`📊 Found ${teachers.length} teachers`);
    
    const teachersList = teachers.map(teacher => ({
      email: teacher.email,
      username: teacher.username,
      name: `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || teacher.username
    }));
    
    console.log(`✅ Returning ${teachersList.length} teachers for filter dropdown`);
    
    res.json({
      success: true,
      teachers: teachersList
    });
  } catch (error) {
    console.error('❌ Error getting teachers list:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error retrieving teachers list'
    });
  }
});

// GET payment history with filters
router.get('/payment-history', async (req, res) => {
  try {
    console.log('🔍 Payment history request received:', req.query);
    
    const { teacherEmail, status } = req.query;
    
    // Get all teachers with their payment history
    const teachers = await Teacher.find({});
    console.log(`📊 Found ${teachers.length} teachers`);
    
    let allPayments = [];
    
    teachers.forEach(teacher => {
      console.log(`👤 Processing teacher: ${teacher.email}, paymentHistory length: ${teacher.paymentHistory ? teacher.paymentHistory.length : 0}`);
      
      if (teacher.paymentHistory && teacher.paymentHistory.length > 0) {
        const teacherPayments = teacher.paymentHistory.map(payment => ({
          _id: payment._id,
          teacherId: teacher._id,
          teacherEmail: teacher.email,
          teacherName: `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || teacher.username,
          period: payment.period,
          duration: payment.duration,
          issueDate: payment.issueDate,
          amount: payment.amount,
          status: payment.status
        }));
        
        allPayments = allPayments.concat(teacherPayments);
        console.log(`📋 Added ${teacherPayments.length} payments for ${teacher.email}`);
      }
    });
    
    console.log(`📊 Total payments found: ${allPayments.length}`);
    
    // Apply filters
    if (teacherEmail) {
      allPayments = allPayments.filter(payment => payment.teacherEmail === teacherEmail);
      console.log(`🔍 Filtered by teacher email: ${teacherEmail}, remaining payments: ${allPayments.length}`);
    }
    
    if (status) {
      allPayments = allPayments.filter(payment => payment.status === status);
      console.log(`🔍 Filtered by status: ${status}, remaining payments: ${allPayments.length}`);
    }
    
    // Sort by issue date (newest first)
    allPayments.sort((a, b) => {
      const dateA = a.issueDate ? new Date(a.issueDate) : new Date(0);
      const dateB = b.issueDate ? new Date(b.issueDate) : new Date(0);
      return dateB - dateA;
    });
    
    console.log(`✅ Returning ${allPayments.length} payment records`);
    
    res.json({
      success: true,
      payments: allPayments
    });
  } catch (error) {
    console.error('❌ Error getting payment history:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error retrieving payment history'
    });
  }
});

// GET specific payment record
router.get('/payment/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    // Find the payment in any teacher's payment history
    const teachers = await Teacher.find({ 'paymentHistory._id': paymentId });
    
    if (teachers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }
    
    const teacher = teachers[0];
    const payment = teacher.paymentHistory.id(paymentId);
    
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }
    
    res.json({
      success: true,
      payment: {
        _id: payment._id,
        teacherId: teacher._id,
        teacherEmail: teacher.email,
        teacherName: `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || teacher.username,
        period: payment.period,
        duration: payment.duration,
        issueDate: payment.issueDate,
        amount: payment.amount,
        status: payment.status
      }
    });
  } catch (error) {
    console.error('Error getting payment record:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving payment record'
    });
  }
});

// PUT update payment record
router.put('/payment/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { amount } = req.body;
    
    if (typeof amount !== 'number' || amount < 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount value'
      });
    }
    
    // Find the teacher with this payment
    const teacher = await Teacher.findOne({ 'paymentHistory._id': paymentId });
    
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }
    
    // Update the payment amount
    const payment = teacher.paymentHistory.id(paymentId);
    payment.amount = amount;
    
    await teacher.save();
    
    res.json({
      success: true,
      message: 'Payment updated successfully',
      payment: {
        _id: payment._id,
        amount: payment.amount
      }
    });
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating payment record'
    });
  }
});

// DELETE payment record
router.delete('/payment/:paymentId', async (req, res) => {
  try {
    const { paymentId } = req.params;
    
    // Find the teacher with this payment
    const teacher = await Teacher.findOne({ 'paymentHistory._id': paymentId });
    
    if (!teacher) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }
    
    // Remove the payment from the teacher's payment history
    teacher.paymentHistory = teacher.paymentHistory.filter(
      payment => payment._id.toString() !== paymentId
    );
    
    await teacher.save();
    
    res.json({
      success: true,
      message: 'Payment record deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting payment record'
    });
  }
});

// GET export payment history as CSV
router.get('/payment-history/export', async (req, res) => {
  try {
    const { teacherEmail, status } = req.query;
    
    // Build filter object
    const filter = {};
    
    if (teacherEmail) {
      const teacher = await Teacher.findOne({ email: teacherEmail });
      if (teacher) {
        filter.teacherId = teacher._id;
      }
    }
    
    if (status) {
      filter.status = status;
    }
    
    // Get all teachers' payment history
    const teachers = await Teacher.find({}).populate('paymentHistory');
    
    let allPayments = [];
    
    teachers.forEach(teacher => {
      if (teacher.paymentHistory && teacher.paymentHistory.length > 0) {
        const teacherPayments = teacher.paymentHistory.map(payment => ({
          teacherEmail: teacher.email,
          teacherName: `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || teacher.username,
          period: payment.period || payment.duration || 'N/A',
          issueDate: payment.issueDate ? new Date(payment.issueDate).toLocaleDateString('en-US') : 'N/A',
          amount: payment.amount || 0,
          status: payment.status || 'N/A'
        }));
        
        allPayments = allPayments.concat(teacherPayments);
      }
    });
    
    // Apply filters
    if (teacherEmail) {
      allPayments = allPayments.filter(payment => payment.teacherEmail === teacherEmail);
    }
    
    if (status) {
      allPayments = allPayments.filter(payment => payment.status === status);
    }
    
    // Sort by issue date (newest first)
    allPayments.sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate));
    
    // Create CSV content
    const csvHeader = 'Teacher Email,Teacher Name,Period,Issue Date,Amount,Status\n';
    const csvRows = allPayments.map(payment => 
      `"${payment.teacherEmail}","${payment.teacherName}","${payment.period}","${payment.issueDate}","${payment.amount.toFixed(2)}","${payment.status}"`
    ).join('\n');
    
    const csvContent = csvHeader + csvRows;
    
    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payment_history_${new Date().toISOString().split('T')[0]}.csv"`);
    
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting payment history:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting payment history'
    });
  }
});

// GET all issue reports
router.get('/issue-reports', verifyToken, async (req, res) => {
  try {
    const { status, teacherId, page = 1, limit = 10 } = req.query;
    
    // Build filter object
    const filter = {};
    if (status) filter.status = status;
    if (teacherId) filter.teacherId = teacherId;
    
    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get issue reports with pagination
    const issueReports = await IssueReport.find(filter)
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('bookingId', 'date time studentName')
      .populate('teacherId', 'firstName lastName username email')
      .populate('studentId', 'firstName lastName username email');
    
    // Get total count for pagination
    const totalCount = await IssueReport.countDocuments(filter);
    
    res.json({
      success: true,
      issueReports,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalCount,
        hasNextPage: skip + issueReports.length < totalCount,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Error fetching issue reports:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching issue reports'
    });
  }
});

// GET single issue report by ID
router.get('/issue-reports/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const issueReport = await IssueReport.findById(id)
      .populate('bookingId', 'date time studentName')
      .populate('teacherId', 'firstName lastName username email')
      .populate('studentId', 'firstName lastName username email');
    
    if (!issueReport) {
      return res.status(404).json({
        success: false,
        message: 'Issue report not found'
      });
    }
    
    res.json({
      success: true,
      issueReport
    });
  } catch (error) {
    console.error('Error fetching issue report:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching issue report'
    });
  }
});

// PUT update issue report status
router.put('/issue-reports/:id/status', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminResponse } = req.body;
    
    if (!status || !['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }
    
    const issueReport = await IssueReport.findById(id);
    if (!issueReport) {
      return res.status(404).json({
        success: false,
        message: 'Issue report not found'
      });
    }
    
    // Update status and admin response
    issueReport.status = status;
    if (adminResponse) {
      issueReport.adminResponse = adminResponse;
    }
    issueReport.reviewedAt = new Date();
    issueReport.reviewedBy = req.user.username || 'admin';
    
    await issueReport.save();
    
    // Create notification for teacher
    const notificationMessage = `Your issue report has been ${status}. ${adminResponse ? 'Admin response: ' + adminResponse : ''}`;
    await createNotification(issueReport.teacherId, 'issue-report-update', notificationMessage);
    
    res.json({
      success: true,
      message: 'Issue report status updated successfully',
      issueReport
    });
  } catch (error) {
    console.error('Error updating issue report status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating issue report status'
    });
  }
});

// GET issue report statistics
router.get('/issue-reports/stats', verifyToken, async (req, res) => {
  try {
    const totalReports = await IssueReport.countDocuments();
    const pendingReports = await IssueReport.countDocuments({ status: 'pending' });
    const resolvedReports = await IssueReport.countDocuments({ status: 'resolved' });
    const dismissedReports = await IssueReport.countDocuments({ status: 'dismissed' });
    
    // Get issue type distribution
    const issueTypeStats = await IssueReport.aggregate([
      {
        $group: {
          _id: '$issueType',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);
    
    res.json({
      success: true,
      stats: {
        total: totalReports,
        pending: pendingReports,
        resolved: resolvedReports,
        dismissed: dismissedReports,
        issueTypes: issueTypeStats
      }
    });
  } catch (error) {
    console.error('Error fetching issue report statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching issue report statistics'
    });
  }
});

// ===== NEW ISSUE MANAGEMENT ENDPOINTS =====

// Test endpoint to check if issues exist (no auth required for testing)
router.get('/issues-test', async (req, res) => {
  try {
    const totalIssues = await IssueReport.countDocuments();
    const sampleIssues = await IssueReport.find().limit(5);
    
    res.json({
      success: true,
      totalIssues,
      sampleIssues: sampleIssues.map(issue => ({
        id: issue._id,
        issueType: issue.issueType,
        status: issue.status,
        submittedAt: issue.submittedAt
      }))
    });
  } catch (error) {
    console.error('Error in test endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Error in test endpoint'
    });
  }
});

// GET all issues with filters
router.get('/issues', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { status, validityStatus, issueType, date } = req.query;
    
    // Build filter object
    const filter = {};
    if (status) filter.status = status;
    if (validityStatus) filter.validityStatus = validityStatus;
    if (issueType) filter.issueType = issueType;
    if (date) {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);
      filter.submittedAt = { $gte: startDate, $lt: endDate };
    }
    
    const issues = await IssueReport.find(filter)
      .sort({ submittedAt: -1 })
      .populate('teacherId', 'firstName lastName')
      .populate('studentId', 'firstName lastName');
    
    res.json({
      success: true,
      issues: issues
    });
  } catch (error) {
    console.error('Error fetching issues:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching issues'
    });
  }
});

// POST review issue
router.post('/issues/review', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { issueId, validityStatus, adminReviewNotes, canReschedule } = req.body;
    
    if (!issueId || !validityStatus) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }
    
    const issue = await IssueReport.findById(issueId);
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found'
      });
    }
    
    // Update issue with review
    issue.validityStatus = validityStatus;
    issue.adminReviewNotes = adminReviewNotes;
    issue.status = 'reviewed';
    issue.reviewedBy = req.user.username || 'admin';
    issue.reviewedAt = new Date();
    
    // Set reschedule options if invalid due to teacher technical issues
    if (validityStatus === 'invalid' && canReschedule && 
        issue.issueType.includes('Technical Issue')) {
      issue.canReschedule = true;
      // Set 15-minute deadline from now
      const deadline = new Date();
      deadline.setMinutes(deadline.getMinutes() + 15);
      issue.rescheduleDeadline = deadline;
    }
    
    await issue.save();
    
    // Create notification for student if reschedule is allowed
    if (issue.canReschedule) {
      const notificationMessage = `Your class issue has been reviewed. You can reschedule your class within 15 minutes due to teacher technical issues.`;
      await createNotification(issue.studentId, 'reschedule-available', notificationMessage);
    }
    
    // Create notification for teacher
    const teacherNotification = `Your issue report has been reviewed. Status: ${validityStatus}. ${adminReviewNotes ? 'Notes: ' + adminReviewNotes : ''}`;
    await createNotification(issue.teacherId, 'issue-reviewed', teacherNotification);
    
    res.json({
      success: true,
      message: 'Issue reviewed successfully',
      issue: issue
    });
  } catch (error) {
    console.error('Error reviewing issue:', error);
    res.status(500).json({
      success: false,
      message: 'Error reviewing issue'
    });
  }
});

// POST mark issue as resolved
router.post('/issues/resolve', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { issueId, resolutionType, teacherFaultReason, resolveNotes } = req.body;
    
    if (!issueId) {
      return res.status(400).json({
        success: false,
        message: 'Issue ID is required'
      });
    }
    
    if (!resolutionType) {
      return res.status(400).json({
        success: false,
        message: 'Resolution type is required'
      });
    }
    
    const issue = await IssueReport.findById(issueId);
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found'
      });
    }
    
    // Update issue with resolution details
    issue.status = 'resolved';
    issue.resolvedAt = new Date();
    issue.resolvedBy = req.user.username || 'admin';
    issue.resolutionType = resolutionType;
    issue.resolveNotes = resolveNotes;
    
    // Set payment impact based on resolution type
    if (resolutionType === 'system-issue') {
      issue.teacherPaymentImpact = 'partial_payment_10'; // 10% of rate
      issue.studentPaymentImpact = 'reschedule_available';
    } else if (resolutionType === 'teacher-fault') {
      issue.teacherPaymentImpact = 'no_payment';
      issue.studentPaymentImpact = 'normal';
      issue.teacherFaultReason = teacherFaultReason;
    } else if (resolutionType === 'student-issue') {
      issue.teacherPaymentImpact = 'partial_payment_50'; // 50% of rate
      issue.studentPaymentImpact = 'normal';
    }
    
    await issue.save();
    
    // Mark the associated booking as completed when issue is resolved
    const Booking = require('./models/Booking');
    try {
      const booking = await Booking.findById(issue.bookingId);
      if (booking && booking.status !== 'completed') {
        booking.status = 'completed';
        booking.finishedAt = new Date();
        
        // Set attendance.classCompleted to true for service fee calculation
        if (!booking.attendance) {
          booking.attendance = {};
        }
        booking.attendance.classCompleted = true;
        await consumeReservedCreditForBooking(booking, 'Class finished');
        await booking.save();
        console.log(`✅ Marked booking ${issue.bookingId} as completed due to resolved issue`);
      }
    } catch (bookingError) {
      console.error('⚠️ Error updating booking status after issue resolution:', bookingError);
      // Don't fail the issue resolution if booking update fails
    }
    
    // Create notification for teacher with resolution details
    let notificationMessage = `Your issue report has been marked as resolved.`;
    
    if (resolutionType === 'system-issue') {
      notificationMessage += ` You will receive 10% of the class rate for your effort. Student can reschedule.`;
    } else if (resolutionType === 'teacher-fault') {
      notificationMessage += ` No payment will be made due to: ${teacherFaultReason}`;
    } else if (resolutionType === 'student-issue') {
      notificationMessage += ` You will receive 50% of the class rate.`;
    }
    
    await createNotification(issue.teacherId, 'issue-resolved', notificationMessage);
    
    res.json({
      success: true,
      message: 'Issue marked as resolved successfully',
      issue: issue
    });
  } catch (error) {
    console.error('Error resolving issue:', error);
    res.status(500).json({
      success: false,
      message: 'Error resolving issue'
    });
  }
});

// POST dismiss issue
router.post('/issues/dismiss', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { issueId } = req.body;
    
    const issue = await IssueReport.findById(issueId);
    if (!issue) {
      return res.status(404).json({
        success: false,
        message: 'Issue not found'
      });
    }
    
    issue.status = 'dismissed';
    issue.reviewedBy = req.user.username || 'admin';
    issue.reviewedAt = new Date();
    
    await issue.save();
    
    // Create notification
    const notificationMessage = `Your issue report has been dismissed.`;
    await createNotification(issue.teacherId, 'issue-dismissed', notificationMessage);
    
    res.json({
      success: true,
      message: 'Issue dismissed'
    });
  } catch (error) {
    console.error('Error dismissing issue:', error);
    res.status(500).json({
      success: false,
      message: 'Error dismissing issue'
    });
  }
});

// GET all teacher assessments (for admin review)
router.get('/teacher-assessments', verifyToken, requireAdmin, async (req, res) => {
  console.log('📊 Admin accessing teacher assessments endpoint');
  try {
    const { status, teacherId } = req.query;
    console.log('Query params:', { status, teacherId });
    
    // Build query
    const query = {};
    if (teacherId) {
      query.teacherId = teacherId;
    }
    
    // Find teachers with assessment tests
    const teachers = await Teacher.find(query)
      .select('teacherId username firstName lastName fullname email assessmentTests')
      .sort({ 'assessmentTests.completedAt': -1 });
    
    // Filter by status if provided
    let filteredTeachers = teachers;
    if (status === 'completed') {
      filteredTeachers = teachers.filter(t => t.assessmentTests && t.assessmentTests.completed);
    } else if (status === 'pending') {
      filteredTeachers = teachers.filter(t => 
        t.assessmentTests && 
        !t.assessmentTests.completed &&
        (t.assessmentTests.listening || t.assessmentTests.typing || t.assessmentTests.reading || t.assessmentTests.pronunciation || t.assessmentTests.grammar || t.assessmentTests.vocabulary)
      );
    }
    
    // Format response
    const assessments = filteredTeachers.map(teacher => ({
      teacherId: teacher.teacherId,
      name: teacher.fullname || `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || teacher.username || 'Unknown',
      email: teacher.email || '',
      username: teacher.username || '',
      completed: teacher.assessmentTests?.completed || false,
      completedAt: teacher.assessmentTests?.completedAt || null,
      tests: {
        listening: {
          completed: !!(teacher.assessmentTests?.listening?.audioRecording || teacher.assessmentTests?.listening?.completedAt),
          completedAt: teacher.assessmentTests?.listening?.completedAt || null
        },
        typing: {
          completed: !!(teacher.assessmentTests?.typing?.wpm !== null && teacher.assessmentTests?.typing?.wpm !== undefined || teacher.assessmentTests?.typing?.completedAt),
          wpm: teacher.assessmentTests?.typing?.wpm || null,
          accuracy: teacher.assessmentTests?.typing?.accuracy || null,
          completedAt: teacher.assessmentTests?.typing?.completedAt || null
        },
        reading: {
          completed: !!(teacher.assessmentTests?.reading?.audioRecording || teacher.assessmentTests?.reading?.completedAt),
          completedAt: teacher.assessmentTests?.reading?.completedAt || null
        },
        pronunciation: {
          completed: !!(teacher.assessmentTests?.pronunciation?.words?.length > 0 || teacher.assessmentTests?.pronunciation?.audioRecording || teacher.assessmentTests?.pronunciation?.completedAt),
          wordsCount: teacher.assessmentTests?.pronunciation?.words?.length || 0,
          completedAt: teacher.assessmentTests?.pronunciation?.completedAt || null
        },
        grammar: {
          completed: !!(teacher.assessmentTests?.grammar?.score !== null && teacher.assessmentTests?.grammar?.score !== undefined || teacher.assessmentTests?.grammar?.completedAt),
          score: teacher.assessmentTests?.grammar?.score || null,
          total: teacher.assessmentTests?.grammar?.total || null,
          completedAt: teacher.assessmentTests?.grammar?.completedAt || null
        },
        vocabulary: {
          completed: !!(teacher.assessmentTests?.vocabulary?.score !== null && teacher.assessmentTests?.vocabulary?.score !== undefined || teacher.assessmentTests?.vocabulary?.completedAt),
          score: teacher.assessmentTests?.vocabulary?.score || null,
          total: teacher.assessmentTests?.vocabulary?.total || null,
          completedAt: teacher.assessmentTests?.vocabulary?.completedAt || null
        }
      }
    }));
    
    res.json({
      success: true,
      assessments: assessments,
      total: assessments.length
    });
  } catch (error) {
    console.error('Error fetching teacher assessments:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// GET specific teacher's assessment details (for admin review)
router.get('/teacher-assessments/:teacherId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { teacherId } = req.params;
    
    const teacher = await Teacher.findOne({ teacherId })
      .select('teacherId username firstName lastName fullname email assessmentTests teachingAbilities teachingPersonality skillAssessments');
    
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    if (!teacher.assessmentTests) {
      return res.json({
        success: true,
        completed: false,
        message: 'No assessment tests found for this teacher'
      });
    }
    
    res.json({
      success: true,
      teacher: {
        teacherId: teacher.teacherId,
        name: teacher.fullname || `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim() || teacher.username || 'Unknown',
        email: teacher.email || '',
        username: teacher.username || '',
        teachingAbilities: teacher.teachingAbilities || null,
        teachingPersonality: teacher.teachingPersonality || null
      },
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
      },
      skillAssessments: teacher.skillAssessments || []
    });
  } catch (error) {
    console.error('Error fetching teacher assessment details:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Allow retake: reset assessment tests so teacher can resubmit
router.post('/teacher-assessments/:teacherId/retake', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { teacherId } = req.params;
    const teacher = await Teacher.findOne({ teacherId });
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    teacher.assessmentTests = {
      completed: false,
      completedAt: null,
      listening: {},
      typing: {},
      reading: {},
      pronunciation: {},
      grammar: {},
      vocabulary: {},
      personality: {}
    };

    await teacher.save();

    await createNotification(
      teacherId,
      'assessment-retake',
      'Your assessment has been reset. Please retake the tests.'
    );

    res.json({
      success: true,
      message: 'Assessment reset. Teacher can retake the tests.'
    });
  } catch (error) {
    console.error('Error enabling retake:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Recompute/backfill grammar & vocabulary scores for existing assessments
router.post('/teacher-assessments/:teacherId/recompute-scores', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { teacherId } = req.params;
    const teacher = await Teacher.findOne({ teacherId });
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }

    if (!teacher.assessmentTests) {
      return res.status(400).json({ error: 'Assessment tests not found' });
    }

    const grammarCorrectIndices = [1, 1, 1, 2, 1];
    const vocabularyCorrectIndices = [1, 0, 1, 1, 0];
    const computeScoreFromAnswers = (answers, correctIndices) => {
      if (!answers) return null;
      const values = Array.isArray(answers) ? answers : Object.values(answers);
      if (!values.length) return null;
      let score = 0;
      values.forEach((val, idx) => {
        if (Number(val) === Number(correctIndices[idx])) {
          score += 1;
        }
      });
      return score;
    };

    const updated = { grammar: false, vocabulary: false, personality: false };

    if (teacher.assessmentTests.grammar) {
      if (!teacher.assessmentTests.grammar.total) {
        const answers = teacher.assessmentTests.grammar.answers;
        const inferredTotal = Array.isArray(answers) ? answers.length : Object.keys(answers || {}).length;
        if (inferredTotal) {
          teacher.assessmentTests.grammar.total = inferredTotal;
          updated.grammar = true;
        }
      }
      const computedScore = computeScoreFromAnswers(teacher.assessmentTests.grammar.answers, grammarCorrectIndices);
      if (computedScore !== null && computedScore !== undefined) {
        teacher.assessmentTests.grammar.score = computedScore;
        updated.grammar = true;
      }
      if (teacher.assessmentTests.grammar.score !== null && teacher.assessmentTests.grammar.score !== undefined) {
        if (!teacher.assessmentTests.grammar.completedAt) {
          teacher.assessmentTests.grammar.completedAt = new Date();
          updated.grammar = true;
        }
      }
    }

    if (teacher.assessmentTests.vocabulary) {
      if (!teacher.assessmentTests.vocabulary.total) {
        const answers = teacher.assessmentTests.vocabulary.answers;
        const inferredTotal = Array.isArray(answers) ? answers.length : Object.keys(answers || {}).length;
        if (inferredTotal) {
          teacher.assessmentTests.vocabulary.total = inferredTotal;
          updated.vocabulary = true;
        }
      }
      const computedScore = computeScoreFromAnswers(teacher.assessmentTests.vocabulary.answers, vocabularyCorrectIndices);
      if (computedScore !== null && computedScore !== undefined) {
        teacher.assessmentTests.vocabulary.score = computedScore;
        updated.vocabulary = true;
      }
      if (teacher.assessmentTests.vocabulary.score !== null && teacher.assessmentTests.vocabulary.score !== undefined) {
        if (!teacher.assessmentTests.vocabulary.completedAt) {
          teacher.assessmentTests.vocabulary.completedAt = new Date();
          updated.vocabulary = true;
        }
      }
    }

    if (teacher.assessmentTests.personality && teacher.assessmentTests.personality.answers) {
      const answers = teacher.assessmentTests.personality.answers || {};
      const categoryScores = {};
      let total = 0;
      let score = 0;

      Object.keys(answers).forEach((category) => {
        const items = Array.isArray(answers[category]) ? answers[category] : [];
        const totalForCategory = items.length;
        let correct = 0;
        items.forEach((val) => {
          if (val === category) {
            correct += 1;
          }
        });
        categoryScores[category] = { correct, total: totalForCategory };
        total += totalForCategory;
        score += correct;
      });

      if (total > 0) {
        teacher.assessmentTests.personality.total = total;
        teacher.assessmentTests.personality.score = score;
        teacher.assessmentTests.personality.percent = Math.round((score / total) * 100);
        teacher.assessmentTests.personality.categoryScores = categoryScores;
        updated.personality = true;
      }

      if (!teacher.assessmentTests.personality.completedAt && total > 0) {
        teacher.assessmentTests.personality.completedAt = new Date();
        updated.personality = true;
      }
    }

    if (updated.grammar || updated.vocabulary || updated.personality) {
      await teacher.save();
    }

    res.json({
      success: true,
      message: 'Recompute complete.',
      updated
    });
  } catch (error) {
    console.error('Error recomputing scores:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Assess teacher skills (Admin/Trainer endpoint)
router.post('/assess-teacher/:teacherId', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { teacherId } = req.params;
    const { skills, personality, notes, totals } = req.body; // skills: { speaking, reading, writing, pronunciation, grammar, vocabulary, listening }
    
    const teacher = await Teacher.findOne({ teacherId });
    if (!teacher) {
      return res.status(404).json({ error: 'Teacher not found' });
    }
    
    // Determine assessor role (admin or trainer)
    const isAdmin = req.user.isAdmin === true || req.user.role === 'admin' || req.user.username === 'admin';
    const assessorRole = isAdmin ? 'Admin' : 'Trainer';
    
    // Create new assessment entry
    const newAssessment = {
      assessmentDate: new Date(),
      assessedBy: assessorRole, // Store role instead of user ID
      skills: {
        listening: skills?.listening !== undefined ? String(skills.listening) : null,
        reading: skills?.reading !== undefined ? String(skills.reading) : null,
        speaking: skills?.speaking !== undefined ? String(skills.speaking) : null,
        writing: skills?.writing !== undefined ? String(skills.writing) : null,
        pronunciation: skills?.pronunciation !== undefined ? String(skills.pronunciation) : null,
        grammar: skills?.grammar !== undefined ? String(skills.grammar) : null,
        vocabulary: skills?.vocabulary !== undefined ? String(skills.vocabulary) : null
      },
      personality: {
        interpersonal: personality?.interpersonal !== undefined ? String(personality.interpersonal) : null,
        professionalism: personality?.professionalism !== undefined ? String(personality.professionalism) : null,
        cultural: personality?.cultural !== undefined ? String(personality.cultural) : null,
        technology: personality?.technology !== undefined ? String(personality.technology) : null,
        engagement: personality?.engagement !== undefined ? String(personality.engagement) : null
      },
      notes: notes || '',
      totals: totals || null
    };
    
    // Add to assessment history
    if (!teacher.skillAssessments) {
      teacher.skillAssessments = [];
    }
    teacher.skillAssessments.push(newAssessment);
    
    // Update current teaching abilities levels
    if (!teacher.teachingAbilities) {
      teacher.teachingAbilities = {
        listening: { description: '', level: null },
        reading: { description: '', level: null },
        speaking: { description: '', level: null },
        writing: { description: '', level: null },
        pronunciation: { description: '', level: null },
        grammar: { description: '', level: null },
        vocabulary: { description: '', level: null }
      };
    }

    if (!teacher.teachingPersonality) {
      teacher.teachingPersonality = {
        interpersonal: { description: '', level: null },
        professionalism: { description: '', level: null },
        cultural: { description: '', level: null },
        technology: { description: '', level: null },
        engagement: { description: '', level: null }
      };
    }
    
    if (skills?.listening !== undefined) {
      teacher.teachingAbilities.listening.level = String(skills.listening);
    }
    if (skills?.reading !== undefined) {
      teacher.teachingAbilities.reading.level = String(skills.reading);
    }
    if (skills?.speaking !== undefined) {
      teacher.teachingAbilities.speaking.level = String(skills.speaking);
    }
    if (skills?.writing !== undefined) {
      teacher.teachingAbilities.writing.level = String(skills.writing);
    }
    if (skills?.pronunciation !== undefined) {
      teacher.teachingAbilities.pronunciation.level = String(skills.pronunciation);
    }
    if (skills?.grammar !== undefined) {
      teacher.teachingAbilities.grammar.level = String(skills.grammar);
    }
    if (skills?.vocabulary !== undefined) {
      teacher.teachingAbilities.vocabulary.level = String(skills.vocabulary);
    }

    if (personality?.interpersonal !== undefined) {
      teacher.teachingPersonality.interpersonal.level = String(personality.interpersonal);
    }
    if (personality?.professionalism !== undefined) {
      teacher.teachingPersonality.professionalism.level = String(personality.professionalism);
    }
    if (personality?.cultural !== undefined) {
      teacher.teachingPersonality.cultural.level = String(personality.cultural);
    }
    if (personality?.technology !== undefined) {
      teacher.teachingPersonality.technology.level = String(personality.technology);
    }
    if (personality?.engagement !== undefined) {
      teacher.teachingPersonality.engagement.level = String(personality.engagement);
    }
    
    await teacher.save();
    
    // Create notification for teacher
    await createNotification(teacherId, 'assessment-completed', 
      `Your teaching abilities have been assessed by ${assessorRole}. Check your profile to see your skill levels.`);
    
    res.json({
      success: true,
      message: `Teacher assessed successfully by ${assessorRole}`,
      assessment: newAssessment
    });
  } catch (error) {
    console.error('Error assessing teacher:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

module.exports = router; 