/**
 * Insert shared Google Analytics loader immediately after <head> on site HTML pages.
 * Skips index.html (inline tag), test/debug pages, and files that already include the tag.
 */
const fs = require('fs');
const path = require('path');

const ROOTS = [
  path.join(__dirname, '../public'),
  path.join(__dirname, '../login'),
];
const SNIPPET =
  '    <script src="/js/remoed-gtag.js?v=ga-1"></script>\n';
const SKIP_NAME = /^(test-|debug-|clear-session|set-teacher-id|remo-ai-chatbot-include)/i;

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'vendor') continue;
      walk(full, out);
    } else if (name.toLowerCase().endsWith('.html')) {
      out.push(full);
    }
  }
}

const files = [];
ROOTS.forEach((r) => walk(r, files));

let changed = 0;
let skipped = 0;
for (const file of files) {
  const base = path.basename(file);
  if (base.toLowerCase() === 'index.html' && path.dirname(file).endsWith('public')) {
    skipped += 1;
    continue;
  }
  if (SKIP_NAME.test(base)) {
    skipped += 1;
    continue;
  }
  let html = fs.readFileSync(file, 'utf8');
  if (/remoed-gtag\.js|G-ERS58WHW7V|googletagmanager\.com\/gtag/i.test(html)) {
    skipped += 1;
    continue;
  }
  if (!/<head[^>]*>/i.test(html)) {
    skipped += 1;
    continue;
  }
  const next = html.replace(/<head([^>]*)>/i, function (m) {
    return m + '\n' + SNIPPET;
  });
  if (next === html) {
    skipped += 1;
    continue;
  }
  fs.writeFileSync(file, next, 'utf8');
  changed += 1;
  console.log('updated', path.relative(path.join(__dirname, '..'), file));
}
console.log('done: changed=%d skipped=%d', changed, skipped);
