'use strict';

const { facebookPageAuth, graph } = require('../growth/metaConnect');

const ASSESSMENT = 'https://remoedph.com/index.html?ref=06REM0TR3L#assessment';

async function pageToken() {
  const auth = await facebookPageAuth();
  const token = auth && auth.token ? String(auth.token).trim() : '';
  if (!token) {
    const err = new Error('Connect the Facebook Page before sending a Messenger welcome.');
    err.code = 'NOT_CONNECTED';
    throw err;
  }
  return token;
}

function welcomeText(firstName) {
  const name = String(firstName || '').trim().split(/\s+/)[0] || 'Parent';
  return (
    'Hi ' + name + ', thank you for messaging RemoEd PH. ' +
    'Book your child\'s free assessment at ' + ASSESSMENT + ', ' +
    'or message us on WhatsApp/Zalo at +639168712529.'
  );
}

async function messengerFirstName(psid) {
  try {
    const token = await pageToken();
    const profile = await graph('/' + encodeURIComponent(psid) + '?fields=first_name', token);
    return String((profile && profile.first_name) || '').trim();
  } catch (_err) {
    return '';
  }
}

async function sendMessengerWelcome({ psid, firstName }) {
  const id = String(psid || '').trim();
  if (!id) throw new Error('Missing Messenger id');
  const token = await pageToken();
  const url = new URL('https://graph.facebook.com/v21.0/me/messages');
  url.searchParams.set('access_token', token);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_type: 'RESPONSE',
        recipient: { id },
        message: { text: welcomeText(firstName) },
      }),
    });
  } catch (_err) {
    throw new Error('Could not reach Facebook');
  }
  const data = await res.json().catch(function () { return {}; });
  if (!res.ok || data.error) {
    throw new Error((data.error && data.error.message) || 'Facebook did not send the welcome.');
  }
  return data;
}

module.exports = { sendMessengerWelcome, messengerFirstName };
