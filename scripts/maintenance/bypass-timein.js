// Script to bypass time-in restrictions for testing
console.log('🔧 Bypassing time-in restrictions for testing...');

// Store original time-in status
localStorage.setItem('timeInStatus', 'completed');
localStorage.setItem('timeInTime', new Date().toISOString());
localStorage.setItem('timeInDate', new Date().toISOString().split('T')[0]);

console.log('✅ Time-in status set to completed');
console.log('✅ You can now access the live classroom for testing');

// Also update teacherId if needed
const username = localStorage.getItem('remoedUsername');
const currentTeacherId = localStorage.getItem('teacherId');

if (username === 'kjbflores' && currentTeacherId !== 'kjb00000002') {
    console.log('🔄 Also updating teacherId to new format...');
    localStorage.setItem('teacherId', 'kjb00000002');
    console.log('✅ TeacherId updated to kjb00000002');
}

console.log('Current status:');
console.log('  - Time-in: COMPLETED');
console.log('  - TeacherId:', localStorage.getItem('teacherId'));
console.log('  - Username:', localStorage.getItem('remoedUsername'));

alert('Time-in restrictions bypassed!\nYou can now test the live classroom.');
