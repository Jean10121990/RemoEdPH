const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Teacher = require('./models/Teacher');
const db = require('./db');

async function createTeacher() {
  const username = 'teacher';
  const plainPassword = 'password123';
  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  try {
    const existing = await Teacher.findOne({ username });
    if (existing) {
      console.log('Teacher already exists.');
      process.exit(0);
    }
    const teacher = new Teacher({ username, password: hashedPassword });
    await teacher.save();
    console.log('Teacher created successfully.');
  } catch (err) {
    console.error('Error creating teacher:', err);
  } finally {
    mongoose.disconnect();
  }
}

createTeacher(); 