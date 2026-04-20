/**
 * Teacher payout tier + credentials: mirrored from GET /api/teacher/profile (admin-set) into
 * localStorage for Teaching Fee (hidden per–25-min rate), Career Path display, growth points, cancellations.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'remoedTeacherPayoutV1';
  var TIER_VALUES = [180, 230, 280, 330];

  function defaultSettings() {
    return { tierBase: 180, c1: false, c2: false, c3: false };
  }

  function normalizeSettings(s) {
    var d = defaultSettings();
    if (!s || typeof s !== 'object') return d;
    var tb = parseInt(s.tierBase, 10);
    d.tierBase = TIER_VALUES.indexOf(tb) >= 0 ? tb : 180;
    d.c1 = !!s.c1;
    d.c2 = !!s.c2;
    d.c3 = !!s.c3;
    return d;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return normalizeSettings(JSON.parse(raw));
    } catch (e) {
      return null;
    }
  }

  function save(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
  }

  function compute(settings) {
    var s = normalizeSettings(settings);
    var n = (s.c1 ? 1 : 0) + (s.c2 ? 1 : 0) + (s.c3 ? 1 : 0);
    var totalHourly = s.tierBase + n * 10;
    return { totalHourly: totalHourly, ratePer25: totalHourly / 2, settings: s };
  }

  function getRatePer25() {
    return compute(load() || defaultSettings()).ratePer25;
  }

  /** Returns settings object or null if no valid tier+cred combo matches. */
  function syncSettingsFromRatePer25(ratePer25) {
    var r = parseFloat(ratePer25);
    if (!isFinite(r) || r <= 0) return null;
    var impliedHourly = r * 2;
    for (var i = 0; i < TIER_VALUES.length; i++) {
      var base = TIER_VALUES[i];
      var delta = impliedHourly - base;
      if (delta >= 0 && delta <= 30 && delta % 10 === 0) {
        var creds = Math.round(delta / 10);
        return {
          tierBase: base,
          c1: creds >= 1,
          c2: creds >= 2,
          c3: creds >= 3
        };
      }
    }
    return null;
  }

  function seedFromRatePer25(ratePer25) {
    var s = syncSettingsFromRatePer25(ratePer25);
    if (s) {
      save(s);
      return true;
    }
    return false;
  }

  /** Map GET /api/teacher/profile `profile` into local tier+cred settings (authoritative from HR/admin). */
  function applyFromServerProfile(profile) {
    if (!profile || typeof profile !== 'object') return false;
    var tb = parseInt(profile.payoutTierBase, 10);
    if (TIER_VALUES.indexOf(tb) < 0) tb = 180;
    save({
      tierBase: tb,
      c1: !!profile.payoutCred1,
      c2: !!profile.payoutCred2,
      c3: !!profile.payoutCred3,
    });
    return true;
  }

  function applyToHiddenHourly() {
    var el = document.getElementById('hourly-rate');
    if (el) el.value = String(getRatePer25());
  }

  /**
   * Prefer server profile (admin-set tier/creds); else cache; else seed from legacy endpoints.
   */
  async function ensureInitialized() {
    try {
      var token = global.localStorage && global.localStorage.getItem('token');
      if (token) {
        var res = await fetch('/api/teacher/profile', {
          credentials: 'include',
          headers: { Authorization: 'Bearer ' + token },
        });
        if (res.ok) {
          var data = await res.json();
          if (data.success && data.profile && applyFromServerProfile(data.profile)) {
            applyToHiddenHourly();
            return;
          }
        }
      }
    } catch (e) {
      console.warn('teacher-payout-settings: profile sync failed', e);
    }
    if (load()) {
      applyToHiddenHourly();
      return;
    }
    try {
      var token2 = global.localStorage && global.localStorage.getItem('token');
      var headers = {};
      if (token2) headers['Authorization'] = 'Bearer ' + token2;
      var res2 = await fetch('/api/admin/teacher-rate', { credentials: 'include', headers: headers });
      if (res2.ok) {
        var data2 = await res2.json();
        if (data2.success && data2.rate > 0) {
          if (!seedFromRatePer25(data2.rate)) save(defaultSettings());
          applyToHiddenHourly();
          return;
        }
      }
    } catch (e) {
      console.warn('teacher-payout-settings: ensureInitialized fetch failed', e);
    }
    save(defaultSettings());
    applyToHiddenHourly();
  }

  /**
   * Deduction in pesos for one cancelled class. ratePer25Min = Total Hourly ÷ 2.
   * hoursBeforeClass = hours from cancellation time until class start.
   */
  function tutorCancellationDeductionPeso(hoursBeforeClass, ratePer25Min) {
    const r = Number(ratePer25Min);
    const h = Number(hoursBeforeClass);
    if (!isFinite(h) || !isFinite(r) || r <= 0) return 0;
    if (h > 72) return 0;
    if (h >= 24) return r * 0.5;
    if (h >= 1) return r * 0.75;
    return r * 1;
  }

  global.RemoedTeacherPayout = {
    STORAGE_KEY: STORAGE_KEY,
    TIER_VALUES: TIER_VALUES,
    defaultSettings: defaultSettings,
    normalize: normalizeSettings,
    load: load,
    save: save,
    compute: compute,
    getRatePer25: getRatePer25,
    syncSettingsFromRatePer25: syncSettingsFromRatePer25,
    seedFromRatePer25: seedFromRatePer25,
    applyFromServerProfile: applyFromServerProfile,
    applyToHiddenHourly: applyToHiddenHourly,
    ensureInitialized: ensureInitialized,
    tutorCancellationDeductionPeso: tutorCancellationDeductionPeso
  };
})(typeof window !== 'undefined' ? window : this);
