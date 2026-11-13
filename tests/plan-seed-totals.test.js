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

test('seeded Spark is 22 credits at $7 with a $0 founder discount', () => {
  assert.equal(catalogValue('creditsPerMonth'), 22);
  assert.equal(catalogValue('usdPerClass'), 7);
  assert.equal(catalogValue('founderDiscountPerMonth'), 21);
  assert.equal(catalogValue('sparkFounderDiscount'), 0);
  assert.equal(CREDITS_PER_MONTH, 22);
  assert.equal(creditsPerMonth(), 22);

  const spark = payments.computePlanTotals('spark', RATE);
  assert.equal(spark.lessonCredits, 22);
  assert.equal(spark.usdPerClass, 7);
  assert.equal(spark.usdFounderDiscount, 0);
  assert.equal(spark.usdTotal, 154);
  assert.equal(spark.phpTotal, 9244.62);
  assert.equal(spark.amountCentavos, 924462);
});

test('seeded plan pesos match checkout at the 60.03 fallback rate', () => {
  const expected = {
    steady: { credits: 66, usd: 399, php: 23951.97 },
    scholar: { credits: 132, usd: 798, php: 47903.94 },
    summit: { credits: 264, usd: 1596, php: 95807.88 },
  };
  Object.entries(expected).forEach(([id, row]) => {
    const totals = payments.computePlanTotals(id, RATE);
    assert.equal(totals.lessonCredits, row.credits, id);
    assert.equal(totals.usdTotal, row.usd, id);
    assert.equal(totals.phpTotal, row.php, id);
    assert.equal(totals.amountCentavos, Math.round(row.php * 100), id);
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
