const mongoose = require('mongoose');
const TeacherSlot = require('./models/TeacherSlot');
const Teacher = require('./models/Teacher');

async function checkAndCreateSlots() {
  try {
    await mongoose.connect('mongodb://localhost:27017/online-distance-learning');
    console.log('Connected to MongoDB');

    // Check existing slots
    const existingSlots = await TeacherSlot.find();
    console.log('Existing teacher slots:', existingSlots.length);

    // Find teacher kjbflores@remoedph.com
    const teacher = await Teacher.findOne({ username: 'kjbflores@remoedph.com' });
    if (!teacher) {
      console.log('Teacher kjbflores@remoedph.com not found');
      return;
    }
    console.log('Found teacher:', teacher.username);

    // Create slots for today and tomorrow
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dates = [
      today.toISOString().split('T')[0],
      tomorrow.toISOString().split('T')[0]
    ];

    const times = ['16:00', '16:30', '17:00', '17:30', '18:00', '18:30'];

    for (const date of dates) {
      for (const time of times) {
        // Check if slot already exists
        const existingSlot = await TeacherSlot.findOne({ 
          teacherId: teacher._id, 
          date, 
          time 
        });

        if (!existingSlot) {
          const slot = new TeacherSlot({
            teacherId: teacher._id,
            date,
            time
          });
          await slot.save();
          console.log(`Created slot: ${date} ${time}`);
        } else {
          console.log(`Slot already exists: ${date} ${time}`);
        }
      }
    }

    // Check final count
    const finalSlots = await TeacherSlot.find({ teacherId: teacher._id });
    console.log(`Total slots for ${teacher.username}:`, finalSlots.length);

    mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    mongoose.disconnect();
  }
}

checkAndCreateSlots(); 