(function (global) {
  var profile = null;

  function setProfile(next) {
    profile = next || null;
  }

  function freePlan() {
    return profile && profile.freePlan ? profile.freePlan : null;
  }

  function isFree() {
    var plan = freePlan();
    return !!(plan && plan.isFree === true);
  }

  function canAccessFeature(featureKey) {
    if (!isFree()) return true;
    if (featureKey === 'playLearn' || featureKey === 'bookTrial') return true;
    return false;
  }

  function mountFeatureLock(container, opts) {
    if (!container || container.querySelector('.remoed-feature-lock')) return;
    opts = opts || {};
    var name = opts.featureName || 'This feature';
    var href = opts.href || 'student-credits.html';
    var cta = opts.ctaLabel || 'Unlock Premium';
    var blurb = opts.blurb || name + ' is part of a learning plan.';
    container.classList.add('remoed-feature-lock-host');
    var overlay = document.createElement('div');
    overlay.className = 'remoed-feature-lock';
    overlay.innerHTML =
      '<svg class="remoed-feature-lock__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect>' +
      '<path d="M7 11V7a5 5 0 0 1 10 0v4"></path>' +
      '</svg>' +
      '<p class="remoed-feature-lock__title">' + name + '</p>' +
      '<p class="remoed-feature-lock__text">' + blurb + '</p>' +
      '<a class="remoed-feature-lock__cta" href="' + href + '">' + cta + '</a>';
    if (opts.altHref && opts.altLabel) {
      var alt = document.createElement('a');
      alt.className = 'remoed-feature-lock__alt';
      alt.href = opts.altHref;
      alt.textContent = opts.altLabel;
      overlay.appendChild(alt);
    }
    container.appendChild(overlay);
  }

  global.RemoedFeatureAccess = {
    setProfile: setProfile,
    isFree: isFree,
    canAccessFeature: canAccessFeature,
    mountFeatureLock: mountFeatureLock,
  };
})(window);
