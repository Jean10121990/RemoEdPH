const mongoose = require('mongoose');
const Teacher = require('./models/Teacher');
const db = require('./db');

async function assignTeacherId() {
  try {
    // Connect to database
    await db;
    
    // Check if teacher already exists
    let teacher = await Teacher.findOne({ username: 'kjbflores@remoedph.com' });
    
    if (!teacher) {
      // Create new teacher
      teacher = new Teacher({
        username: 'kjbflores@remoedph.com',
        password: 'temp_password_123', // You can change this later
        photo: null,
        intro: 'No introduction available'
      });
      await teacher.save();
      console.log('✅ Teacher created successfully!');
    } else {
      console.log('✅ Teacher already exists!');
    }
    
    console.log('📋 Teacher ID:', teacher._id);
    console.log('📧 Username:', teacher.username);
    console.log('\n🔧 Next steps:');
    console.log('1. Open browser DevTools (F12)');
    console.log('2. Go to Console tab');
    console.log('3. Run this command:');
    console.log(`   localStorage.setItem('teacherId', '${teacher._id}');`);
    console.log('   localStorage.setItem("username", "kjbflores@remoedph.com");');
    console.log('   localStorage.setItem("userType", "teacher");');
    console.log('4. Refresh the Class Schedule page');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    mongoose.disconnect();
  }
}

assignTeacherId(); 