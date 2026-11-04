const mongoose = require('mongoose');

const Curriculum = require('./server/models/Curriculum');
const Lesson = require('./server/models/Lesson');
const LessonFile = require('./server/models/LessonFile');
const LessonSlides = require('./server/models/LessonSlides');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/online-distance-learning';

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    const [curriculaCount, lessonsCount, filesCount, slidesCount] = await Promise.all([
      Curriculum.countDocuments(),
      Lesson.countDocuments(),
      LessonFile.countDocuments(),
      LessonSlides.countDocuments(),
    ]);
    console.log('--- Lesson Data Counts ---');
    console.log('Curricula:', curriculaCount);
    console.log('Lessons:', lessonsCount);
    console.log('Lesson Files:', filesCount);
    console.log('Lesson Slides:', slidesCount);
  } catch (err) {
    console.error('Error checking lessons:', err);
  } finally {
    await mongoose.disconnect();
  }
}

run();

