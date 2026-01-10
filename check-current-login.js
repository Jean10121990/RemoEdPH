// This script should be run in the browser console to check current login state
console.log('🔍 Checking current login state...');

const userType = localStorage.getItem('userType');
const username = localStorage.getItem('remoedUsername');
const teacherId = localStorage.getItem('teacherId');
const token = localStorage.getItem('token');

console.log('Current login info:');
console.log('  - User Type:', userType);
console.log('  - Username:', username);
console.log('  - Teacher ID:', teacherId);
console.log('  - Has Token:', token ? 'Yes' : 'No');

if (userType === 'teacher') {
    console.log('✅ Logged in as teacher');
    console.log('📧 Teacher email/username:', username);
} else if (userType === 'student') {
    console.log('✅ Logged in as student');
    console.log('📧 Student email/username:', username);
} else {
    console.log('❌ Not logged in or unknown user type');
}

console.log('\nTo fix the slot issue:');
console.log('1. If logged in as plflores3301, logout and login as kjbflores@remoedph.com');
console.log('2. Or open a new slot as plflores3301 in teacher-open-class.html');
