const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');

// Connect to MongoDB using the same connection as the main app
mongoose.connect('mongodb://localhost:27017/online-distance-learning', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

async function checkLoginCredentials() {
    try {
        console.log('=== DATABASE CONNECTION TEST ===');
        console.log('MongoDB connection status:', mongoose.connection.readyState);
        
        if (mongoose.connection.readyState !== 1) {
            console.log('❌ Database not connected. Please start MongoDB.');
            return;
        }
        
        console.log('✅ Database connected successfully');
        
        // Test specific teacher login
        console.log('\n=== TESTING TEACHER LOGIN ===');
        const testUsername = 'testteacher@remoedph.com';
        const testPassword = 'teacher123';
        
        const teacher = await Teacher.findOne({ username: testUsername });
        console.log('Teacher found:', !!teacher);
        
        if (teacher) {
            const passwordMatch = await bcrypt.compare(testPassword, teacher.password);
            console.log('Password match:', passwordMatch);
            console.log('Teacher ID:', teacher._id);
        } else {
            console.log('❌ Test teacher not found. Creating one...');
            
            // Create a test teacher
            const hashedPassword = await bcrypt.hash(testPassword, 10);
            const newTeacher = new Teacher({
                username: testUsername,
                password: hashedPassword,
                firstName: 'Test',
                lastName: 'Teacher',
                email: testUsername,
                rate: 500
            });
            
            await newTeacher.save();
            console.log('✅ Test teacher created successfully');
        }
        
        // Test specific student login
        console.log('\n=== TESTING STUDENT LOGIN ===');
        const testStudentUsername = 'teststudent@remoedph.com';
        const testStudentPassword = 'student123';
        
        const student = await Student.findOne({ username: testStudentUsername });
        console.log('Student found:', !!student);
        
        if (student) {
            const passwordMatch = await bcrypt.compare(testStudentPassword, student.password);
            console.log('Password match:', passwordMatch);
            console.log('Student ID:', student._id);
        } else {
            console.log('❌ Test student not found. Creating one...');
            
            // Create a test student
            const hashedPassword = await bcrypt.hash(testStudentPassword, 10);
            const newStudent = new Student({
                username: testStudentUsername,
                password: hashedPassword,
                firstName: 'Test',
                lastName: 'Student',
                email: testStudentUsername
            });
            
            await newStudent.save();
            console.log('✅ Test student created successfully');
        }
        
        console.log('\n=== LOGIN CREDENTIALS SUMMARY ===');
        console.log('Teacher Login:');
        console.log('  Username: testteacher@remoedph.com');
        console.log('  Password: teacher123');
        console.log('\nStudent Login:');
        console.log('  Username: teststudent@remoedph.com');
        console.log('  Password: student123');
        
        console.log('\n=== TESTING SERVER ENDPOINTS ===');
        console.log('1. Go to http://localhost:5000/test-login.html');
        console.log('2. Test with the credentials above');
        console.log('3. Check browser console for detailed logs');
        
    } catch (error) {
        console.error('Error during login check:', error);
    } finally {
        mongoose.connection.close();
    }
}

checkLoginCredentials(); 