'use strict';

const Lead = require('../models/Lead');
const { sendLeadWelcomeEmail, sendParentSequenceEmail } = require('../emailService');

const PLANS = [
  'RemoSpark: 22 classes, ₱350 per class (₱7,700)',
  'RemoSteady: 66 classes, ₱340 per class (₱22,440)',
  'RemoScholar: 132 classes, ₱330 per class (₱43,560)',
  'RemoSummit: 264 classes, ₱320 per class (₱84,480)',
].join('\n');

function firstName(name) {
  const first = String(name || '').trim().split(/\s+/)[0];
  return first || 'there';
}

function letters(name) {
  const who = firstName(name);
  return {
    onboard: {
      subject: 'Your free interactive trial is ready on the RemoEd App',
      text: [
        'Hello ' + who + ',',
        '',
        'Welcome. You can sign up and log in on the RemoEd App to start a free interactive trial class for a child ages 3 to 6. No credit card is required.',
        '',
        'This free trial is a gentle activity on the app. It is not a live 25-minute class with a teacher.',
        '',
        'If you would like a starting level first, the free level assessment is here: https://remoedph.com/#assessment',
        'You do not have to take it before the trial.',
        '',
        'Sign up or log in: https://remoedph.com/student-register.html',
        'Already registered: https://remoedph.com/login/',
        '',
        'With care,',
        'RemoEd Support',
        'support@remoedph.com',
      ].join('\n'),
    },
    value: {
      subject: 'After the trial: live classes with a real teacher',
      text: [
        'Hello ' + who + ',',
        '',
        'We hope the free interactive trial on the RemoEd App felt kind and easy. That trial is not a live class. When your family wants a real teacher, these are the paid plans. Each live lesson is 25 minutes, one child and one teacher.',
        '',
        PLANS,
        '',
        'There is no extra discount to invent, and there is no rush. You can log back in on the RemoEd App when you are ready to choose.',
        'https://remoedph.com/login/',
        '',
        'With care,',
        'RemoEd Support',
        'support@remoedph.com',
      ].join('\n'),
    },
    checkin: {
      subject: 'A gentle note if you would like help choosing a time',
      text: [
        'Hello ' + who + ',',
        '',
        'This is a small check-in, not a push. If a live 25-minute class with a real teacher would help your child, we can help you look at a time that fits your week.',
        '',
        'If now is not the time, that is all right. The free interactive trial stays on the RemoEd App, and you can log in whenever you like.',
        'https://remoedph.com/login/',
        '',
        'Reply to this note if you want a hand. We are glad to help.',
        '',
        'With care,',
        'RemoEd Support',
        'support@remoedph.com',
      ].join('\n'),
    },
  };
}

async function claim(lead, key) {
  const now = new Date();
  const filter = { _id: lead._id, ['sequenceSent.' + key]: null };
  const set = { ['sequenceSent.' + key]: now, lastContactAt: now };
  if (key === 'onboard') {
    filter.welcomeEmailSent = { $ne: true };
    set.welcomeEmailSent = true;
    set.welcomeEmailSentAt = now;
  }
  return Lead.findOneAndUpdate(filter, { $set: set }, { new: true });
}

async function release(leadId, key) {
  const set = { ['sequenceSent.' + key]: null };
  if (key === 'onboard') {
    set.welcomeEmailSent = false;
    set.welcomeEmailSentAt = null;
  }
  await Lead.updateOne({ _id: leadId }, { $set: set }).catch(function () {});
}

async function deliver(lead, key) {
  if (!lead || !lead.email || lead.email.indexOf('@') < 1) return { sent: false };
  if (lead.stage === 'Lost') return { sent: false };
  if (key !== 'onboard' && (lead.stage === 'Paid plan' || lead.stage === 'Lost')) return { sent: false };
  const claimed = await claim(lead, key);
  if (!claimed) return { sent: false, skipped: true };
  const pack = letters(claimed.name)[key];
  const result = key === 'onboard'
    ? await sendLeadWelcomeEmail({ name: claimed.name, email: claimed.email, text: pack.text, subject: pack.subject })
    : await sendParentSequenceEmail({ email: claimed.email, subject: pack.subject, text: pack.text });
  if (!result || result.success !== true) {
    await release(claimed._id, key);
    return { sent: false };
  }
  return { sent: true };
}

function queueOnboard(lead) {
  return deliver(lead, 'onboard');
}

function queueValue(lead) {
  if (!lead || lead.stage === 'Paid plan' || lead.stage === 'Lost') return Promise.resolve({ sent: false });
  return deliver(lead, 'value');
}

module.exports = { letters, PLANS, queueOnboard, queueValue, deliver };
