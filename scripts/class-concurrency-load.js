/**
 * Signaling-only classroom load check.
 * Opens Engine.IO polling sockets. Does not open cameras, book students, or send media.
 *
 * node scripts/class-concurrency-load.js --base-url http://127.0.0.1:3000 --rooms 48 --ramp-ms 200 --duration-ms 20000
 */
const http = require('http');
const https = require('https');
const net = require('net');
const tls = require('tls');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { getJwtSecret } = require('../server/config/jwtSecret');

function arg(name, envName, fallback) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    return process.argv[index + 1];
  }
  if (envName && process.env[envName]) return process.env[envName];
  return fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function request(method, url, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const lib = target.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        method,
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        headers: body
          ? {
              'Content-Type': 'text/plain;charset=UTF-8',
              'Content-Length': Buffer.byteLength(body),
            }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      }
    );
    req.setTimeout(20000, () => req.destroy(new Error('polling timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function packetsOf(body) {
  return String(body || '')
    .split('\u001e')
    .map((part) => part.trim())
    .filter(Boolean);
}

function sidFromOpen(body) {
  for (const packet of packetsOf(body)) {
    if (!packet.startsWith('0')) continue;
    const parsed = JSON.parse(packet.slice(1));
    if (parsed && parsed.sid) return String(parsed.sid);
  }
  return '';
}

function packetFailed(packet) {
  return packet.startsWith('44') || packet.includes('auth-error') || packet.includes('entry-denied');
}

async function openSignalingSocket(baseUrl, token, room, userType) {
  const openUrl = `${baseUrl}/socket.io/?EIO=4&transport=polling&token=${encodeURIComponent(token)}`;
  const opened = await request('GET', openUrl);
  if (opened.status >= 400) throw new Error(`handshake ${opened.status}`);
  const sid = sidFromOpen(opened.body);
  if (!sid) throw new Error('handshake missing sid');
  const pollUrl = `${openUrl}&sid=${encodeURIComponent(sid)}`;
  await request('POST', pollUrl, '40');
  const payload = {
    room,
    userType,
    userId: `${userType}-${room}`,
    username: `${userType}-${room}`,
  };
  await request('POST', pollUrl, `42${JSON.stringify(['join', payload])}`);
  return { sid, pollUrl };
}

async function holdSocket(client, until) {
  while (Date.now() < until) {
    let response;
    try {
      response = await request('GET', client.pollUrl);
    } catch (err) {
      if (Date.now() >= until) return;
      if (String(err && err.message) === 'polling timeout') continue;
      throw err;
    }
    if (response.status >= 400) throw new Error(`poll ${response.status}`);
    for (const packet of packetsOf(response.body)) {
      if (packetFailed(packet)) throw new Error('join refused');
      if (packet.startsWith('2')) await request('POST', client.pollUrl, '3');
    }
  }
}

function parseTurnTarget(turnUrl) {
  const raw = String(turnUrl || '').trim();
  const secure = /^turns:/i.test(raw);
  const rest = raw.replace(/^turns?:/i, '').replace(/^\/\//, '').split('?')[0];
  const hostPort = rest.split('/')[0];
  const colon = hostPort.lastIndexOf(':');
  let host = hostPort;
  let port = secure ? 443 : 3478;
  if (colon > 0 && /^\d+$/.test(hostPort.slice(colon + 1))) {
    host = hostPort.slice(0, colon);
    port = Number(hostPort.slice(colon + 1));
  }
  if (!host) return null;
  return { host, port, secure };
}

function probeTurn(turnUrl) {
  return new Promise((resolve) => {
    const parsed = parseTurnTarget(turnUrl);
    if (!parsed) {
      resolve(false);
      return;
    }
    const socket = parsed.secure
      ? tls.connect({ host: parsed.host, port: parsed.port, servername: parsed.host, rejectUnauthorized: false })
      : net.connect({ host: parsed.host, port: parsed.port });
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(5000, () => finish(false));
    socket.once('secureConnect', () => finish(true));
    socket.once('connect', () => {
      if (!parsed.secure) finish(true);
    });
    socket.once('error', () => finish(false));
  });
}

async function main() {
  const baseUrl = String(arg('--base-url', 'CLASS_LOAD_BASE_URL', 'http://127.0.0.1:3000')).replace(/\/$/, '');
  const rooms = Math.max(1, Number(arg('--rooms', 'CLASS_LOAD_ROOMS', '48')) || 48);
  const rampMs = Math.max(0, Number(arg('--ramp-ms', 'CLASS_LOAD_RAMP_MS', '200')) || 0);
  const durationMs = Math.max(1000, Number(arg('--duration-ms', 'CLASS_LOAD_DURATION_MS', '20000')) || 20000);
  const turnUrl = arg('--turn-url', 'CLASS_LOAD_TURN_URL', '');
  const host = new URL(baseUrl).hostname;
  if ((host === 'remoedph.com' || host === 'www.remoedph.com') && !hasFlag('--allow-production')) {
    console.error('Refusing remoedph.com. Pass --allow-production to run this against production.');
    process.exit(1);
  }

  const token = jwt.sign(
    { role: 'student', username: 'class-load', purpose: 'class-load' },
    getJwtSecret(),
    { expiresIn: '1h' }
  );
  const started = Date.now();
  const until = started + durationMs;
  let connectedRooms = 0;
  let failedJoins = 0;

  const jobs = [];
  for (let index = 0; index < rooms; index += 1) {
    const room = `load-room-${index + 1}`;
    jobs.push(
      (async () => {
        await sleep(index * rampMs);
        try {
          const student = await openSignalingSocket(baseUrl, token, room, 'student');
          const teacher = await openSignalingSocket(baseUrl, token, room, 'teacher');
          await Promise.all([holdSocket(student, until), holdSocket(teacher, until)]);
          connectedRooms += 1;
        } catch (_err) {
          failedJoins += 1;
        }
      })()
    );
  }
  await Promise.all(jobs);

  console.log(`connected rooms: ${connectedRooms}`);
  console.log(`failed joins: ${failedJoins}`);
  console.log(`elapsed ms: ${Date.now() - started}`);
  if (turnUrl) {
    const ok = await probeTurn(turnUrl);
    console.log(`turn probe: ${ok ? 'pass' : 'fail'}`);
  }
  if (failedJoins > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
