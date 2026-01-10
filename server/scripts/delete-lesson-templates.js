require('dotenv').config();
const mongoose = require('mongoose');
const Lesson = require('../models/Lesson');
const Curriculum = require('../models/Curriculum');

async function deleteLessonTemplates() {
  try {
    // Connect to MongoDB
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/online-learning';
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Get all curricula for nursery, kinder, and preparatory levels
    const curricula = await Curriculum.find({ 
      level: { $in: ['nursery', 'kinder', 'preparatory'] },
      isActive: true 
    });

    console.log(`\n📚 Found ${curricula.length} curricula to process:`);
    curricula.forEach(c => {
      console.log(`  - ${c.title} (${c.level}) - ID: ${c._id}`);
    });

    let totalDeleted = 0;

    // Delete all lessons for each curriculum
    for (const curriculum of curricula) {
      const result = await Lesson.deleteMany({ 
        curriculumId: curriculum._id 
      });
      
      console.log(`\n🗑️  Deleted ${result.deletedCount} lesson(s) for "${curriculum.title}" (${curriculum.level})`);
      totalDeleted += result.deletedCount;
    }

    console.log(`\n✅ Complete! Total lessons deleted: ${totalDeleted}`);
    console.log('\n📝 You can now create new lessons through the admin lesson library.');
    
  } catch (error) {
    console.error('❌ Error deleting lesson templates:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the script
deleteLessonTemplates();
