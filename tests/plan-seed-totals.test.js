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

test('seeded plans charge ₱7,700 per month', () => {
  assert.equal(catalogValue('creditsPerMonth'), 22);
  assert.equal(catalogValue('phpPerMonth'), 7700);
  assert.equal(CREDITS_PER_MONTH, 22);
  assert.equal(creditsPerMonth(), 22);

  const spark = payments.computePlanTotals('spark', RATE);
  assert.equal(spark.lessonCredits, 22);
  assert.equal(spark.phpPerMonth, 7700);
  assert.equal(spark.phpPerClass, 350);
  assert.equal(spark.usdFounderDiscount, 0);
  assert.equal(spark.phpTotal, 7700);
  assert.equal(spark.amountCentavos, 770000);
  assert.equal(spark.usdTotal, Number((7700 / RATE).toFixed(2)));
});

test('longer plans are ₱7,700 times the months', () => {
  const expected = {
    steady: { credits: 66, months: 3, php: 23100 },
    scholar: { credits: 132, months: 6, php: 46200 },
    summit: { credits: 264, months: 12, php: 92400 },
  };
  Object.entries(expected).forEach(([id, row]) => {
    const totals = payments.computePlanTotals(id, RATE);
    assert.equal(totals.lessonCredits, row.credits, id);
    assert.equal(totals.phpTotal, row.php, id);
    assert.equal(totals.phpPerClass, 350, id);
    assert.equal(totals.amountCentavos, row.php * 100, id);
    assert.equal(totals.usdTotal, Number((row.php / RATE).toFixed(2)), id);
  });
});

test('homepage cards do not carry a second peso price', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const plans = html.slice(html.indexOf('id="plans"'), html.indexOf('id="faq"'));
  assert.doesNotMatch(plans, /₱\s*[\d,]/);
  assert.equal((plans.match(/class="plan-price"/g) || []).length, 4);
  assert.doesNotMatch(plans, /class="plan-price"[^>]*>[^<]*\d/);
  const script = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'plan-pricing.js'), 'utf8');
  assert.match(script, /price\.textContent = '₱' \+ rounded\.toLocaleString/);
  assert.match(script, /Number\(p\.phpTotal\)/);
});
