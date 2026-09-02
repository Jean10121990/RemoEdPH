/**
 * Convert a .ppt/.pptx file to a cached preview.pdf for in-app viewing.
 * Microsoft Office Online cannot fetch localhost or login-gated URLs, so the
 * Lessons Library preview uses a same-origin PDF instead.
 */
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const FormData = require('form-data');
const axios = require('axios');
const libre = require('libreoffice-convert');
const { PRESENTATIONS_ROOT } = require('./presentationUpload');

const libreConvertAsync = promisify(libre.convert);

function diskPathFromHtml5EntryUrl(html5EntryUrl) {
  if (!html5EntryUrl || typeof html5EntryUrl !== 'string') return null;
  if (!html5EntryUrl.startsWith('/uploads/presentations/')) return null;
  const parts = html5EntryUrl.split('/').filter(Boolean);
  const decoded = parts.map((p, i) => (i >= 3 ? decodeURIComponent(p) : p));
  return path.join(__dirname, '../..', ...decoded);
}

async function fileExists(p) {
  try {
    await fsp.access(p, fs.constants.R_OK);
    return true;
  } catch (_e) {
    return false;
  }
}

function safePptxFileName(name) {
  const base = path.basename(String(name || 'presentation.pptx')).replace(/[^a-zA-Z0-9._\- ()[\]]+/g, '_');
  if (/\.(ppt|pptx)$/i.test(base)) return base;
  return (base || 'presentation') + '.pptx';
}

function lessonFileBase64Payload(fileData) {
  if (!fileData || typeof fileData !== 'string') return null;
  const s = fileData.trim();
  if (!s) return null;
  if (s.startsWith('data:')) {
    const base64Idx = s.indexOf('base64,');
    if (base64Idx !== -1) return s.slice(base64Idx + 7);
    const comma = s.indexOf(',');
    return comma >= 0 ? s.slice(comma + 1) : null;
  }
  return s;
}

function publicRemoteOrigin() {
  const envUrl = String(process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
  if (envUrl && !/localhost|127\.0\.0\.1/i.test(envUrl)) return envUrl;
  return '';
}

async function downloadRemotePptx(url, destPath) {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 180000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    validateStatus: (s) => s === 200,
    headers: {
      Accept:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,application/octet-stream,*/*'
    }
  });
  const buf = Buffer.from(response.data);
  if (!buf.length) throw new Error('Empty presentation download');
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  await fsp.writeFile(destPath, buf);
}

/**
 * Locate the PPTX on disk, materialize it from Mongo base64, or pull it from the
 * public FRONTEND_URL host when this machine does not have uploads/.
 */
async function materializePptxSource(file) {
  const fileId = String(file && file._id ? file._id : '');
  if (!fileId) throw new Error('Missing presentation id');
  const destDir = path.join(PRESENTATIONS_ROOT, fileId);
  const storedName = safePptxFileName(file.fileName);
  const destPath = path.join(destDir, storedName);
  const cachedPreview = path.join(destDir, 'preview.pdf');

  const candidates = [];
  const fromUrl = diskPathFromHtml5EntryUrl(file.html5EntryUrl);
  if (fromUrl) candidates.push(fromUrl);
  if (file.html5PackagePath) {
    try {
      const names = await fsp.readdir(file.html5PackagePath);
      const pptName = names.find((n) => /\.(ppt|pptx)$/i.test(n));
      if (pptName) candidates.push(path.join(file.html5PackagePath, pptName));
    } catch (_e) {
      /* ignore missing package dir */
    }
  }
  candidates.push(destPath);

  for (const p of candidates) {
    if (p && (await fileExists(p))) return { sourcePath: p, destDir, cachedPreview };
  }

  await fsp.mkdir(destDir, { recursive: true });

  const b64 = lessonFileBase64Payload(file.fileData);
  if (b64) {
    await fsp.writeFile(destPath, Buffer.from(b64, 'base64'));
    return { sourcePath: destPath, destDir, cachedPreview };
  }

  const origin = publicRemoteOrigin();
  const rel = String(file.html5EntryUrl || '');
  if (origin && rel.startsWith('/uploads/presentations/')) {
    const remoteUrl = origin + rel;
    try {
      await downloadRemotePptx(remoteUrl, destPath);
      console.log('[pptxLocalPreview] Cached presentation from', remoteUrl);
      return { sourcePath: destPath, destDir, cachedPreview };
    } catch (remoteErr) {
      console.warn('[pptxLocalPreview] Remote fetch failed:', remoteErr.message || remoteErr);
    }
  }

  if (await fileExists(cachedPreview)) {
    return { sourcePath: null, destDir, cachedPreview, previewOnly: true };
  }

  throw new Error(
    'This PowerPoint is missing from the server. Ask an admin to re-upload it in Lessons Library, then you can preview it before class.'
  );
}

async function convertViaCloudmersive(sourcePath, fileName) {
  const apiKey = String(process.env.CLOUDMERSIVE_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!apiKey || apiKey === 'your-api-key-here') {
    throw new Error('CLOUDMERSIVE_API_KEY not configured');
  }
  const form = new FormData();
  form.append('file', fs.createReadStream(sourcePath), {
    filename: fileName || path.basename(sourcePath)
  });
  const response = await axios.post('https://api.cloudmersive.com/convert/pptx/to/pdf', form, {
    headers: {
      ...form.getHeaders(),
      Apikey: apiKey
    },
    responseType: 'arraybuffer',
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 180000
  });
  return Buffer.from(response.data);
}

async function convertViaLibreOffice(sourcePath) {
  const pptBuffer = await fsp.readFile(sourcePath);
  return libreConvertAsync(pptBuffer, '.pdf', undefined);
}

/**
 * Ensure preview.pdf exists beside the PPTX. Returns absolute path to PDF.
 */
async function ensurePptxPreviewPdf({ sourcePath, fileName }) {
  if (!sourcePath) throw new Error('Missing source path');
  if (!(await fileExists(sourcePath))) {
    throw new Error('Presentation file missing on this machine (uploads/presentations). Re-upload the PPTX locally.');
  }

  const dir = path.dirname(sourcePath);
  const previewPath = path.join(dir, 'preview.pdf');
  if (await fileExists(previewPath)) {
    return { previewPath, cached: true };
  }

  let pdfBuffer = null;
  let method = '';
  try {
    pdfBuffer = await convertViaCloudmersive(sourcePath, fileName);
    method = 'cloudmersive';
  } catch (cloudErr) {
    console.warn('[pptxLocalPreview] Cloudmersive failed, trying LibreOffice:', cloudErr.message || cloudErr);
    try {
      pdfBuffer = await convertViaLibreOffice(sourcePath);
      method = 'libreoffice';
    } catch (libreErr) {
      const msg =
        'Could not convert PPTX for localhost preview. ' +
        (cloudErr.message || '') +
        ' / ' +
        (libreErr.message || '') +
        '. Install LibreOffice or set CLOUDMERSIVE_API_KEY.';
      throw new Error(msg);
    }
  }

  await fsp.writeFile(previewPath, pdfBuffer);
  console.log('[pptxLocalPreview] Wrote', previewPath, 'via', method);
  return { previewPath, cached: false, method };
}

async function buildLessonPptxPreviewPdf(file) {
  const loc = await materializePptxSource(file);
  if (loc.cachedPreview && (await fileExists(loc.cachedPreview)) && (loc.previewOnly || !loc.sourcePath)) {
    return { previewPath: loc.cachedPreview, cached: true };
  }
  if (loc.cachedPreview && (await fileExists(loc.cachedPreview))) {
    return { previewPath: loc.cachedPreview, cached: true };
  }
  const result = await ensurePptxPreviewPdf({
    sourcePath: loc.sourcePath,
    fileName: file.fileName
  });
  const expected = path.join(loc.destDir, 'preview.pdf');
  if (result.previewPath !== expected) {
    try {
      await fsp.copyFile(result.previewPath, expected);
      return { ...result, previewPath: expected };
    } catch (_c) {
      /* serve from wherever conversion wrote */
    }
  }
  return result;
}

function publicPreviewUrl(fileId) {
  return '/uploads/presentations/' + encodeURIComponent(String(fileId)) + '/preview.pdf';
}

module.exports = {
  diskPathFromHtml5EntryUrl,
  ensurePptxPreviewPdf,
  materializePptxSource,
  buildLessonPptxPreviewPdf,
  publicPreviewUrl,
  fileExists
};
