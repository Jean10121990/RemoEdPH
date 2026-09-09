/**
 * Client-side mirror of server classroom entry rules (for UI; server is authoritative).
 */
(function (global) {
  var EARLY_MIN = 10;
  var EARLY_MS = EARLY_MIN * 60 * 1000;
  var FINISH_MIN = 15;
  var FINISH_MS = FINISH_MIN * 60 * 1000;

  function getScheduledStartMs(booking) {
    if (!booking) return null;
    var fromApi = booking.scheduledStartTime != null ? booking.scheduledStartTime : booking.dateTimeUtc;
    if (fromApi != null && String(fromApi).trim() !== '') {
      var s = String(fromApi).trim();
      if (s && !/Z$/i.test(s)) s += 'Z';
      var t = new Date(s).getTime();
      if (Number.isFinite(t)) return t;
    }
    // booking.date + booking.time are UTC wall clock from the server (same as student schedule).
    if (booking.date && booking.time) {
      var tm = String(booking.time).trim();
      var segs = tm.split(':');
      var h = parseInt(segs[0], 10);
      var m = parseInt(segs[1] != null ? segs[1] : '0', 10);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      var hh = String(h).padStart(2, '0');
      var mm = String(m).padStart(2, '0');
      var utcIso = booking.date + 'T' + hh + ':' + mm + ':00.000Z';
      var ms = new Date(utcIso).getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    return null;
  }

  function isSessionEnded(booking) {
    if (!booking) return false;
    var st = String(booking.status || '').toLowerCase();
    if (st === 'pending_feedback' || st === 'completed') return true;
    if (booking.sessionEndedAt) return true;
    if (booking.finishedAt) return true;
    if (booking.attendance && booking.attendance.classCompleted) return true;
    return false;
  }

  function getEntryGate(booking, nowMs) {
    var now = nowMs != null ? nowMs : Date.now();
    if (isSessionEnded(booking)) {
      return {
        allowed: false,
        code: 'SESSION_ENDED',
        message:
          'This live classroom session has already ended. You cannot re-enter this time slot.',
      };
    }
    var startMs = getScheduledStartMs(booking);
    if (startMs == null) return { allowed: true, reason: 'unknown_schedule' };
    var openMs = startMs - EARLY_MS;
    if (now < openMs) {
      return {
        allowed: false,
        code: 'TOO_EARLY',
        opensAtMs: openMs,
        scheduledStartMs: startMs,
        message:
          'This class has not opened yet. You can enter ' +
          EARLY_MIN +
          ' minutes before the scheduled start.',
      };
    }
    return { allowed: true, opensAtMs: openMs, scheduledStartMs: startMs };
  }

  function canFinishSession(booking, nowMs) {
    var now = nowMs != null ? nowMs : Date.now();
    var startMs = getScheduledStartMs(booking);
    if (startMs == null) return { allowed: true, reason: 'unknown_schedule' };
    var unlockMs = startMs + FINISH_MS;
    if (now < unlockMs) {
      return {
        allowed: false,
        code: 'TOO_EARLY_TO_FINISH',
        unlockAtMs: unlockMs,
        scheduledStartMs: startMs,
        minutesRemaining: Math.max(1, Math.ceil((unlockMs - now) / 60000)),
        message:
          'You can finish the live classroom only after ' +
          FINISH_MIN +
          ' minutes from the scheduled start.',
      };
    }
    return { allowed: true, unlockAtMs: unlockMs, scheduledStartMs: startMs };
  }

  function formatOpensIn(msRemaining) {
    if (msRemaining <= 0) return 'now';
    var s = Math.ceil(msRemaining / 1000);
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return m > 0 ? m + 'm ' + sec + 's' : sec + 's';
  }

  function hrefIfAllowed(url, bookingLike) {
    var gate = getEntryGate(bookingLike || {});
    if (!gate.allowed) {
      if (gate.code === 'SESSION_ENDED') {
        window.alert(gate.message || 'This live classroom session has already ended.');
        return;
      }
      if (gate.code === 'TOO_EARLY') {
        var when =
          gate.opensAtMs != null
            ? (function (ms) {
                try {
                  return new Intl.DateTimeFormat('en-PH', {
                    timeZone: 'Asia/Manila',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  }).format(new Date(ms));
                } catch (e) {
                  return new Date(ms).toLocaleString();
                }
              })(gate.opensAtMs)
            : 'the allowed time';
        window.alert(
          'Class hasn’t opened yet. You can enter starting ' +
            EARLY_MIN +
            ' minutes before the scheduled start (from ' +
            when +
            ').'
        );
        return;
      }
    }
    window.location.href = url;
  }

  global.RemoedClassroomEntry = {
    EARLY_MIN: EARLY_MIN,
    FINISH_MIN: FINISH_MIN,
    getScheduledStartMs: getScheduledStartMs,
    isSessionEnded: isSessionEnded,
    getEntryGate: getEntryGate,
    canFinishSession: canFinishSession,
    formatOpensIn: formatOpensIn,
    hrefIfAllowed: hrefIfAllowed,
  };
})(typeof window !== 'undefined' ? window : globalThis);
