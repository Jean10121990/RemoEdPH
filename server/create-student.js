const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Student = require('./models/Student');

async function createTestStudent() {
  try {
    await mongoose.connect('mongodb://localhost:27017/online-distance-learning');
    console.log('Connected to MongoDB');

    // Check if student already exists
    const existingStudent = await Student.findOne({ username: 'teststudent@remoedph.com' });
    
    if (existingStudent) {
      console.log('✅ Test student already exists!');
      console.log('📧 Username: teststudent@remoedph.com');
      console.log('🔑 Password: student123');
      console.log('🆔 Student ID:', existingStudent._id);
    } else {
      // Create test student
      const hashedPassword = await bcrypt.hash('student123', 10);
      const student = new Student({
        username: 'teststudent@remoedph.com',
        email: 'teststudent@remoedph.com',
        password: hashedPassword,
        firstName: 'Test',
        lastName: 'Student',
        level: 'Beginner'
      });
      
      await student.save();
      console.log('✅ Test student created successfully!');
      console.log('📧 Username: teststudent@remoedph.com');
      console.log('🔑 Password: student123');
      console.log('🆔 Student ID:', student._id);
    }

    console.log('\n🔧 Next steps:');
    console.log('1. Go to http://localhost:5000/student-login.html');
    console.log('2. Login with: teststudent@remoedph.com / student123');
    console.log('3. Go to Book a Class page');
    console.log('4. Try booking a class with your teacher slots!');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createTestStudent(); 