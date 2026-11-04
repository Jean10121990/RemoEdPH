// This script should be run in the browser console on teacher-class-table.html
console.log('🔍 Checking localStorage values...');

const userType = localStorage.getItem('userType');
const username = localStorage.getItem('remoedUsername');
const teacherId = localStorage.getItem('teacherId');
const token = localStorage.getItem('token');

console.log('LocalStorage values:');
console.log('  - userType:', userType);
console.log('  - username:', username);
console.log('  - teacherId:', teacherId);
console.log('  - token exists:', token ? 'Yes' : 'No');

// Check if the teacherId matches what we expect
if (username === 'kjbflores') {
    console.log('✅ Username matches kjbflores');
} else {
    console.log('❌ Username does not match kjbflores:', username);
}

// Test the API call that would be made
const weekStart = new Date();
const dayOfWeek = weekStart.getDay();
const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
weekStart.setDate(weekStart.getDate() - daysToMonday);
const weekString = weekStart.toISOString().split('T')[0];

console.log('\n🔍 API call details:');
console.log('  - Week string:', weekString);
console.log('  - Teacher ID for API:', teacherId || username);
console.log('  - Expected API URL:', `/api/teacher/slots?teacherId=${teacherId || username}&week=${weekString}`);

// Check if the page is logged in as the right teacher
if (userType === 'teacher' && username === 'kjbflores') {
    console.log('\n✅ Page is logged in as the correct teacher (kjbflores)');
    console.log('The slot should be visible. If not, check the browser console for API errors.');
} else {
    console.log('\n❌ Page is NOT logged in as kjbflores');
    console.log('Current login:', username);
    console.log('You need to login as kjbflores to see the slot.');
}
