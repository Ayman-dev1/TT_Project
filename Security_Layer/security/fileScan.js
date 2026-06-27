'use strict';

const crypto = require('crypto');
const path   = require('path');

// ─── Allowed file signatures ──────────────────────────────────────────────────
// magic: [[byteOffset, [byte, byte, ...]]] — ALL checks must pass for a match
const SIGNATURES = [
  {
    mime: 'image/jpeg',
    magic: [[0, [0xFF, 0xD8, 0xFF]]],
    ext: ['.jpg', '.jpeg'],
    maxBytes: 15 * 1024 * 1024   // 15 MB
  },
  {
    mime: 'image/png',
    magic: [[0, [0x89, 0x50, 0x4E, 0x47]]],
    ext: ['.png'],
    maxBytes: 15 * 1024 * 1024
  },
  {
    mime: 'image/gif',
    magic: [[0, [0x47, 0x49, 0x46, 0x38]]],
    ext: ['.gif'],
    maxBytes: 5 * 1024 * 1024    // 5 MB
  },
  {
    mime: 'image/webp',
    magic: [[0, [0x52, 0x49, 0x46, 0x46]], [8, [0x57, 0x45, 0x42, 0x50]]],
    ext: ['.webp'],
    maxBytes: 15 * 1024 * 1024
  },
  {
    mime: 'application/pdf',
    magic: [[0, [0x25, 0x50, 0x44, 0x46]]],    // %PDF
    ext: ['.pdf'],
    maxBytes: 50 * 1024 * 1024,  // 50 MB
    scanForScripts: true          // PDFs can embed JS — scan the content
  },
  {
    mime: 'image/dicom',
    magic: [[128, [0x44, 0x49, 0x43, 0x4D]]],   // DICM at byte 128
    ext: ['.dcm', '.dicom'],
    maxBytes: 200 * 1024 * 1024  // 200 MB — medical imaging files are large
  },
  {
    mime: 'application/dicom',
    magic: [[128, [0x44, 0x49, 0x43, 0x4D]]],
    ext: ['.dcm', '.dicom'],
    maxBytes: 200 * 1024 * 1024
  },
];

// ─── Blocklist ────────────────────────────────────────────────────────────────
// File extensions that are never allowed regardless of magic bytes
const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.ts',
  '.php', '.asp', '.aspx', '.jsp', '.py', '.rb', '.pl',
  '.dll', '.so', '.dylib', '.dmg', '.pkg', '.msi', '.apk',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.html', '.htm', '.xml', '.svg',
  '.csv', '.xls', '.xlsx', '.xlsm',
  '.doc', '.docm', '.pptm',
  '.jar', '.class', '.bin'
]);

// ─── PDF active-content patterns ─────────────────────────────────────────────
const PDF_THREAT_PATTERNS = [
  /\/JavaScript\s/i,
  /\/JS\s/i,
  /\/OpenAction/i,
  /\/AA\s/i,
  /\/Launch/i,
  /\/EmbeddedFile/i,
  /\/RichMedia/i,
  /eval\s*\(/i,
  /unescape\s*\(/i,
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function matchesMagic(buf, magicChecks) {
  return magicChecks.every(([offset, bytes]) => {
    if (buf.length < offset + bytes.length) return false;
    return bytes.every((b, i) => buf[offset + i] === b);
  });
}

function scanPDFForThreats(buf) {
  // Only scan first 1 MB of the file to avoid runaway cost
  const text  = buf.toString('latin1', 0, Math.min(buf.length, 1024 * 1024));
  const found = PDF_THREAT_PATTERNS.filter(p => p.test(text)).map(p => p.source);
  return found;
}

/** Generates a UUID-based safe filename using the validated MIME type's canonical extension */
function safeName(validatedMime) {
  const sig = SIGNATURES.find(s => s.mime === validatedMime);
  const ext = sig ? sig.ext[0] : '.bin';
  return crypto.randomUUID() + ext;
}

// ─── Main scan function ───────────────────────────────────────────────────────
/**
 * Scans an uploaded file buffer for threats.
 *
 * Wire into your upload route:
 *   const result = fileScan.scan(buffer, req.file.originalname, req.file.mimetype);
 *   if (!result.safe) return res.status(400).json({ error: result.reason });
 *   // save file using result.safeName
 *
 * @param {Buffer} buffer           - Raw file bytes
 * @param {string} [originalFilename=''] - Original filename (used for extension check)
 * @param {string} [declaredMime='']    - MIME type declared by the client (used for mismatch detection)
 * @returns {object} Scan result
 *   safe:       boolean  — whether the file is safe to store
 *   mime:       string   — validated MIME type (only when safe)
 *   safeName:   string   — UUID-based filename to use for storage (only when safe)
 *   reason:     string   — human-readable rejection reason (when not safe)
 *   threats:    string[] — list of threat codes detected
 *   sizeBytes:  number
 *   scanMs:     number   — scan duration
 *   sha256:     string   — SHA-256 hex digest of the file
 */
function scan(buffer, originalFilename = '', declaredMime = '') {
  const start   = Date.now();
  const threats = [];
  let validatedMime = null;

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { safe: false, reason: 'Empty or invalid file', threats: [], sizeBytes: 0, scanMs: 0, sha256: null };
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const ext    = path.extname(originalFilename).toLowerCase();

  // ── Extension blocklist ───────────────────────────────────────────────────
  if (BLOCKED_EXTENSIONS.has(ext)) {
    return {
      safe: false,
      reason:    `Blocked file type: ${ext}`,
      threats:   ['BLOCKED_EXTENSION'],
      sizeBytes: buffer.length,
      scanMs:    Date.now() - start,
      sha256
    };
  }

  // ── Magic byte detection ──────────────────────────────────────────────────
  const match = SIGNATURES.find(s => matchesMagic(buffer, s.magic));
  if (!match) {
    return {
      safe: false,
      reason:    'Unrecognised file format — magic bytes do not match any allowed type',
      threats:   ['UNKNOWN_FORMAT'],
      sizeBytes: buffer.length,
      scanMs:    Date.now() - start,
      sha256
    };
  }

  validatedMime = match.mime;

  // ── Extension ↔ magic mismatch (warn, don't reject) ──────────────────────
  if (ext && !match.ext.includes(ext)) {
    threats.push(`EXT_MISMATCH:declared=${ext},detectedType=${validatedMime}`);
  }

  // ── Size limit ────────────────────────────────────────────────────────────
  if (buffer.length > match.maxBytes) {
    return {
      safe: false,
      reason:    `File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB exceeds limit of ${(match.maxBytes / 1024 / 1024).toFixed(0)}MB`,
      threats:   [...threats, 'FILE_TOO_LARGE'],
      sizeBytes: buffer.length,
      scanMs:    Date.now() - start,
      sha256
    };
  }

  // ── MIME type mismatch (warn, don't reject) ───────────────────────────────
  if (declaredMime && declaredMime !== validatedMime) {
    threats.push(`MIME_MISMATCH:declared=${declaredMime},actual=${validatedMime}`);
  }

  // ── PDF active-content scan ───────────────────────────────────────────────
  if (match.scanForScripts) {
    const pdfThreats = scanPDFForThreats(buffer);
    if (pdfThreats.length > 0) {
      return {
        safe: false,
        reason:    'PDF contains embedded scripts or active content',
        threats:   pdfThreats.map(t => 'PDF_SCRIPT:' + t),
        sizeBytes: buffer.length,
        scanMs:    Date.now() - start,
        mime:      validatedMime,
        sha256
      };
    }
  }

  return {
    safe:      true,
    mime:      validatedMime,
    safeName:  safeName(validatedMime),
    reason:    '',
    threats,
    sizeBytes: buffer.length,
    scanMs:    Date.now() - start,
    sha256
  };
}

module.exports = { scan, SIGNATURES, BLOCKED_EXTENSIONS };