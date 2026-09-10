/**
 * Convert a .ppt/.pptx file to a cached preview.pdf (+ optional slide PNGs)
 * for in-app viewing. Microsoft Office Online cannot fetch localhost or
 * login-gated URLs, so Lessons Library / live class use same-origin assets.
 */
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const FormData = require('form-data');
const axios = require('axios');
const libre = require('libreoffice-convert');
const AdmZip = require('adm-zip');
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

async function downloadRemotePptx(url, destPath, authToken) {
  const headers = {
    Accept:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,application/octet-stream,*/*',
  };
  let fetchUrl = url;
  if (authToken) {
    headers.Authorization = 'Bearer ' + authToken;
    try {
      const u = new URL(url);
      if (!u.searchParams.get('token')) u.searchParams.set('token', authToken);
      fetchUrl = u.toString();
    } catch (_e) {
      fetchUrl = url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(authToken);
    }
  }
  const response = await axios.get(fetchUrl, {
    responseType: 'arraybuffer',
    timeout: 180000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    validateStatus: (s) => s === 200,
    headers,
  });
  const buf = Buffer.from(response.data);
  if (!buf.length) throw new Error('Empty presentation download');
  // Reject JSON error bodies mistakenly returned as 200
  const head = buf.slice(0, 32).toString('utf8').trim();
  if (head.startsWith('{') && /"error"/i.test(head)) {
    throw new Error('Remote host returned an error JSON instead of the PowerPoint file');
  }
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  await fsp.writeFile(destPath, buf);
}

function resolveUploadsFetchToken() {
  const mirror = String(process.env.UPLOADS_FETCH_TOKEN || process.env.MEDIA_FETCH_TOKEN || '').trim();
  if (mirror) return mirror;
  try {
    const jwt = require('jsonwebtoken');
    const secret = process.env.JWT_SECRET || 'your_jwt_secret';
    return jwt.sign(
      { purpose: 'uploads-fetch', role: 'admin', isAdmin: true, userType: 'admin' },
      secret,
      { expiresIn: '10m' }
    );
  } catch (_e) {
    return '';
  }
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
    const fetchToken = resolveUploadsFetchToken();
    try {
      await downloadRemotePptx(remoteUrl, destPath, fetchToken);
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
    'This PowerPoint file is not on this machine’s uploads/ folder. ' +
      (origin
        ? 'Could not pull it from ' + origin + ' (auth or file missing on production). '
        : 'Set FRONTEND_URL to your production site to auto-cache it, or ') +
      're-upload the .pptx in Lessons Library on this environment.'
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
        'Could not convert this PowerPoint to PDF for preview. ' +
        'Set CLOUDMERSIVE_API_KEY on the server (Cloud Run secret), or install LibreOffice (soffice). ' +
        'Details: ' +
        (cloudErr && cloudErr.message ? cloudErr.message : 'Cloudmersive unavailable') +
        ' / ' +
        (libreErr && libreErr.message ? libreErr.message : 'LibreOffice unavailable');
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

function publicSlideUrl(fileId, slideFileName) {
  return (
    '/uploads/presentations/' +
    encodeURIComponent(String(fileId)) +
    '/slides/' +
    encodeURIComponent(String(slideFileName))
  );
}

/**
 * Count slides inside a .pptx by enumerating ppt/slides/slideN.xml entries.
 * Returns 0 for .ppt (binary) or unreadable archives.
 */
function countSlidesInPptx(sourcePath) {
  if (!sourcePath || !/\.pptx$/i.test(sourcePath)) return 0;
  try {
    const zip = new AdmZip(sourcePath);
    let count = 0;
    zip.getEntries().forEach((entry) => {
      const name = String(entry.entryName || '').replace(/\\/g, '/');
      if (/^ppt\/slides\/slide\d+\.xml$/i.test(name)) count += 1;
    });
    return count;
  } catch (err) {
    console.warn('[pptxLocalPreview] PPTX slide count failed:', err.message || err);
    return 0;
  }
}

/** pdf-poppler calls process.exit on unsupported platforms — never require it there. */
function loadPdfPopplerSafe() {
  const platform = os.platform();
  if (platform !== 'win32' && platform !== 'darwin') return null;
  try {
    return require('pdf-poppler');
  } catch (err) {
    console.warn('[pptxLocalPreview] pdf-poppler unavailable:', err.message || err);
    return null;
  }
}

async function countPdfPages(pdfPath) {
  const poppler = loadPdfPopplerSafe();
  if (poppler && typeof poppler.info === 'function') {
    try {
      const info = await poppler.info(pdfPath);
      const pages = parseInt(info.pages, 10);
      if (Number.isFinite(pages) && pages >= 1) return pages;
    } catch (err) {
      console.warn('[pptxLocalPreview] pdfinfo failed:', err.message || err);
    }
  }
  try {
    const buf = await fsp.readFile(pdfPath);
    const text = buf.toString('latin1');
    const matches = text.match(/\/Type\s*\/Page(?!\s*s)/g);
    if (matches && matches.length >= 1) return matches.length;
  } catch (_e) {
    /* ignore */
  }
  return 0;
}

async function collectExistingSlideUrls(slidesDir, fileId) {
  try {
    const names = await fsp.readdir(slidesDir);
    const pngs = names
      .filter((n) => /^slide[-_]?\d+\.png$/i.test(n))
      .sort((a, b) => {
        const na = parseInt(String(a).replace(/\D+/g, ''), 10) || 0;
        const nb = parseInt(String(b).replace(/\D+/g, ''), 10) || 0;
        return na - nb;
      });
    return pngs.map((n) => publicSlideUrl(fileId, n));
  } catch (_e) {
    return [];
  }
}

async function normalizeSlideFileNames(slidesDir) {
  const names = await fsp.readdir(slidesDir);
  const candidates = names.filter((n) => /\.png$/i.test(n));
  const mapped = [];
  for (const name of candidates) {
    const m = String(name).match(/(\d+)\.png$/i);
    if (!m) continue;
    const idx = parseInt(m[1], 10);
    if (!Number.isFinite(idx) || idx < 1) continue;
    const destName = `slide-${idx}.png`;
    const from = path.join(slidesDir, name);
    const to = path.join(slidesDir, destName);
    if (name !== destName) {
      try {
        if (await fileExists(to)) await fsp.unlink(to).catch(() => {});
        await fsp.rename(from, to);
      } catch (_e) {
        try {
          await fsp.copyFile(from, to);
          await fsp.unlink(from).catch(() => {});
        } catch (_c) {
          /* keep original name */
          mapped.push({ idx, name });
          continue;
        }
      }
    }
    mapped.push({ idx, name: destName });
  }
  mapped.sort((a, b) => a.idx - b.idx);
  return mapped;
}

/**
 * Render PDF pages to PNGs under destDir/slides using pdf-poppler (win/mac)
 * or pdf2pic (needs GraphicsMagick). Returns public slide URLs.
 */
async function renderPdfPagesToPngs(pdfPath, slidesDir, fileId) {
  await fsp.mkdir(slidesDir, { recursive: true });

  const existing = await collectExistingSlideUrls(slidesDir, fileId);
  if (existing.length) return existing;

  const poppler = loadPdfPopplerSafe();
  if (poppler && typeof poppler.convert === 'function') {
    await poppler.convert(pdfPath, {
      format: 'png',
      out_dir: slidesDir,
      out_prefix: 'slide',
      scale: 1280
    });
    const normalized = await normalizeSlideFileNames(slidesDir);
    if (normalized.length) {
      return normalized.map((s) => publicSlideUrl(fileId, s.name));
    }
  }

  try {
    const { fromPath } = require('pdf2pic');
    const converter = fromPath(pdfPath, {
      density: 120,
      saveFilename: 'slide',
      savePath: slidesDir,
      format: 'png',
      width: 1280,
      height: 720
    });
    const pageCount = (await countPdfPages(pdfPath)) || 50;
    const results = await converter.bulk(-1, { responseType: 'image' }).catch(async () => {
      const out = [];
      for (let i = 1; i <= pageCount; i++) {
        try {
          out.push(await converter(i, { responseType: 'image' }));
        } catch (_pageErr) {
          break;
        }
      }
      return out;
    });
    if (Array.isArray(results) && results.length) {
      const normalized = await normalizeSlideFileNames(slidesDir);
      if (normalized.length) {
        return normalized.map((s) => publicSlideUrl(fileId, s.name));
      }
    }
  } catch (pdf2picErr) {
    console.warn('[pptxLocalPreview] pdf2pic failed:', pdf2picErr.message || pdf2picErr);
  }

  return collectExistingSlideUrls(slidesDir, fileId);
}

/**
 * On PPTX upload: convert to PDF + slide images and return Lesson.files metadata.
 */
async function convertPptxUploadAssets({ sourcePath, fileName, fileId, destDir }) {
  const id = String(fileId || '');
  if (!id) throw new Error('Missing presentation id');
  if (!sourcePath) throw new Error('Missing source path');

  const dir = destDir || path.join(PRESENTATIONS_ROOT, id);
  await fsp.mkdir(dir, { recursive: true });

  const pdfResult = await ensurePptxPreviewPdf({ sourcePath, fileName });
  const previewPath = path.join(dir, 'preview.pdf');
  if (pdfResult.previewPath !== previewPath) {
    await fsp.copyFile(pdfResult.previewPath, previewPath);
  }

  let slideCount = countSlidesInPptx(sourcePath);

  const slidesDir = path.join(dir, 'slides');
  let slideUrls = [];
  try {
    slideUrls = await renderPdfPagesToPngs(previewPath, slidesDir, id);
    if (slideUrls.length) slideCount = slideUrls.length;
  } catch (imgErr) {
    console.warn('[pptxLocalPreview] Slide image render failed:', imgErr.message || imgErr);
  }

  if (!slideCount) {
    slideCount = await countPdfPages(previewPath);
  }

  return {
    convertedPdfUrl: publicPreviewUrl(id),
    slideUrls,
    slideCount: slideCount >= 1 ? slideCount : null,
    previewPath,
    method: pdfResult.method || (pdfResult.cached ? 'cached' : null),
    cached: !!pdfResult.cached
  };
}

module.exports = {
  diskPathFromHtml5EntryUrl,
  ensurePptxPreviewPdf,
  materializePptxSource,
  buildLessonPptxPreviewPdf,
  convertPptxUploadAssets,
  countSlidesInPptx,
  publicPreviewUrl,
  publicSlideUrl,
  fileExists
};
