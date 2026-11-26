const test = require('node:test');
const assert = require('node:assert/strict');
const fb = require('../server/growth/facebookPage');
const { letters } = require('../server/growth/parentSequence');

test('facebook lead fields map name, email, phone, and form', () => {
  const fields = fb.leadFieldsFromGraph({
    id: '99',
    created_time: '2026-01-02T00:00:00+0000',
    field_data: [
      { name: 'full_name', values: ['Ana Cruz'] },
      { name: 'email', values: ['Ana@Example.com'] },
      { name: 'phone_number', values: ['0917'] },
    ],
  }, { id: 'form1', name: 'Free class' });
  assert.equal(fields.facebookLeadId, '99');
  assert.equal(fields.name, 'Ana Cruz');
  assert.equal(fields.email, 'ana@example.com');
  assert.equal(fields.phone, '0917');
  assert.equal(fields.formId, 'form1');
  assert.equal(fields.formName, 'Free class');
});

test('the onboarding letter is for ages 3 to 6 on the RemoEd App', () => {
  const onboard = letters('Ana').onboard;
  assert.match(onboard.text, /ages 3 to 6/);
  assert.match(onboard.text, /RemoEd App/);
  assert.equal(onboard.text.includes('6 to 12'), false);
});
