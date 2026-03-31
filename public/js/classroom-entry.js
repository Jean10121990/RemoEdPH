/**
 * Client-side mirror of server 10-minute early entry rule (for UI; server enauthoritatively).
 */
(function (global) {
  var EARLY_MIN = 10;
  var EARLY_MS = EARLY_MIN * 60 * 1000;

  function getScheduledStartMs(booking) {
    if (!booking) return null;
    var fromApi = booking.scheduledStartTime != null ? booking.scheduledStartTime : booking.dateTimeUtc;
    if (fromApi != null && String(fromApi).trim() !== '') {
      var s = String(fromApi).trim();
      if (s && !/Z$/i.test(s)) s += 'Z';
      var t = new Date(s).getTime();
      if (Number.isFinite(t)) return t;
    }
    if (booking.date && booking.time) {
      var tm = String(booking.time).trim();
      var localIso = booking.date + 'T' + (tm.length <= 5 ? tm + ':00' : tm);
      var ms = new Date(localIso).getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    return null;
  }

  function getEntryGate(booking, nowMs) {
    var now = nowMs != null ? nowMs : Date.now();
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

  function formatOpensIn(msRemaining) {
    if (msRemaining <= 0) return 'now';
    var s = Math.ceil(msRemaining / 1000);
    var m = Math.floor(s / 60);
    var sec = s % 60;
    return m > 0 ? m + 'm ' + sec + 's' : sec + 's';
  }

  function hrefIfAllowed(url, bookingLike) {
    var gate = getEntryGate(bookingLike || {});
    if (!gate.allowed && gate.code === 'TOO_EARLY') {
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
    window.location.href = url;
  }

  global.RemoedClassroomEntry = {
    EARLY_MIN: EARLY_MIN,
    getScheduledStartMs: getScheduledStartMs,
    getEntryGate: getEntryGate,
    formatOpensIn: formatOpensIn,
    hrefIfAllowed: hrefIfAllowed,
  };
})(typeof window !== 'undefined' ? window : globalThis);
