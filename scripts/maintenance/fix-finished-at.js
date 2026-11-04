const mongoose = require('mongoose');
const Booking = require('./server/models/Booking');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/online-distance-learning', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function fixFinishedAtTimestamps() {
  try {
    console.log('🔧 Starting to fix finishedAt timestamps...');
    
    // Find all completed bookings without finishedAt timestamp
    const bookingsToFix = await Booking.find({
      status: 'completed',
      finishedAt: { $exists: false }
    });
    
    console.log(`📊 Found ${bookingsToFix.length} completed bookings without finishedAt timestamp`);
    
    if (bookingsToFix.length === 0) {
      console.log('✅ No bookings need to be fixed!');
      return;
    }
    
    // Update each booking with a finishedAt timestamp and attendance.classCompleted flag
    // We'll set finishedAt to 25 minutes after the class start time
    for (const booking of bookingsToFix) {
      if (booking.date && booking.time) {
        const classDate = new Date(booking.date);
        const [hours, minutes] = booking.time.split(':').map(Number);
        
        // Set class start time
        const classStartTime = new Date(classDate);
        classStartTime.setHours(hours, minutes, 0, 0);
        
        // Set finishedAt to 25 minutes after start (assuming full duration)
        const finishedAt = new Date(classStartTime);
        finishedAt.setMinutes(finishedAt.getMinutes() + 25);
        
        booking.finishedAt = finishedAt;
        booking.attendance = booking.attendance || {};
        booking.attendance.classCompleted = true;
        await booking.save();
        
        console.log(`✅ Fixed booking ${booking._id}: ${booking.date} ${booking.time} -> finishedAt: ${finishedAt.toISOString()}`);
      } else {
        console.log(`⚠️ Skipping booking ${booking._id}: missing date or time`);
      }
    }
    
    console.log('🎉 Finished fixing finishedAt timestamps and classCompleted flags!');
    
  } catch (error) {
    console.error('❌ Error fixing finishedAt timestamps:', error);
  } finally {
    mongoose.connection.close();
  }
}

// Run the fix
fixFinishedAtTimestamps();


