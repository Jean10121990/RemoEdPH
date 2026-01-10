const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Import models
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');
const Admin = require('./models/Admin');
const Announcement = require('./models/Announcement');
const Notification = require('./models/Notification');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/online-distance-learning', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function seedData() {
  try {
    console.log('🌱 Starting database seeding...');

    // Clear existing data
    await Teacher.deleteMany({});
    await Student.deleteMany({});
    await Admin.deleteMany({});
    await Announcement.deleteMany({});
    await Notification.deleteMany({});

    console.log('🗑️ Cleared existing data');

    // Create admin
    const adminPassword = await bcrypt.hash('admin123', 10);
    const admin = new Admin({
      username: 'admin@remoedph.com',
      password: adminPassword
    });
    await admin.save();
    console.log('✅ Created admin: admin@remoedph.com / admin123');

    // Create sample teachers
    const teacherPassword = await bcrypt.hash('teacher123', 10);
    const teachers = [
      {
        username: 'kjbflores@remoedph.com',
        password: teacherPassword,
        firstName: 'Katherine',
        lastName: 'Flores',
        email: 'kjbflores@remoedph.com',
        hourlyRate: 100,
        profile: {
          profilePicture: null,
          bio: 'Experienced English teacher with 5+ years of teaching experience.',
          education: 'Bachelor of Education, University of the Philippines',
          subjects: ['English', 'Literature', 'Grammar'],
          workExperience: [
            {
              company: 'ABC School',
              jobTitle: 'English Teacher',
              jobDescription: 'Taught English to high school students',
              duration: '2020-2023'
            }
          ]
        }
      },
      {
        username: 'teacher2@remoedph.com',
        password: teacherPassword,
        firstName: 'Maria',
        lastName: 'Santos',
        email: 'teacher2@remoedph.com',
        hourlyRate: 100,
        profile: {
          profilePicture: null,
          bio: 'Mathematics teacher specializing in algebra and calculus.',
          education: 'Master of Mathematics, Ateneo de Manila University',
          subjects: ['Mathematics', 'Algebra', 'Calculus']
        }
      }
    ];

    for (const teacherData of teachers) {
      const teacher = new Teacher(teacherData);
      await teacher.save();
    }
    console.log(`✅ Created ${teachers.length} teachers`);

    // Create sample students
    const studentPassword = await bcrypt.hash('student123', 10);
    const students = [
      {
        username: 'student1@remoedph.com',
        password: studentPassword,
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        email: 'student1@remoedph.com',
        grade: 'Grade 10',
        subjects: ['English', 'Mathematics']
      },
      {
        username: 'student2@remoedph.com',
        password: studentPassword,
        firstName: 'Maria',
        lastName: 'Garcia',
        email: 'student2@remoedph.com',
        grade: 'Grade 11',
        subjects: ['English', 'Science']
      },
      {
        username: 'teststudent@remoedph.com',
        password: studentPassword,
        firstName: 'Test',
        lastName: 'Student',
        email: 'teststudent@remoedph.com',
        grade: 'Grade 9',
        subjects: ['English', 'Mathematics', 'Science']
      }
    ];

    for (const studentData of students) {
      const student = new Student(studentData);
      await student.save();
    }
    console.log(`✅ Created ${students.length} students`);

    // Create sample announcements
    const announcements = [
      {
        content: 'Salary is every Saturday',
        role: 'teacher',
        createdAt: new Date('2025-07-30T21:09:55.000Z')
      },
      {
        content: 'test announcement, Hello World!',
        role: 'teacher',
        createdAt: new Date('2025-07-25T20:39:12.000Z')
      },
      {
        content: 'Welcome to the new school year! Classes will begin on August 1st.',
        role: 'student',
        createdAt: new Date('2025-07-31T10:00:00.000Z')
      }
    ];

    for (const announcementData of announcements) {
      const announcement = new Announcement(announcementData);
      await announcement.save();
    }
    console.log(`✅ Created ${announcements.length} announcements`);

    // Create sample notifications for the first teacher
    const teacher = await Teacher.findOne({ username: 'kjbflores@remoedph.com' });
    if (teacher) {
      const notifications = [
        {
          teacherId: teacher._id,
          type: 'clock_in',
          message: 'Clocked in at 10:19:53 AM',
          read: false,
          createdAt: new Date('2025-07-31T10:19:53.000Z')
        },
        {
          teacherId: teacher._id,
          type: 'class_finished',
          message: 'Class marked as finished for 2025-07-31 at 09:00',
          read: false,
          createdAt: new Date('2025-07-31T10:19:00.000Z')
        },
        {
          teacherId: teacher._id,
          type: 'booking',
          message: 'New class booked for 2025-07-31 at 09:00 with 68870755fa770026cf9cf5a3.',
          read: false,
          createdAt: new Date('2025-07-30T22:33:00.000Z')
        },
        {
          teacherId: teacher._id,
          type: 'class_finished',
          message: 'Class marked as finished for 2025-07-29 at 09:00',
          read: false,
          createdAt: new Date('2025-07-29T21:28:00.000Z')
        },
        {
          teacherId: teacher._id,
          type: 'class_finished',
          message: 'Class marked as finished for 2025-07-28 at 17:30',
          read: false,
          createdAt: new Date('2025-07-29T21:13:00.000Z')
        }
      ];

      for (const notificationData of notifications) {
        const notification = new Notification(notificationData);
        await notification.save();
      }
      console.log(`✅ Created ${notifications.length} notifications for teacher`);
    }

    console.log('🎉 Database seeding completed successfully!');
    console.log('\n📋 Sample Data Created:');
    console.log('- Admin: admin@remoedph.com / admin123');
    console.log('- Teachers: kjbflores@remoedph.com, teacher2@remoedph.com / teacher123');
    console.log('- Students: student1@remoedph.com, student2@remoedph.com, teststudent@remoedph.com / student123');
    console.log('- Announcements and notifications');

  } catch (error) {
    console.error('❌ Error seeding data:', error);
  } finally {
    mongoose.connection.close();
  }
}

seedData(); 