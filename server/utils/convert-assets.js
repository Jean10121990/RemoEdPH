/**
 * One-off / maintenance: convert PNG assets under public/images to WebP alongside originals.
 * Run: node server/utils/convert-assets.js
 */
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

const IMAGES_ROOT = path.join(__dirname, '../../public/images');
const WEBP_QUALITY = 80;

async function walkPngFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await walkPngFiles(full)));
    } else if (ent.isFile() && /\.png$/i.test(ent.name)) {
      out.push(full);
    }
  }
  return out;
}

async function convertPngToWebp(pngPath) {
  const dir = path.dirname(pngPath);
  const base = path.basename(pngPath, path.extname(pngPath));
  const webpPath = path.join(dir, `${base}.webp`);
  await sharp(pngPath).rotate().webp({ quality: WEBP_QUALITY }).toFile(webpPath);
  return webpPath;
}

async function main() {
  let pngFiles;
  try {
    pngFiles = await walkPngFiles(IMAGES_ROOT);
  } catch (e) {
    console.error('Cannot read', IMAGES_ROOT, e.message || e);
    process.exit(1);
  }

  if (pngFiles.length === 0) {
    console.log('No PNG files under', IMAGES_ROOT);
    return;
  }

  console.log('Found', pngFiles.length, 'PNG file(s). Converting to WebP (quality', WEBP_QUALITY + ')...\n');

  let ok = 0;
  let fail = 0;
  for (const pngPath of pngFiles) {
    const rel = path.relative(path.join(__dirname, '../..'), pngPath);
    try {
      const webpPath = await convertPngToWebp(pngPath);
      console.log('OK ', rel, '→', path.relative(path.join(__dirname, '../..'), webpPath));
      ok += 1;
    } catch (e) {
      console.error('FAIL', rel, e.message || e);
      fail += 1;
    }
  }

  console.log('\nDone:', ok, 'converted,', fail, 'failed.');
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
