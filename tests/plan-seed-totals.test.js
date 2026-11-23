const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { CATALOG } = require('../server/services/siteSettings');
const { CREDITS_PER_MONTH, creditsPerMonth } = require('../server/config/planCredits');
const payments = require('../server/payments');

const RATE = 60.03;

function catalogValue(key) {
  const row = CATALOG.find((item) => item.key === key);
  assert.ok(row, key);
  return row.value;
}

test('spark charges 22 classes at ₱350', () => {
  assert.equal(catalogValue('creditsPerMonth'), 22);
  assert.equal(catalogValue('phpPerMonth'), 7700);
  assert.equal(CREDITS_PER_MONTH, 22);
  assert.equal(creditsPerMonth(), 22);

  const spark = payments.computePlanTotals('spark', RATE);
  assert.equal(spark.lessonCredits, 22);
  assert.equal(spark.phpPerClass, 350);
  assert.equal(spark.phpPerMonth, 7700);
  assert.equal(spark.phpSave, 0);
  assert.equal(spark.usdFounderDiscount, 0);
  assert.equal(spark.phpTotal, 7700);
  assert.equal(spark.amountCentavos, 770000);
  assert.equal(spark.usdTotal, Number((7700 / RATE).toFixed(2)));
});

test('longer plans step down by ₱10 per class', () => {
  const expected = {
    steady: { credits: 66, months: 3, perClass: 340, php: 22440, perMonth: 7480, save: 660 },
    scholar: { credits: 132, months: 6, perClass: 330, php: 43560, perMonth: 7260, save: 2640 },
    summit: { credits: 264, months: 12, perClass: 320, php: 84480, perMonth: 7040, save: 7920 },
  };
  Object.entries(expected).forEach(([id, row]) => {
    const totals = payments.computePlanTotals(id, RATE);
    assert.equal(totals.lessonCredits, row.credits, id);
    assert.equal(totals.months, row.months, id);
    assert.equal(totals.phpPerClass, row.perClass, id);
    assert.equal(totals.phpPerMonth, row.perMonth, id);
    assert.equal(totals.phpSave, row.save, id);
    assert.equal(totals.phpTotal, row.php, id);
    assert.equal(totals.amountCentavos, row.php * 100, id);
    assert.equal(totals.usdFounderDiscount, 0, id);
    assert.equal(totals.usdTotal, Number((row.php / RATE).toFixed(2)), id);
  });
});

test('homepage cards do not carry a second peso price', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const plans = html.slice(html.indexOf('id="plans"'), html.indexOf('id="faq"'));
  assert.doesNotMatch(plans, /₱\s*[\d,]/);
  assert.equal((plans.match(/class="plan-price"/g) || []).length, 4);
  assert.equal((plans.match(/data-price-role="save"/g) || []).length, 4);
  assert.doesNotMatch(plans, /class="plan-price"[^>]*>[^<]*\d/);
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plan-pricing.js'), 'utf8');
  assert.match(script, /price\.textContent = '₱' \+ rounded\.toLocaleString/);
  assert.match(script, /Number\(p\.phpTotal\)/);
  assert.match(script, /Number\(p\.phpSave\)/);
});
