/**
 * One-shot: ensure every static HTML file references /images/remoed-favicon.png.
 * Run from repo root: node scripts/inject-favicon-links.js
 */
const fs = require('fs');
const path = require('path');

const BLOCK =
  '    <link rel="icon" href="/images/remoed-favicon.png" type="image/png" sizes="any" />\n' +
  '    <link rel="apple-touch-icon" href="/images/remoed-favicon.png" />';

function stripOldIconTags(html) {
  return html
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]*<link rel="icon"[^>]*>\s*/gi, '\n')
    .replace(/\n[ \t]*<link rel="alternate icon"[^>]*>\s*/gi, '\n')
    .replace(/\n[ \t]*<link rel="apple-touch-icon"[^>]*>\s*/gi, '\n');
}

function patchFile(fullPath) {
  let s = fs.readFileSync(fullPath, 'utf8');
  const before = s;
  s = stripOldIconTags(s);
  if (!/<head[^>]*>/i.test(s)) {
    if (s !== before) fs.writeFileSync(fullPath, s);
    return;
  }
  // Avoid duplicate block
  if (s.includes('remoed-favicon.png')) {
    if (s !== before) fs.writeFileSync(fullPath, s);
    return;
  }
  s = s.replace(/<head([^>]*)>/i, `<head$1>\n${BLOCK}`);
  fs.writeFileSync(fullPath, s);
}

function walkHtml(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkHtml(full);
    else if (name.endsWith('.html')) patchFile(full);
  }
}

const root = path.join(__dirname, '..');
walkHtml(path.join(root, 'public'));
walkHtml(path.join(root, 'application-form'));
