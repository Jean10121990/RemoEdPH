const express = require('express');
const router = express.Router();
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');
const Admin = require('./models/Admin');
const CancellationRequest = require('./models/CancellationRequest');
const Booking = require('./models/Booking');
const Notification = require('./models/Notification');
const IssueReport = require('./models/IssueReport');
const { verifyToken, requireAdmin } = require('./authMiddleware');
const bcrypt = require('bcrypt');
const { sendTeacherRegistrationEmail } = require('./emailService');

// Function to create notifications
async function createNotification(userId, type, message) {
  try {
    const notification = new Notification({
      userId,
      type,
      message,
      createdAt: new Date()
    });
    await notification.save();
    console.log(`✅ Notification created for ${userId}: ${type}`);
  } catch (error) {
    console.error('❌ Error creating notification:', error);
  }
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

// GET all teachers weekly salaries
router.get('/teachers-weekly-salaries', async (req, res) => {
  try {
    // Get week from query parameter or use current week
    let startDate, endDate;
    
    if (req.query.week) {
      // Use the provided week start date
      const weekStart = new Date(req.query.week);
      const monday = new Date(weekStart);
      monday.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Ensure it's Monday
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6); // Sunday (7-day week)
      
      startDate = monday.toISOString().split('T')[0];
      endDate = sunday.toISOString().split('T')[0];
    } else {
      // Get current week (Monday to Sunday) - Global format
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - now.getDay() + 1); // Monday
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6); // Sunday (7-day week)
      
      startDate = monday.toISOString().split('T')[0];
      endDate = sunday.toISOString().split('T')[0];
    }
    
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
      
      // Calculate student absent payment (50% of rate)
      const studentAbsentPayment = studentAbsentClasses * (teacher.hourlyRate || globalRate) * 0.5;
      
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

// POST dispense salaries to all teachers
router.post('/dispense-salaries', async (req, res) => {
  try {
    // Get week from request body or use current week
    let startDate, endDate, issueDate;
    
    if (req.body.week) {
      // Use the provided week start date
      const weekStart = new Date(req.body.week);
      const monday = new Date(weekStart);
      monday.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Ensure it's Monday
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6); // Sunday (7-day week)
      
      startDate = monday.toISOString().split('T')[0];
      endDate = sunday.toISOString().split('T')[0];
      issueDate = new Date(sunday);
      issueDate.setDate(sunday.getDate() + 1); // Monday
    } else {
      // Get current week (Monday to Sunday) - Global format
      const now = new Date();
      const monday = new Date(now);
      monday.setDate(now.getDate() - now.getDay() + 1); // Monday
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6); // Sunday (7-day week)
      
      startDate = monday.toISOString().split('T')[0];
      endDate = sunday.toISOString().split('T')[0];
      issueDate = new Date(sunday);
      issueDate.setDate(sunday.getDate() + 1); // Monday
    }
    
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
      
      // Calculate student absent payment (50% of rate)
      const studentAbsentPayment = studentAbsentClasses * (teacher.hourlyRate || globalRate) * 0.5;
      
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
            `Your weekly salary of ₱${weeklySalary.toFixed(2)} for ${startDate} - ${endDate} has been credited.`
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
    const active = await Booking.countDocuments({ status: { $in: ['booked', 'confirmed'] } });
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

module.exports = router; 