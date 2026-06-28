'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const EventEmitter = require('events');

const SCAN_LOG_FILE = path.join(__dirname, 'file_scan_records.json');
const MAX_RECORDS = 5000;
const scanEvents = new EventEmitter();

const STATUS = {
  SAFE: 'Safe',
  SUSPICIOUS: 'Suspicious',
  THREAT: 'Threat'
};

const SIGNATURES = [
  { mime: 'image/jpeg', magic: [[0, [0xFF, 0xD8, 0xFF]]], ext: ['.jpg', '.jpeg'], maxBytes: 15 * 1024 * 1024 },
  { mime: 'image/png', magic: [[0, [0x89, 0x50, 0x4E, 0x47]]], ext: ['.png'], maxBytes: 15 * 1024 * 1024 },
  { mime: 'image/gif', magic: [[0, [0x47, 0x49, 0x46, 0x38]]], ext: ['.gif'], maxBytes: 5 * 1024 * 1024 },
  { mime: 'image/webp', magic: [[0, [0x52, 0x49, 0x46, 0x46]], [8, [0x57, 0x45, 0x42, 0x50]]], ext: ['.webp'], maxBytes: 15 * 1024 * 1024 },
  { mime: 'application/pdf', magic: [[0, [0x25, 0x50, 0x44, 0x46]]], ext: ['.pdf'], maxBytes: 50 * 1024 * 1024, scanPdf: true },
  { mime: 'image/dicom', magic: [[128, [0x44, 0x49, 0x43, 0x4D]]], ext: ['.dcm', '.dicom'], maxBytes: 200 * 1024 * 1024 },
  { mime: 'application/dicom', magic: [[128, [0x44, 0x49, 0x43, 0x4D]]], ext: ['.dcm', '.dicom'], maxBytes: 200 * 1024 * 1024 },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: [[0, [0x50, 0x4B, 0x03, 0x04]]], ext: ['.docx'], maxBytes: 50 * 1024 * 1024, scanContainer: true },
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: [[0, [0x50, 0x4B, 0x03, 0x04]]], ext: ['.xlsx'], maxBytes: 50 * 1024 * 1024, scanContainer: true },
  { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', magic: [[0, [0x50, 0x4B, 0x03, 0x04]]], ext: ['.pptx'], maxBytes: 75 * 1024 * 1024, scanContainer: true },
  { mime: 'application/zip', magic: [[0, [0x50, 0x4B, 0x03, 0x04]]], ext: ['.zip'], maxBytes: 100 * 1024 * 1024, reviewOnly: true, scanContainer: true },
  { mime: 'application/x-rar-compressed', magic: [[0, [0x52, 0x61, 0x72, 0x21]]], ext: ['.rar'], maxBytes: 100 * 1024 * 1024, reviewOnly: true },
  { mime: 'application/x-7z-compressed', magic: [[0, [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C]]], ext: ['.7z'], maxBytes: 100 * 1024 * 1024, reviewOnly: true },
  { mime: 'text/plain', text: true, ext: ['.txt'], maxBytes: 5 * 1024 * 1024, reviewOnly: true },
  { mime: 'text/csv', text: true, ext: ['.csv'], maxBytes: 10 * 1024 * 1024, reviewOnly: true }
];

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.vbs', '.js', '.ts',
  '.php', '.asp', '.aspx', '.jsp', '.py', '.rb', '.pl',
  '.dll', '.so', '.dylib', '.dmg', '.pkg', '.msi', '.apk',
  '.tar', '.gz', '.html', '.htm', '.xml', '.svg',
  '.xlsm', '.docm', '.pptm', '.jar', '.class', '.bin'
]);

const PDF_THREAT_PATTERNS = [
  /\/JavaScript\s/i,
  /\/JS\s/i,
  /\/OpenAction/i,
  /\/AA\s/i,
  /\/Launch/i,
  /\/EmbeddedFile/i,
  /\/RichMedia/i,
  /eval\s*\(/i,
  /unescape\s*\(/i
];

const CONTENT_THREAT_PATTERNS = [
  { code: 'EICAR_TEST_SIGNATURE', pattern: /EICAR-STANDARD-ANTIVIRUS-TEST/i, hardBlock: true },
  { code: 'WINDOWS_EXECUTABLE_HEADER', pattern: /^MZ/, hardBlock: true },
  { code: 'SCRIPT_CONTENT', pattern: /<script|javascript:|powershell|cmd\.exe|wscript\.shell/i, hardBlock: true },
  { code: 'OFFICE_MACRO_INDICATOR', pattern: /vbaProject\.bin|\/macros\/|word\/vba|xl\/vba|ppt\/vba/i, hardBlock: true },
  { code: 'ARCHIVE_PATH_TRAVERSAL', pattern: /\.\.[\\/]/, hardBlock: false }
];

function matchesMagic(buf, magicChecks) {
  return magicChecks.every(([offset, bytes]) => {
    if (buf.length < offset + bytes.length) return false;
    return bytes.every((b, i) => buf[offset + i] === b);
  });
}

function looksLikeText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (!sample.length) return false;
  let printable = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) printable += 1;
  }
  return printable / sample.length > 0.92;
}

function scanText(buffer, limit = 2 * 1024 * 1024) {
  return buffer.toString('latin1', 0, Math.min(buffer.length, limit));
}

function scanContentForThreats(buffer) {
  const text = scanText(buffer);
  return CONTENT_THREAT_PATTERNS.filter(item => item.pattern.test(text)).map(item => item.code);
}

function scanPDFForThreats(buffer) {
  const text = scanText(buffer, 1024 * 1024);
  return PDF_THREAT_PATTERNS.filter(pattern => pattern.test(text)).map(pattern => 'PDF_ACTIVE_CONTENT:' + pattern.source);
}

function pickSignature(matches, ext, buffer) {
  if (matches.length) {
    const exact = matches.find(sig => sig.ext.includes(ext));
    if (exact) return exact;
    return matches.find(sig => !sig.reviewOnly) || matches[0];
  }
  if (looksLikeText(buffer)) {
    if (ext === '.csv') return SIGNATURES.find(sig => sig.mime === 'text/csv');
    if (ext === '.txt') return SIGNATURES.find(sig => sig.mime === 'text/plain');
  }
  return null;
}

function safeName(validatedMime) {
  const sig = SIGNATURES.find(s => s.mime === validatedMime);
  const ext = sig ? sig.ext[0] : '.bin';
  return crypto.randomUUID() + ext;
}

function ensureScanLogFile() {
  try {
    if (!fs.existsSync(SCAN_LOG_FILE)) fs.writeFileSync(SCAN_LOG_FILE, '[]\n', 'utf8');
    const parsed = JSON.parse(fs.readFileSync(SCAN_LOG_FILE, 'utf8'));
    if (!Array.isArray(parsed)) fs.writeFileSync(SCAN_LOG_FILE, '[]\n', 'utf8');
  } catch (_) {
    fs.writeFileSync(SCAN_LOG_FILE, '[]\n', 'utf8');
  }
}

function readRecords() {
  ensureScanLogFile();
  try {
    const parsed = JSON.parse(fs.readFileSync(SCAN_LOG_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeRecords(records) {
  ensureScanLogFile();
  fs.writeFileSync(SCAN_LOG_FILE, JSON.stringify((records || []).slice(0, MAX_RECORDS), null, 2), 'utf8');
}

function classify(result) {
  if (!result.safe) return STATUS.THREAT;
  if (Array.isArray(result.threats) && result.threats.length > 0) return STATUS.SUSPICIOUS;
  return STATUS.SAFE;
}

function analysisFor(result, status) {
  if (status === STATUS.SAFE) return 'File signature, size, extension, MIME, and embedded-content checks passed.';
  if (status === STATUS.SUSPICIOUS) return 'File was not hard-blocked, but indicators or container format require manual Security Layer review before approval.';
  return 'File failed security validation and was blocked before processing or storage.';
}

function normalizeUserInfo(userInfo = {}, req = null) {
  const user = req?.user || {};
  const forwarded = req?.headers?.['x-forwarded-for'];
  const ip = userInfo.ip || (forwarded ? String(forwarded).split(',')[0].trim() : req?.ip || req?.socket?.remoteAddress || '');
  return {
    username: userInfo.username || userInfo.name || user.name || 'Guest',
    email: userInfo.email || user.email || '',
    ipAddress: ip || 'unknown',
    userAgent: userInfo.userAgent || req?.headers?.['user-agent'] || '',
    device: userInfo.device || req?.headers?.['sec-ch-ua-platform'] || '',
    browser: userInfo.browser || req?.headers?.['sec-ch-ua'] || '',
    uploadLocation: userInfo.uploadLocation || userInfo.location || '',
    accountActivity: userInfo.accountActivity || ''
  };
}

function buildRecord({ file = {}, result, req = null, userInfo = {}, uploadLocation = '', accountActivity = '' }) {
  const status = classify(result);
  const enrichedUser = normalizeUserInfo({ ...userInfo, uploadLocation, accountActivity }, req);
  return {
    id: `FS-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    fileName: file.originalname || file.name || 'unknown',
    fileType: result.mime || file.mimetype || file.type || 'unknown',
    fileSize: result.sizeBytes || file.size || 0,
    uploadTimestamp: new Date().toISOString(),
    scanStatus: status,
    detectionResults: result.threats && result.threats.length ? result.threats : ['NO_INDICATORS_DETECTED'],
    securityAnalysisSummary: analysisFor(result, status),
    reasonForClassification: status === STATUS.SAFE ? 'No threats detected' : result.reason || result.threats?.join(', ') || status,
    malwareSignaturesOrIndicators: result.threats || [],
    sha256: result.sha256 || null,
    scanMs: result.scanMs || 0,
    safeName: result.safeName || '',
    username: enrichedUser.username,
    email: enrichedUser.email,
    ipAddress: enrichedUser.ipAddress,
    device: enrichedUser.device,
    browser: enrichedUser.browser,
    userAgent: enrichedUser.userAgent,
    uploadLocation: enrichedUser.uploadLocation,
    accountActivity: enrichedUser.accountActivity,
    blocked: status === STATUS.THREAT,
    requiresReview: status === STATUS.SUSPICIOUS
  };
}

function recordScan(payload) {
  const record = buildRecord(payload);
  const records = readRecords();
  records.unshift(record);
  writeRecords(records);
  scanEvents.emit('record', record);
  return record;
}

function clearRecords() {
  writeRecords([]);
  scanEvents.emit('records-cleared');
}

function onRecord(listener) {
  scanEvents.on('record', listener);
}

function onRecordsCleared(listener) {
  scanEvents.on('records-cleared', listener);
}

function blockedResult(reason, threats, buffer, start, sha256, mime = null) {
  return {
    safe: false,
    reason,
    threats,
    sizeBytes: buffer.length,
    scanMs: Date.now() - start,
    mime,
    sha256
  };
}

function scan(buffer, originalFilename = '', declaredMime = '') {
  const start = Date.now();
  const threats = [];

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { safe: false, reason: 'Empty or invalid file', threats: ['EMPTY_FILE'], sizeBytes: 0, scanMs: 0, sha256: null };
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const ext = path.extname(originalFilename).toLowerCase();
  const contentThreats = scanContentForThreats(buffer);
  const hardContentThreats = contentThreats.filter(code => CONTENT_THREAT_PATTERNS.find(item => item.code === code)?.hardBlock);

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return blockedResult(`Blocked file type: ${ext}`, ['BLOCKED_EXTENSION', ...contentThreats], buffer, start, sha256);
  }

  if (hardContentThreats.length) {
    return blockedResult('Malware signature, macro, executable, or script content detected', hardContentThreats, buffer, start, sha256);
  }

  const matches = SIGNATURES.filter(sig => sig.magic && matchesMagic(buffer, sig.magic));
  const match = pickSignature(matches, ext, buffer);
  if (!match) {
    return blockedResult('Unrecognised file format: magic bytes do not match any allowed type', ['UNKNOWN_FORMAT', ...contentThreats], buffer, start, sha256);
  }

  const validatedMime = match.mime;
  threats.push(...contentThreats);

  if (ext && !match.ext.includes(ext)) {
    threats.push(`EXT_MISMATCH:declared=${ext},detectedType=${validatedMime}`);
  }

  if (buffer.length > match.maxBytes) {
    return blockedResult(
      `File too large: ${(buffer.length / 1024 / 1024).toFixed(1)}MB exceeds limit of ${(match.maxBytes / 1024 / 1024).toFixed(0)}MB`,
      [...threats, 'FILE_TOO_LARGE'],
      buffer,
      start,
      sha256,
      validatedMime
    );
  }

  if (declaredMime && declaredMime !== validatedMime && !(validatedMime.startsWith('text/') && declaredMime.startsWith('text/'))) {
    threats.push(`MIME_MISMATCH:declared=${declaredMime},actual=${validatedMime}`);
  }

  if (match.reviewOnly) {
    threats.push('MANUAL_REVIEW_REQUIRED:container_or_text_upload');
  }

  if (match.scanPdf) {
    const pdfThreats = scanPDFForThreats(buffer);
    if (pdfThreats.length) {
      return blockedResult('PDF contains embedded scripts or active content', [...threats, ...pdfThreats], buffer, start, sha256, validatedMime);
    }
  }

  return {
    safe: true,
    mime: validatedMime,
    safeName: safeName(validatedMime),
    reason: '',
    threats: [...new Set(threats)],
    sizeBytes: buffer.length,
    scanMs: Date.now() - start,
    sha256
  };
}

module.exports = {
  scan,
  recordScan,
  readRecords,
  clearRecords,
  classify,
  onRecord,
  onRecordsCleared,
  STATUS,
  SIGNATURES,
  BLOCKED_EXTENSIONS
};
