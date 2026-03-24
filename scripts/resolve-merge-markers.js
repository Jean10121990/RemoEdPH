/**
 * Removes git merge conflict markers when exactly one side is non-empty.
 * If both sides have content, leaves the conflict in place for manual fix.
 */
const fs = require('fs');
const path = require('path');

const exts = new Set(['.js', '.html', '.css', '.json', '.md', '.example', '']);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else {
      const ext = path.extname(name);
      if (exts.has(ext) || name === '.gitignore' || name === '.env.example') out.push(full);
    }
  }
  return out;
}

function resolveContent(text) {
  const start = '<<<<<<< HEAD';
  const mid = '\n=======\n';
  const endMarker = '\n>>>>>>> ';
  let i = 0;
  let out = '';
  while (i < text.length) {
    const s = text.indexOf(start, i);
    if (s === -1) {
      out += text.slice(i);
      break;
    }
    out += text.slice(i, s);
    const afterStart = s + start.length;
    if (text[afterStart] !== '\n') {
      out += text.slice(s, s + start.length);
      i = afterStart;
      continue;
    }
    const headBegin = afterStart + 1;
    const m = text.indexOf(mid, headBegin);
    if (m === -1) {
      out += text.slice(s);
      break;
    }
    const head = text.slice(headBegin, m);
    const otherBegin = m + mid.length;
    const e = text.indexOf(endMarker, otherBegin);
    if (e === -1) {
      out += text.slice(s);
      break;
    }
    const other = text.slice(otherBegin, e);
    const lineEnd = text.indexOf('\n', e + 1);
    const restStart = lineEnd === -1 ? text.length : lineEnd + 1;

    const ht = head.trim();
    const ot = other.trim();
    if (ht && !ot) out += head;
    else if (!ht && ot) out += other;
    else if (ht && ot) {
      // Both non-empty: keep marker block so humans / follow-up can fix
      out += text.slice(s, restStart);
    }
    i = restStart;
  }
  return out;
}

const root = path.join(__dirname, '..');
const files = walk(path.join(root, 'server')).concat(
  walk(path.join(root, 'public')),
  [path.join(root, '.gitignore'), path.join(root, '.env.example')].filter((p) => fs.existsSync(p))
);

let changed = 0;
let remaining = 0;
for (const file of files) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (!text.includes('<<<<<<< HEAD')) continue;
  const next = resolveContent(text);
  const still = next.includes('<<<<<<< HEAD');
  if (still) remaining++;
  if (next !== text) {
    fs.writeFileSync(file, next, 'utf8');
    changed++;
  }
}

console.log('Files updated:', changed);
console.log('Files still containing conflicts:', remaining);
