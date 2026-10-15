const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const gardenJs = fs.readFileSync(path.join(__dirname, '../public/js/student-virtual-garden.js'), 'utf8');
const gardenHtml = fs.readFileSync(path.join(__dirname, '../public/student-virtual-garden.html'), 'utf8');
const headerJs = fs.readFileSync(path.join(__dirname, '../public/js/student-page-header.js'), 'utf8');

test('frontend renders the server species with no override or mock list', () => {
  assert.equal(/\b(var|let|const)\s+SPECIES\b/.test(gardenJs), false);
  assert.equal(/Math\.random\s*\(/.test(gardenJs), false);
  assert.equal(/localStorage\.(get|set)Item\([^)]*species/i.test(gardenJs), false);
  assert.equal(/\b(Oak|Narra|Acacia|Mahogany)\b/.test(gardenJs), false);
  assert.match(gardenJs, /tree\.species/);
  assert.equal(/id="vg-species">\s*Oak/.test(gardenHtml), false);
});

test('Eco-Drops chip click only navigates and does not call garden writes', () => {
  assert.match(headerJs, /window\.location\.href\s*=\s*'student-virtual-garden\.html'/);
  assert.equal(/\/api\/garden/.test(headerJs), false);
  assert.equal(/seen-stage/.test(headerJs), false);
  assert.equal(/Math\.random\s*\(/.test(headerJs), false);
});

test('garden page no longer posts lastSeenStage', () => {
  assert.equal(/seen-stage/.test(gardenJs), false);
  assert.equal(/lastSeenStage/.test(gardenJs), false);
});

test('stage tracker maps six server stages onto five icons', () => {
  assert.match(gardenJs, /TRACKER_STEPS/);
  assert.match(gardenJs, /paintTracker/);
  assert.match(gardenHtml, /id="vg-tracker"/);
  assert.equal(/Math\.random\s*\(/.test(gardenJs), false);
});

test('garden wallet and mascot tip stay in the page', () => {
  assert.match(gardenHtml, /How do I earn more/);
  assert.match(gardenHtml, /vg-mascot/);
  assert.match(gardenHtml, /id="vg-short-hint"/);
  assert.match(gardenJs, /Finish a game to earn more drops/);
});

test('stage-up copy uses the server species, not a hardcoded name', () => {
  assert.match(gardenJs, /Your ' \+ tree\.species \+ ' grew into/);
  assert.match(gardenHtml, /id="vg-celebrate"/);
});

test('past-tree ambient uses the static class', () => {
  assert.match(gardenJs, /is-static/);
  assert.match(gardenJs, /renderAmbient\(tree,\s*\{\s*static:\s*!live/);
});

test('gallery, theme facts, mute, and parents extras stay frontend-only', () => {
  assert.match(gardenHtml, /id="vg-gallery"/);
  assert.match(gardenHtml, /id="vg-theme-data"/);
  assert.match(gardenHtml, /id="vg-parents"/);
  assert.match(gardenHtml, /id="vg-mute"/);
  assert.match(gardenJs, /paintGallery/);
  assert.match(gardenJs, /applyTheme/);
  assert.match(gardenJs, /playSound/);
  assert.match(gardenJs, /remoed_vg_sound/);
  assert.match(gardenJs, /student-kids-mode/);
  assert.equal(/localStorage\.(get|set)Item\([^)]*species/i.test(gardenJs), false);
  assert.equal(/Math\.random\s*\(/.test(gardenJs), false);
  assert.equal(/\b(Oak|Narra|Acacia|Mahogany)\b/.test(gardenJs), false);
});
