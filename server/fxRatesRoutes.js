/**
 * Public USD exchange rates for the display-only currency converters (landing plans + portal pages).
 * Checkout, payouts, and payroll keep their own PHP amounts; nothing here changes what is charged or paid.
 * Auth: public, read-only. No user input reaches the upstream request, and the response holds only
 * public market rates (no user, payment, or server details). Amounts are converted in the browser.
 */
const express = require('express');

const router = express.Router();

/** Live mid-market rates (updated continuously, no key). */
const LIVE_URL = 'https://api.coinbase.com/v2/exchange-rates?currency=USD';
/** Daily backup if the live source is down. */
const DAILY_URL = 'https://open.er-api.com/v6/latest/USD';
const CACHE_MS = 60 * 1000;
const RETRY_MS = 2 * 60 * 1000;
const FALLBACK = { base: 'USD', rates: { USD: 1, PHP: 60.03 }, updatedAt: null, live: false };

let isoCodes = null;
try {
  isoCodes = new Set(Intl.supportedValuesOf('currency'));
} catch (_e) {
  isoCodes = null;
}

let cache = null;
let cacheAt = 0;
let lastFailAt = 0;
let inflight = null;

async function getJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function cleanRates(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('No rates');
  const rates = {};
  Object.keys(raw).forEach((code) => {
    if (!/^[A-Z]{3}$/.test(code)) return;
    if (isoCodes && !isoCodes.has(code)) return;
    const n = Number(raw[code]);
    if (Number.isFinite(n) && n > 0) rates[code] = Math.round(n * 1e6) / 1e6;
  });
  if (!rates.PHP) throw new Error('PHP missing');
  rates.USD = 1;
  return rates;
}

async function fetchLive() {
  const body = await getJson(LIVE_URL);
  return {
    base: 'USD',
    rates: cleanRates(body && body.data && body.data.rates),
    updatedAt: new Date().toISOString(),
    live: true,
  };
}

async function fetchDaily() {
  const body = await getJson(DAILY_URL);
  const unix = Number(body && body.time_last_update_unix);
  return {
    base: 'USD',
    rates: cleanRates(body && body.rates),
    updatedAt: Number.isFinite(unix) && unix > 0 ? new Date(unix * 1000).toISOString() : new Date().toISOString(),
    live: false,
  };
}

async function getRates() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_MS) return cache;
  if (now - lastFailAt < RETRY_MS) return cache || FALLBACK;
  if (!inflight) {
    inflight = fetchLive()
      .catch((err) => {
        console.warn('[fx-rates] live source failed:', err.message || err);
        return fetchDaily();
      })
      .then((data) => {
        cache = data;
        cacheAt = Date.now();
        return data;
      })
      .catch((err) => {
        lastFailAt = Date.now();
        console.warn('[fx-rates] daily source failed:', err.message || err);
        return cache || FALLBACK;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

router.get('/fx-rates', async (req, res) => {
  const data = await getRates();
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ success: true, base: data.base, rates: data.rates, updatedAt: data.updatedAt, live: !!data.live });
});

module.exports = router;
