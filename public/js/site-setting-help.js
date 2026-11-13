/* Hover notes for Super-Admin site settings. One explanation and one example per key. */
(function (global) {
  'use strict';

  var HELP = {
    creditsPerMonth: {
      title: 'Credits per month',
      what: 'How many lessons one month of a plan includes. Longer plans multiply this number by their months.',
      example: '22 means Spark (1 month) has 22 lessons and Steady (3 months) has 66.'
    },
    usdPerClass: {
      title: 'USD per class',
      what: 'The dollar price of one lesson before any founder discount. Checkout multiplies this by the lesson count.',
      example: '7 means Spark is 22 × $7 = $154 before a Spark discount.'
    },
    founderDiscountPerMonth: {
      title: 'Founder discount per month',
      what: 'Dollars taken off each month of Steady, Scholar, and Summit. Spark does not use this number.',
      example: '21 on a 3-month plan saves $63, so $462 becomes $399.'
    },
    sparkFounderDiscount: {
      title: 'Spark founder discount',
      what: 'Dollars taken off the Spark plan only. Leave it at 0 to keep Spark at the full lesson price.',
      example: '0 keeps Spark at $154. A value of 10 would make Spark $144.'
    },
    adminFeePercent: {
      title: 'Admin fee percent',
      what: 'The percent of a referred payment that is set aside as the admin fee.',
      example: '2 means a ₱1,000 commission pool sets aside ₱20.'
    },
    referralRewardCredits: {
      title: 'Referral reward credits',
      what: 'Lesson credits a student receives after a successful student-to-student referral. The server keeps this between 1 and 5.',
      example: '3 adds 3 lesson credits to the referring student.'
    },
    commissionSpark: {
      title: 'Unique Link commission, Spark',
      what: 'The one-time peso amount a referrer earns when someone buys Spark through their link. The 2% monthly share is separate.',
      example: '1000 pays the referrer ₱1,000 for that Spark signup.'
    },
    commissionSteady: {
      title: 'Unique Link commission, Steady',
      what: 'The one-time peso amount a referrer earns when someone buys Steady through their link.',
      example: '1500 pays the referrer ₱1,500 for that Steady signup.'
    },
    commissionScholar: {
      title: 'Unique Link commission, Scholar',
      what: 'The one-time peso amount a referrer earns when someone buys Scholar through their link.',
      example: '2000 pays the referrer ₱2,000 for that Scholar signup.'
    },
    commissionSummit: {
      title: 'Unique Link commission, Summit',
      what: 'The one-time peso amount a referrer earns when someone buys Summit through their link.',
      example: '2500 pays the referrer ₱2,500 for that Summit signup.'
    },
    payoutPaidHourly: {
      title: 'Paid tier hourly rates',
      what: 'The four hourly teaching rates in pesos. These numbers are the tier codes. This is not the fallback global rate. The list must include 180.',
      example: '180, 230, 280, 330. A 25-minute class at 180 pays ₱75.'
    },
    payoutCredentialAddon: {
      title: 'Credential add-on',
      what: 'Extra pesos per hour for a teacher who has the credential add-on.',
      example: '10 adds ₱10 per hour on top of that teacher’s tier.'
    },
    payoutTrialRate: {
      title: 'Free-trial class rate',
      what: 'The flat peso amount for one free-trial class. It does not use the hourly tier.',
      example: '45 pays the teacher ₱45 for that trial class.'
    },
    emergencyCancelMinutes: {
      title: 'Emergency cancel window',
      what: 'How many minutes before the start a late student cancel is treated as an emergency.',
      example: '30 means a cancel inside the last 30 minutes uses the emergency rule.'
    },
    earlyEntryMinutes: {
      title: 'Early join',
      what: 'How many minutes before the start a student may enter the classroom.',
      example: '10 means a 10:00 class can be joined from 9:50.'
    },
    classMaxMinutes: {
      title: 'Class hard stop',
      what: 'When the live room is forced to end, counted from the start. This is longer than the scheduled lesson.',
      example: '30 closes a class that started at 10:00 at 10:30.'
    },
    classLengthMinutes: {
      title: 'Scheduled class length',
      what: 'The lesson length used for teacher pay. Payout is the hourly tier times this length divided by 60.',
      example: '25 at tier 180 pays 180 × 25 / 60 = ₱75.'
    },
    creditNoticeDays: {
      title: 'Credit expiry notice days',
      what: 'Which days before credits expire a notice is sent. Only 14 and 7 are used. Other numbers are ignored.',
      example: '14, 7 sends one notice two weeks before and one notice one week before.'
    },
    freePlanLessonCount: {
      title: 'Free-plan lesson count',
      what: 'How many Pre-Level lessons a free-plan test student can take, in order. Other students are not affected.',
      example: '3 allows the first three Pre-Level lessons.'
    },
    gardenMonthlyTarget: {
      title: 'Garden monthly target',
      what: 'How many lessons the garden treats as a full month for that student.',
      example: '22 means the month’s target is 22 lessons.'
    },
    gardenTimezone: {
      title: 'Garden timezone',
      what: 'The clock used to decide which garden month a lesson belongs to. If the server has GARDEN_TIMEZONE set, that value wins.',
      example: 'Asia/Manila uses Philippine time for the garden month.'
    },
    treeCreditCap: {
      title: 'Tree credit cap',
      what: 'The most tree lesson credits one student can earn in a month.',
      example: '4 stops new tree credits after the fourth one that month.'
    },
    treeCreditExpiryDays: {
      title: 'Tree credit expiry',
      what: 'How many days a tree credit stays usable after it is awarded.',
      example: '60 means a credit awarded today expires in 60 days.'
    },
    treeReminderDays: {
      title: 'Tree credit reminder',
      what: 'How many days before a tree credit expires the reminder is sent.',
      example: '7 reminds the family one week before that credit expires.'
    },
    treeEligibilityRatio: {
      title: 'Tree eligibility ratio',
      what: 'The share of the monthly target a student must finish before a tree credit can be earned.',
      example: '0.8 with a target of 22 means 18 lessons (80%).'
    },
    gardenCreditsEnabled: {
      title: 'Garden lesson credits',
      what: 'Turns garden lesson rewards on or off. Off pauses new garden credits. Lessons already booked are not reversed.',
      example: 'On allows a finished garden month to award credits. Off pauses those awards.'
    },
    minShareAge: {
      title: 'Minimum share age',
      what: 'The youngest age allowed to use the parent share link.',
      example: '13 blocks the share link for anyone younger than 13.'
    },
    loginFacebookEnabled: {
      title: 'Facebook on the login page',
      what: 'Shows or hides Facebook on the student login page. The admin login stays on Google. Facebook still has to be turned on in the Facebook app.',
      example: 'Off shows Google only. On adds Facebook on the student login page.'
    },
    privacyConsentVersion: {
      title: 'Privacy consent version',
      what: 'The date parents must accept. A new date asks every parent to accept again before booking or checkout. Older acceptances stay on the student record.',
      example: 'Changing 2026-10-01 to 2026-12-01 asks every parent again.'
    },
    supportEmail: {
      title: 'Support email',
      what: 'The address shown on the public site footer after the page loads the public settings.',
      example: 'support@remoedph.com is the address parents see in the footer.'
    },
    facebookUrl: {
      title: 'Facebook page URL',
      what: 'The link used by the Facebook icon in the public footer. It must be a full https address.',
      example: 'https://www.facebook.com/remoed opens the RemoEd Facebook page.'
    }
  };

  var pop = null;
  var hideTimer = null;
  var pinned = false;
  var openKey = '';

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function icon() {
    if (global.RemoedLucide && RemoedLucide.svg) return RemoedLucide.svg('circle-alert');
    return '';
  }

  function button(key) {
    var help = HELP[key];
    if (!help) return '';
    return '<button type="button" class="site-help" data-site-help="' + esc(key) + '" aria-label="About ' + esc(help.title) + '">' + icon() + '</button>';
  }

  function ensurePop() {
    if (pop) return pop;
    var style = document.createElement('style');
    style.textContent = [
      '.site-help{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin-left:4px;padding:0;border:0;border-radius:999px;background:#fff7ed;color:#c2410c;cursor:help;vertical-align:middle;}',
      '.site-help svg{width:16px;height:16px;display:block;}',
      '.site-help:hover,.site-help:focus{background:#ffedd5;outline:2px solid #fdba74;outline-offset:1px;}',
      '.site-help-pop{position:fixed;z-index:var(--z-toast,9500);max-width:min(320px,calc(100vw - 16px));padding:10px 12px;background:#fffbeb;color:#1e293b;border:1px solid #f59e0b;border-radius:10px;box-shadow:0 10px 24px rgba(15,23,42,.16);font-size:.84rem;line-height:1.45;}',
      '.site-help-pop strong{display:block;margin:0 0 4px;font-size:.9rem;}',
      '.site-help-pop p{margin:0;}',
      '.site-help-pop .site-help-example{margin-top:6px;color:#9a3412;}',
      '.site-save-dialog{position:fixed;inset:0;z-index:var(--z-modal,9000);display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.45);}',
      '.site-save-dialog[hidden]{display:none !important;}',
      '.site-save-dialog__card{background:#fff;color:#0f172a;border-radius:12px;max-width:440px;width:100%;padding:20px;box-shadow:0 20px 40px rgba(0,0,0,.2);}',
      '.site-save-dialog__card h2{margin:0 0 8px;font-size:1.15rem;color:#0f172a;}',
      '.site-save-dialog__card p{margin:0;line-height:1.45;}',
      '.site-save-dialog__value{margin-top:8px;font-weight:700;}',
      '.site-save-dialog__example{margin-top:8px;color:#9a3412;}',
      '.site-save-dialog__actions{display:flex;gap:8px;justify-content:flex-end;margin-top:16px;}',
      '.site-save-dialog__actions button{padding:8px 14px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;font-weight:700;}',
      '.site-save-dialog__actions .site-save-go{background:#1ca7e7;border-color:#1ca7e7;color:#fff;}'
    ].join('');
    document.head.appendChild(style);
    pop = document.createElement('div');
    pop.id = 'site-help-pop';
    pop.className = 'site-help-pop';
    pop.setAttribute('role', 'tooltip');
    pop.hidden = true;
    document.body.appendChild(pop);
    pop.addEventListener('mouseenter', function () { clearTimeout(hideTimer); });
    pop.addEventListener('mouseleave', function () { if (!pinned) scheduleHide(); });
    return pop;
  }

  function place(anchor) {
    var box = ensurePop();
    var rect = anchor.getBoundingClientRect();
    var width = Math.min(320, window.innerWidth - 16);
    var left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
    box.style.width = width + 'px';
    box.style.left = left + 'px';
    box.style.top = (rect.bottom + 8) + 'px';
    var height = box.offsetHeight;
    if (rect.bottom + 8 + height > window.innerHeight - 8) {
      box.style.top = Math.max(8, rect.top - height - 8) + 'px';
    }
  }

  function show(anchor, pin) {
    var key = anchor.getAttribute('data-site-help');
    var help = HELP[key];
    if (!help) return;
    clearTimeout(hideTimer);
    var box = ensurePop();
    box.hidden = false;
    box.replaceChildren();
    var title = document.createElement('strong');
    title.textContent = help.title;
    var what = document.createElement('p');
    what.textContent = help.what;
    var example = document.createElement('p');
    example.className = 'site-help-example';
    example.textContent = 'Example: ' + help.example;
    box.appendChild(title);
    box.appendChild(what);
    box.appendChild(example);
    openKey = key;
    pinned = !!pin;
    anchor.setAttribute('aria-expanded', 'true');
    place(anchor);
  }

  function hide() {
    clearTimeout(hideTimer);
    pinned = false;
    openKey = '';
    if (pop) pop.hidden = true;
    document.querySelectorAll('.site-help[aria-expanded="true"]').forEach(function (btn) {
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { if (!pinned) hide(); }, 180);
  }

  function bind() {
    if (bind.done) return;
    bind.done = true;
    document.addEventListener('mouseover', function (event) {
      var btn = event.target.closest && event.target.closest('[data-site-help]');
      if (!btn) return;
      show(btn, false);
    });
    document.addEventListener('mouseout', function (event) {
      var btn = event.target.closest && event.target.closest('[data-site-help]');
      if (!btn) return;
      if (event.relatedTarget && (btn.contains(event.relatedTarget) || (pop && pop.contains(event.relatedTarget)))) return;
      if (!pinned) scheduleHide();
    });
    document.addEventListener('focusin', function (event) {
      var btn = event.target.closest && event.target.closest('[data-site-help]');
      if (btn) show(btn, false);
    });
    document.addEventListener('focusout', function (event) {
      var btn = event.target.closest && event.target.closest('[data-site-help]');
      if (!btn || pinned) return;
      scheduleHide();
    });
    document.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('[data-site-help]');
      if (btn) {
        event.preventDefault();
        if (pinned && openKey === btn.getAttribute('data-site-help')) hide();
        else show(btn, true);
        return;
      }
      if (pop && !pop.hidden && !pop.contains(event.target)) hide();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') hide();
    });
    window.addEventListener('scroll', function () {
      if (!pop || pop.hidden || !openKey) return;
      var anchor = document.querySelector('[data-site-help="' + openKey + '"]');
      if (anchor) place(anchor);
    }, true);
  }

  var dialog = null;
  var dialogGo = null;
  var dialogCancel = null;
  var dialogMode = '';

  function ensureDialog() {
    if (dialog) return dialog;
    ensurePop();
    dialog = document.createElement('div');
    dialog.className = 'site-save-dialog';
    dialog.hidden = true;
    dialog.innerHTML = '<div class="site-save-dialog__card" role="dialog" aria-modal="true" aria-labelledby="site-save-dialog-title">' +
      '<h2 id="site-save-dialog-title"></h2>' +
      '<p id="site-save-dialog-body"></p>' +
      '<p class="site-save-dialog__value" id="site-save-dialog-value"></p>' +
      '<p class="site-save-dialog__example" id="site-save-dialog-example"></p>' +
      '<div class="site-save-dialog__actions">' +
      '<button type="button" id="site-save-cancel">Cancel</button>' +
      '<button type="button" class="site-save-go" id="site-save-go">Save</button>' +
      '</div></div>';
    document.body.appendChild(dialog);
    dialogGo = dialog.querySelector('#site-save-go');
    dialogCancel = dialog.querySelector('#site-save-cancel');
    dialog.addEventListener('click', function (event) {
      if (event.target === dialog && dialogMode === 'confirm') finishDialog(false);
    });
    dialogCancel.addEventListener('click', function () { finishDialog(false); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && dialog && !dialog.hidden && dialogMode === 'confirm') finishDialog(false);
      else if (event.key === 'Escape' && dialog && !dialog.hidden && dialogMode === 'message') finishDialog(true);
    });
    return dialog;
  }

  var finishDialog = function () {};

  function fillDialog(title, body, valueText, example) {
    dialog.querySelector('#site-save-dialog-title').textContent = title || '';
    dialog.querySelector('#site-save-dialog-body').textContent = body || '';
    var valueEl = dialog.querySelector('#site-save-dialog-value');
    var exampleEl = dialog.querySelector('#site-save-dialog-example');
    valueEl.textContent = valueText || '';
    valueEl.hidden = !valueText;
    exampleEl.textContent = example || '';
    exampleEl.hidden = !example;
  }

  function closeSaveDialog() {
    if (!dialog) return;
    dialog.hidden = true;
    dialogMode = '';
    dialogGo.onclick = null;
  }

  function confirmSave(opts) {
    opts = opts || {};
    hide();
    ensureDialog();
    var help = opts.help || {};
    dialogMode = 'confirm';
    fillDialog(
      'Save ' + (opts.label || 'this setting') + '?',
      help.what || 'This updates the live setting.',
      opts.valueText ? 'New value: ' + opts.valueText : '',
      [help.example ? 'Example: ' + help.example : '', opts.note || ''].filter(Boolean).join(' ')
    );
    dialogCancel.hidden = false;
    dialogGo.hidden = false;
    dialogGo.disabled = false;
    dialogGo.textContent = 'Save';
    dialog.hidden = false;
    dialogGo.focus();
    return new Promise(function (resolve) {
      var settled = false;
      finishDialog = function (accepted) {
        if (dialogMode === 'message') {
          closeSaveDialog();
          return;
        }
        if (dialogMode === 'busy') return;
        if (!accepted) {
          if (settled) return;
          settled = true;
          closeSaveDialog();
          resolve(null);
          return;
        }
        dialogMode = 'busy';
        dialogCancel.hidden = true;
        dialogGo.disabled = true;
        dialogGo.textContent = 'Saving…';
        Promise.resolve()
          .then(function () { return opts.run && opts.run(); })
          .then(function (result) {
            result = result || { title: 'Saved', message: 'The setting was saved.' };
            dialogMode = 'message';
            fillDialog(result.title || 'Saved', result.message || '', '', '');
            dialogGo.disabled = false;
            dialogGo.textContent = 'OK';
            dialogGo.focus();
          })
          .catch(function () {
            dialogMode = 'message';
            fillDialog('Could not save', 'Network error. The setting was not changed.', '', '');
            dialogGo.disabled = false;
            dialogGo.textContent = 'OK';
            dialogGo.focus();
          });
      };
      dialogGo.onclick = function () { finishDialog(true); };
    });
  }

  global.RemoedSiteHelp = { HELP: HELP, button: button, bind: bind, hide: hide, confirmSave: confirmSave };
})(typeof window !== 'undefined' ? window : globalThis);
