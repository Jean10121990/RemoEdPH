/**
 * Manila civil dates for the marketing calendar.
 * December 2026 is the dry run. 2027 is the full year.
 * A Monday or Thursday holiday keeps the regular post and adds the observance.
 */

const MONDAY_TOPICS = [
  'A home activity for ages 3 to 6: greetings and kind words',
  'Christian character at home: patience while a child tries',
  'A short listening game a parent can play at the table',
  'Family words: Mommy, Daddy, and the people we love',
  'Gratitude for the family, practiced in an ordinary afternoon',
];

const THURSDAY_TOPICS = [
  'Free interactive trial on the RemoEd App. No card. It is not a live class',
  'Optional free level assessment for parents who want a starting level first',
  'A parent poll: what new English word did your child try this week?',
  'How to log back in to the RemoEd App and continue the free trial',
];

const CSR_TOPICS = [
  'Community care: a simple feeding program for families',
  'Tree planting and caring for the earth',
  'Mental health support: a calm, listening afternoon for families',
  'Waste management: small care for the neighborhood',
  'Family Day: time together close to home',
  'A sustainability project children can join',
  'Rainy season outreach for families nearby',
  "Teachers' month: thanking people who teach with care",
  "Children's month and Students' Day: joy and play",
  'Thanksgiving sharing around one table',
  'A Christmas toy and book drive for children',
];

const OBSERVANCES = [
  { month: 1, day: 1, years: [2027], title: "New Year's Day", topic: "New Year's Day: a warm hello as families begin the year with a live English class", theme: 'new_year' },
  { month: 2, day: 14, years: [2027], title: "Heart's Day", topic: "Heart's Day: kind words and love at home", theme: 'hearts' },
  { month: 3, day: 25, years: [2027], title: 'Holy Week', topic: 'Holy Week and graduation season: a gentle note for families', theme: 'holy_week' },
  { month: 4, day: 9, years: [2027], title: 'Day of Valor', topic: 'Day of Valor: courage and care for one another', theme: 'heroes' },
  { month: 4, day: 22, years: [2027], title: 'Earth Day', topic: 'Earth Day and summer: caring for the world outside', theme: 'summer' },
  { month: 5, day: 1, years: [2027], title: 'Labor Day', topic: 'Labor Day: thanking the people who work with care', theme: 'custom' },
  { month: 5, day: 9, years: [2027], title: "Mother's Day", topic: "Mother's Day: a warm thank-you for Mommy", theme: 'mothers' },
  { month: 6, day: 12, years: [2027], title: 'Independence Day', topic: 'Independence Day: pride, kindness, and home', theme: 'heroes' },
  { month: 6, day: 20, years: [2027], title: "Father's Day", topic: "Father's Day: a warm thank-you for Daddy", theme: 'fathers' },
  { month: 8, day: 30, years: [2027], title: 'National Heroes Day', topic: 'National Heroes Day: brave and gentle hearts', theme: 'heroes' },
  { month: 9, day: 12, years: [2027], title: "Grandparents' Day", topic: "Grandparents' Day: love for Lolo and Lola", theme: 'grandparents' },
  { month: 9, day: 26, years: [2027], title: 'Family Day', topic: 'Family Day: the family God gave us', theme: 'grandparents' },
  { month: 10, day: 5, years: [2027], title: "World Teachers' Day", topic: "World Teachers' Day: thanking a real teacher", theme: 'teachers' },
  { month: 10, day: 10, years: [2027], title: 'World Mental Health Day', topic: 'World Mental Health Day: calm, kindness, and a listening heart', theme: 'mental_health' },
  { month: 11, day: 1, years: [2027], title: "All Saints' Day", topic: "All Saints' Day: remembering with gratitude", theme: 'holy_week' },
  { month: 11, day: 2, years: [2027], title: "All Souls' Day", topic: "All Souls' Day: a quiet thank-you for family", theme: 'holy_week' },
  { month: 11, day: 4, years: [2027], title: "National Children's Month", topic: "National Children's Month: joy, play, and a live class", theme: 'children' },
  { month: 11, day: 20, years: [2027], title: "Children's Day", topic: "Children's Day: a celebration of little learners", theme: 'children' },
  { month: 11, day: 30, years: [2026, 2027], title: 'Bonifacio Day', topic: 'Bonifacio Day: courage and care for community', theme: 'heroes' },
  { month: 12, day: 24, years: [2026, 2027], title: 'Christmas Eve', topic: 'Christmas Eve: warmth, family, and a gentle hello', theme: 'christmas' },
  { month: 12, day: 25, years: [2026, 2027], title: 'Christmas Day', topic: 'Christmas Day: joy for the family at home', theme: 'christmas' },
  { month: 12, day: 30, years: [2026, 2027], title: 'Rizal Day', topic: 'Rizal Day: learning, courage, and love of home', theme: 'heroes' },
];

const CTA = 'remoedph.com • Free Trial on RemoEd App';
const STATUSES = ['planned', 'drafted', 'edited', 'scheduled'];
const CONTENT_TYPES = ['facebook', 'email', 'ad'];

function pad(n) {
  return String(n).padStart(2, '0');
}

function dateKey(year, month, day) {
  return year + '-' + pad(month) + '-' + pad(day);
}

function weekday(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function lastWeekday(year, month, dow) {
  for (let day = daysInMonth(year, month); day >= 1; day -= 1) {
    if (weekday(year, month, day) === dow) return day;
  }
  return null;
}

function monthsInRange() {
  const list = [
    { year: 2026, month: 11, onlyDays: [30] },
    { year: 2026, month: 12 },
  ];
  for (let month = 1; month <= 12; month += 1) list.push({ year: 2027, month });
  return list;
}

function observanceOn(year, month, day) {
  return OBSERVANCES.find((item) => item.month === month && item.day === day && item.years.indexOf(year) !== -1) || null;
}

function posterFor(theme, headline) {
  return {
    format: 'square',
    theme: theme || 'custom',
    headline: headline || '',
    subheadline: '',
    cta: CTA,
    mascot: 'remo',
  };
}

function row(year, month, day, slot, title, keyTopic, theme) {
  const key = dateKey(year, month, day);
  return {
    dateKey: key,
    slot,
    title,
    keyTopic,
    contentType: 'facebook',
    targetMarket: 'General International (Asia)',
    generatedCopy: '',
    emailSubject: '',
    emailBody: '',
    posterConfig: posterFor(theme, title),
    status: 'planned',
    dryRun: year === 2026,
  };
}

function buildMarketingCalendar() {
  const entries = [];
  let mondayIndex = 0;
  let thursdayIndex = 0;
  let csrIndex = 0;
  monthsInRange().forEach(({ year, month, onlyDays }) => {
    const csrDay = onlyDays ? null : lastWeekday(year, month, 6);
    for (let day = 1; day <= daysInMonth(year, month); day += 1) {
      if (onlyDays && onlyDays.indexOf(day) === -1) continue;
      const dow = weekday(year, month, day);
      if (dow === 1 || dow === 4) {
        const monday = dow === 1;
        const pool = monday ? MONDAY_TOPICS : THURSDAY_TOPICS;
        const topicIndex = monday ? mondayIndex : thursdayIndex;
        const topic = pool[topicIndex % pool.length];
        if (monday) mondayIndex += 1;
        else thursdayIndex += 1;
        entries.push(row(
          year,
          month,
          day,
          'regular',
          dow === 1 ? 'Monday post' : 'Thursday post',
          topic,
          'custom'
        ));
      }
      const observance = observanceOn(year, month, day);
      if (observance) {
        entries.push(row(year, month, day, 'observance', observance.title, observance.topic, observance.theme));
      }
      if (day === csrDay) {
        const topic = CSR_TOPICS[csrIndex % CSR_TOPICS.length];
        csrIndex += 1;
        entries.push(row(year, month, day, 'csr', 'Community care', topic, 'csr'));
      }
    }
  });
  return entries;
}

function isAllowedDateKey(value) {
  const key = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  return key >= '2026-11-30' && key <= '2027-12-31';
}

function calendarWriteError(dateKeyValue, status) {
  if (!isAllowedDateKey(dateKeyValue)) {
    return 'That date is outside November 30, 2026 through December 2027.';
  }
  if (status && STATUSES.indexOf(status) === -1) {
    return 'That status is not available.';
  }
  return '';
}

module.exports = {
  buildMarketingCalendar,
  isAllowedDateKey,
  calendarWriteError,
  STATUSES,
  CONTENT_TYPES,
  CTA,
};
