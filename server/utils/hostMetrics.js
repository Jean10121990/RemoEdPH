const os = require('os');
const fs = require('fs').promises;

let prevCpuTimes = null;

/**
 * Host CPU utilization approximated from /proc-style counters (works on Linux, macOS, Windows Node).
 * @returns {number|null} 0–100, or null on first call (no prior sample).
 */
function getCpuLoadPercent() {
  const cpus = os.cpus();
  if (!prevCpuTimes) {
    prevCpuTimes = cpus.map((c) => ({ ...c.times }));
    return null;
  }
  let idleDiff = 0;
  let totalDiff = 0;
  for (let i = 0; i < cpus.length; i++) {
    const a = prevCpuTimes[i];
    const b = cpus[i].times;
    for (const k of Object.keys(b)) {
      const delta = b[k] - (a[k] || 0);
      totalDiff += delta;
      if (k === 'idle') idleDiff += delta;
    }
  }
  prevCpuTimes = cpus.map((c) => ({ ...c.times }));
  if (totalDiff <= 0) return 0;
  const pct = 100 * (1 - idleDiff / totalDiff);
  return Math.round(Math.min(100, Math.max(0, pct)) * 10) / 10;
}

function getMemoryMetrics() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    totalBytes: total,
    usedBytes: used,
    freeBytes: free,
    usedMb: Math.round(used / (1024 * 1024)),
    totalMb: Math.round(total / (1024 * 1024)),
    usedGb: Math.round((used / (1024 * 1024 * 1024)) * 100) / 100,
    totalGb: Math.round((total / (1024 * 1024 * 1024)) * 100) / 100,
    usedPercent: total > 0 ? Math.round((100 * used) / total * 10) / 10 : 0,
  };
}

/**
 * Disk space for the volume containing cwd (Node 18.13+ statfs).
 */
async function getDiskForCwd() {
  try {
    if (typeof fs.statfs !== 'function') {
      return { supported: false, freeBytes: null, totalBytes: null, usedBytes: null };
    }
    const s = await fs.statfs(process.cwd());
    const bsize = Number(s.bsize) || 4096;
    const blocks = Number(s.blocks) || 0;
    const bavail = Number(s.bavail) || 0;
    const totalBytes = blocks * bsize;
    const freeBytes = bavail * bsize;
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    return {
      supported: true,
      totalBytes,
      freeBytes,
      usedBytes,
      usedGb: Math.round((usedBytes / (1024 * 1024 * 1024)) * 100) / 100,
      totalGb: Math.round((totalBytes / (1024 * 1024 * 1024)) * 100) / 100,
      freeGb: Math.round((freeBytes / (1024 * 1024 * 1024)) * 100) / 100,
      usedPercent: totalBytes > 0 ? Math.round((100 * usedBytes) / totalBytes * 10) / 10 : 0,
    };
  } catch (_e) {
    return { supported: false, freeBytes: null, totalBytes: null, usedBytes: null, error: 'statfs_unavailable' };
  }
}

module.exports = {
  getCpuLoadPercent,
  getMemoryMetrics,
  getDiskForCwd,
};
