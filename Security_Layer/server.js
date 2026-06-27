'use strict';
process.env.TZ = 'Africa/Cairo';

require('dotenv').config();

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
const cors    = require('cors');
const fs      = require('fs');
const crypto  = require('crypto');
const net     = require('net');
const os      = require('os');
const https   = require('https');

// ─── Security layer modules ───────────────────────────────────────────────────
const { cairoNow }           = require('./security/timeUtils');
const { computeHealthFromLogs } = require('./security/healthUtils');
const panicState             = require('./security/panicState');
const pkg                    = require('./package.json');
const threatEngine           = require('./security/threatEngine');
const { blockIP, unblockIP, getBlockedIPs, getAllThreats, cleanIP, clearIRLog } = threatEngine;
const logger                 = require('./security/logger');
const wafMiddleware          = require('./security/waf');
const phiAudit               = require('./security/phiAudit');
const geoVelocity            = require('./security/geoVelocity');
const appointmentGuard       = require('./security/appointmentGuard');
const ratingGuard            = require('./security/ratingGuard');
const fileScan               = require('./security/fileScan');
const siemExport             = require('./security/siemExport');

// ─── App setup ────────────────────────────────────────────────────────────────
const app        = express();
const server     = http.createServer(app);
const PORT       = Number(process.env.PORT || 3000);
const STARTED_AT = Date.now();
const PUBLIC_DIR = path.join(__dirname, 'public');
const LOG_FILE   = path.join(__dirname, 'attacks.json');
const SNAP_DIR   = path.join(__dirname, 'snapshots');

const ALARM_HEALTH_THRESHOLD    = Number(process.env.SOC_ALARM_HEALTH    || 50);
const SHUTDOWN_HEALTH_THRESHOLD = Number(process.env.SOC_SHUTDOWN_HEALTH || 40);

// ─── Traffic stats ────────────────────────────────────────────────────────────
const trafficStats = {
  totalRequests:   0,
  recentRequests:  [],
  statusCounts:    Object.create(null),
  lastRequestAt:   null
};

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
  const now    = Date.now();
  const cutoff = now - 60000;
  trafficStats.recentRequests = trafficStats.recentRequests.filter(ts => ts >= cutoff);
  return {
    totalRequests:      trafficStats.totalRequests,
    requestsLastMinute: trafficStats.recentRequests.length,
    statusCounts:       trafficStats.statusCounts,
    lastRequestAt:      trafficStats.lastRequestAt
  };
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
const AUTH_REQUIRED = String(
  process.env.SOC_REQUIRE_AUTH || (process.env.NODE_ENV === 'production' ? 'true' : 'false')
).toLowerCase() === 'true';

let SOC_ADMIN_TOKEN = process.env.SOC_ADMIN_TOKEN || crypto.randomBytes(32).toString('hex');
if (!process.env.SOC_ADMIN_TOKEN) {
  console.warn('[SOC] No SOC_ADMIN_TOKEN set. Generated session token:', SOC_ADMIN_TOKEN);
}

const RECOVERY_PASSWORD = process.env.RECOVERY_PASSWORD || 'TABIBI-RECOVERY-2026';
if (!process.env.RECOVERY_PASSWORD) {
  console.warn('[SOC] RECOVERY_PASSWORD not set — using default. Change this before production!');
}

// Rate-limit login/recovery attempts per IP
const loginAttempts   = Object.create(null);
const recoverAttempts = Object.create(null);
setInterval(() => {
  const cutoff = Date.now() - 600000;
  [loginAttempts, recoverAttempts].forEach(obj => {
    Object.keys(obj).forEach(k => { if (obj[k].windowStart < cutoff) delete obj[k]; });
  });
}, 1800000).unref?.();

// ─── Runtime file setup ───────────────────────────────────────────────────────
function ensureRuntimeFiles() {
  if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  if (!fs.existsSync(SNAP_DIR))   fs.mkdirSync(SNAP_DIR,   { recursive: true });

  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '[]\n', 'utf8');
  try {
    const parsed = JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    if (!Array.isArray(parsed)) fs.writeFileSync(LOG_FILE, '[]\n', 'utf8');
  } catch {
    fs.writeFileSync(LOG_FILE, '[]\n', 'utf8');
  }

  // Copy root index.html into public/ if it isn't there yet
  const rootHtml = path.join(__dirname, 'index.html');
  const pubHtml  = path.join(PUBLIC_DIR, 'index.html');
  if (!fs.existsSync(pubHtml) && fs.existsSync(rootHtml)) {
    try {
      fs.copyFileSync(rootHtml, pubHtml);
      console.log('[SOC] Copied index.html → public/index.html');
    } catch (err) {
      console.error('[SOC] Could not copy index.html to public/:', err.message);
    }
  }
}
ensureRuntimeFiles();

// ─── CORS & origin validation ─────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.SOC_ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
  .split(',').map(o => o.trim()).filter(Boolean);

function originAllowed(origin) {
  if (!origin) return process.env.NODE_ENV !== 'production';
  return ALLOWED_ORIGINS.includes(origin);
}

const TRUSTED_PROXIES = (process.env.TRUSTED_PROXIES || '')
  .split(',').map(p => p.trim()).filter(Boolean);

const corsOptions = {
  origin:         (origin, cb) => originAllowed(origin) ? cb(null, true) : cb(new Error(`CORS blocked: ${origin}`)),
  methods:        ['GET', 'POST', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Content-Type', 'x-soc-token'],
  credentials:    true
};

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin:      (origin, cb) => originAllowed(origin) ? cb(null, true) : cb(new Error(`Socket CORS blocked: ${origin}`)),
    methods:     ['GET', 'POST'],
    credentials: true
  }
});

// ─── Security module initialisation ──────────────────────────────────────────
const waf      = wafMiddleware(io);
const honeypot = require('./security/honeypot')(io);
logger.setIO(io);

// ─── IP resolution ────────────────────────────────────────────────────────────
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const remote    = cleanIP(req.socket?.remoteAddress || req.connection?.remoteAddress || req.ip || '0.0.0.0');
  if (forwarded && TRUSTED_PROXIES.length > 0 && TRUSTED_PROXIES.includes(remote)) {
    return cleanIP(String(forwarded).split(',')[0].trim());
  }
  return cleanIP(req.ip || remote);
}

// ─── Admin auth middleware ────────────────────────────────────────────────────
function requireAdminAuth(req, res, next) {
  if (!AUTH_REQUIRED) return next();
  const token = req.headers['x-soc-token'] || req.query.token;
  if (token && token === SOC_ADMIN_TOKEN) return next();
  console.warn(`[Auth] Unauthorized ${getClientIP(req)} -> ${req.method} ${req.path}`);
  return res.status(401).json({ error: 'Unauthorized - SOC token required' });
}

// ─── Log helpers ──────────────────────────────────────────────────────────────
function readLogs() {
  logger.flushSync();
  return logger.readLogsSync();
}

function writeLogs(logs) {
  logger.writeLogsSync(Array.isArray(logs) ? logs : []);
}

// Patch: ensure every attack entry has a stable ISO timestamp for client dedup
const _origLogger = logger;
function loggerWithIso(entry) {
  if (entry && !entry.isoTime) entry.isoTime = new Date().toISOString();
  return _origLogger(entry);
}

// ─── Health computation ───────────────────────────────────────────────────────
function computeHealth() {
  const logs     = readLogs();
  const total    = logs.length;
  const blocked  = getBlockedIPs().length;
  const critical = logs.filter(item => Number(item.score || 0) >= 100).length;
  const health   = computeHealthFromLogs(logs);
  return {
    total, blocked, critical, health,
    patientDataSafety:  health,
    alarmThreshold:     ALARM_HEALTH_THRESHOLD,
    shutdownThreshold:  SHUTDOWN_HEALTH_THRESHOLD,
    traffic: getTrafficStats(),
    time:    cairoNow()
  };
}

function broadcastHealth() {
  const health = computeHealth();
  io.emit('health-update',   health);
  io.emit('security-state',  { health, blocked: getBlockedIPs(), threats: getAllThreats() });

  // Auto-shutdown when health drops below threshold
  if (health.health <= SHUTDOWN_HEALTH_THRESHOLD && !panicState.get()) {
    panicState.set(true);
    wafMiddleware.setPanicMode(true);
    io.emit('panic-mode', {
      active: true, auto: true, shutdown: true,
      health: health.health, threshold: SHUTDOWN_HEALTH_THRESHOLD,
      time: cairoNow()
    });
  }
  return health;
}

// ─── Security headers ─────────────────────────────────────────────────────────
function cspHeader() {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self' ws: wss:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'"
  ].join('; ');
}

// ─── Express middleware stack ─────────────────────────────────────────────────
app.disable('x-powered-by');
app.set('trust proxy', TRUSTED_PROXIES.length > 0);
app.use(cors(corsOptions));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options',  'nosniff');
  res.setHeader('X-Frame-Options',         'DENY');
  res.setHeader('Referrer-Policy',         'no-referrer');
  res.setHeader('Permissions-Policy',      'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy', cspHeader());
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.text({
  type: ['text/xml', 'application/xml', 'application/soap+xml', 'application/xhtml+xml'],
  limit: '1mb'
}));
app.use(recordTraffic);

// ─── Honeypot routes ──────────────────────────────────────────────────────────
// These decoy routes auto-ban any scanner that touches them.
// Add as many decoys as you like.
const HONEYPOT_ROUTES = [
  '/trap', '/admin', '/wp-login.php', '/phpmyadmin', '/.env',
  '/config', '/backup', '/db', '/shell', '/phpinfo.php', '/administrator'
];
HONEYPOT_ROUTES.forEach(route => app.all(route, honeypot));

// ─── WAF + static files ───────────────────────────────────────────────────────
app.use(waf);
app.use(express.static(PUBLIC_DIR, { index: 'index.html', extensions: ['html'] }));

// ══════════════════════════════════════════════════════════════════════════════
// API ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ── Health check (public) ────────────────────────────────────────────────────
app.get('/api/test', (req, res) => {
  const health = computeHealth();
  res.json({
    message:     'System Secure',
    status:      'online',
    timestamp:   cairoNow(),
    version:     pkg.version,
    wafPatterns: Object.keys(wafMiddleware.PATTERNS || {}).length,
    honeypots:   HONEYPOT_ROUTES.length,
    authRequired: AUTH_REQUIRED,
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    health,
    alarmThreshold:    ALARM_HEALTH_THRESHOLD,
    shutdownThreshold: SHUTDOWN_HEALTH_THRESHOLD,
    traffic: getTrafficStats()
  });
});

// ── System metrics ────────────────────────────────────────────────────────────
app.get('/api/metrics', requireAdminAuth, (req, res) => {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const totalMem = os.totalmem();
  const freeMem  = os.freemem();
  const usedMem  = totalMem - freeMem;
  const loadAvg  = os.loadavg();
  res.json({
    uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
    nodeUptime:    Math.floor(process.uptime()),
    memory: {
      rss:         memUsage.rss,
      heapUsed:    memUsage.heapUsed,
      heapTotal:   memUsage.heapTotal,
      external:    memUsage.external,
      systemTotal: totalMem,
      systemFree:  freeMem,
      systemUsed:  usedMem,
      usedPct:     Math.round((usedMem / totalMem) * 100)
    },
    cpu: {
      user:       cpuUsage.user,
      system:     cpuUsage.system,
      loadAvg1:   loadAvg[0].toFixed(2),
      loadAvg5:   loadAvg[1].toFixed(2),
      loadAvg15:  loadAvg[2].toFixed(2),
      cores:      os.cpus().length
    },
    platform:  os.platform(),
    arch:      os.arch(),
    hostname:  os.hostname(),
    timestamp: cairoNow()
  });
});

// ── Dashboard login ───────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const ip  = getClientIP(req);
  const now = Date.now();
  if (!loginAttempts[ip] || now - loginAttempts[ip].windowStart > 60000) {
    loginAttempts[ip] = { count: 0, windowStart: now };
  }
  loginAttempts[ip].count += 1;
  if (loginAttempts[ip].count > 5) {
    return res.status(429).json({ error: 'Too many attempts. Try in 1 minute.' });
  }
  if (!req.body || req.body.password !== RECOVERY_PASSWORD) {
    console.warn(`[Login] Failed attempt from ${ip}`);
    return res.status(401).json({ error: 'Invalid password' });
  }
  loginAttempts[ip] = { count: 0, windowStart: now };
  res.json({ success: true, token: SOC_ADMIN_TOKEN });
});

// ── Attack logs ───────────────────────────────────────────────────────────────
// Flag set during clear — readLogs() returns [] while this is true
let _logsCleared = false;

app.get('/api/logs', requireAdminAuth, (req, res) => {
  if (_logsCleared) return res.json([]);
  res.json(readLogs());
});

app.delete('/api/logs', requireAdminAuth, (req, res) => {
  try {
    _logsCleared = true;
    // Write empty directly to disk, bypassing all logger buffering
    fs.writeFileSync(LOG_FILE, '[]\n', 'utf8');
    // NOTE: deliberately does NOT touch blockedIPs, tempBans, or panic mode.
    // Clearing the threat log must never block/unblock/quarantine — that's admin-only.
    // Emit clear BEFORE responding so socket arrives before the HTTP response
    io.emit('logs-cleared', { time: cairoNow() });
    broadcastHealth();
    res.json({ success: true });
    // After a short delay, let logger flush then overwrite again to stay empty
    setTimeout(function() {
      try { fs.writeFileSync(LOG_FILE, '[]\n', 'utf8'); } catch(_) {}
      setTimeout(function() {
        try { fs.writeFileSync(LOG_FILE, '[]\n', 'utf8'); } catch(_) {}
        _logsCleared = false;
      }, 2000);
    }, 500);
  } catch (err) {
    _logsCleared = false;
    res.status(500).json({ error: err.message });
  }
});

// ── PHI audit clear ───────────────────────────────────────────────────────────
app.delete('/api/phi/audit/clear', requireAdminAuth, (req, res) => {
  const confirm = req.headers['x-confirm-audit-clear'];
  if (confirm !== 'CONFIRM-ERASE-PHI-AUDIT') {
    return res.status(400).json({
      error: 'Missing confirmation header.',
      hint:  'Add header: x-confirm-audit-clear: CONFIRM-ERASE-PHI-AUDIT'
    });
  }
  try {
    const { PHI_LOG_FILE } = phiAudit;
    fs.writeFileSync(PHI_LOG_FILE, '[]\n', 'utf8');
    console.warn('[SOC] PHI AUDIT TRAIL MANUALLY CLEARED by admin from', getClientIP(req));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Blocked IPs / threats ─────────────────────────────────────────────────────
app.get('/api/blocked-ips', requireAdminAuth, (req, res) => {
  res.json(getBlockedIPs());
});

app.get('/api/threats', requireAdminAuth, (req, res) => {
  res.json(getAllThreats());
});

app.get('/api/security-state', requireAdminAuth, (req, res) => {
  res.json({
    health:            computeHealth(),
    blocked:           getBlockedIPs(),
    threats:           getAllThreats(),
    logs:              readLogs(),
    traffic:           getTrafficStats(),
    alarmThreshold:    ALARM_HEALTH_THRESHOLD,
    shutdownThreshold: SHUTDOWN_HEALTH_THRESHOLD
  });
});

// ── Browser fingerprints ──────────────────────────────────────────────────────
app.get('/api/fingerprints', requireAdminAuth, (req, res) => {
  const hist    = wafMiddleware.getFingerprintHistory();
  const limit   = Math.min(Number(req.query.limit || 100), 500);
  const entries = Object.entries(hist)
    .map(([fp, records]) => ({
      fingerprint: fp,
      ipCount:     new Set(records.map(r => r.ip)).size,
      ips:         [...new Set(records.map(r => r.ip))],
      lastSeen:    new Date(Math.max(...records.map(r => r.time))).toISOString()
    }))
    .sort((a, b) => b.ipCount - a.ipCount)
    .slice(0, limit);
  res.json({ total: entries.length, fingerprints: entries });
});

// ── IP management ─────────────────────────────────────────────────────────────
function validateIP(ip) {
  return typeof ip === 'string' && net.isIP(ip.trim()) !== 0;
}

app.post('/api/block-ip', requireAdminAuth, (req, res) => {
  const ip         = cleanIP(req.body?.ip || '');
  const reason     = String(req.body?.reason || 'manual').slice(0, 80);
  const incidentId = `IR-IP-${Date.now()}`;
  if (!validateIP(ip)) return res.status(400).json({ error: 'Valid IPv4 or IPv6 address required' });
  const blocked = blockIP(ip, reason);
  threatEngine.logIRAction({ action: 'BLOCK_IP', target: ip, reason, severity: 'HIGH', incidentId });
  io.emit('ip-blocked',        { ip, reason, incidentId, time: cairoNow() });
  io.emit('blocked-list',      getBlockedIPs());
  io.emit('incident-response', { action: 'BLOCK_IP', ip, reason, severity: 'HIGH', incidentId, time: cairoNow() });
  broadcastHealth();
  res.json({ success: true, incidentId, blocked });
});

app.post('/api/unblock-ip', requireAdminAuth, (req, res) => {
  const rawIp = String(req.body?.ip || '').trim();
  let ip = cleanIP(rawIp);
  // Strip ::ffff: IPv6-mapped prefix
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  const incidentId = `IR-UNBLK-${Date.now()}`;
  if (!validateIP(ip)) {
    return res.status(400).json({ error: 'Valid IP required', received: rawIp });
  }
  // Try every possible stored form of this IP
  const candidates = [ip, '::ffff:' + ip, rawIp];
  if (ip === '127.0.0.1') candidates.push('::1', 'localhost');
  candidates.forEach(candidate => { try { unblockIP(candidate); } catch(_) {} });
  try { wafMiddleware.clearBruteState(ip); } catch(_) {}
  try { threatEngine.logIRAction({ action: 'UNBLOCK_IP', target: ip, reason: 'manual-unblock', severity: 'INFO', incidentId }); } catch(_) {}
  const remaining = getBlockedIPs();
  io.emit('ip-unblocked',      { ip, incidentId, time: cairoNow() });
  io.emit('blocked-list',      remaining);
  io.emit('incident-response', { action: 'UNBLOCK_IP', ip, incidentId, time: cairoNow() });
  broadcastHealth();
  res.json({ success: true, incidentId, remaining: remaining.length });
});

// ── Incident response ─────────────────────────────────────────────────────────
app.post('/api/incident-response/quarantine', requireAdminAuth, (req, res) => {
  const ip         = cleanIP(req.body?.ip || '');
  const reason     = String(req.body?.reason   || 'manual-ir').slice(0, 120);
  const severity   = String(req.body?.severity || 'HIGH').slice(0, 20);
  const incidentId = `IR-${Date.now()}`;
  if (!validateIP(ip)) return res.status(400).json({ error: 'Valid IPv4 or IPv6 address required' });
  const blocked = blockIP(ip, reason);
  threatEngine.logIRAction({ action: 'QUARANTINE', target: ip, reason, severity, incidentId });
  const entry = {
    ip, type: 'INCIDENT_RESPONSE', score: threatEngine.getThreatScore(ip),
    action: 'QUARANTINE', time: cairoNow(),
    path:   '/api/incident-response/quarantine', method: 'POST',
    payload:  `Manual IR quarantine: ${reason} [${severity}] — ${incidentId}`,
    analysis: { type: 'INCIDENT_RESPONSE', risk: severity, target: ip, technique: 'Admin-initiated quarantine' }
  };
  loggerWithIso(entry);
  io.emit('attack',            entry);
  io.emit('ip-blocked',        { ip, reason, severity, incidentId, time: cairoNow() });
  io.emit('blocked-list',      getBlockedIPs());
  io.emit('incident-response', { action: 'QUARANTINE', ip, reason, severity, incidentId, time: cairoNow() });
  broadcastHealth();
  res.json({ success: true, incidentId, blocked });
});

app.post('/api/incident-response/release', requireAdminAuth, (req, res) => {
  const ip         = cleanIP(req.body?.ip || '');
  const incidentId = `IR-REL-${Date.now()}`;
  if (!validateIP(ip)) return res.status(400).json({ error: 'Valid IPv4 or IPv6 address required' });
  unblockIP(ip);
  wafMiddleware.clearBruteState(ip);
  threatEngine.logIRAction({ action: 'RELEASE', target: ip, reason: 'manual-release', severity: 'INFO', incidentId });
  io.emit('ip-unblocked',      { ip, incidentId, time: cairoNow() });
  io.emit('blocked-list',      getBlockedIPs());
  io.emit('incident-response', { action: 'RELEASE', ip, incidentId, time: cairoNow() });
  broadcastHealth();
  res.json({ success: true, incidentId });
});

app.post('/api/incident-response/quarantine-account', requireAdminAuth, (req, res) => {
  const userId     = String(req.body?.userId   || '').slice(0, 120);
  const reason     = String(req.body?.reason   || 'manual-ir').slice(0, 120);
  const severity   = String(req.body?.severity || 'HIGH').slice(0, 20);
  const incidentId = `IR-ACC-${Date.now()}`;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const result = threatEngine.quarantineAccount(userId, reason, severity, incidentId);
  io.emit('incident-response', { action: 'QUARANTINE_ACCOUNT', userId, reason, severity, incidentId, time: cairoNow() });
  res.json({ success: true, incidentId, quarantined: result });
});

app.post('/api/incident-response/release-account', requireAdminAuth, (req, res) => {
  const userId     = String(req.body?.userId || '').slice(0, 120);
  const incidentId = `IR-REL-ACC-${Date.now()}`;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  const released = threatEngine.releaseAccount(userId, incidentId);
  io.emit('incident-response', { action: 'RELEASE_ACCOUNT', userId, incidentId, time: cairoNow() });
  res.json({ success: true, incidentId, released });
});

app.get('/api/iam/quarantined-accounts', requireAdminAuth, (req, res) => {
  res.json(threatEngine.getQuarantinedAccounts());
});

app.get('/api/incident-response/log', requireAdminAuth, (req, res) => {
  res.json(threatEngine.getIRLog());
});

app.delete('/api/incident-response/log', requireAdminAuth, (req, res) => {
  clearIRLog();
  io.emit('ir-log-cleared', { time: cairoNow() });
  res.json({ success: true, message: 'Incident response log cleared. Bans and quarantines are untouched.' });
});

app.get('/api/incident-response/banned-entities', requireAdminAuth, (req, res) => {
  const blocked = getBlockedIPs().map(b => ({
    time:     b.blockedAt || new Date().toISOString(),
    banTime:  b.blockedAt || null,
    action:   'BLOCK_IP',
    target:   b.ip,
    reason:   b.reason || 'auto',
    severity: (b.score >= 100 ? 'CRITICAL' : b.score >= 70 ? 'HIGH' : 'MEDIUM'),
    score:    b.score,
    hits:     b.hits
  }));
  const quarantined = threatEngine.getQuarantinedAccounts().map(a => ({
    time:     a.quarantinedAt || new Date().toISOString(),
    banTime:  a.quarantinedAt || null,
    action:   'QUARANTINE_ACCOUNT',
    target:   a.id,
    reason:   a.reason || 'manual',
    severity: a.severity || 'HIGH',
    score:    null,
    hits:     null
  }));
  const all = [...blocked, ...quarantined].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
  res.json(all);
});

// ── Data privacy rules ────────────────────────────────────────────────────────
let privacyRules = {
  maskPatientName:     true,
  maskNationalId:      true,
  maskMRN:             true,
  maskDiagnosis:       true,
  maskDOB:             false,
  maskPhone:           true,
  encryptionAtRest:    true,
  encryptionInTransit: true,
  fieldLevelEncryption: false,
  auditLogSigning:     true,
  keyRotationDays:     90,
  bulkExportAlert:     true,
  unusualAccessAlert:  true,
  crossDeptAlert:      false,
  screenshotBlock:     false,
  updatedAt:           null
};

app.get('/api/data-privacy/rules', requireAdminAuth, (req, res) => {
  res.json(privacyRules);
});

app.post('/api/data-privacy/rules', requireAdminAuth, (req, res) => {
  const allowed = Object.keys(privacyRules).filter(k => k !== 'updatedAt');
  allowed.forEach(key => {
    if (req.body && req.body[key] !== undefined) {
      privacyRules[key] = typeof privacyRules[key] === 'boolean'
        ? Boolean(req.body[key])
        : (typeof privacyRules[key] === 'number' ? Number(req.body[key]) : req.body[key]);
    }
  });
  privacyRules.updatedAt = cairoNow();
  io.emit('privacy-rules-updated', { rules: privacyRules, time: privacyRules.updatedAt });
  res.json({ success: true, rules: privacyRules });
});

app.post('/api/data-privacy/rotate-keys', requireAdminAuth, (req, res) => {
  const rotationId = `KR-${Date.now()}`;
  const entry = {
    type: 'KEY_ROTATION', action: 'ROTATED', time: cairoNow(),
    path: '/api/data-privacy/rotate-keys', method: 'POST',
    payload:  `Encryption key rotation initiated — ${rotationId}`,
    analysis: { type: 'KEY_ROTATION', risk: 'INFO', target: 'Encryption keys', technique: 'Manual key rotation' }
  };
  loggerWithIso(entry);
  io.emit('key-rotation', { rotationId, time: cairoNow() });
  res.json({ success: true, rotationId, message: 'Key rotation initiated. Reload secrets from KMS.' });
});

// ── IAM impersonation audit ───────────────────────────────────────────────────
app.post('/api/iam/impersonate', requireAdminAuth, (req, res) => {
  const targetRole = String(req.body?.role    || 'Unknown').slice(0, 40);
  const adminId    = String(req.body?.adminId || 'SOC-ADMIN').slice(0, 60);
  const sessionId  = `IAM-${Date.now()}`;
  const entry = {
    type: 'IAM_IMPERSONATE', action: 'IMPERSONATE', time: cairoNow(),
    path: '/api/iam/impersonate', method: 'POST',
    payload:  `Admin ${adminId} initiated impersonation as role: ${targetRole} — Session: ${sessionId}`,
    analysis: { type: 'IAM_IMPERSONATE', risk: 'INFO', target: `Role: ${targetRole}`, technique: 'Admin impersonation test' }
  };
  loggerWithIso(entry);
  io.emit('iam-impersonate', { adminId, targetRole, sessionId, time: cairoNow() });
  res.json({ success: true, sessionId, role: targetRole, message: `Impersonation session started as ${targetRole}` });
});

// ── Audit log integrity ───────────────────────────────────────────────────────
app.get('/api/audit/verify', requireAdminAuth, (req, res) => {
  const logs = readLogs();
  let valid = 0, tampered = 0, unsigned = 0;
  logs.forEach(entry => {
    const result = logger.verifyEntry(entry);
    if (result === 'VALID') valid++;
    else if (result === 'TAMPERED') tampered++;
    else unsigned++;
  });
  res.json({ total: logs.length, valid, tampered, unsigned, integrity: tampered === 0 ? 'CLEAN' : 'COMPROMISED' });
});

// ── Snapshots ─────────────────────────────────────────────────────────────────
let panicSnapshot     = null;
const MAX_SNAPSHOTS   = 10;

wafMiddleware.setOnPanicAuto(function(health) {
  panicState.set(true);
  console.warn('[WAF] Auto-shutdown triggered at health:', health + '%');
  const snapshot = makeSnapshot('AUTO-SHUTDOWN');
  io.emit('panic-mode', {
    active: true, auto: true, shutdown: true,
    health, threshold: SHUTDOWN_HEALTH_THRESHOLD, snapshot, time: cairoNow()
  });
});

function makeSnapshot(label) {
  try {
    if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });
    const logs      = readLogs();
    const stamp     = new Date().toISOString().replace(/[:.]/g, '-');
    const safeLabel = String(label || 'SNAPSHOT').replace(/[^A-Z0-9_-]/gi, '_');
    const snapPath  = path.join(SNAP_DIR, `${safeLabel}-${stamp}.json`);
    fs.writeFileSync(snapPath, JSON.stringify({ timestamp: cairoNow(), label: safeLabel, logs }, null, 2), 'utf8');
    panicSnapshot = snapPath;
    // Prune oldest snapshots beyond MAX_SNAPSHOTS
    try {
      const files = fs.readdirSync(SNAP_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => ({ f, t: fs.statSync(path.join(SNAP_DIR, f)).mtimeMs }))
        .sort((a, b) => b.t - a.t);
      files.slice(MAX_SNAPSHOTS).forEach(({ f }) => {
        try { fs.unlinkSync(path.join(SNAP_DIR, f)); } catch {}
      });
    } catch {}
    return { filename: path.basename(snapPath), count: logs.length };
  } catch (err) {
    console.error('[Snapshot] Failed:', err.message);
    return null;
  }
}

app.post('/api/snapshot', requireAdminAuth, (req, res) => {
  const label  = String(req.body?.label || 'MANUAL').slice(0, 40);
  const result = makeSnapshot(label);
  if (!result) return res.status(500).json({ error: 'Snapshot failed' });
  res.json({ success: true, ...result });
});

app.get('/api/snapshot', requireAdminAuth, (req, res) => {
  try {
    if (!fs.existsSync(SNAP_DIR)) return res.json({ snapshots: [] });
    const files = fs.readdirSync(SNAP_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const stat = fs.statSync(path.join(SNAP_DIR, f));
        return { filename: f, createdAt: stat.mtime.toISOString(), sizeBytes: stat.size };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ snapshots: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Alert Notifications (Email + SMS) ─────────────────────────────────────────
const nodemailer = (() => { try { return require('nodemailer'); } catch { return null; } })();
const twilioLib  = (() => { try { return require('twilio'); } catch { return null; } })();

function buildEmailHtml(attack, subject) {
  const score    = Number(attack?.score || 0);
  const scoreColor = score >= 100 ? '#ff2d55' : score >= 70 ? '#ffc107' : '#00ff94';
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#020c1b;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:24px auto;">
<tr><td style="background:linear-gradient(135deg,#031422,#020c1c);border:1px solid rgba(0,229,255,0.2);border-radius:12px;padding:28px;">
  <div style="border-bottom:2px solid #00e5ff;padding-bottom:14px;margin-bottom:18px;">
    <span style="font-size:18px;font-weight:700;color:#00e5ff;letter-spacing:3px;">⚡ TABIBI SOC ALERT</span>
  </div>
  <table width="100%" cellpadding="6">
    <tr><td style="color:#6a9bbf;font-size:12px;width:120px;">ALERT TYPE</td><td style="color:#fff;font-weight:700;">${attack?.type||'Unknown'}</td></tr>
    <tr><td style="color:#6a9bbf;font-size:12px;">THREAT SCORE</td><td style="color:${scoreColor};font-weight:700;font-size:16px;">${score}</td></tr>
    <tr><td style="color:#6a9bbf;font-size:12px;">SOURCE IP</td><td style="color:#cce8ff;font-family:monospace;">${attack?.ip||'unknown'}</td></tr>
    <tr><td style="color:#6a9bbf;font-size:12px;">PATH</td><td style="color:#cce8ff;font-family:monospace;">${attack?.path||'/'}</td></tr>
    <tr><td style="color:#6a9bbf;font-size:12px;">ACTION</td><td style="color:${attack?.action==='BLOCKED'?'#ff2d55':'#ffc107'};font-weight:700;">${attack?.action||'LOGGED'}</td></tr>
    <tr><td style="color:#6a9bbf;font-size:12px;">TIME</td><td style="color:#cce8ff;">${attack?.ts||new Date().toISOString()}</td></tr>
    <tr><td style="color:#6a9bbf;font-size:12px;">PAYLOAD</td><td style="color:#3d5a7a;font-family:monospace;font-size:11px;">${String(attack?.payload||'—').slice(0,200)}</td></tr>
  </table>
  <div style="margin-top:18px;padding:10px;background:rgba(255,45,85,0.08);border-radius:6px;border-left:3px solid #ff2d55;">
    <span style="color:#ff2d55;font-size:11px;">This is an automated security alert from TABIBI Security Operations Center. Do not reply to this email.</span>
  </div>
</td></tr></table></body></html>`;
}

app.post('/api/alerts/test-email', requireAdminAuth, async (req, res) => {
  const { smtp, recipients } = req.body || {};
  if (!smtp?.host || !smtp?.user || !smtp?.pass) return res.status(400).json({ error: 'SMTP host, user and password required' });
  if (!Array.isArray(recipients) || recipients.length === 0) return res.status(400).json({ error: 'At least one recipient required' });
  if (!nodemailer) return res.status(500).json({ error: 'nodemailer not installed. Run: npm install nodemailer' });
  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host, port: Number(smtp.port || 587),
      secure: Number(smtp.port) === 465,
      auth: { user: smtp.user, pass: smtp.pass }
    });
    await transporter.verify();
    for (const to of recipients) {
      await transporter.sendMail({
        from: `"TABIBI SOC" <${smtp.user}>`, to,
        subject: '[TABIBI SOC] Test Alert — System Online',
        text: 'TABIBI Security Operations Center — Test alert. Your email notification channel is correctly configured.',
        html: buildEmailHtml({ type:'TEST', score:0, ip:'127.0.0.1', path:'/test', action:'TEST', ts:new Date().toISOString(), payload:'Test notification' }, 'Test Alert')
      });
    }
    res.json({ success: true, sent: recipients.length });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/alerts/send-email', requireAdminAuth, async (req, res) => {
  const { smtp, to, subject, body, attack } = req.body || {};
  if (!smtp?.host || !smtp?.user || !smtp?.pass) return res.status(400).json({ error: 'SMTP config required' });
  if (!to) return res.status(400).json({ error: 'Recipient required' });
  if (!nodemailer) return res.status(500).json({ error: 'nodemailer not installed. Run: npm install nodemailer' });
  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host, port: Number(smtp.port || 587),
      secure: Number(smtp.port) === 465,
      auth: { user: smtp.user, pass: smtp.pass }
    });
    await transporter.sendMail({
      from: `"TABIBI SOC" <${smtp.user}>`, to,
      subject: subject || '[TABIBI SOC] Security Alert',
      text: body || 'Security alert from TABIBI SOC',
      html: buildEmailHtml(attack, subject)
    });
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/alerts/test-sms', requireAdminAuth, async (req, res) => {
  const { twilio, recipients } = req.body || {};
  if (!twilio?.sid || !twilio?.token || !twilio?.from) return res.status(400).json({ error: 'Twilio SID, token and from number required' });
  if (!Array.isArray(recipients) || recipients.length === 0) return res.status(400).json({ error: 'At least one phone number required' });
  if (!twilioLib) return res.status(500).json({ error: 'twilio not installed. Run: npm install twilio' });
  try {
    const client = twilioLib(twilio.sid, twilio.token);
    const results = [];
    for (const to of recipients) {
      const msg = await client.messages.create({
        body: '[TABIBI SOC] Test SMS — Your alert channel is active and operational.',
        from: twilio.from, to
      });
      results.push({ to, sid: msg.sid });
    }
    res.json({ success: true, results });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/alerts/send-sms', requireAdminAuth, async (req, res) => {
  const { twilio, to, body } = req.body || {};
  if (!twilio?.sid || !twilio?.token || !twilio?.from) return res.status(400).json({ error: 'Twilio config required' });
  if (!to) return res.status(400).json({ error: 'Recipient required' });
  if (!twilioLib) return res.status(500).json({ error: 'twilio not installed. Run: npm install twilio' });
  try {
    const client = twilioLib(twilio.sid, twilio.token);
    const msg = await client.messages.create({ body: String(body).slice(0, 1600), from: twilio.from, to });
    res.json({ success: true, sid: msg.sid });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ── Webhook ───────────────────────────────────────────────────────────────────
const ALLOWED_WEBHOOK_HOSTS = (process.env.ALLOWED_WEBHOOK_HOSTS || '')
  .split(',').map(host => host.trim()).filter(Boolean);

function isWebhookAllowed(raw) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    if (ALLOWED_WEBHOOK_HOSTS.length) {
      return ALLOWED_WEBHOOK_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
    }
    if (/^(localhost|127\.|10\.|192\.168\.|0\.0\.0\.0)/i.test(url.hostname)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)) return false;
    return true;
  } catch { return false; }
}

app.post('/api/webhook', requireAdminAuth, (req, res) => {
  const url = req.body?.url;
  if (!url) return res.status(400).json({ error: 'URL required' });
  if (!isWebhookAllowed(url)) {
    return res.status(400).json({ error: 'Webhook URL not allowed. Must be HTTPS and not an internal address.' });
  }
  wafMiddleware.setWebhook(url);
  res.json({ success: true, message: 'Webhook set' });
});

app.post('/api/webhook/test', requireAdminAuth, (req, res) => {
  const url = req.body?.url;
  if (!url) return res.status(400).json({ error: 'URL required' });
  if (!isWebhookAllowed(url)) {
    return res.status(400).json({ error: 'Webhook URL not allowed.' });
  }
  try {
    wafMiddleware.setWebhook(url);
    const body = JSON.stringify({ embeds: [{ title: 'TABIBI SOC — Webhook Test', description: 'Connection verified', color: 65280, timestamp: new Date().toISOString() }] });
    const urlObj = new URL(url);
    const mod    = urlObj.protocol === 'https:' ? https : http;
    const wreq   = mod.request({
      hostname: urlObj.hostname, port: urlObj.port || undefined,
      path: urlObj.pathname + urlObj.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (wres) => {
      res.json({ success: true, status: wres.statusCode, message: 'Test payload sent' });
    });
    wreq.on('error', (err) => res.status(502).json({ error: 'Webhook delivery failed: ' + err.message }));
    wreq.write(body);
    wreq.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Panic mode ────────────────────────────────────────────────────────────────
app.post('/api/panic', requireAdminAuth, (req, res) => {
  panicState.set(true);
  wafMiddleware.setPanicMode(true);
  const snapshot = makeSnapshot('PANIC');
  io.emit('panic-mode', { active: true, time: cairoNow(), snapshot });
  res.json({ success: true, snapshot });
});

app.get('/api/panic-status', requireAdminAuth, (req, res) => {
  res.json({
    panicMode: panicState.get(),
    snapshot:  panicSnapshot ? path.basename(panicSnapshot) : null
  });
});

app.post('/api/recover', (req, res) => {
  const ip  = getClientIP(req);
  const now = Date.now();
  if (!recoverAttempts[ip] || now - recoverAttempts[ip].windowStart > 300000) {
    recoverAttempts[ip] = { count: 0, windowStart: now };
  }
  recoverAttempts[ip].count += 1;
  if (recoverAttempts[ip].count > 3) {
    return res.status(429).json({ error: 'Too many recovery attempts. Try in 5 minutes.' });
  }
  if (!req.body || req.body.password !== RECOVERY_PASSWORD) {
    return res.status(401).json({ error: 'Invalid recovery password' });
  }
  recoverAttempts[ip] = { count: 0, windowStart: now };
  panicState.set(false);
  wafMiddleware.setPanicMode(false);
  io.emit('panic-mode',        { active: false, time: cairoNow() });
  io.emit('lockdown-released', { time: cairoNow() });
  broadcastHealth();
  res.json({ success: true });
});

// ── PHI audit ─────────────────────────────────────────────────────────────────
app.get('/api/phi/audit', requireAdminAuth, (req, res) => {
  const limit = Math.min(Number(req.query.limit || 200), 2000);
  res.json(phiAudit.getRecentAccess(limit));
});

app.get('/api/phi/audit/verify', requireAdminAuth, (req, res) => {
  res.json(phiAudit.verifyLog());
});

app.get('/api/phi/audit/stats', requireAdminAuth, (req, res) => {
  const { userId, patientId, since } = req.query;
  res.json(phiAudit.getAccessStats({ userId, patientId, since }));
});

app.post('/api/phi/audit/log', requireAdminAuth, (req, res) => {
  const { userId, patientId, fields, reason, action, meta } = req.body || {};
  const validFields  = Object.keys(phiAudit.PHI_FIELD_TAGS);
  const cleanFields  = Array.isArray(fields) ? fields.filter(f => validFields.includes(f)) : [];
  phiAudit.logAccess({
    userId:    String(userId    || req.headers['x-soc-token'] || 'admin').slice(0, 80),
    patientId: String(patientId || 'N/A').slice(0, 80),
    fields:    cleanFields,
    reason:    String(reason || 'manual-admin').slice(0, 120),
    ip:        getClientIP(req),
    action:    action || 'READ',
    meta:      meta || {}
  });
  res.json({ success: true });
});

// ── SIEM ──────────────────────────────────────────────────────────────────────
app.get('/api/siem/stream',        requireAdminAuth, siemExport.sseHandler());
app.get('/api/siem/events',        requireAdminAuth, siemExport.restHandler(logger));
app.get('/api/siem/correlations',  requireAdminAuth, (req, res) => {
  res.json(siemExport.getCorrelations(Number(req.query.limit || 50)));
});

// ── File scan ─────────────────────────────────────────────────────────────────
app.post('/api/upload/scan', requireAdminAuth, (req, res) => {
  const { base64Data, filename, mimeType } = req.body || {};
  if (!base64Data) return res.status(400).json({ error: 'base64Data required' });
  try {
    const buffer = Buffer.from(base64Data, 'base64');
    const result = fileScan.scan(buffer, filename || 'upload', mimeType || '');
    if (!result.safe) {
      const entry = {
        ip: getClientIP(req), type: 'MALICIOUS_UPLOAD', score: 80,
        action: 'BLOCKED', time: cairoNow(),
        path:     '/api/upload/scan', method: 'POST',
        payload:  `Malicious file rejected: ${result.reason} [${filename}] sha256=${result.sha256 || 'n/a'}`,
        analysis: { type: 'MALICIOUS_UPLOAD', risk: 'HIGH', target: 'File upload', technique: result.threats.join(', ') }
      };
      loggerWithIso(entry);
      io.emit('attack', entry);
      return res.status(400).json({ safe: false, reason: result.reason, threats: result.threats, sha256: result.sha256 });
    }
    if (result.threats && result.threats.length) {
      logger({
        ip: getClientIP(req), type: 'UPLOAD_WARNING', score: 0,
        action: 'ALLOWED', time: cairoNow(),
        path:     '/api/upload/scan', method: 'POST',
        payload:  `File accepted with warnings: ${result.threats.join(', ')} [${filename}] sha256=${result.sha256 || 'n/a'}`,
        analysis: { type: 'UPLOAD_WARNING', risk: 'LOW', target: 'File upload', technique: result.threats.join(', ') }
      });
    }
    res.json({
      safe:      true,
      mime:      result.mime,
      safeName:  result.safeName,
      sizeBytes: result.sizeBytes,
      scanMs:    result.scanMs,
      sha256:    result.sha256,
      threats:   result.threats || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Geo-velocity ──────────────────────────────────────────────────────────────
app.post('/api/geo/check', requireAdminAuth, async (req, res) => {
  const { userId, ip } = req.body || {};
  if (!userId || !ip) return res.status(400).json({ error: 'userId and ip required' });
  try {
    const result = await geoVelocity.check(String(userId).slice(0, 80), String(ip).slice(0, 45));
    if (result.impossible) {
      const entry = {
        ip, type: 'IMPOSSIBLE_TRAVEL', score: 95,
        action: 'ALERT', time: cairoNow(),
        path:     '/api/geo/check', method: 'POST',
        payload:  result.reason,
        analysis: { type: 'IMPOSSIBLE_TRAVEL', risk: 'CRITICAL', target: `User ${userId}`, technique: result.reason }
      };
      loggerWithIso(entry);
      io.emit('attack',             entry);
      io.emit('impossible-travel',  { userId, ...result });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/geo/location/:userId', requireAdminAuth, (req, res) => {
  const loc = geoVelocity.getLastLocation(req.params.userId);
  res.json(loc || { error: 'No location on record' });
});

// ── Appointment guard ─────────────────────────────────────────────────────────
app.post('/api/appointments/check', requireAdminAuth, (req, res) => {
  const { userId, doctorId, ip } = req.body || {};
  if (!userId || !doctorId) return res.status(400).json({ error: 'userId and doctorId required' });
  const result = appointmentGuard.checkBooking({
    userId:   String(userId).slice(0, 80),
    doctorId: String(doctorId).slice(0, 80),
    ip:       ip || getClientIP(req)
  });
  if (result.blocked) {
    const entry = {
      ip: ip || getClientIP(req), type: 'APPOINTMENT_ABUSE', score: result.score,
      action: 'BLOCKED', time: cairoNow(),
      path:     '/api/appointments/check', method: 'POST',
      payload:  result.reason,
      analysis: { type: result.threat || 'APPOINTMENT_ABUSE', risk: 'HIGH', target: `Doctor ${doctorId}`, technique: result.reason }
    };
    loggerWithIso(entry);
    io.emit('attack', entry);
  }
  res.json(result);
});

app.post('/api/appointments/record', requireAdminAuth, (req, res) => {
  const { bookingId, userId, doctorId, ip } = req.body || {};
  if (!bookingId || !userId || !doctorId) return res.status(400).json({ error: 'bookingId, userId, doctorId required' });
  appointmentGuard.recordBooking({ bookingId, userId, doctorId, ip: ip || getClientIP(req) });
  res.json({ success: true });
});

app.post('/api/appointments/paid', requireAdminAuth, (req, res) => {
  const { bookingId } = req.body || {};
  if (!bookingId) return res.status(400).json({ error: 'bookingId required' });
  res.json(appointmentGuard.recordPayment(bookingId));
});

app.post('/api/appointments/cancel', requireAdminAuth, (req, res) => {
  const { bookingId } = req.body || {};
  if (!bookingId) return res.status(400).json({ error: 'bookingId required' });
  const result = appointmentGuard.checkCancellation(bookingId);
  if (result.suspicious) {
    const entry = {
      ip: getClientIP(req), type: 'RAPID_CANCEL', score: 40,
      action: 'FLAGGED', time: cairoNow(),
      path:     '/api/appointments/cancel', method: 'POST',
      payload:  result.reason,
      analysis: { type: 'RAPID_CANCEL', risk: 'MEDIUM', target: `Booking ${bookingId}`, technique: result.reason }
    };
    loggerWithIso(entry);
    io.emit('attack', entry);
  }
  res.json(result);
});

app.get('/api/appointments/expired', requireAdminAuth, (req, res) => {
  res.json(appointmentGuard.getExpiredUnpaidBookings());
});

app.get('/api/appointments/guard-stats', requireAdminAuth, (req, res) => {
  const { userId, doctorId } = req.query;
  res.json(appointmentGuard.getStats({ userId, doctorId }));
});

// ── Rating guard ──────────────────────────────────────────────────────────────
app.post('/api/ratings/check', requireAdminAuth, (req, res) => {
  const { userId, doctorId, rating, ip, hasAppointment } = req.body || {};
  if (!userId || !doctorId) return res.status(400).json({ error: 'userId and doctorId required' });
  const result = ratingGuard.checkRating({
    userId:         String(userId).slice(0, 80),
    doctorId:       String(doctorId).slice(0, 80),
    rating:         Number(rating || 3),
    ip:             ip || getClientIP(req),
    hasAppointment: Boolean(hasAppointment)
  });
  if (result.blocked || result.suspicious) {
    const ratingAction = result.blocked ? 'BLOCKED' : 'FLAGGED';
    const ratingRisk   = result.blocked ? 'HIGH'    : 'MEDIUM';
    const entry = {
      ip: ip || getClientIP(req), type: 'RATING_MANIPULATION', score: result.score,
      action: ratingAction, time: cairoNow(), isoTime: new Date().toISOString(),
      path:     '/api/ratings/check', method: 'POST',
      payload:  result.reason,
      analysis: { type: 'RATING_MANIPULATION', risk: ratingRisk, target: `Doctor ${doctorId}`, technique: result.reason }
    };
    loggerWithIso(entry);
    if (result.blocked) io.emit('attack', entry);
  }
  res.json(result);
});

app.post('/api/ratings/record', requireAdminAuth, (req, res) => {
  const { userId, doctorId, ip } = req.body || {};
  if (!userId || !doctorId) return res.status(400).json({ error: 'userId and doctorId required' });
  ratingGuard.recordRating({ userId, doctorId, ip: ip || getClientIP(req) });
  res.json({ success: true });
});

app.get('/api/ratings/stats/:doctorId', requireAdminAuth, (req, res) => {
  res.json(ratingGuard.getDoctorStats(req.params.doctorId));
});

// ── Socket.IO connections ─────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('[SOC] Socket connected:', socket.id);
  // Rehydrate blocked-list and current health on fresh connect
  const blockedIPs = getBlockedIPs();
  const health     = computeHealth();
  socket.emit('blocked-list',   blockedIPs);
  socket.emit('panic-mode',     { active: panicState.get() });
  socket.emit('health-update',  health);
  socket.emit('security-state', { health, blocked: blockedIPs, threats: getAllThreats() });

  // Send the last 50 recent attack logs so the dashboard feed populates immediately
  // without waiting for the 3s poll cycle
  try {
    const recentLogs = readLogs().slice(-50);
    recentLogs.forEach(function(entry) {
      if (!entry.isoTime) entry.isoTime = new Date(entry.time || Date.now()).toISOString();
    });
    if (recentLogs.length > 0) socket.emit('recent-attacks', recentLogs);
  } catch(_) {}
});

// Periodic health broadcast every 30 seconds
setInterval(broadcastHealth, 30000).unref?.();

// ── 404 / error handlers ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

app.use((err, req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production';
  console.error('[Server Error]', isProd ? err.message : err.stack || err.message);
  if (res.headersSent) return next(err);
  return res.status(err.status || 500).json({
    error: isProd ? 'An error occurred' : err.message
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════════════╗`);
  console.log(`║  TABIBI Security Layer v${pkg.version}               ║`);
  console.log(`╠══════════════════════════════════════════════╣`);
  console.log(`║  Dashboard → http://localhost:${PORT}          ║`);
  console.log(`║  Auth: ${AUTH_REQUIRED ? 'REQUIRED              ' : 'disabled (dev)    '}             ║`);
  console.log(`║  Alarm: <${ALARM_HEALTH_THRESHOLD}% | Shutdown: <${SHUTDOWN_HEALTH_THRESHOLD}%          ║`);
  console.log(`╚══════════════════════════════════════════════╝\n`);
});