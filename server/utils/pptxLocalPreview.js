/**
 * Convert a local .ppt/.pptx file to a cached preview.pdf for localhost viewing.
 * Office Online cannot fetch localhost URLs — this replaces the old ngrok workaround.
 */
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { promisify } = require('util');
const FormData = require('form-data');
const axios = require('axios');
const libre = require('libreoffice-convert');

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

function publicPreviewUrl(fileId) {
  return '/uploads/presentations/' + encodeURIComponent(String(fileId)) + '/preview.pdf';
}

module.exports = {
  diskPathFromHtml5EntryUrl,
  ensurePptxPreviewPdf,
  publicPreviewUrl,
  fileExists
};
