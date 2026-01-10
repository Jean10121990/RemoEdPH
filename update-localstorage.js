// Script to update localStorage with correct teacherId format
console.log('🔍 Updating localStorage with correct teacherId format...');

// Get current teacher info
const username = localStorage.getItem('remoedUsername');
const currentTeacherId = localStorage.getItem('teacherId');
const userType = localStorage.getItem('userType');

console.log('Current localStorage:');
console.log('  - username:', username);
console.log('  - teacherId:', currentTeacherId);
console.log('  - userType:', userType);

// Map usernames to new teacherId format
const teacherIdMap = {
  'plflores3301': 'kjb00000001',
  'kjbflores': 'kjb00000002'
};

if (userType === 'teacher' && username && teacherIdMap[username]) {
  const newTeacherId = teacherIdMap[username];
  
  if (currentTeacherId !== newTeacherId) {
    console.log(`🔄 Updating teacherId from ${currentTeacherId} to ${newTeacherId}`);
    localStorage.setItem('teacherId', newTeacherId);
    console.log('✅ localStorage updated successfully!');
    
    // Show success message
    alert(`Teacher ID updated to: ${newTeacherId}\nPlease refresh the page.`);
  } else {
    console.log('✅ TeacherId is already correct:', newTeacherId);
  }
} else {
  console.log('❌ No mapping found for username:', username);
  console.log('Available mappings:', Object.keys(teacherIdMap));
}

console.log('Updated localStorage:');
console.log('  - username:', localStorage.getItem('remoedUsername'));
console.log('  - teacherId:', localStorage.getItem('teacherId'));
console.log('  - userType:', localStorage.getItem('userType'));
