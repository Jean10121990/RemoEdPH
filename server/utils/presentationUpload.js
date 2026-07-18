const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const OFFICE_EMBED_HOSTS = [
  'view.officeapps.live.com',
  'officeapps.live.com',
  'onedrive.live.com',
  'sharepoint.com',
  'microsoft.com'
];

function isValidOfficeEmbedUrl(raw) {
  if (!raw || typeof raw !== 'string') return false;
  let url;
  try {
    url = new URL(raw.trim());
  } catch (_e) {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return OFFICE_EMBED_HOSTS.some((h) => host === h || host.endsWith('.' + h));
}

function findHtml5Entry(dir) {
  const candidates = ['index.html', 'story.html', 'presentation.html', 'player.html'];
  for (let i = 0; i < candidates.length; i++) {
    const p = path.join(dir, candidates[i]);
    if (fs.existsSync(p)) return candidates[i];
  }
  const walk = (folder, depth) => {
    if (depth > 4) return null;
    let entries;
    try {
      entries = fs.readdirSync(folder, { withFileTypes: true });
    } catch (_e) {
      return null;
    }
    for (let i = 0; i < entries.length; i++) {
      const ent = entries[i];
      const full = path.join(folder, ent.name);
      if (ent.isFile() && ent.name.toLowerCase().endsWith('.html')) return path.relative(dir, full).split(path.sep).join('/');
      if (ent.isDirectory()) {
        const nested = walk(full, depth + 1);
        if (nested) return nested;
      }
    }
    return null;
  };
  return walk(dir, 0);
}

function extractHtml5Zip(buffer, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const zip = new AdmZip(buffer);
  zip.extractAllTo(destDir, true);
  const entry = findHtml5Entry(destDir);
  if (!entry) {
    throw new Error('HTML5 package must contain at least one .html file');
  }
  return entry;
}

function presentationPublicFields(file) {
  if (!file) return {};
  return {
    presentationType: file.presentationType || 'file',
    embedUrl: file.embedUrl || '',
    html5EntryUrl: file.html5EntryUrl || '',
    html5PackagePath: file.html5PackagePath ? '(stored)' : ''
  };
}

module.exports = {
  isValidOfficeEmbedUrl,
  extractHtml5Zip,
  findHtml5Entry,
  presentationPublicFields,
  PRESENTATIONS_ROOT: path.join(__dirname, '../../uploads/presentations')
};
