/**
 * Smoke test: boot the API briefly and assert GET /api/health returns 200.
 * Designed for CI — no MongoDB/Redis required (REDIS_DISABLED=1).
 */
const { spawn } = require('child_process');
const http = require('http');
const net = require('net');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BOOT_TIMEOUT_MS = Number(process.env.SMOKE_BOOT_TIMEOUT_MS || 60000);
const POLL_MS = 400;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      const port = addr && typeof addr === 'object' ? addr.port : null;
      s.close((err) => {
        if (err) reject(err);
        else if (!port) reject(new Error('no free port'));
        else resolve(port);
      });
    });
    s.on('error', reject);
  });
}

async function main() {
  const PORT = Number(process.env.SMOKE_PORT) || (await getFreePort());
  const HOST = '127.0.0.1';
  const HEALTH_URL = `http://${HOST}:${PORT}/api/health`;

  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: process.env.SMOKE_NODE_ENV || 'test',
    JWT_SECRET: process.env.JWT_SECRET || 'ci-smoke-jwt-secret-not-for-production',
    SESSION_SECRET: process.env.SESSION_SECRET || 'ci-smoke-session-secret',
    REDIS_DISABLED: '1',
    MONGODB_CONNECTION_MODE: 'local',
    // Avoid hanging CI / local smoke on real SMTP verify from a developer .env
    EMAIL_SERVICE_TYPE: 'none',
    EMAIL_USER: '',
    EMAIL_PASS: '',
    SMTP_GMAIL_USER: '',
    SMTP_GMAIL_PASS: '',
    SMTP_USER: '',
    SMTP_PASS: '',
    DISABLE_COMPRESSION_DEBUG: '1',
    SENTRY_ENABLED: '0',
    SENTRY_DSN: '',
  };

  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let settled = false;
  const logs = [];

  function appendLog(chunk, stream) {
    const text = String(chunk);
    logs.push(`[${stream}] ${text}`);
    if (process.env.SMOKE_VERBOSE === '1') {
      process[stream === 'err' ? 'stderr' : 'stdout'].write(text);
    }
  }

  child.stdout.on('data', (d) => appendLog(d, 'out'));
  child.stderr.on('data', (d) => appendLog(d, 'err'));

  function cleanup(code) {
    const finish = () => process.exit(code);
    if (child.exitCode != null || child.killed) {
      finish();
      return;
    }
    child.once('exit', finish);
    try {
      child.kill('SIGTERM');
    } catch (_) {
      /* ignore */
    }
    setTimeout(() => {
      try {
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
            stdio: 'ignore',
            windowsHide: true,
          });
        } else {
          child.kill('SIGKILL');
        }
      } catch (_) {
        /* ignore */
      }
      finish();
    }, 2500).unref();
  }

  function fail(message) {
    if (settled) return;
    settled = true;
    console.error(`✗ Smoke health failed: ${message}`);
    if (logs.length) {
      console.error('--- server output (tail) ---');
      console.error(logs.slice(-40).join(''));
    }
    cleanup(1);
  }

  function ok(body) {
    if (settled) return;
    settled = true;
    console.log('✓ Smoke health OK:', typeof body === 'string' ? body : JSON.stringify(body));
    cleanup(0);
  }

  child.on('error', (err) => fail(`spawn error: ${err.message}`));
  child.on('exit', (code, signal) => {
    if (!settled) {
      fail(`server exited early (code=${code}, signal=${signal})`);
    }
  });

  function getHealth() {
    return new Promise((resolve, reject) => {
      const req = http.get(HEALTH_URL, { timeout: 2000 }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch (_) {
            /* plain text */
          }
          resolve({ statusCode: res.statusCode, raw, json });
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('request timeout'));
      });
    });
  }

  async function waitForHealth() {
    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    let lastErr = null;
    while (Date.now() < deadline) {
      try {
        const result = await getHealth();
        if (result.statusCode === 200 && result.json && result.json.status === 'OK') {
          return result.json;
        }
        lastErr = new Error(
          `unexpected response ${result.statusCode}: ${result.raw.slice(0, 200)}`
        );
      } catch (err) {
        lastErr = err;
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
    throw lastErr || new Error('timed out waiting for /api/health');
  }

  try {
    const body = await waitForHealth();
    ok(body);
  } catch (err) {
    fail(err.message || String(err));
  }
}

main().catch((err) => {
  console.error('✗ Smoke setup failed:', err.message || err);
  process.exit(1);
});
