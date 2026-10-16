const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.OAUTH_STATE_SECRET = process.env.OAUTH_STATE_SECRET || 'test-oauth-state-secret';

const { signState, verifyState, signFinishTicket, verifyFinishTicket } = require('../server/services/oauthState');
const oauthServiceSrc = fs.readFileSync(
  path.join(__dirname, '../server/services/oauthService.js'),
  'utf8'
);
const oauthRoutesSrc = fs.readFileSync(path.join(__dirname, '../server/routes/oauthRoutes.js'), 'utf8');
const studentModelSrc = fs.readFileSync(path.join(__dirname, '../server/models/Student.js'), 'utf8');

test('oauth state round-trips and rejects tampering', () => {
  const token = signState({ intent: 'student_register', trialToken: 'abc12345' });
  const body = verifyState(token);
  assert.equal(body.intent, 'student_register');
  assert.equal(body.trialToken, 'abc12345');
  assert.equal(verifyState(token.slice(0, -2) + 'xx'), null);
});

test('finish ticket requires oauth_finish purpose', () => {
  const ticket = signFinishTicket({ role: 'student', token: 'jwt-here' });
  const body = verifyFinishTicket(ticket);
  assert.equal(body.purpose, 'oauth_finish');
  assert.equal(body.role, 'student');
  assert.equal(verifyFinishTicket(signState({ role: 'student', token: 'x' })), null);
});

test('oauth student create stays assessment-gated in source', () => {
  assert.match(oauthServiceSrc, /ASSESSMENT_REQUIRED/);
  assert.match(oauthServiceSrc, /student_register/);
  assert.match(oauthServiceSrc, /AssessmentTrial/);
  assert.match(oauthServiceSrc, /EMAIL_MISMATCH/);
  assert.match(oauthServiceSrc, /teacher_signup/);
  assert.equal(/createAdmin|Admin\.create|userRole:\s*'admin'/.test(oauthServiceSrc), false);
  assert.match(oauthServiceSrc, /admin_login/);
  assert.match(oauthServiceSrc, /admin_gate/);
  assert.match(oauthRoutesSrc, /admin-gate/);
});

test('models and routes expose authProviders + providers endpoint', () => {
  assert.match(studentModelSrc, /authProviders/);
  assert.match(oauthRoutesSrc, /\/providers/);
  assert.match(oauthRoutesSrc, /\/exchange/);
  assert.match(oauthRoutesSrc, /set-password/);
});
