/**
 * Plan prices from the server (GET /api/payments/plans, same totals as checkout).
 * Fills plan cards marked with data-plan / data-price-line. The static HTML numbers stay as the no-JS fallback.
 * window.RemoEdPlanPricing.ready resolves with { exchangeRatePhp, plans: { [planId]: plan } } or null.
 */
(function () {
  function php(amount) {
    return '₱' + Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function toPhp(usd, rate) {
    return Math.round(usd * rate * 100) / 100;
  }

  var lastData = null;

  function tr(key, fallback) {
    if (window.SiteI18n && SiteI18n.t) {
      var value = SiteI18n.t(key);
      if (value && value !== key) return value;
    }
    return fallback;
  }

  function renderCards(data) {
    lastData = data;
    var rate = data.exchangeRatePhp;
    var cards = document.querySelectorAll('#plans .plan-card[data-plan]');
    Array.prototype.forEach.call(cards, function (card) {
      var p = data.plans[card.getAttribute('data-plan')];
      if (!p) return;
      var perClass = toPhp(p.usdPerClass, rate);
      var discountPhp = toPhp(p.usdFounderDiscount, rate);

      var exact = Number(p.phpTotal);
      var rounded = Math.round(exact);
      var price = card.querySelector('.plan-price');
      if (price) {
        price.textContent = '₱' + rounded.toLocaleString('en-PH');
      }
      var exactEl = card.querySelector('[data-price-role="exact"]');
      if (exactEl) {
        var differs = Math.abs(exact - rounded) >= 0.005;
        exactEl.hidden = !differs;
        exactEl.textContent = differs ? ('Checkout ' + php(exact)) : '';
      }

      var listPhp = Number(p.phpList);
      if (!(listPhp > 0) && Number(p.usdList) > 0) listPhp = toPhp(p.usdList, rate);
      var founderLine = card.querySelector('[data-price-line="founder"]');
      if (founderLine && p.usdFounderDiscount > 0) {
        founderLine.textContent = '';
        if (listPhp > exact) {
          var struck = document.createElement('s');
          struck.textContent = php(listPhp);
          founderLine.appendChild(struck);
          founderLine.appendChild(document.createTextNode(' '));
        }
        founderLine.appendChild(document.createTextNode(tr('plan_founder', 'Founder discount:') + ' −' + php(discountPhp)));
      }

      var badge = card.querySelector('.plan-badge');
      if (badge && p.usdFounderDiscount > 0) badge.textContent = tr('plan_save', 'Save') + ' ' + php(discountPhp);

      var usdLine = card.querySelector('.plan-price-local[data-usd]');
      if (usdLine) usdLine.setAttribute('data-usd', String(p.usdTotal));

      var period = card.querySelector('.plan-period');
      if (period) {
        period.textContent = '';
        var strong = document.createElement('strong');
        strong.textContent = p.lessonCredits + ' ' + tr('plan_lessons', 'Lessons');
        period.appendChild(strong);
        period.appendChild(document.createTextNode(
          ' · ' + tr('plan_good_for', 'Good for') + ' ' + p.months + ' ' +
          (p.months === 1 ? tr('plan_month', 'month') : tr('plan_months', 'months'))
        ));
      }

      var classLine = card.querySelector('[data-price-line="class"]');
      if (classLine) {
        classLine.textContent = p.lessonCredits + ' ' + tr('plan_classes', 'classes') + ' × ' + php(perClass) +
          (p.usdFounderDiscount > 0 ? '' : ' = ' + php(p.phpTotal));
      }

    });
  }

  function usd(amount) {
    var n = Number(amount);
    return '$' + n.toLocaleString('en-US', {
      minimumFractionDigits: n % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2
    });
  }

  function usd2(amount) {
    return '$' + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Generic fields: <x data-plan="steady"> … <y data-plan-field="usdSave"> */
  var FIELDS = {
    usdTotal: function (p) { return usd2(p.usdTotal) + ' USD'; },
    phpTotal: function (p) { return php(p.phpTotal); },
    usdClassLine: function (p) { return p.lessonCredits + ' classes × ' + usd2(p.usdPerClass); },
    usdFounder: function (p) { return 'Founder Discount −' + usd(p.usdFounderDiscount); },
    usdSave: function (p) { return 'Save ' + usd(p.usdFounderDiscount); },
    lessonsValid: function (p) { return p.lessonCredits + ' Lessons · Valid for ' + p.validityMonths + ' Months'; },
    valid: function (p) { return 'Valid for ' + p.validityMonths + ' Months'; }
  };

  function renderFields(data) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-plan-field]'), function (el) {
      var box = el.closest('[data-plan]');
      var p = box && data.plans[box.getAttribute('data-plan')];
      var fn = FIELDS[el.getAttribute('data-plan-field')];
      if (p && fn) el.textContent = fn(p);
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-plan-rate]'), function (el) {
      el.textContent = '1 USD = ' + php(data.exchangeRatePhp);
    });
  }

  var ready = fetch('/api/payments/plans', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (body) {
      if (!body || !body.success || !Array.isArray(body.plans)) return null;
      var rate = Number(body.exchangeRatePhp);
      if (!(rate > 0)) return null;
      var plans = {};
      body.plans.forEach(function (p) { if (p && p.planId) plans[p.planId] = p; });
      var data = { exchangeRatePhp: rate, plans: plans };
      renderCards(data);
      renderFields(data);
      return data;
    })
    .catch(function () { return null; });

  function translateStaticPlans() {
    Array.prototype.forEach.call(document.querySelectorAll('#plans .plan-period'), function (period) {
      var nums = period.textContent.match(/\d+/g);
      if (!nums || nums.length < 2) return;
      var lessons = nums[0];
      var months = nums[nums.length - 1];
      period.textContent = '';
      var strong = document.createElement('strong');
      strong.textContent = lessons + ' ' + tr('plan_lessons', 'Lessons');
      period.appendChild(strong);
      period.appendChild(document.createTextNode(
        ' · ' + tr('plan_good_for', 'Good for') + ' ' + months + ' ' +
        (months === '1' ? tr('plan_month', 'month') : tr('plan_months', 'months'))
      ));
    });
    Array.prototype.forEach.call(document.querySelectorAll('#plans [data-price-line="class"]'), function (line) {
      var match = line.textContent.match(/^(\d+)\s+\S+\s+[×x]\s+([\s\S]+)$/);
      if (!match) return;
      line.textContent = match[1] + ' ' + tr('plan_classes', 'classes') + ' × ' + match[2];
    });
    Array.prototype.forEach.call(document.querySelectorAll('#plans [data-price-line="founder"]'), function (line) {
      var amount = line.textContent.match(/₱[\d,]+(?:\.\d+)?/);
      if (!amount) return;
      line.textContent = tr('plan_founder', 'Founder discount:') + ' −' + amount[0];
    });
    Array.prototype.forEach.call(document.querySelectorAll('#plans .plan-badge'), function (badge) {
      var amount = badge.textContent.match(/₱[\d,]+(?:\.\d+)?/);
      if (!amount) return;
      badge.textContent = tr('plan_save', 'Save') + ' ' + amount[0];
    });
  }

  window.addEventListener('sitei18n:languagechanged', function () {
    if (lastData) renderCards(lastData);
    else translateStaticPlans();
  });
  translateStaticPlans();

  window.RemoEdPlanPricing = { ready: ready };
})();
