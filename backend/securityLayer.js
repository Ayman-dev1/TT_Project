'use strict';
process.env.TZ = 'Africa/Cairo';

const express = require('express');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const net = require('net');
const os = require('os');
const https = require('https');
const http = require('http');
const multer = require('multer');

const { cairoNow } = require('./security/timeUtils');
const { computeHealthFromLogs } = require('./security/healthUtils');
const panicState = require('./security/panicState');
const pkg = require('./package.json');
const threatEngine = require('./security/threatEngine');
const {
  blockIP,
  unblockIP,
  getBlockedIPs,
  getAllThreats,
  cleanIP,
  clearIRLog,
  clearAll,
  quarantineAccount,
  releaseAccount,
  getQuarantinedAccounts,
  getIRLog
} = threatEngine;
const logger = require('./security/logger');
const wafMiddleware = require('./security/waf');
const fileScan = require('./security/fileScan');
const geoVelocity = require('./security/geoVelocity');
const alertChannels = require('./security/alertChannels');
const siemExport = require('./security/siemExport');

const SOC_ROOT = path.join(__dirname, '..', 'Security_Layer');
const PUBLIC_DIR = path.join(SOC_ROOT, 'public');
const LOG_FILE = path.join(__dirname, 'attacks.json');
const SNAP_DIR = path.join(__dirname, 'snapshots');
const SESSION_FILE = path.join(__dirname, 'security', 'session_monitor_state.json');
const BLOCKED_IP_FILE = path.join(__dirname, 'security', 'blocked_ips_persist.json');
const STARTED_AT = Date.now();

const ALARM_HEALTH_THRESHOLD = Number(process.env.SOC_ALARM_HEALTH || 50);
const SHUTDOWN_HEALTH_THRESHOLD = Number(process.env.SOC_SHUTDOWN_HEALTH || 40);

const trafficStats = { totalRequests: 0, recentRequests: [], statusCounts: Object.create(null), lastRequestAt: null };
const sessionMonitor = {
  active: Object.create(null),
  history: [],
  maxHistory: 500
};
let sessionIo = null;
const fileScanUpload = multer({ storage: multer.memoryStorage() });

function saveSessionState() {
  try {
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify({
      active: Object.values(sessionMonitor.active),
      history: sessionMonitor.history.slice(0, sessionMonitor.maxHistory)
    }, null, 2), 'utf8');
  } catch (err) {
    console.error('[SessionMonitor] Could not save state:', err.message);
  }
}

function loadSessionState() {
  try {
    if (!fs.existsSync(SESSION_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8') || '{}');
    sessionMonitor.active = Object.create(null);
    (Array.isArray(parsed.active) ? parsed.active : []).forEach(rec => {
      if (rec && rec.id) sessionMonitor.active[rec.id] = rec;
    });
    sessionMonitor.history = Array.isArray(parsed.history) ? parsed.history.slice(0, sessionMonitor.maxHistory) : [];
  } catch (err) {
    console.warn('[SessionMonitor] Could not load state:', err.message);
  }
}

function pushSessionEvent(event) {
  const item = {
    id: event.id || `SESS-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    time: event.time || cairoNow(),
    isoTime: event.isoTime || new Date().toISOString(),
    user: event.user || 'System',
    role: event.role || 'Admin',
    ip: cleanIP(event.ip || '0.0.0.0'),
    action: event.action || 'EVENT',
    duration: event.duration || '',
    note: event.note || ''
  };
  sessionMonitor.history.unshift(item);
  if (sessionMonitor.history.length > sessionMonitor.maxHistory) sessionMonitor.history.length = sessionMonitor.maxHistory;
  saveSessionState();
  return item;
}

function isHeartbeatAction(action) {
  return /^APP_SESSION_ACTIVE$/i.test(String(action || ''));
}

function getSessionIdentity(record) {
  const email = String(record?.email || record?.note || '').trim().toLowerCase();
  if (email && email.includes('@')) return `email:${email}`;
  const userId = String(record?.userId || '').trim().toLowerCase();
  if (userId) return `user:${userId}`;
  const user = String(record?.user || '').trim().toLowerCase();
  return user ? `name:${user}` : '';
}

function removeDuplicateAppSessions(currentId, identity) {
  if (!identity) return;
}

function emitSessionEvent(io, event) {
  if (!event) return null;
  io.emit('session-event', event);
  return event;
}

function normalizeRole(role) {
  const value = String(role || 'Patient').toLowerCase();
  if (value === 'doctor') return 'Doctor';
  if (value === 'admin') return 'Admin';
  return 'Patient';
}

function recordAppSession(user, req, action) {
  if (!user || !user._id) return null;
  const role = normalizeRole(user.role);
  const ip = getClientIP(req);
  const headerSessionId = String(req.headers['x-tabibi-session-id'] || '').trim().slice(0, 120);
  const browserSessionId = headerSessionId || String(req.body?.sessionId || '').trim().slice(0, 120);
  const legacyId = `app:${String(user._id)}`;
  const id = browserSessionId ? `app:${String(user._id)}:${browserSessionId}` : legacyId;
  const now = Date.now();
  const existing = sessionMonitor.active[id];
  const legacy = sessionMonitor.active[legacyId];
  if (legacyId !== id && legacy) delete sessionMonitor.active[legacyId];
  sessionMonitor.active[id] = {
    id,
    userId: String(user._id),
    user: user.name || user.email || String(user._id),
    email: user.email || '',
    role,
    ip,
    startedAt: existing?.startedAt || legacy?.startedAt || now,
    startedAtIso: existing?.startedAtIso || legacy?.startedAtIso || new Date(now).toISOString(),
    lastSeen: now,
    lastSeenIso: new Date(now).toISOString(),
    expiresAt: now + 30 * 60000,
    userAgent: req.headers['user-agent'] || '',
    status: 'ACTIVE',
    source: 'TABIBI_APP'
  };
  saveSessionState();
  return pushSessionEvent({
    user: sessionMonitor.active[id].user,
    role,
    ip,
    action,
    note: user.email || browserSessionId || 'TABIBI app session'
  });
}

async function runGeoVelocityCheck(user, req, action, io) {
  if (!user) return null;
  const userId = user._id || user.id || user.email;
  if (!userId) return null;
  const ip = getClientIP(req);
  const result = await geoVelocity.check(userId, ip, {
    user: user.name || user.email || String(userId),
    email: user.email || '',
    action
  });
  if (result.impossible || result.suspicious) {
    const entry = {
      ip,
      type: result.impossible ? 'GEO_VELOCITY_IMPOSSIBLE' : 'GEO_VELOCITY_SUSPICIOUS',
      score: result.impossible ? 100 : 55,
      action: result.impossible ? 'BLOCKED' : 'FLAGGED',
      time: cairoNow(),
      isoTime: new Date().toISOString(),
      path: req.originalUrl || req.path,
      method: req.method,
      payload: result.reason,
      analysis: {
        type: 'GEO_VELOCITY',
        risk: result.impossible ? 'CRITICAL' : 'MEDIUM',
        target: result.email || result.userId,
        technique: result.reason,
        from: result.fromCity,
        to: result.toCity,
        speedKph: result.speedKph,
        distanceKm: result.distanceKm
      }
    };
    loggerWithIso(entry);
    io.emit('geo-velocity-alert', result);
    io.emit('geo-velocity-state', geoVelocity.getSnapshot());
    if (result.impossible) io.emit('attack', entry);
  } else {
    io.emit('geo-velocity-state', geoVelocity.getSnapshot());
  }
  return result;
}

function pruneExpiredSessions() {
  const now = Date.now();
  Object.entries(sessionMonitor.active).forEach(([id, rec]) => {
    if (rec.expiresAt && rec.expiresAt < now) {
      delete sessionMonitor.active[id];
      pushSessionEvent({
        user: rec.user,
        role: rec.role,
        ip: rec.ip,
        action: 'SESSION_EXPIRED',
        duration: Math.max(1, Math.round((now - Number(rec.startedAt || now)) / 1000)) + 's',
        note: rec.email || rec.id
      });
      saveSessionState();
    }
  });
}

function getSessionSnapshot() {
  pruneExpiredSessions();
  const active = Object.values(sessionMonitor.active)
    .sort((a, b) => Number(b.lastSeen || b.startedAt || 0) - Number(a.lastSeen || a.startedAt || 0));
  const history = sessionMonitor.history.filter(item => !isHeartbeatAction(item.action));
  return {
    active,
    history,
    stats: {
      total: history.length,
      active: active.length,
      doctors: active.filter(e => e.role === 'Doctor').length,
      patients: active.filter(e => e.role === 'Patient').length,
      admins: active.filter(e => e.role === 'Admin').length
    }
  };
}

function sessionTracker(req, res, next) {
  const tracked = {
    '/api/auth/login': 'LOGIN_SUCCESS',
    '/api/auth/register': 'SIGNUP_SUCCESS',
    '/api/admin/login': 'ADMIN_LOGIN_SUCCESS'
  };
  const action = tracked[req.path];
  if (!action || req.method !== 'POST') return next();

  const originalJson = res.json.bind(res);
  res.json = function(body) {
    if (res.statusCode >= 200 && res.statusCode < 300 && body && body._id && body.role) {
      const event = recordAppSession(body, req, action);
      if (event) {
        try {
          sessionIo?.emit('sessions-updated', getSessionSnapshot());
          sessionIo?.emit('session-event', event);
        } catch(_) {}
      }
      runGeoVelocityCheck(body, req, action, sessionIo).catch(() => {});
    }
    return originalJson(body);
  };
  next();
}

function recordTraffic(req, res, next) {
  const now = Date.now();
  trafficStats.totalRequests += 1;
  trafficStats.recentRequests.push(now);
  trafficStats.lastRequestAt = new Date(now).toISOString();
  const cutoff = now - 60000;
  if (trafficStats.recentRequests.length > 2000 || trafficStats.recentRequests[0] < cutoff) {
    trafficStats.recentRequests = trafficStats.recentRequests.filter(ts => ts >= cutoff);
  }
  res.on('finish', () => {
    const code = String(res.statusCode || 0);
    trafficStats.statusCounts[code] = (trafficStats.statusCounts[code] || 0) + 1;
  });
  next();
}
function getTrafficStats() {
  const now = Date.now();
  const cutoff = now - 60000;
  trafficStats.recentRequests = trafficStats.recentRequests.filter(ts => ts >= cutoff);
  return { totalRequests: trafficStats.totalRequests, requestsLastMinute: trafficStats.recentRequests.length, statusCounts: trafficStats.statusCounts, lastRequestAt: trafficStats.lastRequestAt };
}

const AUTH_REQUIRED = true;
let SOC_ADMIN_TOKEN = process.env.SOC_ADMIN_TOKEN || 'TABIBI-SOC-TOKEN-2026';
const RECOVERY_PASSWORD = process.env.RECOVERY_PASSWORD || 'TABIBI-RECOVERY-2026';
const loginAttempts = Object.create(null);
const recoverAttempts = Object.create(null);
setInterval(() => {
  const cutoff = Date.now() - 600000;
  [loginAttempts, recoverAttempts].forEach(obj => {
    Object.keys(obj).forEach(k => { if (obj[k].windowStart < cutoff) delete obj[k]; });
  });
}, 1800000).unref?.();

function ensureRuntimeFiles() {
  if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '[]\n', 'utf8');
  try {
    const parsed = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    if (!Array.isArray(parsed)) fs.writeFileSync(LOG_FILE, '[]\n', 'utf8');
  } catch { fs.writeFileSync(LOG_FILE, '[]\n', 'utf8'); }
}

const ALLOWED_ORIGINS = (process.env.SOC_ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5000,http://127.0.0.1:5000').split(',').map(o => o.trim()).filter(Boolean);
function originAllowed(origin) { if (!origin) return process.env.NODE_ENV !== 'production'; return ALLOWED_ORIGINS.includes(origin); }
const TRUSTED_PROXIES = (process.env.TRUSTED_PROXIES || '').split(',').map(p => p.trim()).filter(Boolean);
const TRUST_PROXY_HEADERS = String(
  process.env.TRUST_PROXY_HEADERS ||
  (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PUBLIC_DOMAIN ? 'true' : 'false')
).toLowerCase() === 'true';
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const remote = cleanIP(req.socket?.remoteAddress || req.connection?.remoteAddress || req.ip || '0.0.0.0');
  if (forwarded && TRUST_PROXY_HEADERS) return cleanIP(String(forwarded).split(',')[0].trim());
  if (forwarded && TRUSTED_PROXIES.length > 0 && TRUSTED_PROXIES.includes(remote)) return cleanIP(String(forwarded).split(',')[0].trim());
  return cleanIP(req.ip || remote);
}
function requireAdminAuth(req, res, next) {
  if (!AUTH_REQUIRED) return next();
  const token = req.headers['x-soc-token'] || req.query.token;
  if (token && token === SOC_ADMIN_TOKEN) return next();
  const authHeader = req.headers.authorization || '';
  if (authHeader === 'Bearer TABIBI-SOC-TOKEN-2026' || authHeader === 'Bearer ' + SOC_ADMIN_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized - SOC token required' });
}
function readLogs() { logger.flushSync(); return logger.readLogsSync(); }
function writeLogs(logs) { logger.writeLogsSync(Array.isArray(logs) ? logs : []); }
const _origLogger = logger;
function loggerWithIso(entry) { if (entry && !entry.isoTime) entry.isoTime = new Date().toISOString(); return _origLogger(entry); }
let logsClearedUntil = 0;

function uniqueFiles(files) {
  return [...new Set(files.filter(Boolean).map(file => path.resolve(file)))];
}

const attackPersistenceFiles = uniqueFiles([
  LOG_FILE,
  logger.LOG_FILE,
  path.join(SOC_ROOT, 'attacks.json')
]);

const blockedPersistenceFiles = uniqueFiles([
  BLOCKED_IP_FILE,
  path.join(SOC_ROOT, 'security', 'blocked_ips_persist.json')
]);

function wipeJsonArrayFile(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '[]\n', 'utf8');
}

function readJsonArrayCount(file) {
  try {
    if (!fs.existsSync(file)) return 0;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return -1;
  }
}

function wipeSecurityPersistence() {
  const files = uniqueFiles([...attackPersistenceFiles, ...blockedPersistenceFiles]);
  files.forEach(wipeJsonArrayFile);
  return files.map(file => ({ file, count: readJsonArrayCount(file) }));
}

function makeLoopbackAwareIpCandidates(rawIp) {
  const raw = String(rawIp || '').trim();
  const cleaned = cleanIP(raw);
  const candidates = [raw, cleaned, `::ffff:${cleaned}`];
  if (cleaned === '127.0.0.1' || raw === '::1' || raw.toLowerCase() === 'localhost') {
    candidates.push('127.0.0.1', '::ffff:127.0.0.1', '::1', 'localhost');
  }
  return [...new Set(candidates.filter(Boolean))];
}

function isValidBlockIp(value) {
  const raw = String(value || '').trim();
  const cleaned = cleanIP(raw);
  return cleaned === 'localhost' || net.isIP(cleaned) !== 0;
}

function emitClearedSecurityState(io) {
  const healthState = clearedHealthSnapshot();
  io.emit('logs-cleared');
  io.emit('recent-attacks', []);
  io.emit('attack-log-cleared', { success: true, time: new Date().toISOString() });
  io.emit('blocked-list', []);
  io.emit('security-state', {
    health: healthState,
    blocked: [],
    threats: []
  });
  io.emit('lockdown-released');
  io.emit('incident-response', { type: 'CLEAR_ALL_SECURITY_STATE' });
}

function clearedHealthSnapshot() {
  const health = computeHealthFromLogs([]);
  return {
    total: 0,
    blocked: 0,
    critical: 0,
    health,
    patientDataSafety: health,
    alarmThreshold: ALARM_HEALTH_THRESHOLD,
    shutdownThreshold: SHUTDOWN_HEALTH_THRESHOLD,
    traffic: getTrafficStats(),
    time: cairoNow()
  };
}

function csvEscape(value) {
  const text = String(value == null ? '' : Array.isArray(value) ? value.join('|') : value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const FILESCAN_EXPORT_FIELDS = [
  'id', 'fileName', 'fileType', 'fileExtension', 'mimeType', 'fileSize',
  'uploadTimestamp', 'scanTimestamp', 'scanStatus', 'classificationStatus',
  'riskScore', 'threatSeverity', 'confidenceScore', 'reasonForClassification',
  'detectionResults', 'securityAnalysisSummary', 'malwareSignaturesOrIndicators',
  'indicatorsOfCompromise', 'md5', 'sha1', 'sha256', 'detectionRulesTriggered',
  'scanEngineVersion', 'username', 'email', 'userId', 'ipAddress', 'device',
  'operatingSystem', 'browser', 'userAgent', 'uploadLocation', 'accountActivity',
  'lastLoginTimestamp', 'sessionInformation', 'auditSignature'
];

function recordsToCsv(records) {
  return [
    FILESCAN_EXPORT_FIELDS.join(','),
    ...records.map(record => FILESCAN_EXPORT_FIELDS.map(field => csvEscape(record[field])).join(','))
  ].join('\n');
}

function recordsToHtmlReport(records) {
  const rows = records.map(r => `<tr>${FILESCAN_EXPORT_FIELDS.map(f => `<td>${String(r[f] == null ? '' : Array.isArray(r[f]) ? r[f].join('|') : r[f]).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</td>`).join('')}</tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Tabibi Scan History</title><style>body{font-family:Arial,sans-serif}table{border-collapse:collapse;width:100%;font-size:10px}th,td{border:1px solid #ddd;padding:4px;text-align:left}th{background:#10233f;color:white}</style></head><body><h1>Tabibi Scan History Export</h1><p>Generated ${new Date().toISOString()}</p><table><thead><tr>${FILESCAN_EXPORT_FIELDS.map(f => `<th>${f}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

function xmlEscape(value) {
  return String(value == null ? '' : Array.isArray(value) ? value.join('|') : value)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
}

const CRC_TABLE = (() => {
  const table = new Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  files.forEach(file => {
    const name = Buffer.from(file.name);
    const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  });
  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function recordsToXlsx(records) {
  const rows = [FILESCAN_EXPORT_FIELDS, ...records.map(r => FILESCAN_EXPORT_FIELDS.map(f => r[f]))];
  const sheetRows = rows.map((row, rIdx) => `<row r="${rIdx + 1}">${row.map((v, cIdx) => {
    const col = String.fromCharCode(65 + (cIdx % 26));
    return `<c r="${col}${rIdx + 1}" t="inlineStr"><is><t>${xmlEscape(v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Scan History" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
    { name: 'xl/worksheets/sheet1.xml', data: `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>` }
  ]);
}

function recordsToPdf(records) {
  const lines = ['Tabibi Scan History Export', `Generated ${new Date().toISOString()}`, `Records ${records.length}`, ''];
  records.forEach(r => lines.push(`${r.scanTimestamp || ''} | ${r.classificationStatus || r.scanStatus || ''} | ${r.fileName || ''} | ${r.email || r.username || ''} | ${r.threatSeverity || ''} | ${r.reasonForClassification || ''}`));
  const text = lines.join('\n').replace(/[()\\]/g, '\\$&');
  const stream = `BT /F1 8 Tf 36 806 Td 10 TL (${text.slice(0, 60000).replace(/\n/g, ') Tj T* (')}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(o => { pdf += String(o).padStart(10, '0') + ' 00000 n \n'; });
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

function createSecurityLayer(server) {
  ensureRuntimeFiles();
  loadSessionState();
  const router = express.Router();
  const io = new Server(server, { cors: { origin: (origin, cb) => originAllowed(origin) ? cb(null, true) : cb(new Error('Socket CORS blocked: ' + origin)), methods: ['GET', 'POST'], credentials: true } });
  sessionIo = io;
  const waf = wafMiddleware(io);
  const honeypot = require('./security/honeypot')(io);
  logger.setIO(io);
  fileScan.onRecord(record => {
    const records = fileScan.readRecords();
    io.emit('filescan-record', record);
    io.emit('filescan-records', { records: records.slice(0, 250), total: records.length, stats: fileScan.getStats() });
    io.emit('filescan-stats', fileScan.getStats());
    if (record.scanStatus === fileScan.STATUS.THREAT || record.scanStatus === fileScan.STATUS.SUSPICIOUS) {
      io.emit('filescan-alert', record);
    }
  });
  fileScan.onRecordsCleared(() => {
    io.emit('filescan-records', { records: [], total: 0, stats: fileScan.getStats() });
    io.emit('filescan-stats', fileScan.getStats());
  });
  logger.setAlertDispatcher(async entry => {
    const sent = await alertChannels.dispatchAttack(entry);
    if (sent && sent.length) {
      io.emit('alerts-log', alertChannels.publicConfig().alertLog);
      io.emit('alerts-config', alertChannels.publicConfig());
    }
  });
  function computeHealth() {
    const logs = readLogs();
    const total = logs.length;
    const blocked = getBlockedIPs().length;
    const critical = logs.filter(item => Number(item.score || 0) >= 100).length;
    const health = computeHealthFromLogs(logs);
    return { total, blocked, critical, health, patientDataSafety: health, alarmThreshold: ALARM_HEALTH_THRESHOLD, shutdownThreshold: SHUTDOWN_HEALTH_THRESHOLD, traffic: getTrafficStats(), time: cairoNow() };
  }
  function broadcastHealth() {
    const health = computeHealth();
    io.emit('health-update', health);
    io.emit('security-state', { health, blocked: getBlockedIPs(), threats: getAllThreats() });
    if (health.health <= SHUTDOWN_HEALTH_THRESHOLD && !panicState.get()) {
      panicState.set(true);
      wafMiddleware.setPanicMode(true);
      io.emit('panic-mode', { active: true, auto: true, shutdown: true, health: health.health, threshold: SHUTDOWN_HEALTH_THRESHOLD, time: cairoNow() });
    }
    return health;
  }
  const HONEYPOT_ROUTES = ['/trap', '/wp-login.php', '/phpmyadmin', '/.env', '/config', '/backup', '/db', '/shell', '/phpinfo.php', '/administrator'];
  router.use(recordTraffic);

  router.get('/test', (req, res) => {
    res.json({
      ok: true,
      service: 'tabibi-soc',
      version: pkg.version,
      authRequired: AUTH_REQUIRED,
      panic: panicState.get(),
      health: computeHealth()
    });
  });

  router.post('/login', (req, res) => {
    const ip = getClientIP(req);
    const attemptKey = ip;
    const now = Date.now();
    const current = loginAttempts[attemptKey] || { count: 0, windowStart: now };
    if (now - current.windowStart > 600000) {
      current.count = 0;
      current.windowStart = now;
    }
    current.count += 1;
    loginAttempts[attemptKey] = current;

    if (current.count > 10) {
      return res.status(429).json({ success: false, error: 'Too many login attempts. Try again later.' });
    }

    const password = String(req.body?.password || '');
    if (password !== RECOVERY_PASSWORD && password !== SOC_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, error: 'Invalid Security Layer password' });
    }

    current.count = 0;
    res.json({ success: true, token: SOC_ADMIN_TOKEN });
  });

  router.get('/logs', requireAdminAuth, (req, res) => {
    if (Date.now() < logsClearedUntil && readJsonArrayCount(LOG_FILE) === 0) return res.json([]);
    const logs = readLogs().map(entry => ({
      ...entry,
      isoTime: entry.isoTime || new Date(entry.time || Date.now()).toISOString()
    }));
    res.json(logs);
  });

  function performFullClear() {
    logsClearedUntil = Date.now() + 5000;
    // 1. Kill the async write queue first so no pending entries sneak back in
    logger.flushClear();
    // 2. Synchronously overwrite attacks.json with an empty array on disk
    writeLogs([]);
    // 3. Clear all in-memory threat/block state and wipe blocked_ips_persist.json
    clearAll();
    // 4. Reset WAF brute-force counters
    wafMiddleware.clearAllBruteState?.();
    // 5. Clear the incident response log
    clearIRLog();
    // 6. Release panic/lockdown mode
    panicState.set(false);
    wafMiddleware.setPanicMode(false);
    // 7. Final hard wipe of every known security persistence file, then verify
    const verification = wipeSecurityPersistence();
    const dirty = verification.filter(item => item.count !== 0);
    if (dirty.length) {
      const details = dirty.map(item => `${item.file}=${item.count}`).join(', ');
      throw new Error(`Security persistence clear failed: ${details}`);
    }
    return verification;
  }

  function handleFullClearRequest(req, res) {
    try {
      res.json(clearSecurityState());
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  function clearSecurityState() {
    const verification = performFullClear();
    emitClearedSecurityState(io);
    return {
      success: true,
      cleared: true,
      logs: [],
      blocked: [],
      threats: [],
      health: clearedHealthSnapshot(),
      verification
    };
  }

  router.post('/clear-threats', requireAdminAuth, handleFullClearRequest);
  router.delete('/clear-threats', requireAdminAuth, handleFullClearRequest);

  router.delete('/logs', requireAdminAuth, handleFullClearRequest);

  router.post('/logs/clear', requireAdminAuth, handleFullClearRequest);

  router.delete('/security-state', requireAdminAuth, handleFullClearRequest);

  router.post('/security-state/clear', requireAdminAuth, handleFullClearRequest);

  router.get('/blocked-ips', requireAdminAuth, (req, res) => {
    res.json(getBlockedIPs());
  });

  router.get('/threats', requireAdminAuth, (req, res) => {
    res.json(getAllThreats());
  });

  router.get('/security-state', requireAdminAuth, (req, res) => {
    if (Date.now() < logsClearedUntil && readJsonArrayCount(LOG_FILE) === 0) {
      const health = computeHealth();
      return res.json({
        health: { ...health, total: 0, blocked: 0, critical: 0, health: 100, patientDataSafety: 100 },
        blocked: [],
        threats: [],
        logs: [],
        panic: false
      });
    }
    res.json({ health: computeHealth(), blocked: getBlockedIPs(), threats: getAllThreats(), logs: readLogs(), panic: panicState.get() });
  });

  router.get('/panic-status', requireAdminAuth, (req, res) => {
    res.json({ active: panicState.get(), health: computeHealth().health });
  });

  router.post('/panic', requireAdminAuth, (req, res) => {
    const active = req.body?.active !== false;
    panicState.set(active);
    wafMiddleware.setPanicMode(active);
    const health = computeHealth();
    io.emit('panic-mode', { active, manual: true, health: health.health, time: cairoNow() });
    if (!active) io.emit('lockdown-released');
    res.json({ success: true, active, health });
  });

  router.post('/recover', (req, res) => {
    const ip = getClientIP(req);
    const attemptKey = ip;
    const now = Date.now();
    const current = recoverAttempts[attemptKey] || { count: 0, windowStart: now };
    if (now - current.windowStart > 600000) {
      current.count = 0;
      current.windowStart = now;
    }
    current.count += 1;
    recoverAttempts[attemptKey] = current;

    if (current.count > 10) {
      return res.status(429).json({ success: false, error: 'Too many recovery attempts. Try again later.' });
    }

    const password = String(req.body?.password || '');
    if (password !== RECOVERY_PASSWORD && password !== SOC_ADMIN_TOKEN) {
      return res.status(401).json({ success: false, error: 'Incorrect recovery passcode' });
    }

    current.count = 0;
    let verification = [];
    try {
      verification = performFullClear();
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
    io.emit('logs-cleared');
    io.emit('blocked-list', getBlockedIPs());
    io.emit('lockdown-released');
    const health = broadcastHealth();
    res.json({ success: true, health, token: SOC_ADMIN_TOKEN, verification });
  });

  router.post('/block-ip', requireAdminAuth, (req, res) => {
    const ip = cleanIP(req.body?.ip || '');
    if (!ip || ip === '0.0.0.0' || !isValidBlockIp(req.body?.ip || '')) return res.status(400).json({ error: 'valid ip is required' });
    const record = blockIP(ip, req.body?.reason || 'manual-dashboard', req.body?.note || '');
    io.emit('ip-blocked', record);
    io.emit('blocked-list', getBlockedIPs());
    io.emit('incident-response', { type: 'BLOCK_IP', record });
    broadcastHealth();
    res.json({ success: true, record });
  });

  router.post('/unblock-ip', requireAdminAuth, (req, res) => {
    const rawIp = String(req.body?.ip || '').trim();
    const ip = cleanIP(rawIp);
    if (!ip || ip === '0.0.0.0' || !isValidBlockIp(rawIp)) return res.status(400).json({ error: 'valid ip is required' });
    try {
      const candidates = makeLoopbackAwareIpCandidates(rawIp);
      let removedFromBlockedIps = false;
      candidates.forEach(candidate => {
        const result = unblockIP(candidate);
        if (result?.removed) removedFromBlockedIps = true;
        try { wafMiddleware.clearBruteState?.(candidate); } catch (_) {}
      });
      const remaining = getBlockedIPs();
      io.emit('ip-unblocked', { ip, candidates });
      io.emit('blocked-list', remaining);
      io.emit('incident-response', { type: 'UNBLOCK_IP', ip });
      broadcastHealth();
      res.json({
        success: true,
        ip,
        candidates,
        removedFromBlockedIps,
        removedFromBannedEntities: removedFromBlockedIps,
        activeBlockRemoved: true,
        alreadyUnblocked: !removedFromBlockedIps,
        remaining: remaining.length
      });
    } catch (err) {
      console.error('[SOC] unblock-ip failed:', err.message);
      res.status(500).json({ success: false, error: 'Failed to persist unblock operation' });
    }
  });

  router.get('/iam/quarantined-accounts', requireAdminAuth, (req, res) => {
    res.json(getQuarantinedAccounts());
  });

  router.post('/incident-response/quarantine-account', requireAdminAuth, (req, res) => {
    const userId = String(req.body?.userId || '').trim();
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });
    const reason = String(req.body?.reason || 'manual-ir').trim();
    const severity = String(req.body?.severity || 'HIGH').trim().toUpperCase();
    const record = quarantineAccount(userId, reason, severity, req.body?.incidentId || null);
    io.emit('incident-response', { type: 'QUARANTINE_ACCOUNT', userId, record });
    res.json({ success: true, userId, record });
  });

  router.post('/incident-response/release-account', requireAdminAuth, (req, res) => {
    const userId = String(req.body?.userId || '').trim();
    if (!userId) return res.status(400).json({ success: false, error: 'userId is required' });
    const released = releaseAccount(userId, req.body?.incidentId || null);
    io.emit('incident-response', { type: 'RELEASE_ACCOUNT', userId, released });
    res.json({ success: true, userId, released });
  });

  router.get('/incident-response/banned-entities', requireAdminAuth, (req, res) => {
    const blocked = getBlockedIPs().map(item => ({
      time: item.blockedAt,
      banTime: item.blockedAt,
      action: 'BLOCK_IP',
      target: item.ip,
      reason: item.reason,
      note: item.note || '',
      severity: item.reason === 'manual' || item.reason === 'manual-dashboard' ? 'MEDIUM' : 'HIGH',
      score: item.score,
      hits: item.hits,
      type: 'ip'
    }));
    const accounts = getQuarantinedAccounts().map(item => ({
      time: item.quarantinedAt,
      banTime: item.quarantinedAt,
      action: String(item.reason || '').includes('[BAN:') ? 'BAN_ACCOUNT' : 'QUARANTINE_ACCOUNT',
      target: item.id,
      reason: item.reason,
      severity: item.severity || 'HIGH',
      type: 'account'
    }));
    res.json([...blocked, ...accounts].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0)));
  });

  router.get('/incident-response/log', requireAdminAuth, (req, res) => {
    res.json(getIRLog());
  });

  router.delete('/incident-response/log', requireAdminAuth, (req, res) => {
    clearIRLog();
    io.emit('incident-response', { type: 'CLEAR_IR_LOG' });
    res.json({ success: true });
  });

  router.get('/sessions', requireAdminAuth, (req, res) => {
    res.json(getSessionSnapshot());
  });

  router.delete('/sessions', requireAdminAuth, (req, res) => {
    Object.keys(sessionMonitor.active).forEach(id => delete sessionMonitor.active[id]);
    sessionMonitor.history = [];
    saveSessionState();
    io.emit('sessions-updated', getSessionSnapshot());
    res.json({ success: true });
  });

  router.get('/geo-velocity', requireAdminAuth, (req, res) => {
    res.json(geoVelocity.getSnapshot());
  });

  router.post('/geo-velocity/check', requireAdminAuth, async (req, res) => {
    const body = req.body || {};
    const userId = body.userId || body.email || body.username;
    const ip = body.ip || getClientIP(req);
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const result = await geoVelocity.check(userId, ip, {
      user: body.username || body.name || userId,
      email: body.email || ''
    });
    io.emit('geo-velocity-state', geoVelocity.getSnapshot());
    res.json(result);
  });

  router.post('/geo-velocity/record', requireAdminAuth, async (req, res) => {
    const body = req.body || {};
    const userId = body.userId || body.email || body.username;
    const ip = body.ip || getClientIP(req);
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const geo = await geoVelocity.recordLogin(userId, ip, {
      user: body.username || body.name || userId,
      email: body.email || ''
    });
    io.emit('geo-velocity-state', geoVelocity.getSnapshot());
    res.json({ success: true, geo });
  });

  router.delete('/geo-velocity/events', requireAdminAuth, (req, res) => {
    geoVelocity.clearEvents();
    io.emit('geo-velocity-state', geoVelocity.getSnapshot());
    res.json({ success: true });
  });

  router.get('/alerts/config', requireAdminAuth, (req, res) => {
    res.json(alertChannels.publicConfig());
  });

  router.post('/alerts/config', requireAdminAuth, (req, res) => {
    const config = alertChannels.updateConfig(req.body || {});
    io.emit('alerts-config', config);
    res.json({ success: true, config });
  });

  router.get('/alerts/log', requireAdminAuth, (req, res) => {
    res.json({ log: alertChannels.publicConfig().alertLog });
  });

  router.delete('/alerts/log', requireAdminAuth, (req, res) => {
    alertChannels.clearLog();
    io.emit('alerts-log', []);
    io.emit('alerts-config', alertChannels.publicConfig());
    res.json({ success: true });
  });

  router.post('/alerts/test-email', requireAdminAuth, async (req, res) => {
    const body = req.body || {};
    const recipients = body.recipients || body.to || [];
    const list = Array.isArray(recipients) ? recipients : [recipients];
    const smtp = body.smtp || alertChannels.state.smtp;
    const results = [];
    for (const to of list.filter(Boolean)) {
      try {
        await alertChannels.sendEmail({
          smtp,
          to,
          subject: body.subject || '[TABIBI SOC] Test email',
          body: body.body || 'TABIBI SOC email alerts are configured correctly.'
        });
        results.push(alertChannels.logAlert({ type: 'TEST', trigger: 'manual', channel: 'email', to, message: 'Test email delivered successfully', status: 'SENT' }));
      } catch (err) {
        results.push(alertChannels.logAlert({ type: 'TEST', trigger: 'manual', channel: 'email', to, message: 'Test email failed', status: 'FAILED', error: err.message }));
      }
    }
    io.emit('alerts-log', alertChannels.publicConfig().alertLog);
    io.emit('alerts-config', alertChannels.publicConfig());
    const failed = results.find(r => r.status === 'FAILED');
    res.status(failed ? 400 : 200).json({ success: !failed, results, error: failed?.error });
  });

  router.post('/alerts/send-email', requireAdminAuth, async (req, res) => {
    const body = req.body || {};
    try {
      await alertChannels.sendEmail({
        smtp: body.smtp || alertChannels.state.smtp,
        to: body.to,
        subject: body.subject,
        body: body.body
      });
      const item = alertChannels.logAlert({ type: 'ALERT', trigger: body.trigger || 'manual', channel: 'email', to: body.to, message: body.subject || 'Alert email sent', status: 'SENT' });
      io.emit('alerts-log', alertChannels.publicConfig().alertLog);
      io.emit('alerts-config', alertChannels.publicConfig());
      res.json({ success: true, item });
    } catch (err) {
      const item = alertChannels.logAlert({ type: 'ALERT', trigger: body.trigger || 'manual', channel: 'email', to: body.to, message: body.subject || 'Alert email failed', status: 'FAILED', error: err.message });
      io.emit('alerts-log', alertChannels.publicConfig().alertLog);
      res.status(400).json({ success: false, error: err.message, item });
    }
  });

  router.post('/alerts/test-sms', requireAdminAuth, async (req, res) => {
    const body = req.body || {};
    const recipients = body.recipients || body.to || [];
    const list = Array.isArray(recipients) ? recipients : [recipients];
    const twilio = body.twilio || alertChannels.state.twilio;
    const results = [];
    for (const to of list.filter(Boolean)) {
      const result = await alertChannels.sendSms({ twilio, to, body: body.body || 'TABIBI SOC SMS alerts are configured correctly.' });
      results.push(alertChannels.logAlert({ type: 'TEST', trigger: 'manual', channel: 'sms', to, message: result.success ? 'Test SMS delivered successfully' : 'Test SMS failed', status: result.success ? 'SENT' : 'FAILED', error: result.error }));
    }
    io.emit('alerts-log', alertChannels.publicConfig().alertLog);
    io.emit('alerts-config', alertChannels.publicConfig());
    const failed = results.find(r => r.status === 'FAILED');
    res.status(failed ? 400 : 200).json({ success: !failed, results, error: failed?.error });
  });

  router.post('/alerts/send-sms', requireAdminAuth, async (req, res) => {
    const body = req.body || {};
    const result = await alertChannels.sendSms({ twilio: body.twilio || alertChannels.state.twilio, to: body.to, body: body.body });
    const item = alertChannels.logAlert({ type: 'ALERT', trigger: body.trigger || 'manual', channel: 'sms', to: body.to, message: result.success ? 'Alert SMS sent' : 'Alert SMS failed', status: result.success ? 'SENT' : 'FAILED', error: result.error });
    io.emit('alerts-log', alertChannels.publicConfig().alertLog);
    io.emit('alerts-config', alertChannels.publicConfig());
    res.status(result.success ? 200 : 400).json({ ...result, item });
  });

  router.post('/sessions/track', (req, res) => {
    const body = req.body || {};
    const userId = body._id || body.id || body.email;
    if (!userId) return res.status(400).json({ error: 'Session user id required' });

    const role = normalizeRole(body.role);
    const ip = getClientIP(req);
    const browserSessionId = (body.sessionId || req.headers['x-tabibi-session-id'])
      ? String(body.sessionId || req.headers['x-tabibi-session-id']).slice(0, 120)
      : String(userId);
    const id = `app:${String(userId)}:${browserSessionId}`;
    const legacyId = `app:${String(userId)}`;
    const now = Date.now();
    const existing = sessionMonitor.active[id];
    const legacy = sessionMonitor.active[legacyId];
    const identity = getSessionIdentity({ userId, email: body.email, user: body.name });
    removeDuplicateAppSessions(id, identity);
    if (legacyId !== id && legacy) delete sessionMonitor.active[legacyId];
    sessionMonitor.active[id] = {
      id,
      userId: String(userId),
      user: body.name || body.email || String(userId),
      email: body.email || '',
      role,
      ip,
      startedAt: existing?.startedAt || legacy?.startedAt || now,
      startedAtIso: existing?.startedAtIso || legacy?.startedAtIso || new Date(now).toISOString(),
      lastSeen: now,
      lastSeenIso: new Date(now).toISOString(),
      expiresAt: now + 30 * 60000,
      userAgent: req.headers['user-agent'] || '',
      status: 'ACTIVE',
      source: 'TABIBI_APP'
    };
    saveSessionState();

    const requestedAction = body.action || (existing ? 'APP_SESSION_ACTIVE' : 'APP_SESSION_STARTED');
    const action = !existing && isHeartbeatAction(requestedAction) ? 'SESSION_STARTED' : requestedAction;
    const shouldLogHistory = !isHeartbeatAction(action);
    const event = shouldLogHistory ? pushSessionEvent({
      user: sessionMonitor.active[id].user,
      role,
      ip,
      action,
      note: body.email || browserSessionId || 'TABIBI app session'
    }) : null;

    io.emit('sessions-updated', getSessionSnapshot());
    emitSessionEvent(io, event);
    runGeoVelocityCheck({
      _id: userId,
      id: body.id,
      name: body.name,
      email: body.email,
      role: body.role
    }, req, action, io).catch(() => {});
    res.json({ success: true, session: sessionMonitor.active[id] });
  });

  router.post('/sessions/end', (req, res) => {
    const body = req.body || {};
    const userId = body._id || body.id || body.email;
    if (!userId) return res.status(400).json({ error: 'Session user id required' });

    const browserSessionId = (body.sessionId || req.headers['x-tabibi-session-id'])
      ? String(body.sessionId || req.headers['x-tabibi-session-id']).slice(0, 120)
      : String(userId);
    const id = `app:${String(userId)}:${browserSessionId}`;
    const rec = sessionMonitor.active[id];
    if (rec) {
      const durationMs = Date.now() - Number(rec.startedAt || Date.now());
      delete sessionMonitor.active[id];
      saveSessionState();
      const event = pushSessionEvent({
        user: rec.user,
        role: rec.role,
        ip: rec.ip,
        action: 'LOGOUT',
        duration: Math.max(1, Math.round(durationMs / 1000)) + 's',
        note: rec.email || rec.id
      });
      emitSessionEvent(io, event);
    }

    saveSessionState();
    io.emit('sessions-updated', getSessionSnapshot());
    res.json({ success: true });
  });


// File Scan monitoring and protected upload validation.
router.get('/filescan/records', requireAdminAuth, (req, res) => {
  const result = fileScan.queryRecords(req.query || {});
  res.json({ ...result, stats: fileScan.getStats() });
});

router.get('/filescan/stats', requireAdminAuth, (req, res) => {
  res.json(fileScan.getStats());
});

router.get('/filescan/timeline', requireAdminAuth, (req, res) => {
  const threats = fileScan.queryRecords({ ...req.query, status: req.query.status || '', limit: req.query.limit || 500 }).records
    .filter(r => r.scanStatus !== fileScan.STATUS.SAFE)
    .map(r => ({
      id: r.id,
      type: r.scanStatus === fileScan.STATUS.THREAT ? 'FILE_SCAN_THREAT' : 'FILE_SCAN_SUSPICIOUS',
      ip: r.ipAddress,
      score: r.riskScore,
      action: r.scanStatus === fileScan.STATUS.THREAT ? 'BLOCKED' : 'FLAGGED',
      time: r.scanTimestamp || r.uploadTimestamp,
      isoTime: r.scanTimestamp || r.uploadTimestamp,
      path: '/api/upload/scan',
      method: 'POST',
      payload: r.fileName,
      analysis: {
        type: 'FILE_SCAN',
        risk: r.threatSeverity,
        target: r.uploadLocation,
        technique: r.reasonForClassification,
        indicators: r.malwareSignaturesOrIndicators,
        sha256: r.sha256,
        user: r.email || r.username
      }
    }))
    .sort((a, b) => new Date(a.isoTime) - new Date(b.isoTime));
  res.json({ events: threats, total: threats.length });
});

router.get('/filescan/export', requireAdminAuth, (req, res) => {
  const format = String(req.query.format || 'csv').toLowerCase();
  const records = fileScan.queryRecords({ ...req.query, page: 1, exportAll: true }).records;
  if (format === 'json') return res.json({ generatedAt: new Date().toISOString(), total: records.length, records });
  if (format === 'xlsx') {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="tabibi-scan-history.xlsx"');
    return res.send(recordsToXlsx(records));
  }
  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="tabibi-scan-history.pdf"');
    return res.send(recordsToPdf(records));
  }
  const csv = recordsToCsv(records);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="tabibi-scan-history.csv"`);
  return res.send(csv);
});

router.delete('/filescan/records', requireAdminAuth, (req, res) => {
  fileScan.clearRecords();
  res.json({ success: true });
});

router.post('/upload/scan', fileScanUpload.single('file'), (req, res) => {
  const uploaded = req.file;
  if (!uploaded) return res.status(400).json({ error: 'file is required' });

  const body = req.body || {};
  const result = fileScan.scan(uploaded.buffer, uploaded.originalname, uploaded.mimetype);
  const record = fileScan.recordScan({
    file: uploaded,
    result,
    req,
    userInfo: {
      username: body.username,
      email: body.email,
      device: body.device,
      browser: body.browser,
      uploadLocation: body.uploadLocation,
      accountActivity: body.accountActivity
    },
    uploadLocation: body.uploadLocation || 'Website upload validation',
    accountActivity: body.accountActivity || `${req.method} ${req.originalUrl}`
  });

    const entry = {
      ip: record.ipAddress,
      type: record.scanStatus === fileScan.STATUS.THREAT ? 'FILE_SCAN_THREAT' : (record.scanStatus === fileScan.STATUS.SUSPICIOUS ? 'FILE_SCAN_SUSPICIOUS' : 'FILE_SCAN_SAFE'),
      score: record.riskScore || 0,
      action: record.scanStatus === fileScan.STATUS.THREAT ? 'BLOCKED' : (record.scanStatus === fileScan.STATUS.SUSPICIOUS ? 'FLAGGED' : 'SCANNED'),
      time: cairoNow(),
      isoTime: record.scanTimestamp || new Date().toISOString(),
      path: '/api/upload/scan',
      method: 'POST',
      payload: record.fileName,
      analysis: {
        type: 'FILE_SCAN',
        risk: record.threatSeverity || 'Low',
        target: record.uploadLocation || 'Website upload validation',
        technique: record.reasonForClassification,
        indicators: record.malwareSignaturesOrIndicators,
        sha256: record.sha256,
        user: record.email || record.username
      }
    };
    loggerWithIso(entry);
    if (record.scanStatus !== fileScan.STATUS.SAFE) io.emit('filescan-alert', record);
    if (record.scanStatus === fileScan.STATUS.THREAT) {
      const blockedRecord = blockIP(record.ipAddress, 'FILE_SCAN_THREAT-auto', record.reasonForClassification || 'Threat file uploaded');
      io.emit('ip-auto-banned', { ip: record.ipAddress, reason: 'FILE_SCAN_THREAT', score: record.riskScore || 100, time: cairoNow() });
      io.emit('blocked-list', getBlockedIPs());
      io.emit('incident-response', { type: 'BLOCK_IP', record: blockedRecord });
      io.emit('attack', entry);
      io.emit('new-threat', entry);
    }

  const payload = { success: record.scanStatus === fileScan.STATUS.SAFE, record, scan: result };
  if (record.scanStatus === fileScan.STATUS.THREAT) return res.status(400).json(payload);
  if (record.scanStatus === fileScan.STATUS.SUSPICIOUS) return res.status(202).json(payload);
  return res.json(payload);
});

// ── Socket.IO connections ─────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('[SOC] Socket connected:', socket.id);
  // Rehydrate blocked-list and current health on fresh connect
  const blockedIPs = getBlockedIPs();
  const health     = computeHealth();
  socket.emit('sessions-updated', getSessionSnapshot());
  socket.emit('blocked-list',   blockedIPs);
  socket.emit('panic-mode',     { active: panicState.get() });
  socket.emit('health-update',  health);
  socket.emit('security-state', { health, blocked: blockedIPs, threats: getAllThreats() });
  socket.emit('alerts-config', alertChannels.publicConfig());
  socket.emit('alerts-log', alertChannels.publicConfig().alertLog);
  socket.emit('filescan-records', { records: fileScan.readRecords().slice(0, 250), total: fileScan.readRecords().length, stats: fileScan.getStats() });
  socket.emit('filescan-stats', fileScan.getStats());
  // Send the last 50 recent attack logs so the dashboard feed populates immediately
  // without waiting for the 3s poll cycle
  try {
    const recentLogs = readLogs().slice(-50);
    recentLogs.forEach(function(entry) {
      if (!entry.isoTime) entry.isoTime = new Date(entry.time || Date.now()).toISOString();
    });
    if (recentLogs.length > 0) socket.emit('recent-attacks', recentLogs);
  } catch(_) {}

  socket.on('disconnect', () => {
    console.log('[SOC] Socket disconnected:', socket.id);
  });
});

// Periodic health broadcast every 30 seconds
setInterval(broadcastHealth, 30000).unref?.();

// ── 404 / error handlers ──────────────────────────────────────────────────────



  return { router, waf, honeypot, sessionTracker, HONEYPOT_ROUTES, publicDir: PUBLIC_DIR, io, clearSecurityState };
}

module.exports = { createSecurityLayer };
