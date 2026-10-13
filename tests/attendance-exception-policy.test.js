const test = require('node:test');
const assert = require('node:assert/strict');
const { DateTime } = require('luxon');
const {
  attendanceConfig,
  cutoffForAttendanceDate,
  parseReportedTimeout,
  isBlockingStatus,
  reviewerIsEmployee,
  ownerExemptFromAttendance,
  releaseAllowed,
} = require('../server/services/attendanceExceptionPolicy');

test('default cutoff is 07:00 Asia/Manila the next morning', () => {
  const cfg = attendanceConfig({});
  const cutoff = cutoffForAttendanceDate('2026-10-11', cfg);
  assert.equal(cutoff.toISO(), '2026-10-12T07:00:00.000+08:00');
});

test('overnight reported time-out is the next calendar day', () => {
  const clockIn = DateTime.fromISO('2026-10-11T18:00:00', { zone: 'Asia/Manila' }).toJSDate();
  const parsed = parseReportedTimeout({
    attendanceDate: '2026-10-11',
    clockIn,
    reportedHm: '01:30',
    now: DateTime.fromISO('2026-10-12T08:00:00', { zone: 'Asia/Manila' }).toJSDate(),
    zone: 'Asia/Manila',
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.at.toISO(), '2026-10-12T01:30:00.000+08:00');
});

test('future and pre-time-in values are rejected', () => {
  const clockIn = DateTime.fromISO('2026-10-11T09:00:00', { zone: 'Asia/Manila' }).toJSDate();
  const future = parseReportedTimeout({
    attendanceDate: '2026-10-11',
    clockIn,
    reportedHm: '18:00',
    now: DateTime.fromISO('2026-10-11T12:00:00', { zone: 'Asia/Manila' }).toJSDate(),
    zone: 'Asia/Manila',
  });
  assert.equal(future.ok, false);
  const bad = parseReportedTimeout({
    attendanceDate: '2026-10-11',
    clockIn,
    reportedHm: '99:00',
    now: new Date(),
    zone: 'Asia/Manila',
  });
  assert.equal(bad.ok, false);
});

test('unresolved statuses block time-in and approval is required to release', () => {
  assert.equal(isBlockingStatus('PENDING_REVIEW'), true);
  assert.equal(isBlockingStatus('REJECTED'), true);
  assert.equal(isBlockingStatus('APPROVED'), false);
  assert.equal(releaseAllowed('APPROVED'), true);
  assert.equal(releaseAllowed('REJECTED'), false);
});

test('an employee cannot review their own session', () => {
  assert.equal(reviewerIsEmployee('jean', 'admin:jean'), true);
  assert.equal(reviewerIsEmployee('hrlead', 'admin:jean'), false);
  assert.equal(reviewerIsEmployee('hrlead', 'kjb00000001'), false);
});

test('only the owner role is exempt from attendance exceptions', () => {
  assert.equal(ownerExemptFromAttendance('super_admin'), true);
  assert.equal(ownerExemptFromAttendance('admin_hr'), false);
  assert.equal(ownerExemptFromAttendance(''), false);
});
