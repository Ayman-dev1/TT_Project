'use strict';

const crypto = require('crypto');
const https  = require('https');
const logger = require('./logger');
const { addThreat, getThreatScore, isBlocked, blockIP, getBlockedIPs, cleanIP } = require('./threatEngine');
const { cairoNow } = require('./timeUtils');
const { computeHealthFromLogs } = require('./healthUtils');
const panicState = require('./panicState');

// ─── In-memory rate-limit state ───────────────────────────────────────────────
const bruteTracker       = Object.create(null); // { ip: { count, windowStart } }
const tempBans           = Object.create(null); // { ip: expiresAtMs }
const endpointTracker    = Object.create(null); // { 'ip:path': { count, windowStart } }
const fingerprintHist    = Object.create(null); // { fp: [{ ip, time }] }
const blockedLogThrottle = Object.create(null); // { ip: lastLoggedMs }

// ─── Tunable thresholds (all overridable via .env) ───────────────────────────
const BRUTE_WINDOW_MS           = Number(process.env.SOC_BRUTE_WINDOW_MS   || 60000);
const BRUTE_LIMIT               = Number(process.env.SOC_BRUTE_LIMIT        || 6);
const LOGIN_BRUTE_LIMIT         = Number(process.env.SOC_LOGIN_BRUTE_LIMIT  || 3);
const ENDPOINT_WINDOW           = Number(process.env.SOC_ENDPOINT_WINDOW_MS || 60000);
const ENDPOINT_LIMIT            = Number(process.env.SOC_ENDPOINT_LIMIT     || 60);
const TEMPBAN_DURATION          = Number(process.env.SOC_TEMPBAN_MS         || 10 * 60 * 1000);
const ALARM_HEALTH_THRESHOLD    = Number(process.env.SOC_ALARM_HEALTH       || 50);
const SHUTDOWN_HEALTH_THRESHOLD = Number(process.env.SOC_SHUTDOWN_HEALTH    || 40);

// ─── Global state shared with server.js ──────────────────────────────────────
let webhookUrl  = process.env.SOC_WEBHOOK_URL || null;
let onPanicAuto = null;

function setPanicMode(value)    { panicState.set(value); }
function isPanicMode()          { return panicState.get(); }
function setWebhook(url)        { webhookUrl = url || null; }
function setOnPanicAuto(cb)     { onPanicAuto = cb; }

// ─── Route classification ─────────────────────────────────────────────────────
const STATIC_EXT    = /\.(ico|png|jpg|jpeg|gif|svg|css|js|woff2?|ttf|eot|map|webp|json)$/i;
const SKIP_PREFIXES = ['/socket.io'];

const DASHBOARD_PREFIXES = [
  '/api/geo/', '/api/ratings/stats/',
  '/api/siem/', '/api/incident-response/', '/api/iam/', '/api/data-privacy/',
];

const DASHBOARD_APIS = new Set([
  '/api/test', '/api/logs', '/api/blocked-ips', '/api/threats', '/api/fingerprints',
  '/api/security-state', '/api/block-ip', '/api/unblock-ip', '/api/snapshot',
  '/api/webhook', '/api/webhook/test', '/api/panic', '/api/panic-status',
  '/api/recover', '/api/login', '/api/metrics',
  '/api/upload/scan', '/api/geo/check',
  '/api/ratings/check', '/api/ratings/record',
  '/api/incident-response/banned-entities',
  '/api/audit/verify',
  '/api/activity-logs',
]);

function isDashboardRoute(p) {
  if (DASHBOARD_APIS.has(p)) return true;
  return DASHBOARD_PREFIXES.some(prefix => p.startsWith(prefix));
}

// Routes allowed even during full panic/lockdown mode
const PANIC_EXEMPT = new Set(['/', '/index.html', '/api/login', '/api/recover']);

// ─── Temp-ban helpers ─────────────────────────────────────────────────────────
function isTempBanned(ip) {
  if (!tempBans[ip]) return false;
  if (Date.now() > tempBans[ip]) { delete tempBans[ip]; return false; }
  return true;
}
function tempBan(ip) { tempBans[ip] = Date.now() + TEMPBAN_DURATION; }

// ─── Browser fingerprinting ───────────────────────────────────────────────────
/**
 * Creates a lightweight browser fingerprint from request headers.
 * Used for VPN-rotation detection (same fingerprint, many IPs).
 * @param {object} req
 * @returns {string} MD5 hex of the header combination
 */
function getFingerprint(req) {
  const raw = [
    req.headers['user-agent']      || '',
    req.headers['accept-language'] || '',
    req.headers.accept             || '',
    req.headers['accept-encoding'] || ''
  ].join('|');
  return crypto.createHash('md5').update(raw).digest('hex');
}

function trackFingerprint(fp, ip) {
  if (!fingerprintHist[fp]) fingerprintHist[fp] = [];
  fingerprintHist[fp].push({ ip, time: Date.now() });
  if (fingerprintHist[fp].length > 100) fingerprintHist[fp] = fingerprintHist[fp].slice(-100);
  return [...new Set(fingerprintHist[fp].map(e => e.ip))];
}

// Sensitive authentication / critical endpoints subject to brute-force protection
const SENSITIVE_ENDPOINTS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/login',
  '/api/recover',
  '/api/admin/login'
]);

// ─── Brute-force detection ────────────────────────────────────────────────────
function checkBruteForce(ip, p, method) {
  if (STATIC_EXT.test(p)) return false;
  if (SKIP_PREFIXES.some(s => p.startsWith(s))) return false;
  
  const isSensitive = SENSITIVE_ENDPOINTS.has(p);
  if (!isSensitive) return false; // Only enforce brute force limits on authentication/recovery endpoints
  
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  
  const limit = LOGIN_BRUTE_LIMIT;
  const now   = Date.now();
  const t     = bruteTracker[ip];
  if (!t || now - t.windowStart > BRUTE_WINDOW_MS) {
    bruteTracker[ip] = { count: 1, windowStart: now };
    return false;
  }
  t.count += 1;
  return t.count > limit;
}

// ─── Per-endpoint rate limiting ───────────────────────────────────────────────
function checkEndpointRate(ip, p) {
  if (STATIC_EXT.test(p)) return false;
  if (!p.startsWith('/api/')) return false;
  if (isDashboardRoute(p)) return false;
  const key = `${ip}:${p}`;
  const now = Date.now();
  const t   = endpointTracker[key];
  if (!t || now - t.windowStart > ENDPOINT_WINDOW) {
    endpointTracker[key] = { count: 1, windowStart: now };
    return false;
  }
  t.count += 1;
  return t.count > ENDPOINT_LIMIT;
}

// ─── Health broadcast ─────────────────────────────────────────────────────────
function emitSecurityState(io) {
  try {
    logger.flushSync?.();
    const logs     = logger.readLogsSync ? logger.readLogsSync() : [];
    const total    = Array.isArray(logs) ? logs.length : 0;
    const blocked  = getBlockedIPs();
    const critical = Array.isArray(logs) ? logs.filter(item => Number(item.score || 0) >= 100).length : 0;
    const health   = computeHealthFromLogs(Array.isArray(logs) ? logs : []);
    io.emit('health-update', {
      total, blocked: blocked.length, critical, health,
      patientDataSafety: health,
      alarmThreshold:   ALARM_HEALTH_THRESHOLD,
      shutdownThreshold: SHUTDOWN_HEALTH_THRESHOLD,
      time: cairoNow()
    });
    io.emit('blocked-list', blocked);
    if (health <= SHUTDOWN_HEALTH_THRESHOLD && !panicState.get()) {
      if (typeof onPanicAuto === 'function') onPanicAuto(health);
    }
  } catch {}
}

// ─── Discord / webhook alerting ───────────────────────────────────────────────
function sendWebhookAlert(entry) {
  if (!webhookUrl) return;
  try {
    const body = JSON.stringify({
      content: entry.score >= 100 ? '@here CRITICAL - IP AUTO-BANNED' : undefined,
      embeds: [{
        title:  `${entry.type} Attack Detected`,
        color:  entry.score >= 100 ? 16711680 : entry.score >= 60 ? 16744272 : 16776960,
        fields: [
          { name: 'IP',      value: String(entry.ip),              inline: true  },
          { name: 'Score',   value: String(entry.score),           inline: true  },
          { name: 'Path',    value: String(entry.path),            inline: true  },
          { name: 'Payload', value: String(entry.payload || '').slice(0, 200), inline: false }
        ],
        timestamp: new Date().toISOString()
      }]
    });
    const url = new URL(webhookUrl);
    const req = https.request({
      hostname: url.hostname, port: url.port || undefined,
      path: url.pathname + url.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch {}
}

// ─── Attack patterns ──────────────────────────────────────────────────────────
// score = threat severity points added per match
// bodyOnly = skip URL/header scanning (reduces false positives for body-only patterns)
const PATTERNS = {
  CmdInjection:    {
    score: 100,
    pattern: /([;&|`$]\s*(ls|cat|pwd|whoami|id|uname|wget|curl|bash|sh|cmd|powershell|ping|nc|ncat|netcat|python|perl|ruby|php)\b|`[^`]*`|\$\([^)]*\)|\bsystem\s*\(|\bpassthru\s*\(|\bshell_exec\s*\()/i
  },
  SQLi:            {
    score: 100,
    pattern: /(--|DROP\s+TABLE|SELECT\s+.+FROM|UNION\s+SELECT|INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+.+SET|OR\s+1\s*=\s*1|OR\s+'[^']*'\s*=\s*'[^']*'|SLEEP\s*\(|BENCHMARK\s*\(|LOAD_FILE\s*\(|INTO\s+OUTFILE|INFORMATION_SCHEMA|EXEC\s*\(|EXECUTE\s*\(|0x[0-9a-fA-F]+|%27|%2527|'\s*(OR|AND)\s+'?[\w\d])/i
  },
  XXE:             {
    score: 100, bodyOnly: true,
    pattern: /<!ENTITY\s+\S+\s+(SYSTEM|PUBLIC)\s*["']|<!ENTITY\s+%\s+\S+|<!DOCTYPE\s+[^>]*\[|SYSTEM\s+["'][^"']*["']|file:\/\/\/|expect:\/\/|php:\/\/filter|gopher:\/\/|data:text\/xml|&#x25;|%[a-zA-Z][a-zA-Z0-9_]*;\s*<|<!\[CDATA\[[\s\S]{0,200}(file:|http:|ftp:)/i
  },
  SSRF:            {
    score: 100, bodyOnly: true,
    pattern: /(https?:\/\/(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|169\.254\.|localhost|\[?::1\]?)|file:\/\/|dict:\/\/|gopher:\/\/)/i
  },
  PathTraversal:   {
    score: 100,
    pattern: /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e\/|\.\.%2f|%252e%252e|\/etc\/passwd|\/etc\/shadow|\/proc\/self|c:\\windows\\|\.\.%5c)/i
  },
  XSS:             {
    score: 60,
    pattern: /(<script[\s>]|<\/script>|javascript\s*:|vbscript\s*:|on\w+\s*=\s*["']?[^"'\s>]+|<\s*img[^>]+onerror|<\s*svg[^>]+onload|<\s*iframe|alert\s*\(|confirm\s*\(|prompt\s*\(|document\.cookie|eval\s*\(|innerHTML\s*=|%3Cscript)/i
  },
  NoSQLi:          {
    score: 100,
    pattern: /(\$where|\$gt|\$lt|\$ne|\$in|\$nin|\$or|\$and|\$not|\$nor|\$exists|\$regex)\s*[:=]|\{\s*"\$/i
  },
  LDAPInjection:   {
    score: 60,
    pattern: /(\*\)\(|\)\(\||\(\|\(|\*\)\)|\(\&\(|%28%2a%29)/i
  },
  SensitiveFile:   {
    score: 60,
    pattern: /(\.env|\.git\/|\.htaccess|\.htpasswd|web\.config|phpinfo|wp-config|config\.php|credentials|\.pem|\.key|\.bak$|\.sql$)/i
  },
  OpenRedirect:    {
    score: 40,
    pattern: /(redirect|return_url|next|goto|target|dest|redir|redirect_uri|callback)\s*=\s*(https?:\/\/(?!localhost|127\.)[^&\s]+)/i
  },
  PHIExfiltration: {
    score: 80,
    pattern: /(patient_id|national_id|national_no|ssn|mrn|medical_record|dob|date_of_birth|diagnosis_code|icd_?[0-9]|phi|pii|hipaa)\s*=\s*[^&\s]{4,}.*(SELECT|UNION|OR\s+1|%27)/i
  },
  SensitiveAPIAbuse: {
    score: 60,
    pattern: /(\/api\/patient|\/api\/records|\/api\/medical|\/api\/phi|\/api\/prescriptions|\/api\/labs)\/(admin|dump|export|download|bulk|all)\b/i
  },
  PromptInjection: {
    score: 80, bodyOnly: true,
    pattern: /(ignore (previous|all|prior|above)|disregard (instructions|rules|system)|forget (everything|all|your|the)|you are now|new persona|pretend (you are|to be)|act as (if|though|a)?|jailbreak|DAN mode|developer mode|bypass (restrictions|filters|safety)|override (system|instructions|safety)|system prompt|reveal (your|the) (instructions|prompt|system)|what (are|were) your instructions)/i
  },
  PaymentTampering: {
    score: 100, bodyOnly: true,
    pattern: /("amount"\s*:\s*-?\d*\.?\d+e?\d*\s*[,}].*"amount"\s*:|"(amount|price|total|cost|fee)"\s*:\s*-\s*\d|"(amount|price|total)"\s*:\s*0+[,}]|__proto__|constructor\[|prototype\[)/i
  },
};

// ─── Bot honeypot form fields ─────────────────────────────────────────────────
const HONEYPOT_FIELDS = ['_gotcha', 'website', 'phone_number_field', 'fax', 'h_field', 'bot_trap'];

function checkHoneypotFields(body) {
  if (!body || typeof body !== 'object') return false;
  return HONEYPOT_FIELDS.some(f => body[f] !== undefined && body[f] !== '');
}

// ─── Payload analysis ─────────────────────────────────────────────────────────
function analyzePayload(type, payload) {
  const a = { type, risk: 'MEDIUM', target: 'Unknown', technique: 'Unknown' };
  if (type === 'SQLi') {
    a.risk   = 'CRITICAL';
    a.target = /patient|user|medical|record/i.test(payload) ? 'Patient records' : 'Database';
    if (/UNION\s+SELECT/i.test(payload))       a.technique = 'UNION-based extraction';
    else if (/OR\s+1\s*=\s*1/i.test(payload))  a.technique = 'Boolean blind injection';
    else if (/SLEEP|BENCHMARK/i.test(payload)) a.technique = 'Time-based blind injection';
    else if (/DROP\s+TABLE/i.test(payload))    a.technique = 'Destructive DDL injection';
    else                                        a.technique = 'Generic SQL injection';
  } else if (type === 'CmdInjection')      { a.risk = 'CRITICAL'; a.target = 'Server shell'; a.technique = 'OS command execution'; }
  else if (type === 'PathTraversal')       { a.risk = 'HIGH'; a.target = /passwd|shadow/i.test(payload) ? '/etc/passwd' : 'Filesystem'; a.technique = 'Directory traversal'; }
  else if (type === 'SSRF')               { a.risk = 'HIGH'; a.target = 'Internal network'; a.technique = 'Server-Side Request Forgery'; }
  else if (type === 'XSS')               { a.risk = 'MEDIUM'; a.target = 'Browser sessions'; a.technique = /cookie/i.test(payload) ? 'Session hijacking' : 'Reflected XSS'; }
  else if (type === 'XXE')               { a.risk = 'CRITICAL'; a.target = /file:\/\/|\/etc\/|c:\\windows/i.test(payload) ? 'Local filesystem' : 'Internal network/services'; a.technique = /SYSTEM\s*["']/i.test(payload) ? 'External entity injection (SYSTEM)' : /<!ENTITY\s+%/i.test(payload) ? 'XXE via parameter entity (blind)' : 'XML External Entity injection'; }
  else if (type === 'NoSQLi')            { a.risk = 'HIGH'; a.target = 'Auth bypass'; a.technique = 'NoSQL operator injection'; }
  else if (type === 'Brute')             { a.risk = 'MEDIUM'; a.target = 'Unknown endpoints'; a.technique = 'Brute force / scanning'; }
  else if (type === 'RateLimit')         { a.risk = 'LOW'; a.target = 'API availability'; a.technique = 'Endpoint flooding'; }
  else if (type === 'PHIExfiltration')   { a.risk = 'CRITICAL'; a.target = 'Patient Health Information (PHI)'; a.technique = 'SQL injection targeting PHI fields — HIPAA breach risk'; }
  else if (type === 'SensitiveAPIAbuse') { a.risk = 'HIGH'; a.target = 'Medical API endpoints'; a.technique = 'Bulk PHI extraction attempt'; }
  else if (type === 'LDAPInjection')     { a.risk = 'HIGH'; a.target = 'Directory / LDAP auth'; a.technique = 'LDAP operator injection'; }
  else if (type === 'PromptInjection')   { a.risk = 'HIGH'; a.target = 'AI/LLM subsystem'; a.technique = 'Prompt injection / jailbreak attempt'; }
  else if (type === 'PaymentTampering')  { a.risk = 'CRITICAL'; a.target = 'Payment system'; a.technique = 'Amount manipulation or prototype pollution'; }
  return a;
}

// ─── PHI redaction ────────────────────────────────────────────────────────────
// Redacts common PHI patterns before storing payloads in logs
const PHI_REDACT = [
  { re: /\b\d{9,14}\b/g,                                                      mask: '[NATIONAL-ID]' },
  { re: /\b(0?1[0-9]{9})\b/g,                                                 mask: '[EG-PHONE]'    },
  { re: /\+?\d[\d\s\-().]{6,20}\d/g,                                          mask: '[PHONE]'       },
  { re: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,                mask: '[EMAIL]'       },
  { re: /\b(MRN|mrn|patient_id|patientId)\s*[=:]\s*[A-Z0-9\-]{4,20}/gi,      mask: '[MRN]'         },
  { re: /\b(19|20)\d{2}[\-/](0[1-9]|1[0-2])[\-/](0[1-9]|[12]\d|3[01])\b/g,  mask: '[DOB]'         },
];

function redactPHI(text) {
  if (!text || typeof text !== 'string') return text;
  return PHI_REDACT.reduce((t, p) => t.replace(p.re, p.mask), text);
}

// ─── Brute-force state helpers ────────────────────────────────────────────────
function clearBruteState(ip) {
  ip = cleanIP(ip);
  delete bruteTracker[ip];
  delete tempBans[ip];
}

function clearAllBruteState() {
  [bruteTracker, tempBans, endpointTracker, blockedLogThrottle].forEach(obj => {
    Object.keys(obj).forEach(k => delete obj[k]);
  });
}

// ─── Periodic cleanup ─────────────────────────────────────────────────────────
setInterval(() => {
  const now    = Date.now();
  const cutoff = now - 86400000;

  Object.keys(bruteTracker).forEach(ip => {
    if (now - bruteTracker[ip].windowStart > BRUTE_WINDOW_MS * 2) delete bruteTracker[ip];
  });
  Object.keys(endpointTracker).forEach(k => {
    if (now - endpointTracker[k].windowStart > ENDPOINT_WINDOW * 2) delete endpointTracker[k];
  });
  Object.keys(tempBans).forEach(ip => {
    if (now > tempBans[ip]) delete tempBans[ip];
  });
  Object.keys(fingerprintHist).forEach(fp => {
    fingerprintHist[fp] = fingerprintHist[fp].filter(e => e.time > cutoff);
    if (!fingerprintHist[fp].length) delete fingerprintHist[fp];
  });
}, 600000).unref?.();

// ─── Main WAF middleware factory ──────────────────────────────────────────────
/**
 * Returns the WAF Express middleware, bound to the Socket.IO instance.
 *
 * Execution order per request:
 *  1. Skip static files and socket.io paths
 *  2. Enforce Security headers (HSTS in prod, cookie hardening always)
 *  3. Panic/lockdown check
 *  4. Brute-force check
 *  5. Pass-through for SOC dashboard API routes
 *  6. Honeypot form-field check
 *  7. Pattern scanning (WAF rules)
 *  8. Per-endpoint rate limiting
 *  9. Blocked-IP check
 * 10. next() — allow
 *
 * @param {object} io - Socket.IO server instance
 * @returns {Function} Express middleware
 */
module.exports = io => {
  return (req, res, next) => {
    if (SKIP_PREFIXES.some(p => req.path.startsWith(p))) return next();
    if (STATIC_EXT.test(req.path)) return next();

    // HSTS (production only)
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
    }

    // Harden Set-Cookie headers automatically
    const origSetHeader = res.setHeader.bind(res);
    res.setHeader = function(name, value) {
      if (name.toLowerCase() === 'set-cookie') {
        const cookies = Array.isArray(value) ? value : [value];
        value = cookies.map(c => {
          let v = String(c);
          if (!/;\s*HttpOnly/i.test(v))  v += '; HttpOnly';
          if (!/;\s*SameSite/i.test(v))  v += '; SameSite=Strict';
          if (process.env.NODE_ENV === 'production' && !/;\s*Secure/i.test(v)) v += '; Secure';
          return v;
        });
      }
      return origSetHeader(name, value);
    };

    const ip = cleanIP(req.ip);

    // ── Panic / lockdown mode ──────────────────────────────────────────────────
    if (panicState.get() && !PANIC_EXEMPT.has(req.path) && !isDashboardRoute(req.path)) {
      return res.status(503).json({
        error:     'Service Unavailable',
        message:   '503 - System under Emergency Maintenance',
        panicMode: true
      });
    }

    // ── Brute-force detection ─────────────────────────────────────────────────
    if (checkBruteForce(ip, req.path, req.method)) {
      const bScore = addThreat(ip, 60);
      const bCount = (bruteTracker[ip] || {}).count || 0;
      const bEntry = {
        ip, type: 'Brute', score: bScore,
        action:  bScore >= 100 ? 'BLOCKED' : 'RATE-LIMITED',
        time:    cairoNow(),
        isoTime: new Date().toISOString(),
        path:    req.path, method: req.method,
        payload: `${bCount} requests in 60s — brute force`,
        analysis: { type: 'Brute', risk: 'HIGH', target: req.path, technique: 'Brute force' },
        fingerprint: getFingerprint(req),
      };
      if (bScore >= 100) {
        blockIP(ip, 'Brute-auto'); tempBan(ip); clearBruteState(ip);
        io.emit('ip-auto-banned', { ip, reason: 'Brute', score: bScore, time: cairoNow() });
      }
      logger(bEntry);
      io.emit('attack',     bEntry);
      io.emit('new-threat', bEntry);
      emitSecurityState(io);
      sendWebhookAlert(bEntry);
      return res.status(429).json({ message: 'Brute - Too Many Requests' });
    }

    // ── Skip pattern scanning for SOC dashboard routes ────────────────────────
    // /api/login is public-facing (not admin-authed yet) — still scan it for injection attempts.
    if (isDashboardRoute(req.path) && req.path !== '/api/login') return next();

    // Skip pattern scanning for client error logger to avoid false positives on stack traces/URLs
    if (req.path === '/api/log-client-error') {
      if (isTempBanned(ip) || isBlocked(ip) || getThreatScore(ip) >= 100) {
        return res.status(403).json({ message: 'IP BLOCKED - Access Denied' });
      }
      return next();
    }

    // ── Honeypot form-field trap ──────────────────────────────────────────────
    if (checkHoneypotFields(req.body)) {
      const score = addThreat(ip, 100);
      blockIP(ip, 'honeypot');
      const entry = {
        ip, type: 'HONEYPOT', score, action: 'BLOCKED',
        time:    cairoNow(),
        isoTime: new Date().toISOString(),
        path: req.path, method: req.method,
        payload: 'Bot trap - honeypot field filled',
        analysis: { type: 'HONEYPOT', risk: 'HIGH', technique: 'Automated bot', target: 'Form' },
      };
      logger(entry);
      io.emit('attack',         entry);
      io.emit('new-threat',     entry);
      io.emit('ip-auto-banned', { ip, reason: 'HONEYPOT', score, time: cairoNow() });
      emitSecurityState(io);
      return res.status(200).json({ success: true }); // deceive scanner
    }

    // ── Pattern matching ──────────────────────────────────────────────────────
    const fingerprint         = getFingerprint(req);
    const knownIPs            = trackFingerprint(fingerprint, ip);
    const suspiciousFingerprint = knownIPs.length > 3;

    const rawUrl    = req.originalUrl || req.url || req.path;
    let cleanBodyObj = null;
    if (req.body && typeof req.body === 'object') {
      cleanBodyObj = { ...req.body };
      if (cleanBodyObj.fileData) {
        cleanBodyObj.fileData = '[REDACTED_BASE64_DATA]';
      }
      if (cleanBodyObj.image) {
        cleanBodyObj.image = '[REDACTED_BASE64_DATA]';
      }
    }
    const bodyStr   = cleanBodyObj
      ? JSON.stringify(cleanBodyObj)
      : (req.body
          ? (typeof req.body === 'string'
              ? req.body
              : (Object.keys(req.body).length ? JSON.stringify(req.body) : ''))
          : '');
    const queryStr  = req.query  && Object.keys(req.query).length  ? JSON.stringify(req.query)  : '';
    const paramStr  = req.params && Object.keys(req.params).length ? JSON.stringify(req.params) : '';
    const bodyData  = [bodyStr, queryStr, paramStr, rawUrl].filter(Boolean).join(' ');
    const fullData  = `${bodyData} ${req.headers['user-agent'] || ''} ${req.headers['x-forwarded-for'] || ''} ${req.headers.referer || ''}`;
    const displayPayload = [bodyStr, queryStr, paramStr].filter(Boolean).join(' ') || rawUrl;

    const matches = [];
    for (const [type, cfg] of Object.entries(PATTERNS)) {
      const data = cfg.bodyOnly ? bodyData : fullData;
      if (cfg.pattern.test(data)) matches.push({ type, score: cfg.score });
    }

    let detectedType  = null;
    let detectedScore = 0;
    if (matches.length > 0) {
      matches.sort((a, b) => b.score - a.score);
      detectedType  = matches[0].type;
      detectedScore = matches[0].score;
    } else if (checkEndpointRate(ip, req.path)) {
      detectedType  = 'RateLimit';
      detectedScore = 30;
    }

    if (detectedType) {
      const score = addThreat(ip, detectedScore);
      if (score >= 100) {
        blockIP(ip, `${detectedType}-auto`); tempBan(ip); clearBruteState(ip);
        io.emit('ip-auto-banned', { ip, reason: detectedType, score, time: cairoNow() });
      }
      const entry = {
        ip, type: detectedType, score,
        action: score >= 100 ? 'BLOCKED' : (detectedType === 'Brute' || detectedType === 'RateLimit' ? 'RATE-LIMITED' : 'LOGGED'),
        time:    cairoNow(),
        isoTime: new Date().toISOString(),
        path:    req.path, method: req.method,
        payload: redactPHI(displayPayload.slice(0, 200)),
        analysis: {
          ...analyzePayload(detectedType, displayPayload),
          additionalTypes: matches.slice(1).map(m => m.type)
        },
        fingerprint, suspiciousFingerprint, knownIPs
      };
      logger(entry);
      io.emit('attack',     entry);
      io.emit('new-threat', entry);
      emitSecurityState(io);
      sendWebhookAlert(entry);
      if (detectedType === 'Brute' || detectedType === 'RateLimit') {
        return res.status(429).json({ message: `${detectedType} - Too Many Requests` });
      }
      return res.status(403).json({ message: `${detectedType} Attack Blocked` });
    }

    // ── Blocked-IP check ──────────────────────────────────────────────────────
    if (isTempBanned(ip) || isBlocked(ip) || getThreatScore(ip) >= 100) {
      const now = Date.now();
      if (!blockedLogThrottle[ip] || now - blockedLogThrottle[ip] > 60000) {
        blockedLogThrottle[ip] = now;
        const entry = {
          ip, type: 'BLOCKED_IP', score: getThreatScore(ip), action: 'BLOCKED',
          time:    cairoNow(),
          isoTime: new Date().toISOString(),
          path:    req.path, method: req.method,
          payload: 'Blocked IP access attempt',
          analysis: null, fingerprint, suspiciousFingerprint, knownIPs
        };
        logger(entry);
        io.emit('attack',     entry);
        io.emit('new-threat', entry);
        emitSecurityState(io);
      }
      return res.status(403).json({ message: 'IP BLOCKED - Access Denied' });
    }

    return next();
  };
};

// ─── Exported helpers ─────────────────────────────────────────────────────────
module.exports.setPanicMode          = setPanicMode;
module.exports.isPanicMode           = isPanicMode;
module.exports.setWebhook            = setWebhook;
module.exports.setOnPanicAuto        = setOnPanicAuto;
module.exports.getFingerprintHistory = () => fingerprintHist;
module.exports.clearBruteState       = clearBruteState;
module.exports.clearAllBruteState    = clearAllBruteState;
module.exports.DASHBOARD_APIS        = DASHBOARD_APIS;
module.exports.isDashboardRoute      = isDashboardRoute;
module.exports.PATTERNS              = PATTERNS;