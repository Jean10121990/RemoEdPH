/**
 * Shrinks the pictures inside a .pptx so it fits Microsoft's online viewer (about 10 MB).
 * Entry names and extensions are kept, so the slide XML links stay valid.
 * Never throws: on any failure the original file is left unchanged.
 */
const fsp = require('fs').promises;
const AdmZip = require('adm-zip');
const sharp = require('sharp');

const OFFICE_VIEWER_MAX_BYTES = 10 * 1024 * 1024;
const MIN_IMAGE_BYTES = 150 * 1024;
const MAX_IMAGE_WIDTH = 1920;
const MEDIA_RE = /^ppt\/media\/[^/]+\.(jpe?g|png)$/i;

async function recompressImage(buffer, ext) {
  let img = sharp(buffer, { failOn: 'none' }).rotate().resize({
    width: MAX_IMAGE_WIDTH,
    fit: 'inside',
    withoutEnlargement: true
  });
  img = ext === 'png'
    ? img.png({ compressionLevel: 9, adaptiveFiltering: true })
    : img.jpeg({ quality: 78, mozjpeg: true });
  return img.toBuffer();
}

/**
 * @param {string} filePath absolute path of the stored deck
 * @returns {Promise<{compressed:boolean,beforeBytes:number,afterBytes:number,overLimit:boolean}>}
 */
async function compressPptxIfLarge(filePath) {
  let beforeBytes = 0;
  try {
    beforeBytes = (await fsp.stat(filePath)).size;
  } catch (_e) {
    return { compressed: false, beforeBytes: 0, afterBytes: 0, overLimit: false };
  }
  const unchanged = () => ({
    compressed: false,
    beforeBytes,
    afterBytes: beforeBytes,
    overLimit: beforeBytes > OFFICE_VIEWER_MAX_BYTES
  });

  if (!/\.pptx$/i.test(String(filePath)) || beforeBytes <= OFFICE_VIEWER_MAX_BYTES) return unchanged();

  const tmpPath = filePath + '.compressing.tmp';
  try {
    const zip = new AdmZip(filePath);
    let replaced = 0;
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || !MEDIA_RE.test(entry.entryName)) continue;
      if (entry.header.size < MIN_IMAGE_BYTES) continue;
      try {
        const original = entry.getData();
        const ext = /\.png$/i.test(entry.entryName) ? 'png' : 'jpg';
        const next = await recompressImage(original, ext);
        if (next.length > 0 && next.length < original.length) {
          zip.updateFile(entry, next);
          replaced += 1;
        }
      } catch (imgErr) {
        console.warn('[UPLOAD] PPTX image skipped:', entry.entryName, imgErr.message || imgErr);
      }
    }
    if (!replaced) return unchanged();

    zip.writeZip(tmpPath);
    const afterBytes = (await fsp.stat(tmpPath)).size;
    if (afterBytes >= beforeBytes) {
      await fsp.unlink(tmpPath).catch(() => {});
      return unchanged();
    }
    await fsp.rename(tmpPath, filePath);
    return {
      compressed: true,
      beforeBytes,
      afterBytes,
      overLimit: afterBytes > OFFICE_VIEWER_MAX_BYTES
    };
  } catch (err) {
    console.warn('[UPLOAD] PPTX compression failed, keeping original:', err.message || err);
    await fsp.unlink(tmpPath).catch(() => {});
    return unchanged();
  }
}

module.exports = { OFFICE_VIEWER_MAX_BYTES, compressPptxIfLarge };
