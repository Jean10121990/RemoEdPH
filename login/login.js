function parseJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch (_e) {
    return null;
  }
}

function isJwtValid(token) {
  const p = parseJwtPayload(token);
  if (!p || !p.exp) return false;
  const now = Math.floor(Date.now() / 1000);
  return Number(p.exp) > now;
}

function firstStored(keys) {
  for (let i = 0; i < keys.length; i++) {
    try {
      const v = localStorage.getItem(keys[i]) || sessionStorage.getItem(keys[i]);
      if (v) return v;
    } catch (_e) {}
  }
  return '';
}

function jwtRole(token) {
  const p = parseJwtPayload(token);
  if (!p) return '';
  return String(p.userRole || p.userType || p.role || '').toLowerCase();
}

function redirectFromToken(token) {
  const role = jwtRole(token);
  if (role === 'teacher') {
    window.location.replace('/teacher-dashboard.html');
    return true;
  }
  if (role === 'student') {
    window.location.replace('/student-dashboard.html');
    return true;
  }
  return false;
}

// Auto-login: student tokens first so a leftover teacher session cannot block students.
(function () {
  const studentTok = firstStored([
    'remoed_student_token',
    'remoed_student_auth',
  ]);
  if (studentTok && isJwtValid(studentTok) && jwtRole(studentTok) === 'student') {
    window.location.replace('/student-dashboard.html');
    return;
  }
  const teacherTok = firstStored([
    'remoed_teacher_token',
    'remoed_teacher_auth',
  ]);
  if (teacherTok && isJwtValid(teacherTok) && jwtRole(teacherTok) === 'teacher') {
    window.location.replace('/teacher-dashboard.html');
    return;
  }
  const legacy = firstStored(['remoed_user_token', 'token']);
  if (legacy && isJwtValid(legacy)) {
    redirectFromToken(legacy);
  }
})();

document.getElementById('unified-login-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  const loginBtn = document.getElementById('login-btn');
  if (loginBtn.disabled || loginBtn.dataset.busy === '1') return;

  const email = String(document.getElementById('email').value || '').trim();
  const password = String(document.getElementById('password').value || '').trim();
  const rememberMe = !!(document.getElementById('remember-me') && document.getElementById('remember-me').checked);
  const errorDiv = document.getElementById('login-error');

  errorDiv.style.display = 'none';
  errorDiv.textContent = '';

  if (!email || !password) {
    errorDiv.textContent = 'Please enter both email and password.';
    errorDiv.style.display = 'block';
    return;
  }

  loginBtn.dataset.busy = '1';
  loginBtn.disabled = true;
  loginBtn.textContent = 'Logging in...';

  try {
    const response = await fetch('/api/auth/unified-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password, rememberMe }),
      credentials: 'same-origin',
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      errorDiv.textContent = (data && data.message) || 'Invalid email or password';
      errorDiv.style.display = 'block';
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
      loginBtn.dataset.busy = '';
      return;
    }

    if (data && data.success && data.token && data.userRole && data.redirectTo) {
      // Role-specific keys + legacy remoed_user_token (used by unified login + remember-me)
      try {
        localStorage.removeItem('remoed_user_token');
        localStorage.removeItem('remoed_teacher_token');
        localStorage.removeItem('remoed_teacher_auth');
        localStorage.removeItem('remoed_student_token');
        localStorage.removeItem('remoed_student_auth');
        sessionStorage.removeItem('remoed_user_token');
        sessionStorage.removeItem('remoed_teacher_token');
        sessionStorage.removeItem('remoed_teacher_auth');
        sessionStorage.removeItem('remoed_student_token');
        sessionStorage.removeItem('remoed_student_auth');
        var roleKey =
          data.userRole === 'teacher'
            ? 'remoed_teacher_token'
            : data.userRole === 'student'
              ? 'remoed_student_token'
              : 'remoed_user_token';
        if (rememberMe) {
          localStorage.setItem(roleKey, data.token);
          localStorage.setItem('remoed_user_token', data.token);
        } else {
          sessionStorage.setItem(roleKey, data.token);
          sessionStorage.setItem('remoed_user_token', data.token);
        }
      } catch (_e) {}

      // Backward-compat keys (existing pages read these)
      try {
        localStorage.setItem('token', data.token);
        localStorage.setItem('userType', data.userRole);
        localStorage.setItem('userRole', data.userRole);
        localStorage.setItem('remoedUsername', email);
        const payload = parseJwtPayload(data.token);
        if (payload && payload.userRole === 'student' && payload.studentId) {
          localStorage.setItem('studentId', String(payload.studentId));
        }
        if (payload && payload.userRole === 'teacher' && payload.teacherId) {
          localStorage.setItem('teacherId', String(payload.teacherId));
        }
        if (payload && payload.userRole === 'teacher' && payload.teacherMongoId) {
          localStorage.setItem('teacherMongoId', String(payload.teacherMongoId));
        }
        if (data.teacherMongoId) {
          localStorage.setItem('teacherMongoId', String(data.teacherMongoId));
        }
      } catch (_e2) {}

      // Use redirectTo field from API
      if (data.redirectTo === '/teacher/dashboard') {
        window.location.replace('/teacher-dashboard.html');
        return;
      }
      if (data.redirectTo === '/student/dashboard') {
        window.location.replace('/student-dashboard.html');
        return;
      }
      window.location.replace('/index.html');
      return;
    }

    errorDiv.textContent = 'Login failed. Please try again.';
    errorDiv.style.display = 'block';
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
    loginBtn.dataset.busy = '';
  } catch (err) {
    console.error('Unified login error:', err);
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
    loginBtn.dataset.busy = '';
  }
});

