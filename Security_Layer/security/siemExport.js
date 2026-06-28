'use strict';

// ─── CEF severity mapping ─────────────────────────────────────────────────────
function cefSeverity(score) {
  if (score >= 100) return 10;
  if (score >= 80)  return 8;
  if (score >= 60)  return 6;
  if (score >= 40)  return 4;
  return 2;
}

// ─── Format converters ────────────────────────────────────────────────────────
/**
 * Converts an attack entry to a CEF (Common Event Format) log line.
 * @param {object} entry
 * @returns {string}
 */
function toCEF(entry) {
  const sev  = cefSeverity(entry.score || 0);
  const type = String(entry.type || 'UNKNOWN').replace(/\|/g, '\\|');
  const safe = s => String(s || '').replace(/[\r\n]/g, ' ').replace(/\|/g, '\\|').slice(0, 200);
  const ext  = [
    `src=${safe(entry.ip)}`,
    `request=${safe(entry.path)}`,
    `requestMethod=${safe(entry.method)}`,
    `msg=${safe(entry.payload)}`,
    `cn1=${entry.score || 0}`,
    `cn1Label=ThreatScore`,
    `act=${safe(entry.action || 'LOGGED')}`,
    `rt=${new Date(entry.time || Date.now()).getTime()}`,
    `cs1=${safe(entry.analysis?.technique)}`,
    `cs1Label=Technique`,
    `cs2=${safe(entry.analysis?.target)}`,
    `cs2Label=Target`,
    `cs3=${safe(entry.fingerprint)}`,
    `cs3Label=Fingerprint`,
  ].join(' ');
  return `CEF:0|Tabibi|SecurityLayer|5.2|${type}|${type} detected|${sev}|${ext}`;
}

/**
 * Converts an attack entry to Elastic Common Schema (ECS) / SIEM JSON format.
 * @param {object} entry
 * @returns {object}
 */
function toSIEMJson(entry) {
  return {
    '@timestamp': entry.isoTime || entry.time || new Date().toISOString(),
    event: {
      kind:     'alert',
      category: ['intrusion_detection'],
      type:     ['indicator'],
      severity: cefSeverity(entry.score || 0),
      action:   entry.action || 'LOGGED',
      outcome:  entry.action === 'BLOCKED' ? 'failure' : 'unknown',
      dataset:  'tabibi.security',
      module:   'tabibi'
    },
    source: { ip: entry.ip },
    url:    { path: entry.path },
    http:   { request: { method: entry.method } },
    rule: {
      name:        entry.type,
      description: entry.analysis?.technique,
      category:    entry.analysis?.target
    },
    tabibi: {
      threat_score:    entry.score,
      attack_type:     entry.type,
      payload_excerpt: String(entry.payload || '').slice(0, 200),
      fingerprint:     entry.fingerprint,
      analysis:        entry.analysis,
      simulation_id:   entry.simulationId
    }
  };
}

// ─── Correlation engine ───────────────────────────────────────────────────────
const ipAttackTypes  = Object.create(null);
const endpointHits   = Object.create(null);
const fpIpMap        = Object.create(null);
const correlations   = [];
const MAX_CORR        = 200;
const CORR_WINDOW_MS  = 10 * 60 * 1000; // 10 minutes

const CORRELATION_RULES = [
  {
    id: 'MULTI_VECTOR',
    name: 'Multi-vector attack',
    description: 'Same IP used 3+ different attack types in 10 minutes',
    severity: 9,
    check(ip) {
      const rec = ipAttackTypes[ip];
      if (!rec) return false;
      return Object.keys(rec.types).length >= 3 && (Date.now() - rec.firstSeen) <= CORR_WINDOW_MS;
    },
    detail(ip) {
      const rec = ipAttackTypes[ip];
      return { ip, attackTypes: Object.keys(rec.types), windowMs: Date.now() - rec.firstSeen };
    }
  },
  {
    id: 'CREDENTIAL_STUFFING',
    name: 'Credential stuffing',
    description: '10+ requests to /api/login from 5+ different IPs in 10 minutes',
    severity: 8,
    check() {
      const rec = endpointHits['/api/login'];
      if (!rec) return false;
      const cutoff = Date.now() - CORR_WINDOW_MS;
      const recent = rec.times.filter(t => t >= cutoff);
      return recent.length >= 10 && rec.ips.size >= 5;
    },
    detail() {
      const rec = endpointHits['/api/login'];
      return { endpoint: '/api/login', uniqueIPs: rec?.ips?.size, recentHits: rec?.times?.length };
    }
  },
  {
    id: 'FINGERPRINT_MULTI_IP',
    name: 'Same fingerprint, multiple IPs',
    description: 'One browser fingerprint appearing from 4+ different IPs — VPN rotation suspected',
    severity: 7,
    check(ip, entry) {
      if (!entry?.fingerprint) return false;
      const ips = fpIpMap[entry.fingerprint];
      return ips && ips.size >= 4;
    },
    detail(ip, entry) {
      if (!entry?.fingerprint) return {};
      return { fingerprint: entry.fingerprint, ipCount: fpIpMap[entry.fingerprint]?.size };
    }
  }
];

function correlate(entry) {
  if (!entry || !entry.ip) return [];

  const now  = Date.now();
  const ip   = entry.ip;
  const type = entry.type;

  if (!ipAttackTypes[ip]) ipAttackTypes[ip] = { types: {}, firstSeen: now };
  ipAttackTypes[ip].types[type] = (ipAttackTypes[ip].types[type] || 0) + 1;

  const p = entry.path || '/unknown';
  if (!endpointHits[p]) endpointHits[p] = { ips: new Set(), times: [] };
  endpointHits[p].ips.add(ip);
  endpointHits[p].times.push(now);
  const cutoff = now - CORR_WINDOW_MS;
  endpointHits[p].times = endpointHits[p].times.filter(t => t >= cutoff);

  if (entry.fingerprint) {
    if (!fpIpMap[entry.fingerprint]) fpIpMap[entry.fingerprint] = new Set();
    fpIpMap[entry.fingerprint].add(ip);
  }

  const triggered = [];
  for (const rule of CORRELATION_RULES) {
    if (rule.check(ip, entry)) {
      const corr = {
        ruleId:      rule.id,
        ruleName:    rule.name,
        description: rule.description,
        severity:    rule.severity,
        triggerIp:   ip,
        detail:      rule.detail(ip, entry),
        time:        new Date().toISOString()
      };
      triggered.push(corr);
      correlations.unshift(corr);
      if (correlations.length > MAX_CORR) correlations.pop();
    }
  }
  return triggered;
}

/** @returns {Array} Most recent correlation events (default 50) */
function getCorrelations(limit = 50) { return correlations.slice(0, limit); }

/** @returns {string} CEF lines for an array of entries, newline-separated */
function getAllCEF(entries) { return entries.map(toCEF).join('\n'); }

// ─── SSE (Server-Sent Events) stream ─────────────────────────────────────────
const sseClients  = new Set();
let _lastFpClean  = Date.now();

/**
 * Express middleware factory for the SIEM SSE stream.
 * Mount at: GET /api/siem/stream
 * @returns {Function} Express handler
 */
function sseHandler() {
  return (req, res) => {
    res.set({
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();
    const heartbeat = setInterval(() => { res.write(': heartbeat\n\n'); }, 30000);
    res.write(`event: connected\ndata: {"status":"connected","time":"${new Date().toISOString()}"}\n\n`);
    const client = { res };
    sseClients.add(client);
    req.on('close', () => { clearInterval(heartbeat); sseClients.delete(client); });
  };
}

function pushToSSE(entry) {
  if (!sseClients.size) return;
  const cef     = toCEF(entry);
  const json    = JSON.stringify(toSIEMJson(entry));
  const payload = `event: attack\ndata: ${cef}\n\nevent: siem_json\ndata: ${json}\n\n`;
  for (const client of sseClients) {
    try { client.res.write(payload); } catch { sseClients.delete(client); }
  }
}

function pushCorrelationToSSE(corr) {
  if (!sseClients.size) return;
  const payload = `event: correlation\ndata: ${JSON.stringify(corr)}\n\n`;
  for (const client of sseClients) {
    try { client.res.write(payload); } catch { sseClients.delete(client); }
  }
}

/**
 * Express middleware factory for the SIEM REST export endpoint.
 * Mount at: GET /api/siem/events
 * Supports ?format=cef|json, ?limit=N, ?since=ISO_DATE
 * @param {object} logger - The logger module (for readLogsSync)
 * @returns {Function} Express handler
 */
function restHandler(logger) {
  return (req, res) => {
    const limit  = Math.min(Number(req.query.limit || 500), 5000);
    const format = req.query.format || 'json';
    const since  = req.query.since ? new Date(req.query.since).getTime() : 0;
    let entries  = [];
    try {
      entries = (logger ? logger.readLogsSync() : [])
        .filter(e => !since || new Date(e.isoTime || e.time || 0).getTime() >= since)
        .slice(-limit);
    } catch {}
    if (format === 'cef') {
      res.type('text/plain').send(getAllCEF(entries));
    } else {
      res.json({
        count:        entries.length,
        format:       'siem_json',
        events:       entries.map(toSIEMJson),
        correlations: getCorrelations(20),
        exportedAt:   new Date().toISOString()
      });
    }
  };
}

/**
 * Ingest an attack entry into the SIEM engine.
 * Runs correlation rules, pushes to SSE clients, emits Socket.IO events.
 * Called automatically by the logger on every enqueued entry.
 *
 * @param {object} entry - Attack log entry
 * @param {object|null} io - Socket.IO server instance
 * @returns {Array} Triggered correlation events
 */
function ingest(entry, io) {
  const triggered = correlate(entry);
  pushToSSE(entry);
  triggered.forEach(corr => {
    pushCorrelationToSSE(corr);
    if (io) io.emit('correlation-alert', corr);
  });
  return triggered;
}

// ─── Periodic cleanup ─────────────────────────────────────────────────────────
setInterval(() => {
  const cutoff = Date.now() - CORR_WINDOW_MS * 2;
  Object.keys(ipAttackTypes).forEach(ip => {
    if (ipAttackTypes[ip].firstSeen < cutoff) delete ipAttackTypes[ip];
  });
  Object.keys(endpointHits).forEach(p => {
    endpointHits[p].times = endpointHits[p].times.filter(t => t >= cutoff);
    if (!endpointHits[p].times.length) delete endpointHits[p];
  });
  if (Date.now() - _lastFpClean >= 86400000) {
    Object.keys(fpIpMap).forEach(fp => delete fpIpMap[fp]);
    _lastFpClean = Date.now();
  }
}, 600000).unref?.();

module.exports = {
  toCEF, toSIEMJson,
  correlate, ingest,
  getCorrelations, getAllCEF,
  sseHandler, pushToSSE, pushCorrelationToSSE,
  restHandler
};
