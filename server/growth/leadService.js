'use strict';

const Lead = require('../models/Lead');

const STAGE_RANK = {
  Inquiry: 1,
  'Assessment done': 2,
  Trial: 3,
  Registered: 4,
  'Paid plan': 5,
  'Renewal due': 6,
  'At-risk': 6,
  Lost: 0,
};

async function upsertLead(patch) {
  const email = String(patch.email || '').trim().toLowerCase();
  const phone = String(patch.phone || '').trim();
  if (!email && !phone) return null;
  const or = [];
  if (email) or.push({ email });
  if (phone) or.push({ phone });
  let lead = await Lead.findOne({ $or: or });
  if (!lead) {
    lead = new Lead({
      email,
      phone,
      name: patch.name || '',
      source: patch.source || 'manual',
      stage: patch.stage || 'Inquiry',
    });
  }
  if (patch.name) lead.name = patch.name;
  if (email) lead.email = email;
  if (phone) lead.phone = phone;
  if (patch.country) lead.country = patch.country;
  if (patch.language) lead.language = patch.language;
  if (patch.timeZone) lead.timeZone = patch.timeZone;
  if (patch.source && !lead.source) lead.source = patch.source;
  if (patch.utm) lead.utm = Object.assign({}, lead.utm || {}, patch.utm);
  if (patch.referralCode) lead.referralCode = patch.referralCode;
  if (patch.assessmentId) lead.assessmentId = patch.assessmentId;
  if (patch.studentId) lead.studentId = patch.studentId;
  const next = patch.stage;
  if (next && (STAGE_RANK[next] || 0) >= (STAGE_RANK[lead.stage] || 0) && lead.stage !== 'Lost') {
    lead.stage = next;
  }
  lead.lastContactAt = new Date();
  await lead.save();
  return lead;
}

module.exports = { upsertLead, STAGE_RANK };
