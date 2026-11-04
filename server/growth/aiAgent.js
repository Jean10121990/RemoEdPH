'use strict';

const AiKnowledge = require('../models/AiKnowledge');

const RULES = [
  { test: /refund|complaint|human|agent/i, handoff: true, reply: 'I will ask a RemoEd person to continue this chat.' },
  { test: /plan|price|cost|how much/i, reply: 'Plans are 1, 3, 6, or 12 months. RemoSpark is 22 lessons for $154 (1 month). A 25-minute class is $7. Assessment: https://remoedph.com/#assessment' },
  { test: /assess/i, reply: 'Start the free assessment: https://remoedph.com/#assessment' },
];

function ruleReply(text) {
  const hit = RULES.find((r) => r.test.test(text));
  if (!hit) {
    return { reply: 'RemoEd is live one-on-one English for ages 3–6. Assessment: https://remoedph.com/#assessment', handoff: false };
  }
  return { reply: hit.reply, handoff: !!hit.handoff };
}

async function answerParent(text) {
  const rules = ruleReply(text);
  if (rules.handoff || !process.env.GEMINI_API_KEY) return { ...rules, source: 'rules' };
  const day = new Date().toISOString().slice(0, 10);
  if (answerParent._day !== day) {
    answerParent._day = day;
    answerParent._tokens = 0;
  }
  const cap = Number(process.env.GEMINI_DAILY_TOKEN_CAP || 1500);
  if (answerParent._tokens >= cap) return { ...rules, source: 'rules' };
  try {
    const knowledge = await AiKnowledge.find({}).lean();
    const facts = knowledge.map((k) => k.body).join('\n');
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Answer in the parent's language. USD prices first. Do not offer discounts, refunds, or student data. Facts:\n${facts}\n\nParent: ${text}`,
          }],
        }],
      }),
    });
    if (!res.ok) return { ...rules, source: 'rules' };
    const data = await res.json();
    const reply = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;
    if (!reply) return { ...rules, source: 'rules' };
    answerParent._tokens += Math.ceil(String(reply).length / 4);
    return { reply, handoff: /refund/i.test(reply), source: 'gemini' };
  } catch (_e) {
    return { ...rules, source: 'rules' };
  }
}

module.exports = { answerParent, ruleReply };
