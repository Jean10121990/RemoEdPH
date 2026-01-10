

document.getElementById('login-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorDiv = document.getElementById('error-message');
    const loginBtn = document.getElementById('login-btn');
    
    errorDiv.style.display = 'none';

    if (!username || !password) {
        errorDiv.textContent = 'Please enter both username and password.';
        errorDiv.style.display = 'block';
        return;
    }

    // Show loading state
    loginBtn.textContent = 'Logging in...';
    loginBtn.disabled = true;

    console.log('Attempting login with username:', username);
    console.log('Server URL:', window.location.origin + '/api/auth/login');

    // Real authentication logic
    fetch('/api/auth/login', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ username, password }),
        credentials: 'same-origin'
    })
    .then(response => {
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        if (!response.ok) {
            // Handle suspended account specifically
            if (response.status === 403) {
                return response.json().then(data => {
                    throw new Error('SUSPENDED: ' + (data.message || 'Account suspended'));
                });
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return response.json();
    })
    .then(data => {
        console.log('Login response:', data);
        if (data.success && data.token) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('remoedUsername', username);
            localStorage.setItem('teacherId', data.teacherId);
            localStorage.setItem('userType', 'teacher');
            
            console.log('Login successful, checking if password change is needed...');
            
            // Check if user needs to change their generated password
            if (data.needsPasswordChange) {
                console.log('User has generated password, redirecting to change password page...');
                window.location.href = 'change-password.html';
            } else {
                console.log('Redirecting to dashboard...');
                window.location.href = 'teacher-dashboard.html';
            }
        } else {
            errorDiv.textContent = data.message || 'Invalid username or password.';
            errorDiv.style.display = 'block';
            loginBtn.textContent = 'Login';
            loginBtn.disabled = false;
        }
    })
    .catch(error => {
        console.error('Login error:', error);
        
        // Handle suspended account message
        if (error.message.startsWith('SUSPENDED:')) {
            const suspendedMessage = error.message.replace('SUSPENDED: ', '');
            errorDiv.textContent = suspendedMessage;
            errorDiv.style.display = 'block';
            errorDiv.style.background = '#fff3cd';
            errorDiv.style.borderColor = '#ffeaa7';
            errorDiv.style.color = '#856404';
        } else {
            errorDiv.textContent = 'Server error. Please try again later. Error: ' + error.message;
            errorDiv.style.display = 'block';
        }
        
        loginBtn.textContent = 'Login';
        loginBtn.disabled = false;
    });
});

// Alternative login method using XMLHttpRequest as fallback
function attemptLoginWithXHR(username, password) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/auth/login', true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');
    
    xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
            console.log('XHR Response status:', xhr.status);
            console.log('XHR Response:', xhr.responseText);
            
            if (xhr.status === 200) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    if (data.success && data.token) {
                        localStorage.setItem('token', data.token);
                        localStorage.setItem('remoedUsername', username);
                        localStorage.setItem('teacherId', data.teacherId);
                        localStorage.setItem('userType', 'teacher');
                        window.location.href = 'teacher-dashboard.html';
                    } else {
                        document.getElementById('error-message').textContent = data.message || 'Invalid credentials';
                        document.getElementById('error-message').style.display = 'block';
                    }
                } catch (e) {
                    console.error('JSON parse error:', e);
                    document.getElementById('error-message').textContent = 'Server response error';
                    document.getElementById('error-message').style.display = 'block';
                }
            } else {
                document.getElementById('error-message').textContent = 'Server error: ' + xhr.status;
                document.getElementById('error-message').style.display = 'block';
            }
            
            document.getElementById('login-btn').textContent = 'Login';
            document.getElementById('login-btn').disabled = false;
        }
    };
    
    xhr.onerror = function() {
        console.error('XHR Error');
        document.getElementById('error-message').textContent = 'Network error';
        document.getElementById('error-message').style.display = 'block';
        document.getElementById('login-btn').textContent = 'Login';
        document.getElementById('login-btn').disabled = false;
    };
    
    xhr.send(JSON.stringify({ username, password }));
}

document.addEventListener('DOMContentLoaded', function() {

    
    if (localStorage.getItem('loggedOut')) {
        var logoutMsg = document.getElementById('logout-message');
        if (logoutMsg) {
            logoutMsg.textContent = 'You have been logged out.';
            logoutMsg.style.display = 'block';
        }
        localStorage.removeItem('loggedOut');
    }
    
    // Add a small delay to ensure everything is loaded
    setTimeout(function() {
        // Password toggle functionality is now handled by the onclick="togglePassword()" in HTML
    }, 100); // 100ms delay
    
    // Test server connectivity
    fetch('/api/health')
        .then(res => console.log('Server is reachable. Health:', res.status))
        .catch(err => console.error('Server connectivity issue:', err));
});

 