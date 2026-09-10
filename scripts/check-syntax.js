/**
 * Lightweight lint gate: syntax-check all server-side JS with `node --check`.
 * Avoids introducing a full ESLint config against a large legacy codebase.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TARGETS = [
  path.join(ROOT, 'server'),
  path.join(ROOT, 'scripts'),
];

const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  'coverage',
  'uploads',
  'dist',
  'build',
]);

function collectJsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIR_NAMES.has(ent.name)) continue;
      collectJsFiles(full, out);
    } else if (ent.isFile() && ent.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

const files = TARGETS.flatMap((t) => collectJsFiles(t)).sort();
if (!files.length) {
  console.error('No JS files found to syntax-check.');
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const rel = path.relative(ROOT, file);
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    failed += 1;
    console.error(`✗ ${rel}`);
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.stdout) process.stdout.write(result.stdout);
  }
}

if (failed) {
  console.error(`\nSyntax check failed: ${failed}/${files.length} file(s).`);
  process.exit(1);
}

console.log(`✓ Syntax OK (${files.length} files)`);
