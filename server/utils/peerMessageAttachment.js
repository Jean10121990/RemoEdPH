/**
 * Shared multer + helpers for peer-message file attachments (images + PDF).
 */
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { createGridFsStorage } = require('../services/gridFsMulterStorage');

const ATTACH_PREFIX = 'message-attachments';
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf']);

const storage = createGridFsStorage({
  prefix: ATTACH_PREFIX,
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase() || '';
    const safeExt = ALLOWED_EXT.has(ext) ? ext : '';
    cb(null, `msg-${Date.now()}-${crypto.randomInt(0, 1e9)}${safeExt}`);
  },
});

const peerMessageAttachUpload = multer({
  storage,
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ALLOWED_EXT.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Attachment must be an image (JPEG, PNG, GIF, WebP) or PDF.'), false);
    }
  },
  limits: { fileSize: MAX_BYTES },
});

function attachmentFromMulterFile(file) {
  if (!file || !file.filename) return null;
  return {
    url: `/uploads/message-attachments/${file.filename}`,
    originalName: String(file.originalname || file.filename).slice(0, 200),
    mimeType: String(file.mimetype || 'application/octet-stream').slice(0, 120),
    size: Number(file.size) || 0,
  };
}

function serializeAttachment(att) {
  if (!att || !att.url) return null;
  return {
    url: String(att.url),
    originalName: att.originalName || null,
    mimeType: att.mimeType || null,
    size: att.size != null ? Number(att.size) : null,
  };
}

function snippetForChatList(message, attachment) {
  const text = String(message || '').trim();
  if (text) return text;
  if (attachment && attachment.originalName) return `📎 ${attachment.originalName}`;
  if (attachment && attachment.url) return '📎 Attachment';
  return '';
}

function isImageMime(mime) {
  return /^image\//i.test(String(mime || ''));
}

module.exports = {
  peerMessageAttachUpload,
  attachmentFromMulterFile,
  serializeAttachment,
  snippetForChatList,
  isImageMime,
  MAX_BYTES,
};
