/**
 * Public USD exchange rates for the landing-page plan converter (display only; checkout keeps its own PHP rate).
 * Auth: public, read-only. No user input reaches the upstream request.
 */
const express = require('express');

const router = express.Router();

const UPSTREAM_URL = 'https://open.er-api.com/v6/latest/USD';
const CACHE_MS = 6 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
const FALLBACK = { base: 'USD', rates: { USD: 1, PHP: 60.03 }, updatedAt: null, source: 'fallback' };

let cache = null;
let cacheAt = 0;
let lastFailAt = 0;
let inflight = null;

async function fetchRates() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(UPSTREAM_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const body = await res.json();
    const raw = body && body.rates;
    if (!raw || typeof raw !== 'object') throw new Error('No rates');
    const rates = {};
    Object.keys(raw).forEach((code) => {
      const n = Number(raw[code]);
      if (/^[A-Z]{3}$/.test(code) && Number.isFinite(n) && n > 0) rates[code] = n;
    });
    if (!rates.PHP) throw new Error('PHP missing');
    rates.USD = 1;
    const unix = Number(body.time_last_update_unix);
    return {
      base: 'USD',
      rates,
      updatedAt: Number.isFinite(unix) && unix > 0 ? new Date(unix * 1000).toISOString() : new Date().toISOString(),
      source: 'live',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getRates() {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_MS) return cache;
  if (now - lastFailAt < RETRY_MS) return cache || FALLBACK;
  if (!inflight) {
    inflight = fetchRates()
      .then((data) => {
        cache = data;
        cacheAt = Date.now();
        return data;
      })
      .catch((err) => {
        lastFailAt = Date.now();
        console.warn('[fx-rates] upstream failed:', err.message || err);
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
  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ success: true, ...data });
});

module.exports = router;
