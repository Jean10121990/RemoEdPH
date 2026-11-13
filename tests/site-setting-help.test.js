const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { CATALOG } = require('../server/services/siteSettings');

test('every site setting has a hover explanation and an example', () => {
  const help = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'site-setting-help.js'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin-settings.html'), 'utf8');
  assert.match(page, /site-setting-help\.js/);
  assert.match(page, /RemoedSiteHelp\.button\(row\.key\)/);
  CATALOG.forEach((row) => {
    const block = help.slice(help.indexOf(row.key + ': {'));
    assert.notEqual(block.indexOf(row.key + ': {'), -1, row.key);
    const next = block.slice(0, block.indexOf('\n    },') + 1 || 800);
    assert.match(next, /what: '/, row.key);
    assert.match(next, /example: '/, row.key);
  });
});
