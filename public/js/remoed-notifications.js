/**
 * Shared notification bell helpers for student / teacher portals.
 * Deep links, actionable badge, day groups, relative time, Unread/All filter, snooze, 31-day note.
 */
(function (global) {
  'use strict';

  var FILTER_KEY = 'remoed_notif_filter';

  function unwrapList(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.notifications)) return data.notifications;
    return [];
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function authHeaders(token) {
    return {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    };
  }

  function isActionable(n) {
    if (!n) return false;
    if (n.actionable === true || n.importance === 'actionable') return true;
    var t = String(n.type || '');
    return (
      t === 'booking' ||
      t === 'cancel' ||
      t === 'reminder' ||
      t === 'reschedule-available' ||
      t === 'schedule-change' ||
      t === 'absent' ||
      t === 'credits-low' ||
      t === 'credits-topup' ||
      t === 'credits-expiring' ||
      t === 'credits-expired' ||
      t === 'trial-ending' ||
      t === 'teacher-joined' ||
      t === 'teacher-late' ||
      t === 'peer-message' ||
      t === 'cancellation-request'
    );
  }

  function relativeTime(iso) {
    if (!iso) return '';
    var t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    var diff = Date.now() - t;
    var abs = Math.abs(diff);
    var mins = Math.round(abs / 60000);
    if (mins < 1) return diff >= 0 ? 'just now' : 'in <1 min';
    if (mins < 60) return diff >= 0 ? mins + 'm ago' : 'in ' + mins + ' min';
    var hrs = Math.round(mins / 60);
    if (hrs < 24) return diff >= 0 ? hrs + 'h ago' : 'in ' + hrs + 'h';
    var days = Math.round(hrs / 24);
    return diff >= 0 ? days + 'd ago' : 'in ' + days + 'd';
  }

  function dayLabel(iso) {
    if (!iso) return 'Earlier';
    var d = new Date(iso);
    var today = new Date();
    var yday = new Date();
    yday.setDate(today.getDate() - 1);
    function sameDay(a, b) {
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }
    if (sameDay(d, today)) return 'Today';
    if (sameDay(d, yday)) return 'Yesterday';
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  }

  function joinNotificationSocket(role, identity) {
    try {
      if (!global.io || typeof global.io !== 'function') return null;
      var socket = global.__remoedNotifSocket;
      if (!socket) {
        socket = global.io({ transports: ['websocket', 'polling'] });
        global.__remoedNotifSocket = socket;
      }
      var payload = { role: role };
      if (role === 'teacher') payload.teacherId = identity;
      else if (role === 'student') payload.username = identity;
      else payload.username = identity;
      socket.emit('join-notifications', payload);
      return socket;
    } catch (_e) {
      return null;
    }
  }

  function getFilter() {
    try {
      return localStorage.getItem(FILTER_KEY) || 'all';
    } catch (_e) {
      return 'all';
    }
  }

  function setFilter(v) {
    try {
      localStorage.setItem(FILTER_KEY, v);
    } catch (_e) {}
  }

  function renderItems(contentEl, list, opts) {
    opts = opts || {};
    if (!contentEl) return;
    var role = opts.role || 'student';
    var retention = opts.retentionDays || 31;
    var filter = opts.filter || getFilter();
    var items = (list || []).slice();
    if (filter === 'unread') items = items.filter(function (n) { return !n.read; });
    if (filter === 'actionable') items = items.filter(function (n) { return isActionable(n) && !n.read; });

    var toolbar =
      '<div class="remoed-notif-toolbar" style="display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap;">' +
      '<button type="button" data-notif-filter="all" class="remoed-notif-filter' +
      (filter === 'all' ? ' is-active' : '') +
      '" style="font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid #cbd5e1;background:' +
      (filter === 'all' ? '#e2e8f0' : '#fff') +
      ';cursor:pointer;">All</button>' +
      '<button type="button" data-notif-filter="unread" class="remoed-notif-filter' +
      (filter === 'unread' ? ' is-active' : '') +
      '" style="font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid #cbd5e1;background:' +
      (filter === 'unread' ? '#e2e8f0' : '#fff') +
      ';cursor:pointer;">Unread</button>' +
      '<button type="button" data-notif-filter="actionable" class="remoed-notif-filter' +
      (filter === 'actionable' ? ' is-active' : '') +
      '" style="font-size:11px;padding:4px 8px;border-radius:6px;border:1px solid #cbd5e1;background:' +
      (filter === 'actionable' ? '#e2e8f0' : '#fff') +
      ';cursor:pointer;">Action</button>' +
      '</div>';

    if (!items.length) {
      contentEl.innerHTML =
        toolbar +
        '<div class="nav-dropdown-item">No notifications' +
        (filter !== 'all' ? ' in this filter' : ' yet') +
        '.</div>' +
        '<div class="remoed-notif-footer" style="padding:8px 12px;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">' +
        '<span>Showing last ' +
        retention +
        ' days</span>' +
        '<button type="button" data-notif-prefs="1" style="border:none;background:transparent;color:#0369a1;cursor:pointer;padding:0;font-size:11px;">Preferences</button>' +
        '</div>';
      return;
    }

    var limited = items.slice(0, opts.limit || 12);
    var html = toolbar;
    var lastDay = '';
    limited.forEach(function (n) {
      var day = dayLabel(n.createdAt);
      if (day !== lastDay) {
        lastDay = day;
        html +=
          '<div style="padding:6px 12px 2px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">' +
          escapeHtml(day) +
          '</div>';
      }
      var msg = escapeHtml(n.message || 'Notification');
      var time = relativeTime(n.createdAt);
      var href = n.actionUrl ? String(n.actionUrl) : '';
      if (n.bookingId && href && href.indexOf('bookingId=') < 0 && href.indexOf('waiting-room') >= 0) {
        href += (href.indexOf('?') >= 0 ? '&' : '?') + 'bookingId=' + encodeURIComponent(n.bookingId);
      }
      var id = n._id || n.id || '';
      var actionable = isActionable(n);
      var pill = actionable
        ? '<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:1px 6px;border-radius:999px;">Action</span>'
        : '<span style="font-size:10px;background:#f1f5f9;color:#475569;padding:1px 6px;border-radius:999px;">FYI</span>';
      var snooze =
        n.type === 'reminder' && id
          ? '<button type="button" data-notif-snooze="' +
            escapeHtml(id) +
            '" style="margin-top:4px;font-size:11px;border:none;background:transparent;color:#0369a1;cursor:pointer;padding:0;">Remind again in 5 min</button>'
          : '';
      var inner =
        '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">' +
        '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:0.9rem;">' +
        msg +
        '</div>' +
        '<div style="font-size:0.75rem;color:#64748b;margin-top:2px;">' +
        escapeHtml(time) +
        '</div>' +
        snooze +
        '</div>' +
        pill +
        '</div>';

      var cls = 'nav-dropdown-item' + (n.read ? ' read' : '');
      var dataAttrs =
        ' data-id="' +
        escapeHtml(id) +
        '" data-action-url="' +
        escapeHtml(href) +
        '" data-role="' +
        escapeHtml(role) +
        '"';

      if (href) {
        html +=
          '<a class="' +
          cls +
          '" href="' +
          escapeHtml(href) +
          '"' +
          dataAttrs +
          ' style="display:block;text-decoration:none;color:inherit;">' +
          inner +
          '</a>';
      } else {
        html += '<div class="' + cls + '"' + dataAttrs + '>' + inner + '</div>';
      }
    });

    html +=
      '<div class="remoed-notif-footer" style="padding:8px 12px;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">' +
      '<span>Showing last ' +
      retention +
      ' days</span>' +
      '<button type="button" data-notif-prefs="1" style="border:none;background:transparent;color:#0369a1;cursor:pointer;padding:0;font-size:11px;">Preferences</button>' +
      '</div>';
    contentEl.innerHTML = html;
  }

  function setBadge(badgeEl, unread) {
    if (!badgeEl) return;
    var n = Number(unread) || 0;
    badgeEl.textContent = String(n);
    badgeEl.style.display = n > 0 ? 'flex' : 'none';
  }

  function badgeCountFromPayload(data, list) {
    if (data && typeof data.actionableUnreadCount === 'number') return data.actionableUnreadCount;
    var items = list || unwrapList(data);
    return items.filter(function (n) {
      return !n.read && isActionable(n);
    }).length;
  }

  function openPrefsModal(role, getToken, onRefresh) {
    var apiBase = role === 'teacher' ? '/api/teacher' : '/api/student';
    var token = getToken();
    if (!token) return;
    fetch(apiBase + '/notification-prefs', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        var p = (data && data.prefs) || {};
        var existing = document.getElementById('remoed-notif-prefs-modal');
        if (existing) existing.remove();
        var modal = document.createElement('div');
        modal.id = 'remoed-notif-prefs-modal';
        modal.style.cssText =
          'position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:4000;display:flex;align-items:center;justify-content:center;padding:16px;';
        var fields =
          role === 'teacher'
            ? [
                ['reminders', 'Class reminders'],
                ['announcements', 'Announcements'],
                ['peerMessages', 'Peer messages'],
                ['salary', 'Salary notices'],
                ['digestEmail', 'Daily email digest'],
                ['quietHoursEnabled', 'Quiet hours (FYI only)'],
              ]
            : [
                ['reminders', 'Class reminders'],
                ['announcements', 'Announcements'],
                ['credits', 'Credit / payment alerts'],
                ['digestEmail', 'Daily email digest'],
                ['quietHoursEnabled', 'Quiet hours (FYI only)'],
              ];
        var checks = fields
          .map(function (f) {
            return (
              '<label style="display:flex;gap:8px;align-items:center;margin:8px 0;font-size:14px;">' +
              '<input type="checkbox" data-pref="' +
              f[0] +
              '"' +
              (p[f[0]] ? ' checked' : '') +
              '> ' +
              f[1] +
              '</label>'
            );
          })
          .join('');
        modal.innerHTML =
          '<div style="background:#fff;border-radius:12px;max-width:420px;width:100%;padding:20px;box-shadow:0 20px 50px rgba(0,0,0,0.2);">' +
          '<h3 style="margin:0 0 12px;font-size:18px;">Notification preferences</h3>' +
          checks +
          '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">' +
          '<button type="button" data-close="1" style="padding:8px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer;">Cancel</button>' +
          '<button type="button" data-save="1" style="padding:8px 12px;border:none;border-radius:8px;background:#0ea5e9;color:#fff;cursor:pointer;">Save</button>' +
          '</div></div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', function (ev) {
          if (ev.target === modal || ev.target.getAttribute('data-close') === '1') modal.remove();
          if (ev.target.getAttribute('data-save') === '1') {
            var body = {};
            modal.querySelectorAll('[data-pref]').forEach(function (input) {
              body[input.getAttribute('data-pref')] = !!input.checked;
            });
            fetch(apiBase + '/notification-prefs', {
              method: 'PATCH',
              headers: authHeaders(token),
              body: JSON.stringify(body),
            })
              .then(function () {
                modal.remove();
                onRefresh();
              })
              .catch(function () {
                modal.remove();
              });
          }
        });
      })
      .catch(function () {});
  }

  function bindDropdownExtras(dropdown, opts) {
    if (!dropdown || dropdown.getAttribute('data-remoed-notif-extras') === '1') return;
    dropdown.setAttribute('data-remoed-notif-extras', '1');
    var role = (opts && opts.role) || 'student';
    var apiBase = role === 'teacher' ? '/api/teacher' : '/api/student';
    var getToken = (opts && opts.getToken) || function () { return ''; };
    var onRefresh = (opts && opts.onRefresh) || function () {};

    dropdown.addEventListener('click', function (e) {
      var prefsBtn = e.target.closest('[data-notif-prefs]');
      if (prefsBtn) {
        e.preventDefault();
        e.stopPropagation();
        openPrefsModal(role, getToken, onRefresh);
        return;
      }

      var filterBtn = e.target.closest('[data-notif-filter]');
      if (filterBtn) {
        e.preventDefault();
        e.stopPropagation();
        setFilter(filterBtn.getAttribute('data-notif-filter') || 'all');
        onRefresh();
        return;
      }

      var snoozeBtn = e.target.closest('[data-notif-snooze]');
      if (snoozeBtn) {
        e.preventDefault();
        e.stopPropagation();
        var sid = snoozeBtn.getAttribute('data-notif-snooze');
        var token = getToken();
        if (!sid || !token) return;
        fetch(apiBase + '/notifications/' + encodeURIComponent(sid) + '/snooze', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({ minutes: 5 }),
        })
          .then(function () {
            onRefresh();
          })
          .catch(function () {});
        return;
      }

      var item = e.target.closest('[data-id]');
      if (!item) return;
      var id = item.getAttribute('data-id');
      var token2 = getToken();
      if (!id || !token2) return;
      // Mark read; navigation follows <a href> naturally
      fetch(apiBase + '/notifications/' + encodeURIComponent(id) + '/mark-read', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + token2 },
      }).catch(function () {});
    });
  }

  global.RemoedNotifications = {
    unwrapList: unwrapList,
    escapeHtml: escapeHtml,
    authHeaders: authHeaders,
    joinNotificationSocket: joinNotificationSocket,
    renderItems: renderItems,
    setBadge: setBadge,
    badgeCountFromPayload: badgeCountFromPayload,
    bindDropdownExtras: bindDropdownExtras,
    getFilter: getFilter,
    setFilter: setFilter,
    isActionable: isActionable,
    relativeTime: relativeTime,
  };
})(typeof window !== 'undefined' ? window : this);
