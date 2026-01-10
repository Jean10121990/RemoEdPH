const mongoose = require('mongoose');
const Teacher = require('./server/models/Teacher');
const Student = require('./server/models/Student');

// Connect to MongoDB - FIXED DATABASE NAME
mongoose.connect('mongodb://localhost:27017/online-distance-learning', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function checkUsers() {
  try {
    console.log('🔍 Checking all users in database...');
    
    const teachers = await Teacher.find({});
    const students = await Student.find({});
    
    console.log(`📊 Found ${teachers.length} teachers:`);
    teachers.forEach(teacher => {
      console.log(`  - Username: ${teacher.username}`);
      console.log(`    Email: ${teacher.email}`);
      console.log(`    Name: ${teacher.firstName} ${teacher.lastName}`);
      console.log(`    ID: ${teacher._id}`);
      console.log('---');
    });
    
    console.log(`📊 Found ${students.length} students:`);
    students.forEach(student => {
      console.log(`  - Username: ${student.username}`);
      console.log(`    Email: ${student.email}`);
      console.log(`    Name: ${student.firstName} ${student.lastName}`);
      console.log(`    ID: ${student._id}`);
      console.log('---');
    });
    
    if (teachers.length === 0 && students.length === 0) {
      console.log('❌ No users found in database. You need to register/login first!');
    }
    
  } catch (error) {
    console.error('❌ Error checking users:', error);
  } finally {
    mongoose.connection.close();
  }
}

checkUsers();
