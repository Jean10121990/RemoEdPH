'use strict';

const Lead = require('../models/Lead');
const { deliver } = require('./parentSequence');

const CHECKIN_HOURS = 72;

async function runLeadReminders(now = new Date()) {
  const cutoff = new Date(now.getTime() - CHECKIN_HOURS * 60 * 60 * 1000);
  const leads = await Lead.find({
    email: { $ne: '' },
    stage: { $nin: ['Paid plan', 'Lost'] },
    'sequenceSent.value': { $ne: null, $lte: cutoff },
    'sequenceSent.checkin': null,
  }).limit(100);
  let sent = 0;
  for (const lead of leads) {
    const result = await deliver(lead, 'checkin');
    if (result && result.sent) sent += 1;
  }
  return sent;
}

module.exports = { runLeadReminders, CHECKIN_HOURS };
