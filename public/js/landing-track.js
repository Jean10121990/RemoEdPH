/**
 * Stores ad click ids for this visit and fires Meta events when a pixel id is set.
 * Does not load Facebook when metaPixelId is empty. Does not fire Schedule.
 */
(function () {
  var cfg = window.RemoEdLanding || {};
  var KEY = "remoed_landing_attr";
  var KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid"];

  function read() {
    try {
      var parsed = JSON.parse(sessionStorage.getItem(KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function capture() {
    var stored = read();
    var q = new URLSearchParams(window.location.search);
    KEYS.forEach(function (name) {
      var value = q.get(name);
      if (value) stored[name] = String(value).slice(0, 200);
    });
    try {
      sessionStorage.setItem(KEY, JSON.stringify(stored));
    } catch (e) {}
    return stored;
  }

  function pixelId() {
    var id = String(cfg.metaPixelId || "").trim();
    return /^\d{5,20}$/.test(id) ? id : "";
  }

  function loadPixel(id) {
    if (window.fbq) return;
    var n = (window.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!window._fbq) window._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://connect.facebook.net/en_US/fbevents.js";
    var first = document.getElementsByTagName("script")[0];
    if (first && first.parentNode) first.parentNode.insertBefore(s, first);
    else document.head.appendChild(s);
    window.fbq("init", id);
    window.fbq("track", "PageView");
  }

  function track(eventName) {
    if (!pixelId() || typeof window.fbq !== "function") return;
    window.fbq("track", eventName);
  }

  capture();
  var id = pixelId();
  if (id) loadPixel(id);

  window.RemoEdLandingTrack = {
    attr: function () {
      return capture();
    },
    lead: function () {
      track("Lead");
    },
    completeRegistration: function () {
      track("CompleteRegistration");
    },
    viewContent: function () {
      track("ViewContent");
    },
  };

  document.addEventListener("DOMContentLoaded", function () {
    if (document.body && document.body.classList.contains("page-index")) {
      track("ViewContent");
    }
  });
})();
