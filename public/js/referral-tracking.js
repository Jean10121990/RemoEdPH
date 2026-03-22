// Capture referral code from URL (?ref=XXXX) and persist for signup/subscription.
(function () {
  'use strict';

  function getRefFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      return ref && String(ref).trim() ? String(ref).trim() : null;
    } catch {
      return null;
    }
  }

  const ref = getRefFromUrl();
  if (ref) {
    try {
      localStorage.setItem('referralCode', ref);
      localStorage.setItem('referralCapturedAt', new Date().toISOString());
    } catch {
      // ignore storage errors
    }
  }
})();

