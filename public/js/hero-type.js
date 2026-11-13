/* Types the homepage hero headline. The words stay whatever the page already set. */
(function () {
  var el = document.getElementById("hero-title");
  if (!el) return;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var arm = 0;
  var stepTimer = 0;
  var token = 0;
  var lock = false;
  var current = "";

  function wait(ch) {
    if (ch === " ") return 36;
    if (ch === "," || ch === "." || ch === "—" || ch === "–" || ch === "!") return 160;
    return 34;
  }

  function type(full) {
    clearTimeout(stepTimer);
    var id = ++token;
    current = full;
    lock = true;
    el.classList.add("hero-typing");
    el.setAttribute("aria-label", full);
    var i = 0;
    el.textContent = "";
    function step() {
      if (id !== token) return;
      if (i >= full.length) {
        el.textContent = full;
        el.classList.remove("hero-typing");
        lock = false;
        return;
      }
      i += 1;
      el.textContent = full.slice(0, i);
      stepTimer = setTimeout(step, wait(full.charAt(i - 1)));
    }
    step();
  }

  function schedule() {
    clearTimeout(arm);
    arm = setTimeout(function () {
      var full = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!full) return;
      if (lock && (full === current || current.indexOf(full) === 0)) return;
      if (!lock && full === el.getAttribute("data-typed")) return;
      el.setAttribute("data-typed", full);
      if (reduce) {
        el.textContent = full;
        el.setAttribute("aria-label", full);
        return;
      }
      type(full);
    }, 60);
  }

  if (window.MutationObserver) {
    new MutationObserver(function () {
      var now = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (lock && now && current.indexOf(now) !== 0) {
        token += 1;
        lock = false;
        clearTimeout(stepTimer);
        el.classList.remove("hero-typing");
      }
      schedule();
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }

  schedule();
})();
