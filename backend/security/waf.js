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

const MUST_BLOCK_ATTACKS = new Set([
  'SQLi',
  'XSS',
  'Brute',
  'PathTraversal',
  'CmdInjection',
  'SSRF',
  'XXE',
  'NoSQLi',
  'HONEYPOT',
  'PrototypePollution',
  'PaymentTampering'
]);

const ATTACK_PRIORITY = {
  XXE: 100,
  SQLi: 95,
  NoSQLi: 90,
  CmdInjection: 85,
  SSRF: 80,
  PathTraversal: 75,
  XSS: 70,
  Brute: 65,
  HONEYPOT: 60
};

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
  '/api/siem/', '/api/incident-response/', '/api/iam/',
];

const DASHBOARD_APIS = new Set([
  '/api/test', '/api/logs', '/api/logs/clear', '/api/clear-threats', '/api/blocked-ips', '/api/threats', '/api/fingerprints',
  '/api/security-state', '/api/security-state/clear', '/api/block-ip', '/api/unblock-ip', '/api/snapshot',
  '/api/webhook', '/api/webhook/test', '/api/panic', '/api/panic-status',
  '/api/recover', '/api/login', '/api/metrics',
  '/api/upload/scan',
  '/api/filescan/records', '/api/filescan/stats', '/api/filescan/timeline', '/api/filescan/export',
  '/api/geo-velocity', '/api/geo-velocity/check', '/api/geo-velocity/record', '/api/geo-velocity/events',
  '/api/alerts/config', '/api/alerts/log', '/api/alerts/test-email', '/api/alerts/send-email', '/api/alerts/test-sms', '/api/alerts/send-sms',
  '/api/incident-response/banned-entities',
  '/api/audit/verify',
  '/api/sessions', '/api/sessions/track', '/api/sessions/end',
  '/api/auth/me', '/api/auth/register',
  '/api/doctors', '/api/appointments',
  '/api/recommend-doc', '/api/chatbot/messages', '/api/chats-active-contacts',
  '/api/activity-logs', '/api/log-client-error', '/api/medical-records',
  '/api/security/sessions', '/api/security/sessions/track', '/api/security/sessions/end',
]);

const AUTH_ENDPOINTS = new Set(['/api/login', '/api/signin', '/api/auth/login']);

const TRUSTED_ROLE_ROUTES = {
  patient: [/^\/api\/auth\/me$/, /^\/api\/appointments(?:\/|$)/, /^\/api\/doctors(?:\/|$)/, /^\/api\/medical-records(?:\/|$)/, /^\/api\/recommend-doc$/, /^\/api\/chatbot(?:\/|$)/, /^\/api\/chats(?:\/|$)/, /^\/api\/chats-active-contacts$/, /^\/api\/sessions(?:\/|$)/],
  doctor: [/^\/api\/auth\/me$/, /^\/api\/appointments(?:\/|$)/, /^\/api\/doctors(?:\/|$)/, /^\/api\/medical-records(?:\/|$)/, /^\/api\/recommend-doc$/, /^\/api\/chatbot(?:\/|$)/, /^\/api\/chats(?:\/|$)/, /^\/api\/chats-active-contacts$/, /^\/api\/sessions(?:\/|$)/],
  admin: [/^\/api\/auth\/me$/, /^\/api\/admin(?:\/|$)/, /^\/api\/appointments(?:\/|$)/, /^\/api\/doctors(?:\/|$)/, /^\/api\/medical-records(?:\/|$)/, /^\/api\/activity-logs(?:\/|$)/, /^\/api\/recommend-doc$/, /^\/api\/chatbot(?:\/|$)/, /^\/api\/chats(?:\/|$)/, /^\/api\/chats-active-contacts$/, /^\/api\/sessions(?:\/|$)/, /^\/api\/security(?:\/|$)/],
  security_admin: [/^\/api\/(?:test|logs|blocked-ips|threats|fingerprints|security-state|metrics)(?:\/|$)/, /^\/api\/(?:siem|incident-response|iam|sessions)(?:\/|$)/, /^\/api\/security(?:\/|$)/],
};

const TRUSTED_AUTHENTICATED_ROUTES = [
  /^\/api\/auth\/me$/,
  /^\/api\/appointments(?:\/|$)/,
  /^\/api\/doctors(?:\/|$)/,
  /^\/api\/medical-records(?:\/|$)/,
  /^\/api\/recommend-doc$/,
  /^\/api\/chatbot(?:\/|$)/,
  /^\/api\/chats(?:\/|$)/,
  /^\/api\/chats-active-contacts$/,
  /^\/api\/activity-logs(?:\/|$)/,
  /^\/api\/admin(?:\/|$)/,
  /^\/api\/sessions(?:\/|$)/,
  /^\/api\/security(?:\/|$)/,
];

function isDashboardRoute(p) {
  if (DASHBOARD_APIS.has(p)) return true;
  return DASHBOARD_PREFIXES.some(prefix => p.startsWith(prefix));
}

function isBlockedIpExemptRoute(p) {
  if (!isDashboardRoute(p)) return false;
  return !/^\/api\/(?:auth|doctors|appointments|medical-records|chatbot|chats)(?:\/|$)/.test(p);
}

function isUserSafeRoute(req, trustedNormalTraffic = false) {
  const p = req.path || '/';
  if (p === '/' || p === '/index.html') return true;
  if (p === '/soc' || p.startsWith('/soc/')) return true;
  if (req.method === 'GET' && !p.startsWith('/api/')) return true;
  if (trustedNormalTraffic) return true;
  return [
    /^\/api\/auth(?:\/|$)/,
    /^\/api\/doctors(?:\/|$)/,
    /^\/api\/appointments(?:\/|$)/,
    /^\/api\/chats(?:\/|$)/,
    /^\/api\/chats-active-contacts$/,
    /^\/api\/chatbot(?:\/|$)/,
    /^\/api\/recommend-doc$/,
    /^\/api\/medical-records(?:\/|$)/,
    /^\/api\/sessions(?:\/|$)/,
    /^\/api\/security\/sessions(?:\/|$)/
  ].some(rule => rule.test(p));
}

function normalizeRole(role) {
  const value = String(role || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (value === 'securityadmin' || value === 'soc_admin') return 'security_admin';
  return value;
}

function getRequestUser(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const user = req.user || body.user || {};
  const role = normalizeRole(user.role || body.role || req.headers['x-user-role']);
  return {
    id: user._id || user.id || body._id || body.id || body.email || req.headers['x-user-id'] || null,
    role: role || null,
    authenticated: Boolean(req.user || req.headers.authorization || body._id || body.id || body.email),
  };
}

function isRoleAllowed(role, p) {
  const rules = TRUSTED_ROLE_ROUTES[normalizeRole(role)] || [];
  return rules.some(rule => rule.test(p));
}

function isTrustedNormalTraffic(req) {
  const user = getRequestUser(req);
  if (isDashboardRoute(req.path)) return true;
  if (req.method === 'GET' && !req.path.startsWith('/api/')) return true;
  if (user.authenticated && TRUSTED_AUTHENTICATED_ROUTES.some(rule => rule.test(req.path))) return true;
  return Boolean(user.authenticated && user.role && isRoleAllowed(user.role, req.path));
}

function explainThreat(req, user, rule, score, reason, decision) {
  return {
    userId: user.id || 'anonymous',
    role: user.role || 'anonymous',
    route: req.path,
    action: req.method,
    threatScore: score,
    detectionRule: rule,
    reason,
    finalDecision: decision,
  };
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

// ─── Brute-force detection ────────────────────────────────────────────────────
function recordFailedAuthAttempt(ip, p) {
  if (!AUTH_ENDPOINTS.has(p)) return false;
  const now   = Date.now();
  const t     = bruteTracker[ip];
  if (!t || now - t.windowStart > BRUTE_WINDOW_MS) {
    bruteTracker[ip] = { count: 1, windowStart: now };
    return false;
  }
  t.count += 1;
  return t.count > LOGIN_BRUTE_LIMIT;
}

function getBruteCount(ip) {
  return (bruteTracker[ip] || {}).count || 0;
}

function watchFailedAuth(req, res, ip, io) {
  if (req.method !== 'POST' || !AUTH_ENDPOINTS.has(req.path)) return;
  let handled = false;
  const handleFailure = (body) => {
    if (handled) return;
    if (res.statusCode < 400) {
      delete bruteTracker[ip];
      return;
    }
    if (res.statusCode !== 401 && res.statusCode !== 403) return;
    if (body && /Attack Blocked|IP BLOCKED/i.test(String(body.message || body.error || ''))) return;
    if (!recordFailedAuthAttempt(ip, req.path)) return;
    handled = true;
    const bScore = addThreat(ip, 100);
    const user = getRequestUser(req);
    const blockedRecord = blockIP(ip, 'Brute-auto', `Repeated failed login attempts on ${req.path}`);
    tempBan(ip);
    const decision = 'BLOCKED';
    const bEntry = {
      ip, type: 'Brute', score: bScore,
      action: 'BLOCKED',
      time: cairoNow(),
      isoTime: new Date().toISOString(),
      path: req.path, method: req.method,
      payload: `${getBruteCount(ip)} failed login attempts in 60s`,
      analysis: { type: 'Brute', risk: 'HIGH', target: req.path, technique: 'Failed authentication burst' },
      explanation: explainThreat(req, user, 'FAILED_AUTH_BRUTE_FORCE', bScore, 'Repeated failed authentication attempts', decision),
      fingerprint: getFingerprint(req),
    };
    logger(bEntry);
    io.emit('attack', bEntry);
    io.emit('new-threat', bEntry);
    io.emit('ip-auto-banned', { ip, reason: 'Brute', score: bScore, time: cairoNow() });
    io.emit('blocked-list', getBlockedIPs());
    io.emit('incident-response', { type: 'BLOCK_IP', record: blockedRecord });
    emitSecurityState(io);
    sendWebhookAlert(bEntry);
  };
  const originalJson = res.json.bind(res);
  res.json = function(body) {
    handleFailure(body);
    return originalJson(body);
  };
  res.on('finish', () => handleFailure(null));
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
  PrototypePollution: {
    score: 100,
    pattern: /(__proto__|constructor\s*\[|constructor\s*\.|prototype\s*\.|prototype\s*\[|\bproto\b)/i
  },
  ParamPollution: {
    score: 80,
    pattern: /(\[\]\s*=|%5B%5D=|(?:^|[?&])([^=&]+)=([^&]*)(?:&\2=))/i
  },
  CmdInjection:    {
    score: 100,
    pattern: /([;&|`$]\s*(ls|cat|pwd|whoami|id|uname|wget|curl|bash|sh|cmd|powershell|ping|nc|ncat|netcat|python|perl|ruby|php)\b|(\|\||&&)\s*(ls|cat|id|whoami|curl|wget|bash|sh|cmd|powershell)\b|\$\{?IFS\}?|`[^`]*`|\$\([^)]*\)|\b(bash|sh|cmd|powershell)\s+(-c|\/c|-enc|-encodedcommand)\b|\b(system|passthru|shell_exec|exec|popen|proc_open)\s*\()/i
  },
  SQLi:            {
    score: 100,
    pattern: /(--|#|\/\*|\*\/|;?\s*DROP\s+TABLE|SELECT\s+.+FROM|UNION(?:\s|\/\*.*?\*\/)+SELECT|INSERT\s+INTO|DELETE\s+FROM|UPDATE\s+.+SET|\b(OR|AND)\b\s+['"]?\w+['"]?\s*=\s*['"]?\w+['"]?|\b(OR|AND)\b\s+1\s*=\s*1|SLEEP\s*\(|BENCHMARK\s*\(|WAITFOR\s+DELAY|PG_SLEEP\s*\(|DBMS_PIPE\.RECEIVE_MESSAGE|LOAD_FILE\s*\(|INTO\s+OUTFILE|INFORMATION_SCHEMA|XP_CMDSHELL|EXEC\s*\(|EXECUTE\s*\(|CAST\s*\(|CONVERT\s*\(|0x[0-9a-fA-F]+|'\s*(OR|AND)\s+'?[\w\d])/i
  },
  XXE:             {
    score: 100, bodyOnly: true,
    pattern: /<!ENTITY\s+\S+\s+(SYSTEM|PUBLIC)\s*["']|<!ENTITY\s+%\s+\S+|<!DOCTYPE\s+[^>]*\[|SYSTEM\s+["'][^"']*["']|file:\/\/\/|expect:\/\/|php:\/\/filter|gopher:\/\/|data:text\/xml|&#x25;|%[a-zA-Z][a-zA-Z0-9_]*;\s*<|<!\[CDATA\[[\s\S]{0,200}(file:|http:|ftp:)/i
  },
  SSRF:            {
    score: 100, bodyOnly: true,
    pattern: /(https?:\/\/(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|169\.254\.|localhost|\[?::1\]?|2130706433|0177\.|0x7f)|metadata\.google\.internal|169\.254\.169\.254|latest\/meta-data|computeMetadata\/v1|file:\/\/|dict:\/\/|gopher:\/\/|ftp:\/\/)/i
  },
  PathTraversal:   {
    score: 100,
    pattern: /(\.\.\/|\.\.\\|\.\.%2f|\.\.%5c|%2e%2e%2f|%2e%2e%5c|%252e%252e|%c0%ae|\/etc\/passwd|\/etc\/shadow|\/proc\/self|\/var\/log|c:\\windows\\|windows\\win\.ini|boot\.ini)/i
  },
  XSS:             {
    score: 60,
    pattern: /(<\s*script[\s/>]|<\/\s*script>|javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|srcdoc\s*=|on\w+\s*=\s*["']?[^"'\s>]+|<\s*(img|svg|body|iframe|math|object|embed)[^>]*(onerror|onload|srcdoc|javascript:)|alert\s*\(|confirm\s*\(|prompt\s*\(|document\.(cookie|domain|location)|eval\s*\(|Function\s*\(|innerHTML\s*=|<\s*iframe)/i
  },
  NoSQLi:          {
    score: 100,
    pattern: /(\$where|\$gt|\$gte|\$lt|\$lte|\$ne|\$eq|\$in|\$nin|\$or|\$and|\$not|\$nor|\$exists|\$regex|\$expr|\$function)\s*[:=]|\{\s*"\$|"\w+"\s*:\s*\{\s*"\$ne"\s*:|this\.\w+\s*==|sleep\s*\(\s*\d+\s*\)/i
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
  SensitiveAPIAbuse: {
    score: 60,
    pattern: /(\/api\/patient|\/api\/records|\/api\/medical|\/api\/prescriptions|\/api\/labs)\S*(admin|dump|export|download|bulk|all)/i
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

function decodeHtmlEntities(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&colon;/gi, ':')
    .replace(/&sol;/gi, '/')
    .replace(/&bsol;/gi, '\\')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function safeDecodeURIComponent(value) {
  try { return decodeURIComponent(value.replace(/\+/g, ' ')); } catch { return value; }
}

function normalizeForInspection(value) {
  let out = String(value || '').slice(0, 50000);
  for (let i = 0; i < 4; i += 1) {
    const before = out;
    out = out.replace(/%u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    out = safeDecodeURIComponent(out);
    out = decodeHtmlEntities(out);
    out = out.replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    out = out.replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    if (out === before) break;
  }
  return out
    .replace(/\/\*!?\d*/g, '/*')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectAttackTypes({ bodyData = '', fullData = '' } = {}) {
  const normalizedBody = normalizeForInspection(bodyData);
  const normalizedFull = normalizeForInspection(fullData);
  const candidates = {
    bodyData: [bodyData, normalizedBody].filter(Boolean).join(' '),
    fullData: [fullData, normalizedFull].filter(Boolean).join(' ')
  };
  const matches = [];
  for (const [type, cfg] of Object.entries(PATTERNS)) {
    const data = cfg.bodyOnly ? candidates.bodyData : candidates.fullData;
    cfg.pattern.lastIndex = 0;
    if (cfg.pattern.test(data)) matches.push({ type, score: cfg.score });
  }
  return matches.sort((a, b) =>
    b.score - a.score ||
    (ATTACK_PRIORITY[b.type] || 0) - (ATTACK_PRIORITY[a.type] || 0) ||
    a.type.localeCompare(b.type)
  );
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
  else if (type === 'SensitiveAPIAbuse') { a.risk = 'HIGH'; a.target = 'Medical API endpoints'; a.technique = 'Bulk medical API extraction attempt'; }
  else if (type === 'LDAPInjection')     { a.risk = 'HIGH'; a.target = 'Directory / LDAP auth'; a.technique = 'LDAP operator injection'; }
  else if (type === 'PromptInjection')   { a.risk = 'HIGH'; a.target = 'AI/LLM subsystem'; a.technique = 'Prompt injection / jailbreak attempt'; }
  else if (type === 'PaymentTampering')  { a.risk = 'CRITICAL'; a.target = 'Payment system'; a.technique = 'Amount manipulation or prototype pollution'; }
  return a;
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
    const requestUser = getRequestUser(req);
    const trustedNormalTraffic = isTrustedNormalTraffic(req);
    watchFailedAuth(req, res, ip, io);

    // ── Panic / lockdown mode ──────────────────────────────────────────────────
    if (panicState.get() && !PANIC_EXEMPT.has(req.path) && !isDashboardRoute(req.path) && !isUserSafeRoute(req, trustedNormalTraffic)) {
      return res.status(503).json({
        error:     'Service Unavailable',
        message:   '503 - System under Emergency Maintenance',
        panicMode: true
      });
    }

    // ── Brute-force detection ─────────────────────────────────────────────────
    // Failed-login brute-force detection is recorded after the auth route responds.

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
    const bodyStr   = req.body
      ? (typeof req.body === 'string'
          ? req.body
          : (Object.keys(req.body).length ? JSON.stringify(req.body) : ''))
      : '';
    const queryStr  = req.query  && Object.keys(req.query).length  ? JSON.stringify(req.query)  : '';
    const paramStr  = req.params && Object.keys(req.params).length ? JSON.stringify(req.params) : '';
    const headerStr = JSON.stringify({
      'user-agent': req.headers['user-agent'] || '',
      'x-forwarded-for': req.headers['x-forwarded-for'] || '',
      referer: req.headers.referer || '',
      cookie: req.headers.cookie || '',
      'content-type': req.headers['content-type'] || ''
    });
    const bodyData  = [bodyStr, queryStr, paramStr, rawUrl].filter(Boolean).join(' ');
    const fullData  = `${bodyData} ${headerStr}`;
    const displayPayload = [bodyStr, queryStr, paramStr].filter(Boolean).join(' ') || rawUrl;

    const matches = detectAttackTypes({ bodyData, fullData });

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
      const isCriticalAttack = detectedScore >= 100 && detectedType !== 'RateLimit';
      const mustBlockAttack = MUST_BLOCK_ATTACKS.has(detectedType);
      const adjustedScore = mustBlockAttack
        ? Math.max(detectedScore, 100)
        : ((requestUser.authenticated || trustedNormalTraffic) && !isCriticalAttack ? Math.min(detectedScore, 30) : detectedScore);
      const score = addThreat(ip, adjustedScore);
      const shouldBlock = detectedType !== 'RateLimit' && !isBlockedIpExemptRoute(req.path) && (score >= 100 || isCriticalAttack || mustBlockAttack);
      if (shouldBlock) {
        const blockedRecord = blockIP(ip, `${detectedType}-auto`, `Detected ${detectedType} attack on ${req.path}`);
        tempBan(ip); clearBruteState(ip);
        io.emit('ip-auto-banned', { ip, reason: detectedType, score, time: cairoNow() });
        io.emit('blocked-list', getBlockedIPs());
        io.emit('incident-response', { type: 'BLOCK_IP', record: blockedRecord });
      }
      const decision = shouldBlock ? 'BLOCKED' : (detectedType === 'RateLimit' ? 'TEMP_RATE_LIMIT' : (requestUser.authenticated || trustedNormalTraffic ? 'WARNING' : 'LOGGED'));
      const entry = {
        ip, type: detectedType, score,
        action: decision === 'TEMP_RATE_LIMIT' ? 'RATE-LIMITED' : decision,
        time:    cairoNow(),
        isoTime: new Date().toISOString(),
        path:    req.path, method: req.method,
        payload: displayPayload.slice(0, 200),
        analysis: {
          ...analyzePayload(detectedType, displayPayload),
          additionalTypes: matches.slice(1).map(m => m.type)
        },
        explanation: explainThreat(req, requestUser, detectedType, score, requestUser.authenticated || trustedNormalTraffic ? 'Trusted/authenticated request lowered to warning sensitivity' : 'Attack pattern matched request payload', decision),
        fingerprint, suspiciousFingerprint, knownIPs
      };
      logger(entry);
      io.emit('attack',     entry);
      io.emit('new-threat', entry);
      emitSecurityState(io);
      sendWebhookAlert(entry);
      if (detectedType === 'RateLimit') {
        return res.status(429).json({ message: `${detectedType} - Too Many Requests` });
      }
      if (shouldBlock) return res.status(403).json({ message: `${detectedType} Attack Blocked` });
    }

    if (req.method === 'POST' && AUTH_ENDPOINTS.has(req.path) && recordFailedAuthAttempt(ip, req.path)) {
      const score = addThreat(ip, 100);
      const blockedRecord = blockIP(ip, 'Brute-auto', `Rapid authentication attempts on ${req.path}`);
      tempBan(ip); clearBruteState(ip);
      const entry = {
        ip, type: 'Brute', score, action: 'BLOCKED',
        time: cairoNow(),
        isoTime: new Date().toISOString(),
        path: req.path, method: req.method,
        payload: `${LOGIN_BRUTE_LIMIT + 1}+ login attempts in ${Math.round(BRUTE_WINDOW_MS / 1000)}s`,
        analysis: { type: 'Brute', risk: 'HIGH', target: req.path, technique: 'Authentication burst before controller' },
        explanation: explainThreat(req, requestUser, 'AUTH_BRUTE_FORCE', score, 'Rapid authentication attempts', 'BLOCKED'),
        fingerprint, suspiciousFingerprint, knownIPs
      };
      logger(entry);
      io.emit('attack', entry);
      io.emit('new-threat', entry);
      io.emit('ip-auto-banned', { ip, reason: 'Brute', score, time: cairoNow() });
      io.emit('blocked-list', getBlockedIPs());
      io.emit('incident-response', { type: 'BLOCK_IP', record: blockedRecord });
      emitSecurityState(io);
      sendWebhookAlert(entry);
      return res.status(403).json({ message: 'Brute Force Attack Blocked' });
    }

    // ── Blocked-IP check ──────────────────────────────────────────────────────
    if (!isBlockedIpExemptRoute(req.path) && !isUserSafeRoute(req, trustedNormalTraffic) && (isTempBanned(ip) || isBlocked(ip) || getThreatScore(ip) >= 100)) {
      const now = Date.now();
      if (!blockedLogThrottle[ip] || now - blockedLogThrottle[ip] > 60000) {
        blockedLogThrottle[ip] = now;
        const entry = {
          ip, type: 'BLOCKED_IP', score: getThreatScore(ip), action: 'BLOCKED',
          time:    cairoNow(),
          isoTime: new Date().toISOString(),
          path:    req.path, method: req.method,
          payload: 'Blocked IP access attempt',
          analysis: null,
          explanation: explainThreat(req, requestUser, 'BLOCKED_IP', getThreatScore(ip), 'IP is blocked or temporarily banned', 'BLOCKED'),
          fingerprint, suspiciousFingerprint, knownIPs
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
module.exports.normalizeForInspection = normalizeForInspection;
module.exports.detectAttackTypes     = detectAttackTypes;

