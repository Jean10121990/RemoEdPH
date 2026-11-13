/* Applies published English copy. Missing blocks leave the HTML file unchanged. */
(function () {
  var cache = null;

  function english() {
    var lang = (document.documentElement.lang || "en").toLowerCase();
    return lang === "en" || lang.indexOf("en-") === 0;
  }

  function setText(el, value) {
    var letter = el.querySelector(".remo-heart-card__letter");
    if (letter) {
      var next = letter.nextSibling;
      if (next && next.nodeType === 3) next.nodeValue = " " + value;
      else letter.insertAdjacentText("afterend", " " + value);
      return;
    }
    el.textContent = value;
  }

  function apply(data) {
    if (!data) return;
    cache = data;
    var blocks = data.blocks || {};
    if (english()) {
      document.querySelectorAll("[data-cms]").forEach(function (el) {
        var key = el.getAttribute("data-cms");
        if (blocks[key]) setText(el, blocks[key]);
      });
      if (document.body.getAttribute("data-content-page") === "home") {
        var angle = "";
        try { angle = new URLSearchParams(window.location.search).get("angle") || ""; } catch (e) {}
        Object.keys(blocks).forEach(function (key) {
          if (key.indexOf("home.") !== 0) return;
          var name = key.slice(5);
          if (name === "hero_title" && angle) return;
          document.querySelectorAll('[data-i18n="' + name + '"]').forEach(function (el) {
            setText(el, blocks[key]);
          });
        });
      }
      if (blocks["brand.site_title"] && document.body.getAttribute("data-content-page") === "home") {
        document.title = blocks["brand.site_title"];
      }
      var meta = document.querySelector('meta[name="description"]');
      if (meta && blocks["brand.meta_description"] && document.body.getAttribute("data-content-page") === "home") {
        meta.setAttribute("content", blocks["brand.meta_description"]);
      }
      var og = document.querySelector('meta[property="og:title"]');
      if (og && blocks["brand.og_title"] && document.body.getAttribute("data-content-page") === "home") {
        og.setAttribute("content", blocks["brand.og_title"]);
      }
    }
    document.querySelectorAll("[data-cms-html]").forEach(function (el) {
      var key = el.getAttribute("data-cms-html");
      if (blocks[key]) el.innerHTML = blocks[key];
    });
    var contact = data.contact || {};
    if (contact.supportEmail) {
      document.querySelectorAll("a.site-footer__contact").forEach(function (a) {
        a.href = "mailto:" + contact.supportEmail;
        a.textContent = contact.supportEmail;
      });
    }
    if (contact.facebookUrl) {
      document.querySelectorAll("a.site-footer__social").forEach(function (a) {
        a.href = contact.facebookUrl;
      });
    }
  }

  function load() {
    fetch("/api/public/site-content", { credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (body) { if (body && body.success) apply(body); })
      .catch(function () {});
  }

  window.addEventListener("sitei18n:languagechanged", function () {
    if (!cache) return;
    setTimeout(function () { apply(cache); }, 0);
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})();
