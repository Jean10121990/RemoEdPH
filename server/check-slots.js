const mongoose = require('mongoose');
const TeacherSlot = require('./models/TeacherSlot');
const Teacher = require('./models/Teacher');

async function checkSlots() {
  try {
    await mongoose.connect('mongodb://localhost:27017/online-distance-learning');
    console.log('Connected to MongoDB');
    
    // Check all teachers
    const teachers = await Teacher.find({});
    console.log('\n=== ALL TEACHERS ===');
    console.log(JSON.stringify(teachers, null, 2));
    
    // Check all slots
    const slots = await TeacherSlot.find({}).populate('teacherId');
    console.log('\n=== ALL SLOTS ===');
    console.log(JSON.stringify(slots, null, 2));
    
    // Check specific date (August 2, 2025)
    const august2Slots = await TeacherSlot.find({ date: '2025-08-02' }).populate('teacherId');
    console.log('\n=== AUGUST 2, 2025 SLOTS ===');
    console.log(JSON.stringify(august2Slots, null, 2));
    
    // Check slots for teacher kjbflores@remoedph.com
    const teacher = await Teacher.findOne({ username: 'kjbflores@remoedph.com' });
    if (teacher) {
      console.log('\n=== TEACHER FOUND ===');
      console.log('Teacher ID:', teacher._id);
      
      const teacherSlots = await TeacherSlot.find({ teacherId: teacher._id });
      console.log('\n=== SLOTS FOR KJBFLORES ===');
      console.log(JSON.stringify(teacherSlots, null, 2));
    } else {
      console.log('\n=== TEACHER NOT FOUND ===');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkSlots(); 