const mongoose = require('mongoose');

async function clearCorrectDatabase() {
  try {
    // Use the same database URI as the server
    await mongoose.connect('mongodb://localhost:27017/online-distance-learning');
    console.log('Connected to MongoDB (online-distance-learning)');
    
    const TeacherSlot = require('./server/models/TeacherSlot');
    
    // Delete ALL slots
    const result = await TeacherSlot.deleteMany({});
    
    console.log('\n=== CLEARING ALL TEACHER SLOTS ===');
    console.log(`Deleted ${result.deletedCount} slots`);
    
    // Verify deletion
    const remainingSlots = await TeacherSlot.find({});
    console.log(`Remaining slots: ${remainingSlots.length}`);
    
    if (remainingSlots.length === 0) {
      console.log('✅ All TeacherSlot data cleared successfully');
    } else {
      console.log('❌ Some slots still remain');
    }
    
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

clearCorrectDatabase(); 