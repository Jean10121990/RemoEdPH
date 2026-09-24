/**
 * Admin portal time tracking (header mini + dashboard card).
 * Singleton — safe if AdminPageHeader and the page both load this file.
 * Never auto clock-in on login; only POST clock-in/out on explicit button click.
 */
(function () {
    'use strict';

    if (window.__REMOED_ADMIN_TT__) {
        if (typeof window.initAdminTimeTracking === 'function') {
            window.initAdminTimeTracking();
        }
        return;
    }
    window.__REMOED_ADMIN_TT__ = true;

    function getToken() {
        if (typeof RemoedAdminSession !== 'undefined' && RemoedAdminSession.getAuthToken) {
            return RemoedAdminSession.getAuthToken();
        }
        return (
            localStorage.getItem('remoed_admin_token') ||
            localStorage.getItem('remoed_admin_auth') ||
            localStorage.getItem('adminToken') ||
            ''
        );
    }

    function showAdminTimeMessage(message, type) {
        var bg = type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : type === 'warning' ? '#ff9800' : '#2196F3';
        var div = document.createElement('div');
        div.style.cssText = 'position:fixed;top:20px;right:20px;background:' + bg + ';color:white;padding:12px 20px;border-radius:8px;z-index:10050;font-weight:600;max-width:320px;box-shadow:0 4px 12px rgba(0,0,0,0.15);';
        div.textContent = message;
        document.body.appendChild(div);
        setTimeout(function () { if (div.parentNode) div.parentNode.removeChild(div); }, 3500);
    }

    var timeInSession = null;
    var sessionTimer = null;
    var isClockedIn = false;
    var statusPollStarted = false;
    var clockDisplayStarted = false;

    window.adminTimeTrackingStatus = {};

    function updateCurrentTimeDisplay() {
        var el = document.getElementById('time-display');
        if (!el) return;
        var now = new Date();
        el.textContent = now.toLocaleTimeString('en-US', {
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        });
    }

    async function loadAdminTimeTrackingStatus() {
        var token = getToken();
        if (!token) return;
        try {
            var res = await fetch('/api/admin/time-tracking/status', {
                headers: { Authorization: 'Bearer ' + token },
                credentials: 'include'
            });
            if (!res.ok) return;
            var data = await res.json();
            isClockedIn = !!data.isClockedIn;
            if (data.isClockedIn && data.currentLog && data.currentLog.clockIn) {
                timeInSession = new Date(data.currentLog.clockIn.timestamp);
                startSessionTimer();
            } else {
                timeInSession = null;
                if (sessionTimer) {
                    clearInterval(sessionTimer);
                    sessionTimer = null;
                }
            }
            window.adminTimeTrackingStatus = data;
            updateAdminTimeTrackingUI();
        } catch (e) {
            console.error('Admin time status:', e);
        }
    }

    function updateAdminTimeTrackingMini() {
        var statusMini = document.getElementById('time-status-mini');
        var btnMini = document.getElementById('time-btn-mini');
        if (!statusMini || !btnMini) return;

        var st = window.adminTimeTrackingStatus || {};
        if (st.dailyCompleted && !isClockedIn) {
            statusMini.textContent = 'Daily completed';
            statusMini.className = 'time-status-mini not-clocked';
            btnMini.textContent = 'Time In';
            btnMini.className = 'time-btn-mini clock-in';
            btnMini.disabled = true;
            btnMini.setAttribute('aria-disabled', 'true');
            btnMini.style.opacity = '0.55';
            btnMini.style.cursor = 'not-allowed';
            return;
        }
        btnMini.disabled = false;
        btnMini.removeAttribute('aria-disabled');
        btnMini.style.opacity = '';
        btnMini.style.cursor = 'pointer';

        if (isClockedIn) {
            statusMini.textContent = 'Clocked In';
            statusMini.className = 'time-status-mini clocked-in';
            btnMini.textContent = 'Time Out';
            btnMini.className = 'time-btn-mini clock-out';
        } else {
            statusMini.textContent = 'Not Clocked In';
            statusMini.className = 'time-status-mini not-clocked';
            btnMini.textContent = 'Time In';
            btnMini.className = 'time-btn-mini clock-in primary';
        }
    }

    function updateAdminTimeTrackingUI() {
        updateCurrentTimeDisplay();

        var statusSpan = document.getElementById('current-status');
        var timeInBtn = document.getElementById('time-in-btn');
        var timeOutBtn = document.getElementById('time-out-btn');
        var sessionTimeDiv = document.getElementById('session-time');
        var statusMessage = document.getElementById('time-status-message');
        var hasCard = statusSpan && timeInBtn && timeOutBtn && sessionTimeDiv && statusMessage;

        if (hasCard) {
            var status = window.adminTimeTrackingStatus || {};

            if (isClockedIn) {
                statusSpan.textContent = 'Clocked In';
                statusSpan.style.color = '#4CAF50';
                timeInBtn.style.display = 'none';
                timeInBtn.disabled = true;
                timeOutBtn.style.display = 'inline-block';
                timeOutBtn.disabled = status.canTimeOut === false;
                timeOutBtn.style.pointerEvents = 'auto';
                timeOutBtn.style.cursor = timeOutBtn.disabled ? 'not-allowed' : 'pointer';
                sessionTimeDiv.style.display = 'block';
                statusMessage.style.display = 'none';
            } else if (status.dailyCompleted) {
                statusSpan.textContent = 'Daily Time Log Completed';
                statusSpan.style.color = '#f44336';
                timeInBtn.style.display = 'inline-block';
                timeInBtn.disabled = true;
                timeInBtn.textContent = 'Time In (Daily Completed)';
                timeInBtn.style.background = 'rgba(158, 158, 158, 0.6)';
                timeInBtn.style.cursor = 'not-allowed';
                timeOutBtn.style.display = 'none';
                sessionTimeDiv.style.display = 'none';
                statusMessage.innerHTML = '<strong>You have already completed your time log for today.</strong> New time logs will be available tomorrow at 7 AM Philippine time.';
                statusMessage.style.display = 'block';
                statusMessage.style.color = '#f44336';
                statusMessage.style.background = '#ffebee';
                statusMessage.style.border = '1px solid #fecaca';
            } else {
                statusSpan.textContent = 'Not Clocked In';
                statusSpan.style.color = '#FF5722';
                timeInBtn.style.display = 'inline-block';
                timeInBtn.disabled = status.canTimeIn === false;
                timeInBtn.textContent = 'Time In';
                timeInBtn.style.background = '#28a745';
                timeInBtn.style.cursor = timeInBtn.disabled ? 'not-allowed' : 'pointer';
                timeInBtn.style.pointerEvents = 'auto';
                timeOutBtn.style.display = 'none';
                sessionTimeDiv.style.display = 'none';
                statusMessage.style.display = 'none';
            }
        }

        updateAdminTimeTrackingMini();
    }

    function startSessionTimer() {
        if (sessionTimer) clearInterval(sessionTimer);
        sessionTimer = setInterval(function () {
            if (!timeInSession) return;
            var dur = Date.now() - timeInSession.getTime();
            var h = Math.floor(dur / 3600000);
            var m = Math.floor((dur % 3600000) / 60000);
            var s = Math.floor((dur % 60000) / 1000);
            var el = document.getElementById('duration-display');
            if (el) {
                el.textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
            }
        }, 1000);
    }

    window.adminTimeIn = async function adminTimeIn() {
        var token = getToken();
        if (!token) {
            showAdminTimeMessage('Please log in again.', 'error');
            return;
        }
        var st = window.adminTimeTrackingStatus || {};
        if (st.dailyCompleted) {
            showAdminTimeMessage('Daily time log is already completed. It will refresh at 7 AM Philippine time.', 'warning');
            return;
        }
        if (st.isClockedIn) {
            showAdminTimeMessage('Already clocked in. Use Time Out when finished.', 'warning');
            return;
        }
        try {
            var res = await fetch('/api/admin/time-tracking/clock-in', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                credentials: 'include',
                body: '{}'
            });
            var data = await res.json().catch(function () { return {}; });
            if (res.ok && data.success) {
                timeInSession = new Date();
                isClockedIn = true;
                startSessionTimer();
                await loadAdminTimeTrackingStatus();
                showAdminTimeMessage('Successfully clocked in!', 'success');
                document.dispatchEvent(new CustomEvent('admin-refresh-notifications'));
            } else if (res.status === 404) {
                showAdminTimeMessage((data && data.error) || 'Time tracking API not found. Restart the Node server and hard-refresh.', 'error');
            } else {
                showAdminTimeMessage((data && (data.error || data.message)) || 'Failed to clock in', 'error');
            }
        } catch (e) {
            showAdminTimeMessage('Error clocking in.', 'error');
        }
    };

    window.adminTimeOut = async function adminTimeOut() {
        var token = getToken();
        if (!token) {
            showAdminTimeMessage('Please log in again.', 'error');
            return;
        }
        try {
            var res = await fetch('/api/admin/time-tracking/clock-out', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                credentials: 'include',
                body: '{}'
            });
            var data = await res.json().catch(function () { return {}; });
            if (res.ok && data.success) {
                timeInSession = null;
                isClockedIn = false;
                if (sessionTimer) {
                    clearInterval(sessionTimer);
                    sessionTimer = null;
                }
                await loadAdminTimeTrackingStatus();
                var hrs = data.timeLog && data.timeLog.totalHours != null ? data.timeLog.totalHours : '';
                showAdminTimeMessage(hrs !== '' ? ('Clocked out! Session: ' + hrs + ' hours') : 'Clocked out!', 'success');
                document.dispatchEvent(new CustomEvent('admin-refresh-notifications'));
            } else if (res.status === 404) {
                showAdminTimeMessage((data && data.error) || 'Time tracking API not found. Restart the Node server.', 'error');
            } else {
                showAdminTimeMessage((data && (data.error || data.message)) || 'Failed to clock out', 'error');
            }
        } catch (e) {
            showAdminTimeMessage('Error clocking out.', 'error');
        }
    };

    function renderAdminTimeLogRows(timeLogs) {
        if (!timeLogs || !timeLogs.length) {
            return '<div style="text-align:center;color:#888;padding:32px;">No entries for this period.</div>';
        }
        var html = '<table style="width:100%;border-collapse:collapse;font-size:0.9rem;"><thead><tr style="background:#f8f9fa;"><th style="padding:8px;text-align:left;">Date</th><th style="padding:8px;">In</th><th style="padding:8px;">Out</th><th style="padding:8px;">Hours</th></tr></thead><tbody>';
        timeLogs.forEach(function (log) {
            html += '<tr style="border-bottom:1px solid #eee;"><td style="padding:8px;">' + (log.date || '') + '</td><td style="padding:8px;">' + (log.clockIn && log.clockIn.time) + '</td><td style="padding:8px;">' + (log.clockOut ? log.clockOut.time : '—') + '</td><td style="padding:8px;">' + (log.totalHours != null ? log.totalHours : '—') + '</td></tr>';
        });
        html += '</tbody></table>';
        return html;
    }

    async function loadAdminTimeLogsWithFilter() {
        var content = document.getElementById('admin-time-log-content');
        var filterTypeEl = document.getElementById('admin-filter-type');
        if (!content || !filterTypeEl) return;
        var filterType = filterTypeEl.value;
        var token = getToken();
        if (!token) return;

        var startDate, endDate;
        var now = new Date();
        switch (filterType) {
            case 'week':
                var monday = new Date(now);
                monday.setDate(now.getDate() - now.getDay() + 1);
                var sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                startDate = monday.toISOString().split('T')[0];
                endDate = sunday.toISOString().split('T')[0];
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
                break;
            default:
                startDate = endDate = null;
        }

        content.innerHTML = '<div style="text-align:center;padding:24px;color:#888;">Loading…</div>';
        var url = '/api/admin/time-tracking/history';
        if (startDate && endDate) url += '?startDate=' + startDate + '&endDate=' + endDate;
        try {
            var res = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, credentials: 'include' });
            var data = await res.json();
            if (res.ok && data.timeLogs) {
                content.innerHTML = renderAdminTimeLogRows(data.timeLogs);
            } else {
                content.innerHTML = '<div style="color:#c00;padding:16px;">Could not load logs.</div>';
            }
        } catch (e) {
            content.innerHTML = '<div style="color:#c00;padding:16px;">Error loading logs.</div>';
        }
    }

    function adminTimeLogModalIsOpen(modal) {
        if (!modal) return false;
        return window.getComputedStyle(modal).display !== 'none';
    }

    window.showAdminTimeLogModal = function () {
        var modal = document.getElementById('admin-time-log-modal');
        if (!modal) {
            showAdminTimeMessage('Time log modal is missing on this page.', 'error');
            return;
        }
        modal.style.display = 'flex';
        var ft = document.getElementById('admin-filter-type');
        if (ft) ft.value = 'week';
        loadAdminTimeLogsWithFilter();
    };

    window.hideAdminTimeLogModal = function () {
        var modal = document.getElementById('admin-time-log-modal');
        if (modal) modal.style.display = 'none';
    };

    /** Public helpers for inline onclick on the dashboard card. */
    window.remoedAdminTimeInClick = function (ev) {
        if (ev) {
            ev.preventDefault();
            ev.stopPropagation();
        }
        var btn = document.getElementById('time-in-btn');
        if (btn && btn.disabled) return false;
        window.adminTimeIn();
        return false;
    };
    window.remoedAdminTimeOutClick = function (ev) {
        if (ev) {
            ev.preventDefault();
            ev.stopPropagation();
        }
        var btn = document.getElementById('time-out-btn');
        if (btn && btn.disabled) return false;
        window.adminTimeOut();
        return false;
    };
    window.remoedAdminViewLogsClick = function (ev) {
        if (ev) {
            ev.preventDefault();
            ev.stopPropagation();
        }
        window.showAdminTimeLogModal();
        return false;
    };

    function wireDelegatedClicksOnce() {
        if (document.body.getAttribute('data-admin-tt-delegated') === '1') return;
        document.body.setAttribute('data-admin-tt-delegated', '1');

        document.addEventListener('click', function (e) {
            var t = e.target;
            if (!t || !t.closest) return;

            var mini = t.closest('#time-btn-mini');
            if (mini) {
                if (mini.disabled) return;
                e.preventDefault();
                e.stopPropagation();
                var st = window.adminTimeTrackingStatus || {};
                if (st.isClockedIn || isClockedIn) window.adminTimeOut();
                else window.adminTimeIn();
                return;
            }

            if (t.closest('#time-in-btn')) {
                window.remoedAdminTimeInClick(e);
                return;
            }
            if (t.closest('#time-out-btn')) {
                window.remoedAdminTimeOutClick(e);
                return;
            }
            if (t.closest('#view-log-btn')) {
                window.remoedAdminViewLogsClick(e);
            }
        }, true);
    }

    function wireCardModalOnce() {
        if (document.body.getAttribute('data-admin-tt-modal') === '1') return;
        if (!document.getElementById('admin-time-log-modal')) return;
        document.body.setAttribute('data-admin-tt-modal', '1');

        var closeBtn = document.getElementById('admin-close-time-log');
        if (closeBtn) closeBtn.addEventListener('click', window.hideAdminTimeLogModal);

        var applyBtn = document.getElementById('admin-apply-filter');
        if (applyBtn) applyBtn.addEventListener('click', loadAdminTimeLogsWithFilter);

        var modal = document.getElementById('admin-time-log-modal');
        if (modal) {
            window.hideAdminTimeLogModal();
            modal.addEventListener('click', function (e) {
                if (e.target === modal) window.hideAdminTimeLogModal();
            });
            var panel = document.getElementById('admin-time-log-modal-panel');
            if (panel) {
                panel.addEventListener('click', function (e) {
                    e.stopPropagation();
                });
            }
        }

        document.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Escape') return;
            var m = document.getElementById('admin-time-log-modal');
            if (adminTimeLogModalIsOpen(m)) window.hideAdminTimeLogModal();
        });
    }

    window.initAdminTimeTracking = function () {
        var hasCard = !!document.getElementById('admin-time-tracking-card');
        var hasMini = !!document.getElementById('time-btn-mini');
        if (!hasCard && !hasMini) return;

        wireDelegatedClicksOnce();
        wireCardModalOnce();

        if (!clockDisplayStarted) {
            clockDisplayStarted = true;
            updateCurrentTimeDisplay();
            setInterval(updateCurrentTimeDisplay, 1000);
        } else {
            updateCurrentTimeDisplay();
        }

        if (!statusPollStarted) {
            statusPollStarted = true;
            // Status only — never auto clock-in.
            loadAdminTimeTrackingStatus();
            setInterval(loadAdminTimeTrackingStatus, 5 * 60 * 1000);
        } else {
            updateAdminTimeTrackingUI();
            wireCardModalOnce();
        }
    };

    window.AdminTimeTracking = {
        refresh: loadAdminTimeTrackingStatus,
        init: window.initAdminTimeTracking
    };

    function boot() {
        window.initAdminTimeTracking();
        // Card/modal may appear after header early-load.
        setTimeout(window.initAdminTimeTracking, 0);
        setTimeout(window.initAdminTimeTracking, 400);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
