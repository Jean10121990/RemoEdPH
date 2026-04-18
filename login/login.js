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

function getStoredUserToken() {
  return (
    localStorage.getItem('remoed_user_token') ||
    sessionStorage.getItem('remoed_user_token') ||
    localStorage.getItem('token') ||
    sessionStorage.getItem('token') ||
    ''
  );
}

function redirectFromToken(token) {
  const p = parseJwtPayload(token);
  const role = p && p.userRole ? String(p.userRole) : '';
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

// Auto-login: if a valid token exists, go straight to dashboard.
(function () {
  const tok = getStoredUserToken();
  if (tok && isJwtValid(tok)) {
    redirectFromToken(tok);
  }
})();

document.getElementById('unified-login-form').addEventListener('submit', async function (e) {
  e.preventDefault();

  const email = String(document.getElementById('email').value || '').trim();
  const password = String(document.getElementById('password').value || '').trim();
  const rememberMe = !!(document.getElementById('remember-me') && document.getElementById('remember-me').checked);
  const errorDiv = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');

  errorDiv.style.display = 'none';
  errorDiv.textContent = '';

  if (!email || !password) {
    errorDiv.textContent = 'Please enter both email and password.';
    errorDiv.style.display = 'block';
    return;
  }

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
      return;
    }

    if (data && data.success && data.token && data.userRole && data.redirectTo) {
      // New canonical token key (used by unified login + remember-me)
      try {
        localStorage.removeItem('remoed_user_token');
        sessionStorage.removeItem('remoed_user_token');
        if (rememberMe) {
          localStorage.setItem('remoed_user_token', data.token);
        } else {
          sessionStorage.setItem('remoed_user_token', data.token);
        }
      } catch (_e) {}

      // Backward-compat keys (existing pages read these)
      try {
        localStorage.setItem('token', data.token);
        localStorage.setItem('userType', data.userRole);
        localStorage.setItem('remoedUsername', email);
        const payload = parseJwtPayload(data.token);
        if (payload && payload.userRole === 'student' && payload.studentId) {
          localStorage.setItem('studentId', String(payload.studentId));
        }
        if (payload && payload.userRole === 'teacher' && payload.teacherId) {
          localStorage.setItem('teacherId', String(payload.teacherId));
        }
      } catch (_e2) {}

      // Use redirectTo field from API
      if (data.redirectTo === '/teacher/dashboard') {
        window.location.href = '/teacher-dashboard.html';
        return;
      }
      if (data.redirectTo === '/student/dashboard') {
        window.location.href = '/student-dashboard.html';
        return;
      }
      window.location.href = '/index.html';
      return;
    }

    errorDiv.textContent = 'Login failed. Please try again.';
    errorDiv.style.display = 'block';
  } catch (err) {
    console.error('Unified login error:', err);
    errorDiv.textContent = 'Network error. Please try again.';
    errorDiv.style.display = 'block';
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Login';
  }
});

