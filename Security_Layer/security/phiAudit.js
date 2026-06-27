'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ─── Config ───────────────────────────────────────────────────────────────────
const PHI_LOG_FILE = path.join(__dirname, '..', 'phi_audit.json');
const MAX_ENTRIES  = Number(process.env.PHI_MAX_LOG_ENTRIES || 10000);

/**
 * Maps PHI field names to HIPAA data category labels.
 * Used to tag every audit entry with the class of data accessed.
 */
const PHI_FIELD_TAGS = {
  patientName:    'IDENTITY',
  nationalId:     'IDENTITY',
  mrn:            'IDENTITY',
  dateOfBirth:    'IDENTITY',
  phone:          'CONTACT',
  email:          'CONTACT',
  address:        'CONTACT',
  diagnosis:      'CLINICAL',
  icd_code:       'CLINICAL',
  prescription:   'CLINICAL',
  labResult:      'CLINICAL',
  imagingReport:  'CLINICAL',
  medicalHistory: 'CLINICAL',
  insuranceId:    'FINANCIAL',
  paymentMethod:  'FINANCIAL',
};

// ─── HMAC signing ─────────────────────────────────────────────────────────────
const SIGN_KEY = crypto
  .createHmac('sha256', process.env.PHI_SIGN_KEY || 'TABIBI-PHI-AUDIT-KEY')
  .update('tabibi-phi-audit-v1')
  .digest('hex');

/**
 * Signs a PHI audit entry. The signature covers userId, patientId,
 * fields, action, time, and ip — the minimum set needed to prove intent.
 * @param {object} entry
 * @returns {object} Entry with _sig field appended
 */
function signEntry(entry) {
  const canonical = JSON.stringify({
    userId: entry.userId, patientId: entry.patientId,
    fields: entry.fields, action: entry.action, time: entry.time, ip: entry.ip
  });
  const sig = crypto.createHmac('sha256', SIGN_KEY).update(canonical).digest('hex').slice(0, 16);
  return { ...entry, _sig: sig };
}

/**
 * Verifies the HMAC on a stored PHI audit entry.
 * @param {object} entry
 * @returns {'VALID'|'TAMPERED'|'UNSIGNED'}
 */
function verifyEntry(entry) {
  if (!entry._sig) return 'UNSIGNED';
  const canonical = JSON.stringify({
    userId: entry.userId, patientId: entry.patientId,
    fields: entry.fields, action: entry.action, time: entry.time, ip: entry.ip
  });
  const expected = crypto.createHmac('sha256', SIGN_KEY).update(canonical).digest('hex').slice(0, 16);
  return entry._sig === expected ? 'VALID' : 'TAMPERED';
}

// ─── File I/O ─────────────────────────────────────────────────────────────────
function ensureLog() {
  try {
    if (!fs.existsSync(PHI_LOG_FILE)) fs.writeFileSync(PHI_LOG_FILE, '[]\n', 'utf8');
  } catch {}
}

function readLog() {
  ensureLog();
  try {
    const raw = JSON.parse(fs.readFileSync(PHI_LOG_FILE, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function writeLog(entries) {
  const trimmed = entries.length > MAX_ENTRIES ? entries.slice(entries.length - MAX_ENTRIES) : entries;
  fs.writeFileSync(PHI_LOG_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
}

// ─── Async write queue ────────────────────────────────────────────────────────
let _writeQueue = [];
let _flushTimer = null;

function flush() {
  if (!_writeQueue.length) return;
  const batch    = _writeQueue.splice(0);
  const existing = readLog();
  existing.push(...batch);
  try { writeLog(existing); } catch {}
  _flushTimer = null;
}

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * Records a PHI data access event to the audit log.
 * Every record is HMAC-signed and tagged with HIPAA data categories.
 *
 * Call this from your application whenever a user reads, writes,
 * exports, or deletes any PHI field.
 *
 * @param {object} opts
 * @param {string}   opts.userId    - Who performed the access
 * @param {string}   opts.patientId - Which patient's data was accessed
 * @param {string[]} opts.fields    - Which PHI fields were accessed (keys from PHI_FIELD_TAGS)
 * @param {string}   [opts.reason]  - Business justification
 * @param {string}   [opts.ip]      - Accessor's IP address
 * @param {string}   [opts.action]  - 'READ' | 'WRITE' | 'EXPORT' | 'DELETE'
 * @param {object}   [opts.meta]    - Arbitrary additional metadata
 */
function logAccess({ userId, patientId, fields = [], reason = 'unknown', ip = '0.0.0.0', action = 'READ', meta = {} }) {
  ensureLog();

  const time = new Date().toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  }) + ' CAI';

  const timeCairo = new Date().toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }) + ' CAI';

  const safeFields  = fields.filter(f => typeof f === 'string').slice(0, 20);
  const categories  = [...new Set(safeFields.map(f => PHI_FIELD_TAGS[f] || 'OTHER'))];

  const entry = signEntry({
    userId:    String(userId    || 'unknown').slice(0, 80),
    patientId: String(patientId || 'unknown').slice(0, 80),
    fields:    safeFields,
    categories,
    action:    ['READ', 'WRITE', 'EXPORT', 'DELETE'].includes(action) ? action : 'READ',
    reason:    String(reason || 'unknown').slice(0, 120),
    ip:        String(ip).slice(0, 45),
    time,
    timeCairo,
    isoTime:   new Date().toISOString(),
    meta
  });

  _writeQueue.push(entry);
  if (!_flushTimer) _flushTimer = setTimeout(flush, 400);
}

/**
 * Shorthand for logging a bulk export event — automatically includes all PHI field keys.
 * @param {object} opts
 * @param {string} opts.userId
 * @param {number} opts.patientCount
 * @param {string} opts.format     - e.g. 'csv', 'json', 'pdf'
 * @param {string} opts.ip
 * @param {string} opts.reason
 */
function logBulkExport({ userId, patientCount, format, ip, reason }) {
  logAccess({
    userId,
    patientId: 'BULK',
    fields:    Object.keys(PHI_FIELD_TAGS),
    reason:    `BULK_EXPORT:${reason || 'unknown'} format=${format} count=${patientCount}`,
    ip,
    action:    'EXPORT',
    meta:      { patientCount, format, alert: true }
  });
}

/**
 * Verifies the HMAC signature of every entry in the PHI audit log.
 * Returns a summary with counts of valid, tampered, and unsigned entries.
 * @returns {object}
 */
function verifyLog() {
  const entries = readLog();
  let valid = 0, tampered = 0, unsigned = 0;
  entries.forEach(e => {
    const r = verifyEntry(e);
    if (r === 'VALID')    valid++;
    else if (r === 'TAMPERED') tampered++;
    else unsigned++;
  });
  return {
    total: entries.length, valid, tampered, unsigned,
    integrity: tampered === 0 ? 'CLEAN' : 'COMPROMISED',
    checkedAt: new Date().toLocaleString('en-GB', {
      timeZone: 'Africa/Cairo', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }) + ' CAI'
  };
}

/**
 * Returns the most recent N audit entries, newest first.
 * @param {number} [limit=200]
 * @returns {Array}
 */
function getRecentAccess(limit = 200) {
  const entries = readLog();
  return entries.slice(-limit).reverse();
}

/**
 * Returns access statistics, optionally filtered by userId, patientId, or since timestamp.
 * @param {object} [opts]
 * @param {string} [opts.userId]
 * @param {string} [opts.patientId]
 * @param {string} [opts.since] - ISO date string
 * @returns {object}
 */
function getAccessStats({ userId, patientId, since } = {}) {
  const entries  = readLog();
  const sinceTs  = since ? new Date(since).getTime() : 0;
  const filtered = entries.filter(e => {
    if (userId    && e.userId    !== userId)    return false;
    if (patientId && e.patientId !== patientId) return false;
    if (sinceTs && ((e.isoTime ? new Date(e.isoTime).getTime() : 0) || 0) < sinceTs) return false;
    return true;
  });
  const byAction = filtered.reduce((acc, e) => {
    acc[e.action] = (acc[e.action] || 0) + 1;
    return acc;
  }, {});
  return { total: filtered.length, byAction, entries: filtered.slice(-50) };
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('exit',   flush);
process.on('SIGINT',  () => { flush(); process.exit(0); });
process.on('SIGTERM', () => { flush(); process.exit(0); });

module.exports = {
  logAccess, logBulkExport,
  verifyLog, verifyEntry,
  getRecentAccess, getAccessStats,
  readLog,
  PHI_FIELD_TAGS,
  PHI_LOG_FILE
};