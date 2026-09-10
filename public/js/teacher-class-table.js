// Extracted from teacher-class-table.html inline script
// (function wrapper to avoid polluting global scope too much)

// Role-based access control (shared gate — also accepts teacher JWT / remoed_teacher_token)
if (
  !window.RemoedTeacherSession ||
  !RemoedTeacherSession.requireTeacher({ redirect: 'index.html' })
) {
  throw new Error('Teachers only');
}

// Get user info from localStorage
const username = localStorage.getItem('remoedUsername') || 'Teacher';
const teacherId = localStorage.getItem('teacherId');

// Update sidebar with loading message (will be updated with first name later)
document.getElementById('avatar-text').textContent = username[0].toUpperCase();
document.getElementById('sidebar-email').textContent = 'Loading...';

// Load profile picture if available
if (teacherId) {
  loadProfilePicture(teacherId);
}

// Open class button
document.getElementById('open-class-btn').onclick = () => {
  window.location.href = 'teacher-open-class.html';
};

// The rest of the logic remains in the HTML for now; migrate incrementally as needed.


