const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Student = require('./models/Student');

async function addTestStudent() {
  try {
    await mongoose.connect('mongodb://localhost:27017/online-distance-learning');
    console.log('Connected to MongoDB');
    
    // Check if student already exists
    const existingStudent = await Student.findOne({ username: 'teststudent@remoedph.com' });
    if (existingStudent) {
      console.log('Student teststudent@remoedph.com already exists');
      await mongoose.disconnect();
      return;
    }
    
    // Create the test student
    const hashedPassword = await bcrypt.hash('student123', 10);
    const testStudent = new Student({
      username: 'teststudent@remoedph.com',
      email: 'teststudent@remoedph.com',
      password: hashedPassword,
      firstName: 'Test',
      lastName: 'Student',
      level: 'Primary',
      age: 10
    });
    
    await testStudent.save();
    console.log('✅ Created test student: teststudent@remoedph.com / student123');
    
    // Verify the student was created
    const allStudents = await Student.find({});
    console.log('\n📋 All students in database:');
    allStudents.forEach(student => {
      console.log(`- ${student.username} (${student.firstName} ${student.lastName})`);
    });
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

addTestStudent(); 