/**
 * Admin notification bell — shared across all admin pages (dashboard, hubs, tools).
 */
(function (global) {
    'use strict';

    var pollTimer = null;

    function getAdminToken() {
        if (global.RemoedAdminSession && RemoedAdminSession.getAuthToken) {
            return RemoedAdminSession.getAuthToken();
        }
        return (
            localStorage.getItem('remoed_admin_auth') ||
            localStorage.getItem('remoed_admin_token') ||
            localStorage.getItem('adminToken') ||
            sessionStorage.getItem('remoed_admin_auth') ||
            sessionStorage.getItem('remoed_admin_token') ||
            sessionStorage.getItem('adminToken') ||
            ''
        );
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/"/g, '&quot;');
    }

    async function loadAdminNotifications() {
        try {
            var token = getAdminToken();
            var badge = document.getElementById('admin-notifications-badge');
            var container = document.getElementById('admin-notifications-dropdown-content');
            if (!badge || !container) return;

            if (!token) {
                badge.style.display = 'none';
                container.innerHTML = '<div class="nav-dropdown-item">Sign in to see notifications</div>';
                return;
            }

            var response = await fetch('/api/admin/notifications', {
                headers: { Authorization: 'Bearer ' + token }
            });
            var data = response.ok ? await response.json() : null;

            if (!response.ok || !data || !data.success) {
                badge.style.display = 'none';
                container.innerHTML = '<div class="nav-dropdown-item">Could not load notifications</div>';
                return;
            }

            var unread =
                typeof data.unreadCount === 'number'
                    ? data.unreadCount
                    : (data.notifications || []).filter(function (n) {
                          return !n.read;
                      }).length;
            badge.textContent = unread > 99 ? '99+' : String(unread);
            badge.style.display = unread > 0 ? 'flex' : 'none';

            var list = (data.notifications || []).slice(0, 15);
            if (!list.length) {
                container.innerHTML = '<div class="nav-dropdown-item">No notifications yet</div>';
                return;
            }

            container.innerHTML = list
                .map(function (n) {
                    var time = n.createdAt ? new Date(n.createdAt).toLocaleString() : '';
                    var type = String(n.type || 'info').replace(/-/g, ' ');
                    var unreadStyle = !n.read ? 'font-weight:600;background:#f0f9ff;' : '';
                    return (
                        '<div class="nav-dropdown-item admin-notif-item" data-id="' +
                        escapeHtml(n._id) +
                        '" data-read="' +
                        (n.read ? '1' : '0') +
                        '" style="' +
                        unreadStyle +
                        'cursor:pointer;padding:10px 12px;border-bottom:1px solid #f1f5f9;">' +
                        '<div style="font-size:0.85rem;">' +
                        escapeHtml(n.message) +
                        '</div>' +
                        '<div style="font-size:0.7rem;color:#64748b;margin-top:4px;text-transform:capitalize;">' +
                        escapeHtml(type) +
                        ' • ' +
                        escapeHtml(time) +
                        '</div>' +
                        '</div>'
                    );
                })
                .join('');

            container.querySelectorAll('.admin-notif-item').forEach(function (el) {
                el.addEventListener('click', async function (e) {
                    e.stopPropagation();
                    var id = el.getAttribute('data-id');
                    if (!id) return;
                    if (el.getAttribute('data-read') !== '1') {
                        try {
                            await fetch('/api/admin/notifications/' + id + '/read', {
                                method: 'PATCH',
                                headers: {
                                    Authorization: 'Bearer ' + token,
                                    'Content-Type': 'application/json'
                                }
                            });
                            await loadAdminNotifications();
                        } catch (err) {
                            console.error(err);
                        }
                    }
                });
            });
        } catch (error) {
            console.error('Error loading admin notifications:', error);
        }
    }

    function init() {
        if (document.body.getAttribute('data-admin-notif-init') === '1') return;
        var icon = document.getElementById('admin-notifications-icon');
        var dropdown = document.getElementById('admin-notifications-dropdown');
        if (!icon || !dropdown) return;
        document.body.setAttribute('data-admin-notif-init', '1');

        icon.addEventListener('click', function (event) {
            event.stopPropagation();
            dropdown.classList.toggle('show');
            if (dropdown.classList.contains('show')) {
                loadAdminNotifications();
            }
        });

        dropdown.addEventListener('click', function (e) {
            e.stopPropagation();
        });

        document.addEventListener('click', function () {
            dropdown.classList.remove('show');
        });

        var markAllBtn = document.getElementById('admin-notifications-mark-read');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', async function (e) {
                e.stopPropagation();
                var token = getAdminToken();
                if (!token) return;
                try {
                    var r = await fetch('/api/admin/notifications/mark-all-read', {
                        method: 'PATCH',
                        headers: {
                            Authorization: 'Bearer ' + token,
                            'Content-Type': 'application/json'
                        }
                    });
                    if (r.ok) await loadAdminNotifications();
                } catch (err) {
                    console.error('Mark all read failed:', err);
                }
            });
        }

        document.addEventListener('admin-refresh-notifications', function () {
            loadAdminNotifications();
        });

        loadAdminNotifications();
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(loadAdminNotifications, 60000);
    }

    global.loadAdminNotifications = loadAdminNotifications;
    global.AdminNotifications = {
        init: init,
        load: loadAdminNotifications
    };
})(typeof window !== 'undefined' ? window : this);
