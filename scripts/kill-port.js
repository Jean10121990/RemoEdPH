/**
 * Free PORT before starting the API (avoids EADDRINUSE from leftover node processes).
 * Windows: netstat + taskkill. Unix: lsof + kill.
 */
const { execSync } = require('child_process');

const port = String(process.env.PORT || 8080).trim();

function killWindowsPort(targetPort) {
  let out = '';
  try {
    out = execSync(`netstat -ano | findstr :${targetPort}`, { encoding: 'utf8' });
  } catch {
    return;
  }

  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    if (!line.includes('LISTENING')) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
  }

  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      console.log(`🔌 Freed port ${targetPort} (stopped PID ${pid})`);
    } catch {
      console.warn(`⚠️  Could not stop PID ${pid} on port ${targetPort}`);
    }
  }
}

function killUnixPort(targetPort) {
  try {
    execSync(`lsof -ti:${targetPort} | xargs -r kill -9`, { stdio: 'ignore' });
    console.log(`🔌 Freed port ${targetPort}`);
  } catch {
    // already free
  }
}

if (process.platform === 'win32') {
  killWindowsPort(port);
} else {
  killUnixPort(port);
}
