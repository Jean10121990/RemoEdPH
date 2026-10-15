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

  function renderCards(data) {
    var rate = data.exchangeRatePhp;
    var cards = document.querySelectorAll('#plans .plan-card[data-plan]');
    Array.prototype.forEach.call(cards, function (card) {
      var p = data.plans[card.getAttribute('data-plan')];
      if (!p) return;
      var perClass = toPhp(p.usdPerClass, rate);
      var discountPhp = toPhp(p.usdFounderDiscount, rate);

      var price = card.querySelector('.plan-price');
      if (price) price.textContent = php(p.phpTotal);

      var badge = card.querySelector('.plan-badge');
      if (badge && p.usdFounderDiscount > 0) badge.textContent = 'Save ' + php(discountPhp);

      var usdLine = card.querySelector('.plan-price-local[data-usd]');
      if (usdLine) usdLine.setAttribute('data-usd', String(p.usdTotal));

      var period = card.querySelector('.plan-period');
      if (period) {
        period.textContent = '';
        var strong = document.createElement('strong');
        strong.textContent = p.lessonCredits + ' Lessons';
        period.appendChild(strong);
        period.appendChild(document.createTextNode(' · Valid for ' + p.validityMonths + ' Months'));
      }

      var classLine = card.querySelector('[data-price-line="class"]');
      if (classLine) {
        classLine.textContent = p.lessonCredits + ' classes × ' + php(perClass) +
          (p.usdFounderDiscount > 0 ? '' : ' = ' + php(p.phpTotal));
      }

      var founderLine = card.querySelector('[data-price-line="founder"]');
      if (founderLine && p.usdFounderDiscount > 0 && p.months > 0) {
        var perMonth = toPhp(p.usdFounderDiscount / p.months, rate);
        founderLine.textContent = 'Founder Discount −' + php(perMonth) + '/mo × ' + p.months + ' (−' + php(discountPhp) + ')';
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

  window.RemoEdPlanPricing = { ready: ready };
})();
