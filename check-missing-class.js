const mongoose = require('mongoose');
const Booking = require('./server/models/Booking');
const Teacher = require('./server/models/Teacher');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/online-distance-learning', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function checkMissingClasses() {
  try {
    console.log('Connecting to database...');
    await mongoose.connection.asPromise();
    console.log('Connected to database');

    // Find the teacher by email
    const teacher = await Teacher.findOne({ username: 'kjbflores@remoedph.com' });
    if (!teacher) {
      console.log('Teacher not found');
      return;
    }

    console.log('Teacher found:', teacher._id);

    // Check for the specific classes that should exist based on the screenshot
    const expectedClasses = [
      { date: '2025-08-05', time: '09:00', status: 'finished' }, // Tuesday 9:00 AM - F
      { date: '2025-08-09', time: '09:00', status: 'finished' }, // Saturday 9:00 AM - F (MISSING!)
      { date: '2025-08-03', time: '17:00', status: 'absent' },   // Sunday 5:00 PM - A
      { date: '2025-08-05', time: '11:00', status: 'absent' },   // Tuesday 11:00 AM - A
      { date: '2025-08-05', time: '13:00', status: 'absent' },   // Tuesday 1:00 PM - A
      { date: '2025-08-05', time: '13:30', status: 'absent' },   // Tuesday 1:30 PM - A
      { date: '2025-08-05', time: '14:00', status: 'absent' }    // Tuesday 2:00 PM - A
    ];

    console.log('\n=== Checking expected classes ===');
    for (const expected of expectedClasses) {
      const booking = await Booking.findOne({
        teacherId: teacher._id,
        date: expected.date,
        time: expected.time
      });

      if (booking) {
        console.log(`✓ ${expected.date} ${expected.time}: Found with status '${booking.status}' (expected '${expected.status}')`);
        if (booking.status !== expected.status) {
          console.log(`  → Status mismatch! Updating from '${booking.status}' to '${expected.status}'`);
          booking.status = expected.status;
          await booking.save();
        }
      } else {
        console.log(`✗ ${expected.date} ${expected.time}: MISSING - Need to create with status '${expected.status}'`);
        
        // Create the missing booking
        const newBooking = new Booking({
          teacherId: teacher._id,
          studentId: '507f1f77bcf86cd799439011', // Default student ID
          date: expected.date,
          time: expected.time,
          status: expected.status,
          lesson: 'General Lesson',
          studentLevel: 'Primary',
          classroomId: `room_${expected.date}_${expected.time.replace(':', '')}`
        });
        
        await newBooking.save();
        console.log(`  → Created missing booking with status '${expected.status}'`);
      }
    }

    // Show final summary
    const allClasses = await Booking.find({
      teacherId: teacher._id,
      date: { $gte: '2025-08-03', $lte: '2025-08-09' }
    }).select('date time status');

    console.log('\n=== Final database state ===');
    allClasses.forEach(cls => {
      console.log(`${cls.date} ${cls.time}: status = ${cls.status}`);
    });

    const finishedCount = allClasses.filter(cls => cls.status === 'finished').length;
    const absentCount = allClasses.filter(cls => cls.status === 'absent').length;
    
    console.log(`\nSummary: ${finishedCount} finished, ${absentCount} absent classes`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

checkMissingClasses(); 