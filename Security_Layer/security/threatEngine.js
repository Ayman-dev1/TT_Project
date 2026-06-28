'use strict';

const fs   = require('fs');
const path = require('path');

// ─── In-memory stores ─────────────────────────────────────────────────────────
const threats             = Object.create(null);
const blockedIPs          = Object.create(null);
const quarantinedAccounts = Object.create(null);
const incidentLog         = [];
const MAX_IR_LOG          = 500;

// ─── Persistence ──────────────────────────────────────────────────────────────
const PERSIST_FILE = path.join(__dirname, 'blocked_ips_persist.json');

function writeJsonArrayAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

function saveBlockedIPs() {
  try {
    const data = Object.entries(blockedIPs).map(([ip, d]) => ({
      ip, ...d,
      score: threats[ip] ? threats[ip].score : 100,
      hits:  threats[ip] ? threats[ip].hits  : 1
    }));
    writeJsonArrayAtomic(PERSIST_FILE, data);
  } catch (e) {
    console.error('[ThreatEngine] Could not save blocked IPs:', e.message);
    throw e;
  }
}

function loadBlockedIPs() {
  try {
    if (!fs.existsSync(PERSIST_FILE)) return;
    const data = JSON.parse(fs.readFileSync(PERSIST_FILE, 'utf8'));
    if (!Array.isArray(data)) return;
    data.forEach(({ ip, reason, blockedAt, score, hits }) => {
      const isoAt = blockedAt && !isNaN(new Date(blockedAt).getTime())
        ? blockedAt
        : new Date().toISOString();
      blockedIPs[ip] = { reason: reason || 'persisted', blockedAt: isoAt };
      threats[ip]    = {
        score: score || 100, hits: hits || 1, blocked: true,
        firstSeen: isoAt, lastSeen: new Date().toISOString()
      };
    });
    console.log(`[ThreatEngine] Loaded ${data.length} persisted blocked IPs`);
  } catch (e) {
    console.warn('[ThreatEngine] Could not load persisted IPs:', e.message);
  }
}

loadBlockedIPs();

// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Normalises an IP address — strips IPv4-mapped IPv6 prefix,
 * converts loopback ::1 to 127.0.0.1.
 * @param {string} ip
 * @returns {string}
 */
function cleanIP(ip) {
  if (!ip) return '0.0.0.0';
  return String(ip).replace('::ffff:', '').replace('::1', '127.0.0.1');
}

function nowIso() { return new Date().toISOString(); }

function ensureThreat(ip) {
  ip = cleanIP(ip);
  if (!threats[ip]) {
    threats[ip] = { score: 0, hits: 0, blocked: false, firstSeen: nowIso(), lastSeen: nowIso() };
  }
  return threats[ip];
}

// ─── Threat scoring ───────────────────────────────────────────────────────────
/**
 * Adds to the cumulative threat score for an IP.
 * @param {string} ip
 * @param {number} score - Points to add
 * @returns {number} New cumulative score
 */
function addThreat(ip, score) {
  const item = ensureThreat(ip);
  item.score   += Number(score || 0);
  item.hits    += 1;
  item.lastSeen = nowIso();
  return item.score;
}

/** @returns {number} Current threat score for an IP (0 if unknown) */
function getThreatScore(ip) {
  ip = cleanIP(ip);
  return threats[ip] ? threats[ip].score : 0;
}

/** @returns {void} Reset score to 0 without unblocking */
function resetScore(ip) {
  ip = cleanIP(ip);
  if (threats[ip]) { threats[ip].score = 0; threats[ip].lastSeen = nowIso(); }
}

// ─── Block / unblock ──────────────────────────────────────────────────────────
/**
 * Permanently blocks an IP and persists to disk.
 * @param {string} ip
 * @param {string} [reason='manual']
 * @returns {object} Blocked IP record
 */
function blockIP(ip, reason = 'manual') {
  ip = cleanIP(ip);
  const item = ensureThreat(ip);
  item.blocked  = true;
  item.score    = Math.max(item.score, 100);
  item.lastSeen = nowIso();
  blockedIPs[ip] = { reason, blockedAt: nowIso() };
  saveBlockedIPs();
  return getBlockedIP(ip);
}

/**
 * Removes an IP from the blocked list and resets its score.
 * @param {string} ip
 */
function unblockIP(ip) {
  ip = cleanIP(ip);
  const wasBlocked = Boolean(blockedIPs[ip]);
  delete blockedIPs[ip];
  if (threats[ip]) { threats[ip].blocked = false; threats[ip].score = 0; threats[ip].lastSeen = nowIso(); }
  saveBlockedIPs();
  return { ip, removed: wasBlocked, alreadyUnblocked: !wasBlocked, activeBlockRemoved: true };
}

/** @returns {boolean} Whether an IP is currently blocked */
function isBlocked(ip) {
  ip = cleanIP(ip);
  return Boolean(blockedIPs[ip] || (threats[ip] && threats[ip].blocked));
}

/** @returns {object|null} Block record for an IP, or null if not blocked */
function getBlockedIP(ip) {
  ip = cleanIP(ip);
  const data = blockedIPs[ip];
  if (!data) return null;
  return {
    ip,
    reason: data.reason,
    blockedAt: data.blockedAt,
    score: getThreatScore(ip),
    hits: threats[ip] ? threats[ip].hits : 0
  };
}

/** @returns {Array} All currently blocked IPs, sorted newest first */
function getBlockedIPs() {
  return Object.keys(blockedIPs)
    .map(getBlockedIP)
    .filter(Boolean)
    .sort((a, b) => new Date(b.blockedAt) - new Date(a.blockedAt));
}

/** @returns {Array} All tracked IPs with their threat data */
function getAllThreats() {
  return Object.keys(threats)
    .map(ip => ({ ip, ...threats[ip], blocked: isBlocked(ip) }))
    .sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen));
}

// ─── Account quarantine ───────────────────────────────────────────────────────
/**
 * Places a user account into quarantine (soft block at application layer).
 * @param {string} userId
 * @param {string} [reason='manual-ir']
 * @param {string} [severity='HIGH']
 * @param {string|null} [incidentId=null]
 * @returns {object} Quarantine record
 */
function quarantineAccount(userId, reason = 'manual-ir', severity = 'HIGH', incidentId = null) {
  const id = String(userId).slice(0, 120);
  quarantinedAccounts[id] = { reason, severity, quarantinedAt: nowIso() };
  logIRAction({ action: 'QUARANTINE_ACCOUNT', target: id, reason, severity, incidentId });
  return quarantinedAccounts[id];
}

/**
 * Releases a quarantined user account.
 * @param {string} userId
 * @param {string|null} [incidentId=null]
 * @returns {boolean} True if the account was previously quarantined
 */
function releaseAccount(userId, incidentId = null) {
  const id = String(userId).slice(0, 120);
  const wasQuarantined = !!quarantinedAccounts[id];
  delete quarantinedAccounts[id];
  logIRAction({
    action: 'RELEASE_ACCOUNT', target: id,
    reason: wasQuarantined ? 'manual-release' : 'not-quarantined',
    severity: 'INFO', incidentId
  });
  return wasQuarantined;
}

/** @returns {boolean} Whether a user account is currently quarantined */
function isAccountQuarantined(userId) {
  return Boolean(quarantinedAccounts[String(userId)]);
}

/** @returns {Array} All quarantined accounts */
function getQuarantinedAccounts() {
  return Object.entries(quarantinedAccounts).map(([id, data]) => ({ id, ...data }));
}

// ─── Incident response log ────────────────────────────────────────────────────
function logIRAction(action) {
  incidentLog.unshift({ ...action, time: new Date().toISOString() });
  if (incidentLog.length > MAX_IR_LOG) incidentLog.length = MAX_IR_LOG;
}

/** @returns {Array} Copy of the incident response log */
function getIRLog() { return incidentLog.slice(); }

/** Clears the incident response log (does not affect blocks or quarantines) */
function clearIRLog() { incidentLog.length = 0; }

// ─── Nuclear reset (testing / admin) ─────────────────────────────────────────
/** Clears all in-memory state and persists empty blocked list. */
function clearAll() {
  Object.keys(threats).forEach(k => delete threats[k]);
  Object.keys(blockedIPs).forEach(k => delete blockedIPs[k]);
  Object.keys(quarantinedAccounts).forEach(k => delete quarantinedAccounts[k]);
  incidentLog.length = 0;
  saveBlockedIPs();
}

module.exports = {
  addThreat, getThreatScore, resetScore,
  blockIP, unblockIP, isBlocked,
  getBlockedIP, getBlockedIPs, getAllThreats,
  quarantineAccount, releaseAccount, isAccountQuarantined, getQuarantinedAccounts,
  getIRLog, logIRAction, clearIRLog,
  clearAll, cleanIP
};
