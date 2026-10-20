(function () {
  'use strict';

  var trialId = null;
  var startedAt = Date.now();
  var results = {};

  function token() {
    try {
      var keys = ['remoed_student_token', 'remoed_student_auth', 'remoed_user_token', 'token'];
      var stores = [localStorage, sessionStorage];
      var i, j, v;
      for (i = 0; i < stores.length; i++) {
        for (j = 0; j < keys.length; j++) {
          v = stores[i].getItem(keys[j]);
          if (v) return v;
        }
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  function api(method, url, body) {
    var headers = { 'Content-Type': 'application/json' };
    var bearer = token();
    if (bearer) headers.Authorization = 'Bearer ' + bearer;
    return fetch(url, {
      method: method,
      headers: headers,
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) {
          var e = new Error((data && data.error) || 'Something went wrong');
          e.status = r.status;
          throw e;
        }
        return data;
      });
    });
  }

  var Trial = {
    start: function (childId, theme) {
      return api('POST', '/api/trials', { childId: childId, theme: theme }).then(function (d) {
        trialId = d.trialId;
        startedAt = Date.now();
        results = {};
        try { sessionStorage.setItem('trialId', trialId); } catch (e) {}
        return d;
      });
    },

    resume: function (id) {
      trialId = id;
      try { sessionStorage.setItem('trialId', trialId); } catch (e) {}
      return api('GET', '/api/trials/' + trialId).then(function (d) {
        results = {};
        return d;
      });
    },

    recordAnswer: function (word, correct) {
      var r = results[word] || (results[word] = { word: word, attempts: 0, correctFirstTry: false, spokeIt: false });
      r.attempts += 1;
      if (correct && r.attempts === 1) r.correctFirstTry = true;
    },

    recordSpoke: function (word) {
      var r = results[word] || (results[word] = { word: word, attempts: 0, correctFirstTry: false, spokeIt: false });
      r.spokeIt = true;
    },

    save: function () {
      if (!trialId) return Promise.resolve();
      return api('POST', '/api/trials/' + trialId + '/progress', {
        words: Object.keys(results).map(function (k) { return results[k]; }),
        secondsSpent: Math.round((Date.now() - startedAt) / 1000),
      });
    },

    finish: function () {
      return Trial.save().then(function () {
        return api('POST', '/api/trials/' + trialId + '/complete');
      });
    },
  };

  window.Trial = Trial;
})();
