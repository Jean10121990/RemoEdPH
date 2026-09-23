/**
 * Admin notification bell — works on every admin page (including after portal
 * layout moves .nav-right into the phone top bar). Uses event delegation so
 * clicks still work when the icon node is re-parented.
 */
(function (global) {
    'use strict';

    var pollTimer = null;
    var wired = false;

    function getAdminToken() {
        if (global.RemoedAdminSession && RemoedAdminSession.getAuthToken) {
            return RemoedAdminSession.getAuthToken();
        }
        return (
            localStorage.getItem('remoed_admin_token') ||
            localStorage.getItem('remoed_admin_auth') ||
            localStorage.getItem('adminToken') ||
            sessionStorage.getItem('remoed_admin_token') ||
            sessionStorage.getItem('remoed_admin_auth') ||
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

    function ensureDropdownCss() {
        if (document.getElementById('admin-notif-dropdown-css')) return;
        var style = document.createElement('style');
        style.id = 'admin-notif-dropdown-css';
        style.textContent =
            '#admin-notifications-dropdown{display:none;position:absolute;top:calc(100% + 8px);right:0;' +
            'width:min(360px,calc(100vw - 24px));max-height:420px;overflow:auto;background:#fff;' +
            'border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 8px 24px rgba(15,23,42,.16);' +
            'z-index:var(--z-dropdown,400);}' +
            '#admin-notifications-dropdown.show{display:block!important;}' +
            '#admin-notifications-icon{cursor:pointer;position:relative;}' +
            '#admin-notifications-badge{pointer-events:none;}';
        document.head.appendChild(style);
    }

    function setDropdownOpen(dropdown, open) {
        if (!dropdown) return;
        if (typeof global.remoedSetNavDropdownOpen === 'function') {
            global.remoedSetNavDropdownOpen(dropdown, open);
            return;
        }
        dropdown.classList.toggle('show', !!open);
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
                headers: { Authorization: 'Bearer ' + token },
                credentials: 'include'
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
        } catch (error) {
            console.error('Error loading admin notifications:', error);
        }
    }

    function init() {
        ensureDropdownCss();

        // Ensure portal dropdown helper is available when possible
        if (typeof global.remoedSetNavDropdownOpen !== 'function') {
            try {
                if (!document.querySelector('script[data-remoed-notif-helper]')) {
                    var s = document.createElement('script');
                    s.src = 'js/remoed-notifications.js';
                    s.async = true;
                    s.setAttribute('data-remoed-notif-helper', '1');
                    document.head.appendChild(s);
                }
            } catch (_e) {}
        }

        if (!wired) {
            wired = true;
            document.addEventListener(
                'click',
                function (event) {
                    var icon = event.target && event.target.closest
                        ? event.target.closest('#admin-notifications-icon')
                        : null;
                    var dropdown = document.getElementById('admin-notifications-dropdown');
                    var markAll = event.target && event.target.closest
                        ? event.target.closest('#admin-notifications-mark-read')
                        : null;
                    var item = event.target && event.target.closest
                        ? event.target.closest('.admin-notif-item')
                        : null;

                    if (markAll) {
                        event.preventDefault();
                        event.stopPropagation();
                        (async function () {
                            var token = getAdminToken();
                            if (!token) return;
                            try {
                                var r = await fetch('/api/admin/notifications/mark-all-read', {
                                    method: 'PATCH',
                                    headers: {
                                        Authorization: 'Bearer ' + token,
                                        'Content-Type': 'application/json'
                                    },
                                    credentials: 'include'
                                });
                                if (r.ok) await loadAdminNotifications();
                            } catch (err) {
                                console.error('Mark all read failed:', err);
                            }
                        })();
                        return;
                    }

                    if (item) {
                        event.stopPropagation();
                        (async function () {
                            var id = item.getAttribute('data-id');
                            var token = getAdminToken();
                            if (!id || !token) return;
                            if (item.getAttribute('data-read') === '1') return;
                            try {
                                await fetch('/api/admin/notifications/' + id + '/read', {
                                    method: 'PATCH',
                                    headers: {
                                        Authorization: 'Bearer ' + token,
                                        'Content-Type': 'application/json'
                                    },
                                    credentials: 'include'
                                });
                                await loadAdminNotifications();
                            } catch (err) {
                                console.error(err);
                            }
                        })();
                        return;
                    }

                    if (icon) {
                        event.preventDefault();
                        event.stopPropagation();
                        dropdown = document.getElementById('admin-notifications-dropdown');
                        if (!dropdown) return;
                        // Keep dropdown under the icon if layout moved the chip
                        if (dropdown.parentElement !== icon) {
                            try {
                                icon.appendChild(dropdown);
                            } catch (_e2) {}
                        }
                        var open = !dropdown.classList.contains('show');
                        setDropdownOpen(dropdown, open);
                        if (open) loadAdminNotifications();
                        return;
                    }

                    // Outside click — close
                    dropdown = document.getElementById('admin-notifications-dropdown');
                    if (dropdown && dropdown.classList.contains('show')) {
                        if (dropdown.contains(event.target)) return;
                        setDropdownOpen(dropdown, false);
                    }
                },
                true
            );
        }

        loadAdminNotifications();
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(loadAdminNotifications, 60000);
    }

    global.loadAdminNotifications = loadAdminNotifications;
    global.AdminNotifications = {
        init: init,
        load: loadAdminNotifications
    };

    // Auto-init when DOM is ready (covers pages that forget to call init)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(init, 0);
        });
    } else {
        setTimeout(init, 0);
    }
})(typeof window !== 'undefined' ? window : this);
