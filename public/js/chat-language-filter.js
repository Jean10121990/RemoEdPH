/**
 * Conservative classroom-language screen.
 * Flags possible strong insults only (word-boundary). Not a guarantee — teachers may reveal.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RemoedChatLanguage = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var TERMS = [
    'fuck',
    'fucking',
    'fucker',
    'motherfucker',
    'shit',
    'bitch',
    'asshole',
    'bastard',
    'cunt',
    'dickhead',
    'slut',
    'whore',
    'nigger',
    'faggot',
    'retard',
    'putangina',
    'tangina',
    'putang',
    'gago',
    'tarantado',
    'punyeta',
    'leche',
  ];
  var PATTERN = new RegExp('\\b(' + TERMS.map(escapeRe).join('|') + ')\\b', 'gi');

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function stars(word) {
    return '*'.repeat(Math.max(1, String(word).length));
  }

  function screenMessage(raw) {
    var original = String(raw == null ? '' : raw);
    var flagged = false;
    var display = original.replace(PATTERN, function (m) {
      flagged = true;
      return stars(m);
    });
    return {
      original: original,
      display: display,
      flagged: flagged,
    };
  }

  function payloadForRole(stored, role) {
    var isTeacher = String(role || '').toLowerCase() === 'teacher';
    var out = Object.assign({}, stored);
    out.message = stored.display || stored.message;
    out.flagged = !!stored.flagged;
    out.flagUncertain = !!stored.flagged;
    if (isTeacher && stored.flagged && stored.originalMessage) {
      out.originalMessage = stored.originalMessage;
    } else {
      delete out.originalMessage;
    }
    return out;
  }

  return {
    screenMessage: screenMessage,
    payloadForRole: payloadForRole,
  };
});
