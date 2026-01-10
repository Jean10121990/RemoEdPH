document.getElementById('register-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const password = document.getElementById('password').value.trim();
    const errorDiv = document.getElementById('error-message');
    const successDiv = document.getElementById('success-message');
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';

    if (!password) {
        errorDiv.textContent = 'Please enter a password.';
        errorDiv.style.display = 'block';
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await response.json();
        if (response.ok) {
            successDiv.textContent = 'Registration successful! You can now log in.';
            successDiv.style.display = 'block';
            errorDiv.style.display = 'none';
            document.getElementById('register-form').reset();
        } else {
            errorDiv.textContent = data.message || 'Registration failed.';
            errorDiv.style.display = 'block';
        }
    } catch (err) {
        errorDiv.textContent = 'Server error. Please try again later.';
        errorDiv.style.display = 'block';
    }
}); 