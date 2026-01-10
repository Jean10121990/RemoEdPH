const mongoose = require('mongoose');
const Booking = require('./server/models/Booking');
const Teacher = require('./server/models/Teacher');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/online-distance-learning', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function testTeacherId() {
  try {
    console.log('Connecting to database...');
    await mongoose.connection.asPromise();
    console.log('Connected to database');

    // Find the teacher by email
    const teacher = await Teacher.findOne({ username: 'kjbflores@remoedph.com' });
    if (teacher) {
      console.log('Teacher found:', teacher._id);
      console.log('Teacher email:', teacher.username);
    } else {
      console.log('Teacher not found by email');
    }

    // Find all classes in the date range
    const allClasses = await Booking.find({
      date: { $gte: '2025-08-04', $lte: '2025-08-08' }
    }).select('date time status teacherId');

    console.log('\n=== All classes in date range ===');
    allClasses.forEach(cls => {
      console.log(`${cls.date} ${cls.time}: status = ${cls.status}, teacherId: ${cls.teacherId}`);
    });

    // Check if any classes match the teacher ID
    if (teacher) {
      const teacherClasses = allClasses.filter(cls => cls.teacherId.toString() === teacher._id.toString());
      console.log(`\nClasses for teacher ${teacher._id}:`);
      teacherClasses.forEach(cls => {
        console.log(`${cls.date} ${cls.time}: status = ${cls.status}`);
      });

      const finishedCount = teacherClasses.filter(cls => cls.status === 'finished').length;
      const absentCount = teacherClasses.filter(cls => cls.status === 'absent').length;
      
      console.log(`\nSummary for teacher ${teacher._id}:`);
      console.log(`Finished classes: ${finishedCount}`);
      console.log(`Absent classes: ${absentCount}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

testTeacherId(); 