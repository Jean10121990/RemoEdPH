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
        if (!confirm('Clock out now? This ends your shift for today (until 7 AM Philippine time). Only continue if your shift is finished.')) {
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

    function isSuperAdminClient() {
        try {
            return String(localStorage.getItem('adminRole') || '').trim().toLowerCase() === 'super_admin';
        } catch (e) {
            return false;
        }
    }

    function toTimeInputValue(labelOrTs) {
        if (!labelOrTs) return '';
        if (labelOrTs instanceof Date || (typeof labelOrTs === 'string' && labelOrTs.indexOf('T') >= 0)) {
            var d = new Date(labelOrTs);
            if (Number.isNaN(d.getTime())) return '';
            var parts = new Intl.DateTimeFormat('en-GB', {
                timeZone: 'Asia/Manila',
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            }).formatToParts(d);
            var hh = '00';
            var mm = '00';
            parts.forEach(function (p) {
                if (p.type === 'hour') hh = p.value;
                if (p.type === 'minute') mm = p.value;
            });
            return hh + ':' + mm;
        }
        var s = String(labelOrTs).trim();
        var m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
        if (!m) return '';
        var h = Number(m[1]);
        var min = m[2];
        var ap = (m[3] || '').toUpperCase();
        if (ap === 'PM' && h < 12) h += 12;
        if (ap === 'AM' && h === 12) h = 0;
        return String(h).padStart(2, '0') + ':' + min;
    }

    function renderAdminTimeLogRows(timeLogs, manageMode) {
        if (!timeLogs || !timeLogs.length) {
            return '<div style="text-align:center;color:#888;padding:32px;">No entries for this period.</div>';
        }
        var html = '<table style="width:100%;border-collapse:collapse;font-size:0.9rem;"><thead><tr style="background:#f8f9fa;">';
        if (manageMode) html += '<th style="padding:8px;text-align:left;">Admin</th>';
        html += '<th style="padding:8px;text-align:left;">Date</th><th style="padding:8px;">In</th><th style="padding:8px;">Out</th><th style="padding:8px;">Hours</th><th style="padding:8px;">Status</th>';
        if (manageMode) html += '<th style="padding:8px;">Actions</th>';
        html += '</tr></thead><tbody>';
        timeLogs.forEach(function (log) {
            var outLabel = log.clockOut && log.clockOut.time ? log.clockOut.time : '—';
            var status = log.status === 'clocked-in' ? 'Open' : 'Completed';
            var statusColor = log.status === 'clocked-in' ? '#27ae60' : '#64748b';
            html += '<tr style="border-bottom:1px solid #eee;">';
            if (manageMode) {
                html += '<td style="padding:8px;">' + (log.adminUsername || '') + '</td>';
            }
            html +=
                '<td style="padding:8px;">' + (log.date || '') + '</td>' +
                '<td style="padding:8px;">' + (log.clockIn && log.clockIn.time ? log.clockIn.time : '—') + '</td>' +
                '<td style="padding:8px;">' + outLabel + '</td>' +
                '<td style="padding:8px;">' + (log.totalHours != null ? log.totalHours : '—') + '</td>' +
                '<td style="padding:8px;color:' + statusColor + ';font-weight:600;">' + status + '</td>';
            if (manageMode) {
                html +=
                    '<td style="padding:8px;white-space:nowrap;">' +
                    (log.status === 'clocked-out'
                        ? '<button type="button" class="admin-tt-reopen" data-id="' + log._id + '" style="padding:4px 8px;margin:2px;border:none;border-radius:6px;background:#f59e0b;color:#fff;font-weight:600;cursor:pointer;font-size:0.78rem;">Reopen shift</button>'
                        : '') +
                    '<button type="button" class="admin-tt-edit" data-id="' + log._id + '" data-in="' + toTimeInputValue((log.clockIn && log.clockIn.timestamp) || (log.clockIn && log.clockIn.time)) + '" data-out="' + toTimeInputValue((log.clockOut && log.clockOut.timestamp) || (log.clockOut && log.clockOut.time)) + '" style="padding:4px 8px;margin:2px;border:none;border-radius:6px;background:#1ca7e7;color:#fff;font-weight:600;cursor:pointer;font-size:0.78rem;">Edit times</button>' +
                    '</td>';
            }
            html += '</tr>';
        });
        html += '</tbody></table>';
        return html;
    }

    async function loadAdminFilterOptionsForLogs() {
        var sel = document.getElementById('admin-log-username-filter');
        if (!sel || sel.getAttribute('data-loaded') === '1') return;
        var token = getToken();
        if (!token) return;
        try {
            var res = await fetch('/api/admin/admin-fee/admins-filter-list', {
                headers: { Authorization: 'Bearer ' + token },
                credentials: 'include'
            });
            var data = await res.json().catch(function () { return {}; });
            if (!res.ok || !data.success) return;
            sel.innerHTML = '<option value="">All admins</option>';
            (data.admins || []).forEach(function (a) {
                var opt = document.createElement('option');
                opt.value = a.username;
                opt.textContent = a.username + (a.role ? ' (' + a.role + ')' : '');
                sel.appendChild(opt);
            });
            sel.setAttribute('data-loaded', '1');
        } catch (e) {
            console.warn('Admin log filter load failed', e);
        }
    }

    async function patchAdminTimeLog(id, body) {
        var token = getToken();
        if (!token) throw new Error('Please log in again.');
        var res = await fetch('/api/admin/time-tracking/logs/' + encodeURIComponent(id), {
            method: 'PATCH',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body || {})
        });
        var data = await res.json().catch(function () { return {}; });
        if (!res.ok || !data.success) {
            throw new Error((data && (data.error || data.message)) || 'Update failed');
        }
        return data;
    }

    async function loadAdminTimeLogsWithFilter() {
        var content = document.getElementById('admin-time-log-content');
        var filterTypeEl = document.getElementById('admin-filter-type');
        if (!content || !filterTypeEl) return;
        var filterType = filterTypeEl.value;
        var token = getToken();
        if (!token) return;
        var manageMode = isSuperAdminClient();

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
        var url;
        var params = new URLSearchParams();
        if (startDate && endDate) {
            params.set('startDate', startDate);
            params.set('endDate', endDate);
        }
        if (manageMode) {
            var un = document.getElementById('admin-log-username-filter');
            if (un && un.value) params.set('username', un.value);
            url = '/api/admin/time-tracking/manage' + (params.toString() ? '?' + params.toString() : '');
        } else {
            url = '/api/admin/time-tracking/history' + (params.toString() ? '?' + params.toString() : '');
        }
        try {
            var res = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, credentials: 'include' });
            var data = await res.json();
            if (res.ok && data.timeLogs) {
                content.innerHTML = renderAdminTimeLogRows(data.timeLogs, manageMode);
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
        var manageWrap = document.getElementById('admin-log-manage-filters');
        var hint = document.getElementById('admin-log-super-hint');
        if (isSuperAdminClient()) {
            if (manageWrap) manageWrap.style.display = 'inline-flex';
            if (hint) hint.style.display = 'block';
            loadAdminFilterOptionsForLogs();
        } else {
            if (manageWrap) manageWrap.style.display = 'none';
            if (hint) hint.style.display = 'none';
        }
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
                    if (e.target === panel) return;
                    e.stopPropagation();
                });
            }

            var contentEl = document.getElementById('admin-time-log-content');
            if (contentEl) {
                contentEl.addEventListener('click', function (e) {
                    var t = e.target;
                    if (!t || !t.closest) return;
                    var reopenBtn = t.closest('.admin-tt-reopen');
                    if (reopenBtn) {
                        e.preventDefault();
                        e.stopPropagation();
                        var rid = reopenBtn.getAttribute('data-id');
                        if (!rid) return;
                        if (!confirm('Reopen this shift? The admin will be clocked in again and can Time Out when finished.')) return;
                        reopenBtn.disabled = true;
                        patchAdminTimeLog(rid, { action: 'reopen', note: 'Accidental Time Out correction' })
                            .then(function (data) {
                                showAdminTimeMessage(data.message || 'Shift reopened', 'success');
                                loadAdminTimeLogsWithFilter();
                                loadAdminTimeTrackingStatus();
                            })
                            .catch(function (err) {
                                showAdminTimeMessage(err.message || 'Reopen failed', 'error');
                                reopenBtn.disabled = false;
                            });
                        return;
                    }
                    var editBtn = t.closest('.admin-tt-edit');
                    if (editBtn) {
                        e.preventDefault();
                        e.stopPropagation();
                        var eid = editBtn.getAttribute('data-id');
                        if (!eid) return;
                        var defIn = editBtn.getAttribute('data-in') || '09:00';
                        var defOut = editBtn.getAttribute('data-out') || '';
                        var newIn = window.prompt('Clock In (HH:MM, Philippine time):', defIn);
                        if (newIn == null) return;
                        newIn = String(newIn).trim();
                        if (!/^\d{1,2}:\d{2}$/.test(newIn)) {
                            showAdminTimeMessage('Use HH:MM for clock in (e.g. 09:00)', 'warning');
                            return;
                        }
                        var newOut = window.prompt(
                            'Clock Out (HH:MM), or leave blank to keep the shift open (reopened):',
                            defOut
                        );
                        if (newOut == null) return;
                        newOut = String(newOut).trim();
                        var body = { action: 'edit', clockIn: newIn, note: 'Manual time correction' };
                        if (!newOut) body.clockOut = null;
                        else if (!/^\d{1,2}:\d{2}$/.test(newOut)) {
                            showAdminTimeMessage('Use HH:MM for clock out (e.g. 17:00)', 'warning');
                            return;
                        } else body.clockOut = newOut;
                        editBtn.disabled = true;
                        patchAdminTimeLog(eid, body)
                            .then(function (data) {
                                showAdminTimeMessage(data.message || 'Log updated', 'success');
                                loadAdminTimeLogsWithFilter();
                                loadAdminTimeTrackingStatus();
                            })
                            .catch(function (err) {
                                showAdminTimeMessage(err.message || 'Edit failed', 'error');
                                editBtn.disabled = false;
                            });
                    }
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
