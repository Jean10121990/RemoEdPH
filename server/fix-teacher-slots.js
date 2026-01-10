const mongoose = require('mongoose');
const TeacherSlot = require('./models/TeacherSlot');
const Teacher = require('./models/Teacher');

async function fixTeacherSlots() {
  try {
    await mongoose.connect('mongodb://localhost:27017/online-distance-learning');
    console.log('Connected to MongoDB');

    // Find teacher kjbflores@remoedph.com
    const teacher = await Teacher.findOne({ username: 'kjbflores@remoedph.com' });
    if (!teacher) {
      console.log('Teacher kjbflores@remoedph.com not found');
      return;
    }
    console.log('Found teacher:', teacher.username, 'ID:', teacher._id);

    // Find slots with null teacherId
    const nullSlots = await TeacherSlot.find({ teacherId: null });
    console.log('Slots with null teacherId:', nullSlots.length);

    // Find slots for this teacher
    const teacherSlots = await TeacherSlot.find({ teacherId: teacher._id });
    console.log('Slots for teacher:', teacherSlots.length);

    // If there are null slots, fix them
    if (nullSlots.length > 0) {
      for (const slot of nullSlots) {
        slot.teacherId = teacher._id;
        await slot.save();
        console.log(`Fixed slot: ${slot.date} ${slot.time}`);
      }
    }

    // Create new slots if needed
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
          console.log(`Created new slot: ${date} ${time}`);
        }
      }
    }

    // Final check
    const finalSlots = await TeacherSlot.find({ teacherId: teacher._id });
    console.log(`Final slots for ${teacher.username}:`, finalSlots.length);

    mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    mongoose.disconnect();
  }
}

fixTeacherSlots(); 