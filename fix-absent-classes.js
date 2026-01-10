const mongoose = require('mongoose');
const Booking = require('./server/models/Booking');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/online-distance-learning', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function fixAbsentClasses() {
  try {
    console.log('Connecting to database...');
    await mongoose.connection.asPromise();
    console.log('Connected to database');

    // Find all bookings for the teacher in the date range that should be absent
    // Based on the screenshots, these are the classes that show "A- Juan"
    const absentClasses = [
      { date: '2025-08-05', time: '11:00' },
      { date: '2025-08-05', time: '13:00' },
      { date: '2025-08-05', time: '13:30' },
      { date: '2025-08-05', time: '14:00' }
    ];

    console.log('Looking for classes to mark as absent...');
    
    for (const classInfo of absentClasses) {
      // Find the booking by date and time
      const booking = await Booking.findOne({
        date: classInfo.date,
        time: classInfo.time,
        status: 'finished' // Only update if currently marked as finished
      });

      if (booking) {
        console.log(`Found booking for ${classInfo.date} ${classInfo.time}, updating status from 'finished' to 'absent'`);
        booking.status = 'absent';
        await booking.save();
        console.log(`Updated booking ${booking._id} status to 'absent'`);
      } else {
        console.log(`No booking found for ${classInfo.date} ${classInfo.time}`);
      }
    }

    // Also check for any other classes that might be incorrectly marked
    const allClasses = await Booking.find({
      date: { $gte: '2025-08-04', $lte: '2025-08-08' }
    }).select('date time status studentId teacherId');

    console.log('\n=== Current database state ===');
    allClasses.forEach(cls => {
      console.log(`${cls.date} ${cls.time}: status = ${cls.status}`);
    });

    console.log('\nScript completed successfully!');
  } catch (error) {
    console.error('Error fixing absent classes:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

fixAbsentClasses(); 