const mongoose = require('mongoose');
const Curriculum = require('./models/Curriculum');
const Lesson = require('./models/Lesson');
// LessonFile model removed - files are now embedded in Lesson model
const LessonProgress = require('./models/LessonProgress');
const { connectDB } = require('./db');

async function seedLessons() {
  try {
    await connectDB();
    console.log('✅ Connected to MongoDB database: online-distance-learning');
    
    // Verify we're using the correct database
    const dbName = mongoose.connection.db.databaseName;
    console.log(`📊 Using database: ${dbName}`);
    
    if (dbName !== 'online-distance-learning') {
      console.warn('⚠️ Warning: Not using expected database name!');
    }

    // Clear existing data (optional - comment out if you want to keep existing data)
    // await Curriculum.deleteMany({});
    // await Lesson.deleteMany({});
    // Note: LessonFile collection removed - files are now embedded in Lesson model
    // console.log('🧹 Cleared existing lesson data');

    // Create sample curricula for different growth levels
    const curricula = [
      {
        title: 'Little Seeds English Basics',
        description: 'Introduction to English for Little Seeds (Age 3) students',
        level: 'Little Seeds (Age 3)',
        order: 1,
        isActive: true,
        createdBy: 'admin'
      },
      {
        title: 'Sprouts Phonics',
        description: 'Phonics and reading fundamentals for Sprouts (Age 4)',
        level: 'Sprouts (Age 4)',
        order: 1,
        isActive: true,
        createdBy: 'admin'
      },
      {
        title: 'Saplings Reading & Writing',
        description: 'Reading and writing skills for Saplings (Age 5)',
        level: 'Saplings (Age 5)',
        order: 1,
        isActive: true,
        createdBy: 'admin'
      },
      {
        title: 'Young Stewards Communication',
        description: 'Communication and literacy for Young Stewards (Age 6)',
        level: 'Young Stewards (Age 6)',
        order: 1,
        isActive: true,
        createdBy: 'admin'
      }
    ];

    const createdCurricula = [];
    for (const curriculumData of curricula) {
      let curriculum = await Curriculum.findOne({ 
        title: curriculumData.title, 
        level: curriculumData.level 
      });
      
      if (!curriculum) {
        curriculum = new Curriculum(curriculumData);
        await curriculum.save();
        console.log(`✅ Created curriculum: ${curriculum.title} (${curriculum.level})`);
      } else {
        console.log(`ℹ️  Curriculum already exists: ${curriculum.title}`);
      }
      createdCurricula.push(curriculum);
    }

    // Create sample lessons for each curriculum
    const lessonTemplates = {
      'Little Seeds (Age 3)': [
        { number: 1, title: 'Alphabet Introduction', description: 'Learn the English alphabet A-Z', duration: 30 },
        { number: 2, title: 'Basic Words', description: 'Introduction to simple words', duration: 30 },
        { number: 3, title: 'Colors and Shapes', description: 'Learn colors and basic shapes', duration: 30 },
        { number: 4, title: 'Numbers 1-10', description: 'Counting from 1 to 10', duration: 30 },
        { number: 5, title: 'Animals', description: 'Learn animal names and sounds', duration: 30 }
      ],
      'Sprouts (Age 4)': [
        { number: 1, title: 'Phonics: Letter Sounds', description: 'Introduction to letter sounds', duration: 45 },
        { number: 2, title: 'Simple Sentences', description: 'Building simple sentences', duration: 45 },
        { number: 3, title: 'Reading Short Stories', description: 'Reading comprehension basics', duration: 45 },
        { number: 4, title: 'Vocabulary Building', description: 'Expanding vocabulary', duration: 45 },
        { number: 5, title: 'Writing Practice', description: 'Basic writing skills', duration: 45 }
      ],
      'Saplings (Age 5)': [
        { number: 1, title: 'Advanced Reading', description: 'Reading comprehension and analysis', duration: 60 },
        { number: 2, title: 'Creative Writing', description: 'Writing stories and essays', duration: 60 },
        { number: 3, title: 'Grammar Fundamentals', description: 'Parts of speech and sentence structure', duration: 60 },
        { number: 4, title: 'Vocabulary Expansion', description: 'Advanced vocabulary and synonyms', duration: 60 },
        { number: 5, title: 'Communication Skills', description: 'Speaking and presentation skills', duration: 60 }
      ],
      'Young Stewards (Age 6)': [
        { number: 1, title: 'Storytelling', description: 'Tell and retell short stories', duration: 60 },
        { number: 2, title: 'Reading Fluency', description: 'Build confident oral reading', duration: 60 },
        { number: 3, title: 'Writing Paragraphs', description: 'Organize ideas into paragraphs', duration: 60 },
        { number: 4, title: 'Listening Skills', description: 'Follow multi-step instructions', duration: 60 },
        { number: 5, title: 'Class Presentations', description: 'Present ideas to peers', duration: 60 }
      ]
    };

    for (const curriculum of createdCurricula) {
      const templates = lessonTemplates[curriculum.level] || [];
      
      for (const template of templates) {
        let lesson = await Lesson.findOne({ 
          curriculumId: curriculum._id, 
          lessonNumber: template.number 
        });
        
        if (!lesson) {
          lesson = new Lesson({
            curriculumId: curriculum._id,
            title: template.title,
            description: template.description,
            lessonNumber: template.number,
            order: template.number,
            estimatedDuration: template.duration,
            isActive: true,
            createdBy: 'admin'
          });
          await lesson.save();
          console.log(`  ✅ Created lesson: ${lesson.title} (Lesson ${lesson.lessonNumber})`);
        } else {
          console.log(`  ℹ️  Lesson already exists: ${lesson.title}`);
        }
      }
    }

    console.log('\n✅ Lesson seeding completed!');
    console.log('\n📊 Summary:');
    const totalCurricula = await Curriculum.countDocuments({ isActive: true });
    const totalLessons = await Lesson.countDocuments({ isActive: true });
    console.log(`  - Curricula: ${totalCurricula}`);
    console.log(`  - Lessons: ${totalLessons}`);
    
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error seeding lessons:', error);
    process.exit(1);
  }
}

// Run the seed function
seedLessons();
