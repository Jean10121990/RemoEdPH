const mongoose = require('mongoose');
const Booking = require('./models/Booking');
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');

class AttendanceChecker {
  constructor() {
    this.checkInterval = null;
    this.ABSENT_THRESHOLD_MINUTES = 15; // Mark as absent after 15 minutes
    this.CHECK_INTERVAL_MS = 60000; // Check every minute
  }

  start() {
    console.log('🕐 Starting attendance checker...');
    this.checkInterval = setInterval(() => {
      this.checkForAbsentBookings();
    }, this.CHECK_INTERVAL_MS);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('🛑 Attendance checker stopped');
    }
  }

  async checkForAbsentBookings() {
    try {
      const now = new Date();
      const currentDate = now.toISOString().split('T')[0];
      const currentTime = now.toTimeString().slice(0, 5); // HH:MM format

      console.log(`🔍 Checking for absent bookings at ${currentDate} ${currentTime}`);

      // Find all pending/confirmed bookings for today that haven't been checked for absence
      const todayBookings = await Booking.find({
        date: currentDate,
        status: { $in: ['pending', 'confirmed'] },
        'attendance.absentChecked': false
      });

      console.log(`📊 Found ${todayBookings.length} bookings to check`);

      for (const booking of todayBookings) {
        await this.checkBookingAttendance(booking, now);
      }
    } catch (error) {
      console.error('❌ Error checking for absent bookings:', error);
    }
  }

  async checkBookingAttendance(booking, now) {
    try {
      const bookingDateTime = new Date(`${booking.date}T${booking.time}:00`);
      const timeDiffMinutes = (now - bookingDateTime) / (1000 * 60);

      // Only check bookings that are past their scheduled time by more than 15 minutes
      if (timeDiffMinutes >= this.ABSENT_THRESHOLD_MINUTES) {
        console.log(`⏰ Booking ${booking._id} is ${timeDiffMinutes.toFixed(1)} minutes past scheduled time`);

        // Check attendance patterns to determine who was absent
        const teacherEntered = booking.attendance.teacherEntered || false;
        const studentEntered = booking.attendance.studentEntered || false;
        
        if (!teacherEntered && !studentEntered) {
          // Neither teacher nor student entered - mark as teacher absent
          console.log(`❌ Marking booking ${booking._id} as teacher absent - neither teacher nor student entered classroom`);
          
          booking.status = 'absent';
          booking.attendance.absentChecked = true;
          await booking.save();

          // Create notification for teacher about teacher absence
          await this.createAbsentNotification(booking, 'teacher');
          
          console.log(`✅ Booking ${booking._id} marked as teacher absent`);
        } else if (teacherEntered && !studentEntered) {
          // Teacher entered but student didn't - mark as student absent
          console.log(`⚠️ Marking booking ${booking._id} as student absent - teacher entered but student didn't`);
          
          booking.status = 'absent';
          booking.attendance.absentChecked = true;
          await booking.save();

          // Create notification for teacher about student absence
          await this.createAbsentNotification(booking, 'student');
          
          console.log(`✅ Booking ${booking._id} marked as student absent`);
        } else if (!teacherEntered && studentEntered) {
          // Student entered but teacher didn't - mark as teacher absent
          console.log(`❌ Marking booking ${booking._id} as teacher absent - student entered but teacher didn't`);
          
          booking.status = 'absent';
          booking.attendance.absentChecked = true;
          await booking.save();

          // Create notification for teacher about teacher absence
          await this.createAbsentNotification(booking, 'teacher');
          
          console.log(`✅ Booking ${booking._id} marked as teacher absent`);
        } else {
          // Both entered, mark as checked to avoid future checks
          booking.attendance.absentChecked = true;
          await booking.save();
          console.log(`✅ Booking ${booking._id} has full attendance, marked as checked`);
        }
      }
    } catch (error) {
      console.error(`❌ Error checking attendance for booking ${booking._id}:`, error);
    }
  }

  async createAbsentNotification(booking, absentType) {
    try {
      const Notification = require('./models/Notification');
      
      let message = '';
      if (absentType === 'student') {
        message = `Student was absent for class on ${booking.date} at ${booking.time}. Class marked as absent.`;
      } else if (absentType === 'teacher') {
        message = `Teacher was absent for class on ${booking.date} at ${booking.time}. Class marked as absent.`;
      }

      await Notification.create({
        teacherId: booking.teacherId,
        type: 'absent',
        message: message,
        read: false
      });

      console.log(`📢 Created absent notification for booking ${booking._id}`);
    } catch (error) {
      console.error('❌ Error creating absent notification:', error);
    }
  }

  // Method to manually mark a booking as absent (for testing or manual override)
  async markBookingAsAbsent(bookingId, absentType = 'student') {
    try {
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        throw new Error('Booking not found');
      }

      booking.status = 'absent';
      booking.attendance.absentChecked = true;
      await booking.save();

      await this.createAbsentNotification(booking, absentType);
      
      console.log(`✅ Manually marked booking ${bookingId} as absent`);
      return true;
    } catch (error) {
      console.error('❌ Error manually marking booking as absent:', error);
      return false;
    }
  }
}

module.exports = AttendanceChecker; 