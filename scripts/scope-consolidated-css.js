const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const PUBLIC_STYLE = path.join(ROOT, 'public', 'style.css');
const ROOT_STYLE = path.join(ROOT, 'style.css');

function toPageClass(filePathLike) {
  const base = path.basename(filePathLike, path.extname(filePathLike)).toLowerCase();
  return `page-${base.replace(/[^a-z0-9]+/g, '-')}`;
}

function findMatchingBrace(str, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < str.length; i += 1) {
    if (str[i] === '{') depth += 1;
    else if (str[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function prefixSelector(selector, scope) {
  const raw = selector.trim();
  if (!raw) return raw;
  if (raw.startsWith(scope)) return raw;
  if (raw === 'body' || raw === 'html' || raw === ':root') return `body.${scope.slice(1)}`;
  if (raw.startsWith('body ') || raw.startsWith('html ')) {
    return `body.${scope.slice(1)} ${raw.split(/\s+/).slice(1).join(' ')}`.trim();
  }
  if (raw.startsWith(':root ')) {
    return `body.${scope.slice(1)} ${raw.slice(6).trim()}`.trim();
  }
  return `${scope} ${raw}`;
}

function scopeCss(css, scope) {
  let i = 0;
  let out = '';

  while (i < css.length) {
    const nextComment = css.indexOf('/*', i);
    if (nextComment === i) {
      const endComment = css.indexOf('*/', i + 2);
      if (endComment === -1) {
        out += css.slice(i);
        break;
      }
      out += css.slice(i, endComment + 2);
      i = endComment + 2;
      continue;
    }

    const open = css.indexOf('{', i);
    const semi = css.indexOf(';', i);
    if (open === -1 && semi === -1) {
      out += css.slice(i);
      break;
    }

    if (semi !== -1 && (open === -1 || semi < open)) {
      out += css.slice(i, semi + 1);
      i = semi + 1;
      continue;
    }

    const prelude = css.slice(i, open).trim();
    const close = findMatchingBrace(css, open);
    if (close === -1) {
      out += css.slice(i);
      break;
    }
    const inner = css.slice(open + 1, close);

    if (!prelude) {
      out += css.slice(i, close + 1);
      i = close + 1;
      continue;
    }

    if (prelude.startsWith('@')) {
      const lower = prelude.toLowerCase();
      if (lower.startsWith('@media') || lower.startsWith('@supports') || lower.startsWith('@container')) {
        out += `${prelude}{${scopeCss(inner, scope)}}`;
      } else {
        out += `${prelude}{${inner}}`;
      }
    } else {
      const scopedSelectors = prelude
        .split(',')
        .map((sel) => prefixSelector(sel, scope))
        .join(', ');
      out += `${scopedSelectors}{${inner}}`;
    }

    i = close + 1;
  }

  return out;
}

function scopeBySourceBlocks(styleText) {
  const markerRegex = /\/\*\s*--- Source:\s*([^\*]+?)\s*---\s*\*\//g;
  const parts = [];
  let match;
  let lastIdx = 0;
  let currentSource = null;

  while ((match = markerRegex.exec(styleText)) !== null) {
    if (match.index > lastIdx) {
      parts.push({
        source: currentSource,
        css: styleText.slice(lastIdx, match.index),
      });
    }
    currentSource = match[1].trim();
    lastIdx = markerRegex.lastIndex;
    parts.push({ source: `__MARKER__:${currentSource}`, css: match[0] + '\n' });
  }

  if (lastIdx < styleText.length) {
    parts.push({ source: currentSource, css: styleText.slice(lastIdx) });
  }

  let out = '';
  for (const part of parts) {
    if (part.source && part.source.startsWith('__MARKER__:')) {
      out += part.css;
      continue;
    }
    if (!part.source) {
      out += part.css;
      continue;
    }
    const scopeClass = `.${toPageClass(part.source)}`;
    out += scopeCss(part.css, scopeClass);
  }

  return out;
}

function addBodyClassToHtml(htmlPath) {
  const rel = path.relative(ROOT, htmlPath).replace(/\\/g, '/');
  const cls = toPageClass(rel);
  let content = fs.readFileSync(htmlPath, 'utf8');
  content = content.replace(/<body([^>]*)>/i, (m, attrs) => {
    if (/class\s*=/.test(attrs)) {
      return `<body${attrs.replace(/class\s*=\s*["']([^"']*)["']/, (cm, val) => ` class="${`${val} ${cls}`.trim()}"`)}>`;
    }
    return `<body${attrs} class="${cls}">`;
  });
  fs.writeFileSync(htmlPath, content, 'utf8');
}

function main() {
  if (!fs.existsSync(PUBLIC_STYLE)) {
    throw new Error(`Missing file: ${PUBLIC_STYLE}`);
  }

  const htmlFiles = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git') continue;
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.toLowerCase().endsWith('.html')) htmlFiles.push(full);
    }
  }
  walk(ROOT);

  htmlFiles.forEach(addBodyClassToHtml);

  const original = fs.readFileSync(PUBLIC_STYLE, 'utf8');
  const scoped = scopeBySourceBlocks(original);
  fs.writeFileSync(PUBLIC_STYLE, scoped, 'utf8');
  fs.writeFileSync(ROOT_STYLE, scoped, 'utf8');

  console.log(`Updated ${htmlFiles.length} HTML files with page classes.`);
  console.log('Scoped consolidated styles by source page.');
}

main();
