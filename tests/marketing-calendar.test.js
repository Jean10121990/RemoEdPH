const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildMarketingCalendar,
  calendarWriteError,
} = require('../server/services/marketingCalendarSeed');
const { warmParentLetter, letterNeedsHistory } = require('../server/services/marketingEmailVoice');

const entries = buildMarketingCalendar();

function on(dateKey) {
  return entries.filter((row) => row.dateKey === dateKey);
}

function slots(dateKey) {
  return on(dateKey).map((row) => row.slot).sort();
}

function weekday(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function lastSaturday(year, month) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let day = last; day >= 1; day -= 1) {
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 6) {
      return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    }
  }
  return '';
}

test('December 2026 and every 2027 month are seeded', () => {
  const months = new Set(entries.map((row) => row.dateKey.slice(0, 7)));
  assert.equal(months.has('2026-12'), true);
  for (let month = 1; month <= 12; month += 1) {
    assert.equal(months.has('2027-' + String(month).padStart(2, '0')), true);
  }
  assert.deepEqual(entries.filter((row) => row.dateKey.startsWith('2026-11')).map((row) => row.dateKey), ['2026-11-30', '2026-11-30']);
  assert.equal(entries.some((row) => row.dateKey.startsWith('2028-')), false);
});

test('every Monday and Thursday has its own regular row, including holidays', () => {
  const regularDates = new Set(entries.filter((row) => row.slot === 'regular').map((row) => row.dateKey));
  const start = Date.UTC(2026, 11, 1);
  const end = Date.UTC(2027, 11, 31);
  for (let cursor = start; cursor <= end; cursor += 86400000) {
    const date = new Date(cursor);
    const dow = date.getUTCDay();
    if (dow !== 1 && dow !== 4) continue;
    const key = date.toISOString().slice(0, 10);
    assert.equal(regularDates.has(key), true, key);
    assert.equal(on(key).filter((row) => row.slot === 'regular').length, 1);
  }
});

test('holiday Mondays and Thursdays keep the regular post beside the observance', () => {
  assert.deepEqual(slots('2026-12-24'), ['observance', 'regular']);
  assert.equal(on('2026-12-24').find((row) => row.slot === 'observance').title, 'Christmas Eve');
  assert.equal(on('2026-12-24').find((row) => row.slot === 'regular').title, 'Thursday post');
  assert.equal(weekday('2026-12-24'), 4);

  assert.deepEqual(slots('2027-04-22'), ['observance', 'regular']);
  assert.equal(on('2027-04-22').find((row) => row.slot === 'observance').title, 'Earth Day');

  assert.deepEqual(slots('2027-08-30'), ['observance', 'regular']);
  assert.equal(on('2027-08-30').find((row) => row.slot === 'observance').title, 'National Heroes Day');
  assert.equal(weekday('2027-08-30'), 1);

  assert.deepEqual(slots('2027-11-01'), ['observance', 'regular']);
  assert.equal(on('2027-11-01').find((row) => row.slot === 'observance').title, "All Saints' Day");
  assert.equal(weekday('2027-11-01'), 1);
});

test('December 2026 rows are dry run and the CSR post is the last Saturday', () => {
  const december = entries.filter((row) => row.dateKey.startsWith('2026-12'));
  assert.ok(december.length > 0);
  assert.equal(december.every((row) => row.dryRun === true), true);
  assert.equal(entries.filter((row) => row.dateKey.startsWith('2027-')).every((row) => row.dryRun === false), true);
  assert.deepEqual(slots('2026-12-31'), ['regular']);
  assert.equal(weekday('2026-12-26'), 6);
  assert.equal(on('2026-12-26').some((row) => row.slot === 'csr'), true);
});

test('March 25 keeps the regular Thursday post and Holy Week, and CSR is the last Saturday', () => {
  assert.equal(weekday('2027-03-25'), 4);
  assert.deepEqual(slots('2027-03-25'), ['observance', 'regular']);
  assert.equal(on('2027-03-25').find((row) => row.slot === 'observance').title, 'Holy Week');
  assert.equal(weekday('2027-03-27'), 6);
  assert.equal(on('2027-03-27').some((row) => row.slot === 'csr'), true);
});

test('listed holidays match those dates', () => {
  const expected = {
    '2027-01-01': "New Year's Day",
    '2027-02-14': "Heart's Day",
    '2027-03-25': 'Holy Week',
    '2027-04-09': 'Day of Valor',
    '2027-04-22': 'Earth Day',
    '2027-05-01': 'Labor Day',
    '2027-05-09': "Mother's Day",
    '2027-06-12': 'Independence Day',
    '2027-06-20': "Father's Day",
    '2027-08-30': 'National Heroes Day',
    '2027-09-12': "Grandparents' Day",
    '2027-09-26': 'Family Day',
    '2027-10-05': "World Teachers' Day",
    '2027-10-10': 'World Mental Health Day',
    '2027-11-01': "All Saints' Day",
    '2027-11-02': "All Souls' Day",
    '2027-11-04': "National Children's Month",
    '2027-11-20': "Children's Day",
    '2027-11-30': 'Bonifacio Day',
    '2026-12-24': 'Christmas Eve',
    '2026-12-25': 'Christmas Day',
    '2026-12-30': 'Rizal Day',
    '2027-12-24': 'Christmas Eve',
    '2027-12-25': 'Christmas Day',
    '2027-12-30': 'Rizal Day',
  };
  Object.entries(expected).forEach(([dateKey, title]) => {
    const row = on(dateKey).find((item) => item.slot === 'observance');
    assert.ok(row, dateKey);
    assert.equal(row.title, title);
  });
});

test('September has one Family Day on September 26', () => {
  const family = entries.filter((row) => row.dateKey.startsWith('2027-09') && row.slot === 'observance' && row.title === 'Family Day');
  assert.equal(family.length, 1);
  assert.equal(family[0].dateKey, '2027-09-26');
});

test('November has Children\'s Month on November 4 and Children\'s Day on November 20', () => {
  assert.equal(on('2027-11-04').find((row) => row.slot === 'observance').title, "National Children's Month");
  assert.equal(on('2027-11-04').some((row) => row.slot === 'regular'), true);
  assert.equal(on('2027-11-20').find((row) => row.slot === 'observance').title, "Children's Day");
});

test('each month has one CSR post on the last Saturday', () => {
  const months = [{ year: 2026, month: 12 }];
  for (let month = 1; month <= 12; month += 1) months.push({ year: 2027, month });
  months.forEach(({ year, month }) => {
    const prefix = year + '-' + String(month).padStart(2, '0');
    const csr = entries.filter((row) => row.dateKey.startsWith(prefix) && row.slot === 'csr');
    assert.equal(csr.length, 1, prefix);
    assert.equal(csr[0].dateKey, lastSaturday(year, month));
  });
});

test('November 30 2026 is the Bonifacio Day test beside the Monday class', () => {
  assert.equal(weekday('2026-11-30'), 1);
  assert.deepEqual(slots('2026-11-30'), ['observance', 'regular']);
  assert.equal(on('2026-11-30').find((row) => row.slot === 'observance').title, 'Bonifacio Day');
  assert.equal(on('2026-11-30').find((row) => row.slot === 'regular').title, 'Monday post');
  assert.equal(on('2026-11-30').every((row) => row.dryRun === true), true);
  assert.equal(entries.some((row) => row.dateKey === '2026-11-26'), false);
});

test('a parent email sounds like a caring note, not a pasted topic', () => {
  const letter = warmParentLetter('Bonifacio Day: courage and care for community');
  assert.match(letter.subject, /courage/i);
  assert.equal(letter.subject.includes('Bonifacio Day: courage'), false);
  assert.match(letter.body, /Hello,/);
  assert.match(letter.body, /Andres Bonifacio/);
  assert.match(letter.body, /November 30, 1863/);
  assert.match(letter.body, /Katipunan/);
  assert.match(letter.body, /in case this day is new to your family/);
  assert.match(letter.body, /real teacher/);
  assert.match(letter.body, /With care/);
  assert.equal(letter.body.includes('Bonifacio Day: courage and care for community'), false);
  assert.equal(letterNeedsHistory('Bonifacio Day: courage and care for community', 'A short note with no history.'), true);
  const rizal = warmParentLetter('Rizal Day: learning, courage, and love of home');
  assert.match(rizal.body, /December 30, 1896/);
  assert.match(rizal.body, /Noli Me Tangere/);
  const independence = warmParentLetter('Independence Day: pride, kindness, and home');
  assert.match(independence.body, /June 12, 1898/);
  assert.match(independence.body, /Kawit/);
});

test('a bad status and a date outside the window are rejected', () => {
  assert.equal(calendarWriteError('2026-11-29', 'planned'), 'That date is outside November 30, 2026 through December 2027.');
  assert.equal(calendarWriteError('2028-01-01', 'planned'), 'That date is outside November 30, 2026 through December 2027.');
  assert.equal(calendarWriteError('2027-01-04', 'published'), 'That status is not available.');
  assert.equal(calendarWriteError('2026-11-30', 'planned'), '');
  assert.equal(calendarWriteError('2026-12-24', 'edited'), '');
  assert.equal(calendarWriteError('2027-12-31', 'scheduled'), '');
});
