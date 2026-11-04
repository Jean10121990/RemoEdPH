'use strict';

const Lead = require('../models/Lead');
const { sendRawEmail } = require('../emailService');

const STEPS = [
  { key: 'h24', hours: 24 },
  { key: 'd3', hours: 72 },
  { key: 'd7', hours: 24 * 7 },
];

async function runLeadReminders(now = new Date()) {
  const leads = await Lead.find({ stage: 'Assessment done', email: { $ne: '' } }).limit(100);
  let sent = 0;
  for (const lead of leads) {
    const ageH = (now.getTime() - new Date(lead.createdAt).getTime()) / 36e5;
    const flags = lead.reminderSent || {};
    const step = STEPS.find((s) => ageH >= s.hours && !flags[s.key]);
    if (!step) continue;
    const result = await sendRawEmail(
      lead.email,
      'Finish your RemoEd registration',
      `<p>Hello ${lead.name || ''},</p><p>Your free assessment is saved. Register to book a class: https://remoedph.com/student-register.html</p>`,
      'Your free assessment is saved. Register at https://remoedph.com/student-register.html'
    );
    if (result && result.success) {
      lead.reminderSent = Object.assign({}, flags, { [step.key]: now });
      await lead.save();
      sent += 1;
    }
  }
  return sent;
}

module.exports = { runLeadReminders, STEPS };
