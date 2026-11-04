const mongoose = require('mongoose');

async function checkCorrectDatabase() {
  try {
    // Use the same database URI as the server
    await mongoose.connect('mongodb://localhost:27017/online-distance-learning');
    console.log('Connected to MongoDB (online-distance-learning)');
    
    const TeacherSlot = require('./server/models/TeacherSlot');
    const slots = await TeacherSlot.find({});
    
    console.log('\n=== TEACHER SLOT COLLECTION (online-distance-learning) ===');
    console.log('Total slots:', slots.length);
    
    if (slots.length === 0) {
      console.log('✅ TeacherSlot collection is EMPTY');
    } else {
      console.log('\nSlots found:');
      slots.forEach(slot => {
        console.log(`- ${slot.date} ${slot.time} - Teacher: ${slot.teacherId}`);
      });
    }
    
    // Also check for any August 6 slots specifically
    const august6Slots = await TeacherSlot.find({ date: '2025-08-06' });
    console.log(`\nAugust 6 slots: ${august6Slots.length}`);
    
    // Check for August 7 slots
    const august7Slots = await TeacherSlot.find({ date: '2025-08-07' });
    console.log(`\nAugust 7 slots: ${august7Slots.length}`);
    
    // Check for July 30 slots
    const july30Slots = await TeacherSlot.find({ date: '2025-07-30' });
    console.log(`\nJuly 30 slots: ${july30Slots.length}`);
    
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

checkCorrectDatabase(); 