/**
 * Live password rules + weak / strong / super-strong meter.
 * Required (matches /api/auth/reset-password): 8+ chars, upper, lower, number. Letters and digits only.
 */
(function (global) {
  var RULES = [
    { id: 'length', label: 'At least 8 characters', test: function (pw) { return pw.length >= 8; } },
    { id: 'lower', label: 'At least 1 lowercase letter', test: function (pw) { return /[a-z]/.test(pw); } },
    { id: 'upper', label: 'At least 1 uppercase letter', test: function (pw) { return /[A-Z]/.test(pw); } },
    { id: 'number', label: 'At least 1 number', test: function (pw) { return /\d/.test(pw); } },
  ];

  function analyze(password) {
    var pw = String(password || '');
    var rules = {};
    var missing = [];
    RULES.forEach(function (rule) {
      var ok = rule.test(pw);
      rules[rule.id] = ok;
      if (!ok) missing.push(rule.label.charAt(0).toLowerCase() + rule.label.slice(1));
    });
    var requiredMet = missing.length === 0 && pw.length > 0;
    var hasSpecial = /[^A-Za-z0-9]/.test(pw);
    var level = 'weak';
    var label = 'Weak password';
    if (requiredMet && pw.length >= 12) {
      level = 'super';
      label = 'Super strong password';
    } else if (requiredMet) {
      level = 'strong';
      label = 'Strong password';
    }
    var hint = '';
    if (pw && !requiredMet && missing[0]) {
      hint = 'Must include ' + missing[0] + '.';
    } else if (hasSpecial) {
      hint = 'Use letters and numbers only (no symbols).';
    }
    return {
      rules: rules,
      requiredMet: requiredMet && !hasSpecial,
      serverOk: requiredMet && !hasSpecial,
      level: pw ? level : 'idle',
      label: pw ? label : '',
      hint: hint,
    };
  }

  function wire(opts) {
    var input = document.getElementById(opts.inputId);
    if (!input) return;
    var meter = document.getElementById(opts.meterId);
    var meterLabel = document.getElementById(opts.meterLabelId);
    var list = document.getElementById(opts.listId);
    var hint = document.getElementById(opts.hintId);
    var toggle = document.getElementById(opts.toggleId);

    function render() {
      var result = analyze(input.value);
      if (meter) meter.setAttribute('data-level', result.level);
      if (meterLabel) meterLabel.textContent = result.label;
      if (list) {
        RULES.forEach(function (rule) {
          var li = list.querySelector('[data-rule="' + rule.id + '"]');
          if (!li) return;
          li.classList.toggle('is-met', !!result.rules[rule.id]);
        });
      }
      if (hint) {
        hint.textContent = result.hint;
        hint.hidden = !result.hint;
      }
      input.setCustomValidity(result.serverOk || !input.value ? '' : (result.hint || 'Password does not meet the requirements.'));
    }

    input.addEventListener('input', render);
    input.addEventListener('blur', render);
    if (toggle) {
      toggle.addEventListener('click', function () {
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        toggle.classList.toggle('is-shown', show);
      });
    }
    render();
  }

  global.RemoedPasswordStrength = {
    analyze: analyze,
    wire: wire,
  };
})(typeof window !== 'undefined' ? window : globalThis);
