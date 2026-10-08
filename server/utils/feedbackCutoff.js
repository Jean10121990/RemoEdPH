/**
 * Teacher wrap-up feedback stays editable through the class's salary date:
 * the 15th for lessons on the 1st–15th, or the last calendar day for the 16th–end.
 * Dates are Philippine calendar days.
 */

function manilaYmd(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function lessonYmdFromBooking(booking) {
  const dateStr = String((booking && booking.date) || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 10);
  if (booking && booking.dateTimeUtc) {
    const fromUtc = manilaYmd(booking.dateTimeUtc);
    if (fromUtc) return fromUtc;
  }
  return manilaYmd(new Date());
}

function feedbackCutoffYmd(lessonYmd) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(lessonYmd || ''));
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const mm = String(month).padStart(2, '0');
  if (day <= 15) return `${match[1]}-${mm}-15`;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${match[1]}-${mm}-${String(last).padStart(2, '0')}`;
}

function isFeedbackOpenForCutoff(booking, now = new Date()) {
  const lesson = lessonYmdFromBooking(booking);
  const cutoff = feedbackCutoffYmd(lesson);
  const today = manilaYmd(now);
  if (!cutoff || !today) return false;
  return today <= cutoff;
}

module.exports = {
  manilaYmd,
  lessonYmdFromBooking,
  feedbackCutoffYmd,
  isFeedbackOpenForCutoff,
};
