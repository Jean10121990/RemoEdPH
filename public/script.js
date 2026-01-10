document.addEventListener('DOMContentLoaded', function() {
    var logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            // Clear session data and token
            localStorage.setItem('loggedOut', '1');
            localStorage.removeItem('authToken');
            window.location.href = 'teacher-login.html';
        });
    }

    var trialClassBtn = document.getElementById('trial-class-btn');
    if (trialClassBtn) {
        trialClassBtn.addEventListener('click', function() {
            window.location.href = 'trial-class.html';
        });
    }

    var videoRoomBtn = document.getElementById('video-room-btn');
    if (videoRoomBtn) {
        videoRoomBtn.addEventListener('click', function() {
            // Always generate a random room ID client-side
            function generateRoomId() {
                return Math.random().toString(36).substr(2, 8);
            }
            const room = generateRoomId();
            window.location.href = 'video-room?room=' + encodeURIComponent(room);
        });
    }

    var classTableBtn = document.getElementById('class-table-btn');
    if (classTableBtn) {
        classTableBtn.addEventListener('click', function() {
            window.location.href = 'class-table.html';
        });
    }

    // Show/hide password logic for all password fields
    document.querySelectorAll('.password-group').forEach(function(group) {
        var passwordInput = group.querySelector('input[type="password"], input[type="text"]');
        var togglePasswordBtn = group.querySelector('button');
        var eyeIcon = togglePasswordBtn.querySelector('svg');
        var openPath = "M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z";
        var openCircle = "M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z";
        var closedPath = "M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-11-7-11-7a21.81 21.81 0 0 1 5.06-6.06M1 1l22 22";
        var closedCircle = "M9.53 9.53A3 3 0 0 0 12 15a3 3 0 0 0 2.47-5.47";
        if (togglePasswordBtn && passwordInput && eyeIcon) {
            togglePasswordBtn.addEventListener('click', function() {
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    togglePasswordBtn.setAttribute('aria-label', 'Hide password');
                    // Change to closed eye
                    eyeIcon.innerHTML = '';
                    eyeIcon.setAttribute('viewBox', '0 0 24 24');
                    eyeIcon.innerHTML = '<path d="' + closedPath + '"/><path d="' + closedCircle + '"/>';
                } else {
                    passwordInput.type = 'password';
                    togglePasswordBtn.setAttribute('aria-label', 'Show password');
                    // Change to open eye
                    eyeIcon.innerHTML = '';
                    eyeIcon.setAttribute('viewBox', '0 0 24 24');
                    eyeIcon.innerHTML = '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"></path><circle cx="12" cy="12" r="3"></circle>';
                }
            });
        }
    });

    // Brightness and Whiteness slider for device-check.html
    var videoPreview = document.getElementById('video-preview');
    var brightnessSlider = document.getElementById('brightness-slider');
    var whitenessSlider = document.getElementById('whiteness-slider');
    if (videoPreview && brightnessSlider && whitenessSlider) {
        function updateVideoPreviewFilter() {
            videoPreview.style.filter = 'brightness(' + brightnessSlider.value + ') contrast(' + whitenessSlider.value + ')';
        }
        brightnessSlider.addEventListener('input', updateVideoPreviewFilter);
        whitenessSlider.addEventListener('input', updateVideoPreviewFilter);
    }
    // Brightness and Whiteness slider for video-room.html
    var localVideo = document.getElementById('local-video');
    var localBrightnessSlider = document.getElementById('local-brightness-slider');
    var localWhitenessSlider = document.getElementById('local-whiteness-slider');
    if (localVideo && localBrightnessSlider && localWhitenessSlider) {
        function updateLocalVideoFilter() {
            localVideo.style.filter = 'brightness(' + localBrightnessSlider.value + ') contrast(' + localWhitenessSlider.value + ')';
        }
        localBrightnessSlider.addEventListener('input', updateLocalVideoFilter);
        localWhitenessSlider.addEventListener('input', updateLocalVideoFilter);
    }
});
