'use strict';

const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');
const { cairoNow } = require('./timeUtils');
const siemExport = require('./siemExport');

// ─── Config ───────────────────────────────────────────────────────────────────
const LOG_FILE    = path.join(__dirname, '..', 'attacks.json');
const MAX_ENTRIES = Number(process.env.SOC_MAX_LOG_ENTRIES || 5000);

const SIGN_KEY = crypto
  .createHmac('sha256', process.env.AUDIT_SIGN_KEY || 'TABIBI-DEFAULT-SIGN-KEY')
  .update('tabibi-audit-signing-v1')
  .digest('hex');

// ─── HMAC entry signing ───────────────────────────────────────────────────────
/**
 * Signs an attack log entry with an HMAC covering its key fields.
 * Signing can be disabled via SOC_AUDIT_SIGNING=false.
 * @param {object} entry
 * @returns {object} Entry with _sig field appended
 */
function signEntry(entry) {
  if (process.env.SOC_AUDIT_SIGNING === 'false') return entry;
  const canonical = JSON.stringify({
    type: entry.type, ip: entry.ip, time: entry.time,
    path: entry.path, score: entry.score, payload: entry.payload
  });
  const sig = crypto.createHmac('sha256', SIGN_KEY).update(canonical).digest('hex').slice(0, 16);
  return { ...entry, _sig: sig };
}

/**
 * Verifies the HMAC signature on a stored log entry.
 * @param {object} entry
 * @returns {'VALID'|'TAMPERED'|null} null if no signature present
 */
function verifyEntry(entry) {
  if (!entry._sig) return null;
  const canonical = JSON.stringify({
    type: entry.type, ip: entry.ip, time: entry.time,
    path: entry.path, score: entry.score, payload: entry.payload
  });
  const expected = crypto.createHmac('sha256', SIGN_KEY).update(canonical).digest('hex').slice(0, 16);
  return entry._sig === expected ? 'VALID' : 'TAMPERED';
}

// ─── File I/O ─────────────────────────────────────────────────────────────────
function ensureLogFile() {
  try {
    if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '[]\n', 'utf8');
  } catch (err) {
    console.error('[Logger] Could not create attacks.json:', err.message);
  }
}

/** @returns {Array} Current log entries from disk */
function readLogsSync() {
  ensureLogFile();
  try {
    const logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    return Array.isArray(logs) ? logs : [];
  } catch {
    return [];
  }
}

/** Writes a log array to disk, trimming to MAX_ENTRIES */
function writeLogsSync(logs) {
  ensureLogFile();
  const trimmed = logs.length > MAX_ENTRIES ? logs.slice(logs.length - MAX_ENTRIES) : logs;
  fs.writeFileSync(LOG_FILE, JSON.stringify(trimmed, null, 2), 'utf8');
}

// ─── Async write queue ────────────────────────────────────────────────────────
let writeQueue = [];
let flushTimer = null;

/** Flush the write queue synchronously (used on process exit) */
function flushSync() {
  if (!writeQueue.length) return;
  const batch = writeQueue.splice(0);
  const logs  = readLogsSync();
  logs.push(...batch);
  try { writeLogsSync(logs); } catch (err) { console.error('[Logger] Sync write failed:', err.message); }
}

function flushAsync() {
  flushTimer = null;
  if (!writeQueue.length) return;
  const batch = writeQueue.splice(0);
  fs.readFile(LOG_FILE, 'utf8', (readErr, raw) => {
    let logs = [];
    if (!readErr && raw) {
      try { logs = JSON.parse(raw); } catch { logs = []; }
      if (!Array.isArray(logs)) logs = [];
    }
    logs.push(...batch);
    if (logs.length > MAX_ENTRIES) logs = logs.slice(logs.length - MAX_ENTRIES);
    fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2), 'utf8', writeErr => {
      if (writeErr) console.error('[Logger] Async write failed:', writeErr.message);
    });
  });
}

// ─── Socket.IO injection ──────────────────────────────────────────────────────
let _io = null;

/** Injects the Socket.IO server so the logger can forward to SIEM */
function setIO(io) { _io = io; }

// ─── Main enqueue function ────────────────────────────────────────────────────
/**
 * Enqueues an attack event for async disk write.
 * Also forwards to SIEM engine and Socket.IO.
 * This function is the module's default export.
 *
 * @param {object} entry - Attack log entry
 */
function enqueue(entry) {
  ensureLogFile();
  const cairoLabel = new Date().toLocaleString('en-GB', {
    timeZone: 'Africa/Cairo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  }) + ' CAI';

  const signed = signEntry({
    ...entry,
    time:      entry.time      || cairoNow(),
    timeCairo: entry.timeCairo || cairoLabel,
    isoTime:   entry.isoTime   || new Date().toISOString(),
  });

  writeQueue.push(signed);

  try { siemExport.ingest(signed, _io); } catch (err) {
    console.error('[Logger] SIEM ingest failed:', err.message);
  }

  // Flush immediately once queue grows large to avoid memory build-up
  if (writeQueue.length >= 50) {
    if (flushTimer) clearTimeout(flushTimer);
    flushAsync();
    return;
  }
  if (!flushTimer) flushTimer = setTimeout(flushAsync, 300);
}

/**
 * Clears the write queue without writing.
 * Useful when clearing all logs — prevents stale queue from re-writing.
 * @param {Function} [callback]
 */
function flushClear(callback) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  writeQueue = [];
  ensureLogFile();
  if (typeof callback === 'function') callback();
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('exit',   flushSync);
process.on('SIGINT',  () => { flushSync(); process.exit(0); });
process.on('SIGTERM', () => { flushSync(); process.exit(0); });

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports          = enqueue;
module.exports.flushSync    = flushSync;
module.exports.flushClear   = flushClear;
module.exports.readLogsSync = readLogsSync;
module.exports.writeLogsSync = writeLogsSync;
module.exports.LOG_FILE     = LOG_FILE;
module.exports.signEntry    = signEntry;
module.exports.verifyEntry  = verifyEntry;
module.exports.setIO        = setIO;