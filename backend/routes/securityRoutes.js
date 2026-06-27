'use strict';

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const net = require('net');
const os = require('os');
const https = require('https');
const http = require('http');
const mongoose = require('mongoose');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const ChatMessage = require('../models/ChatMessage');
const ChatbotMessage = require('../models/ChatbotMessage');

const { cairoNow } = require('../security/timeUtils');
const { computeHealthFromLogs } = require('../security/healthUtils');
const panicState = require('../security/panicState');
const threatEngine = require('../security/threatEngine');
const { blockIP, unblockIP, getBlockedIPs, getAllThreats, cleanIP, clearIRLog } = threatEngine;
const logger = require('../security/logger');
const wafMiddleware = require('../security/waf');
const phiAudit = require('../security/phiAudit');
const geoVelocity = require('../security/geoVelocity');
const appointmentGuard = require('../security/appointmentGuard');
const ratingGuard = require('../security/ratingGuard');
const fileScan = require('../security/fileScan');
const siemExport = require('../security/siemExport');

let pkg = { version: "5.2.0" };
try {
    pkg = require('../../Security_Layer/package.json');
} catch (err) {
    try {
        pkg = require('../package.json');
    } catch (e) {
        // Fallback version
    }
}

const STARTED_AT = Date.now();
const LOG_FILE = path.join(__dirname, '..', 'attacks.json');
const SNAP_DIR = path.join(__dirname, '..', 'snapshots');

const ALARM_HEALTH_THRESHOLD = Number(process.env.SOC_ALARM_HEALTH || 50);
const SHUTDOWN_HEALTH_THRESHOLD = Number(process.env.SOC_SHUTDOWN_HEALTH || 40);

const AUTH_REQUIRED = String(
    process.env.SOC_REQUIRE_AUTH || (process.env.NODE_ENV === 'production' ? 'true' : 'false')
).toLowerCase() === 'true';

let SOC_ADMIN_TOKEN = process.env.SOC_ADMIN_TOKEN || crypto.randomBytes(32).toString('hex');
if (!process.env.SOC_ADMIN_TOKEN) {
    console.warn('[SOC] No SOC_ADMIN_TOKEN set. Generated session token:', SOC_ADMIN_TOKEN);
}

const RECOVERY_PASSWORD = process.env.RECOVERY_PASSWORD || 'TABIBI-RECOVERY-2026';

// Traffic stats tracking
const trafficStats = {
    totalRequests: 0,
    recentRequests: [],
    statusCounts: Object.create(null),
    lastRequestAt: null
};

// Route recorder helper called by main app
router.use((req, res, next) => {
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
});

function getTrafficStats() {
    const now = Date.now();
    const cutoff = now - 60000;
    trafficStats.recentRequests = trafficStats.recentRequests.filter(ts => ts >= cutoff);
    return {
        totalRequests: trafficStats.totalRequests,
        requestsLastMinute: trafficStats.recentRequests.length,
        statusCounts: trafficStats.statusCounts,
        lastRequestAt: trafficStats.lastRequestAt
    };
}

// Rate-limit login/recovery attempts per IP
const loginAttempts = Object.create(null);
const recoverAttempts = Object.create(null);
setInterval(() => {
    const cutoff = Date.now() - 600000;
    [loginAttempts, recoverAttempts].forEach(obj => {
        Object.keys(obj).forEach(k => { if (obj[k].windowStart < cutoff) delete obj[k]; });
    });
}, 1800000).unref?.();

function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    const TRUSTED_PROXIES = (process.env.TRUSTED_PROXIES || '').split(',').map(p => p.trim()).filter(Boolean);
    const remote = cleanIP(req.socket?.remoteAddress || req.connection?.remoteAddress || req.ip || '0.0.0.0');
    if (forwarded && TRUSTED_PROXIES.length > 0 && TRUSTED_PROXIES.includes(remote)) {
        return cleanIP(String(forwarded).split(',')[0].trim());
    }
    return cleanIP(req.ip || remote);
}

function requireAdminAuth(req, res, next) {
    if (!AUTH_REQUIRED) return next();
    const token = req.headers['x-soc-token'] || req.query.token;
    if (token && token === SOC_ADMIN_TOKEN) return next();
    
    // Check Authorization header
    const authHeader = req.headers['authorization'];
    if (authHeader) {
        if (authHeader === 'Bearer TABIBI-SOC-TOKEN-2026' || authHeader === `Bearer ${SOC_ADMIN_TOKEN}`) {
            return next();
        }
    }
    
    console.warn(`[Auth] Unauthorized ${getClientIP(req)} -> ${req.method} ${req.path}`);
    return res.status(401).json({ error: 'Unauthorized - SOC token required' });
}

function readLogs() {
    logger.flushSync();
    return logger.readLogsSync();
}

function computeHealth() {
    const logs = readLogs();
    const total = logs.length;
    const blocked = threatEngine.getBlockedIPs().length;
    const critical = logs.filter(item => Number(item.score || 0) >= 100).length;
    const health = computeHealthFromLogs(logs);
    return {
        total, blocked, critical, health,
        patientDataSafety: health,
        alarmThreshold: ALARM_HEALTH_THRESHOLD,
        shutdownThreshold: SHUTDOWN_HEALTH_THRESHOLD,
        traffic: getTrafficStats(),
        time: cairoNow()
    };
}

function broadcastHealth(io) {
    if (!io) return;
    const health = computeHealth();
    io.emit('health-update', health);
    io.emit('security-state', { health, blocked: threatEngine.getBlockedIPs(), threats: threatEngine.getAllThreats() });

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

// ── Dashboard APIs ───────────────────────────────────────────────────────────
router.get('/test', (req, res) => {
    const health = computeHealth();
    res.json({
        message: 'System Secure',
        status: 'online',
        timestamp: cairoNow(),
        version: pkg.version,
        wafPatterns: Object.keys(wafMiddleware.PATTERNS || {}).length,
        honeypots: 11,
        authRequired: AUTH_REQUIRED,
        uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
        health,
        alarmThreshold: ALARM_HEALTH_THRESHOLD,
        shutdownThreshold: SHUTDOWN_HEALTH_THRESHOLD,
        traffic: getTrafficStats()
    });
});

router.get('/metrics', requireAdminAuth, (req, res) => {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const loadAvg = os.loadavg();
    res.json({
        uptimeSeconds: Math.floor((Date.now() - STARTED_AT) / 1000),
        nodeUptime: Math.floor(process.uptime()),
        memory: {
            rss: memUsage.rss,
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            systemTotal: totalMem,
            systemFree: freeMem,
            systemUsed: usedMem,
            usedPct: Math.round((usedMem / totalMem) * 100)
        },
        cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system,
            loadAvg1: loadAvg[0].toFixed(2),
            loadAvg5: loadAvg[1].toFixed(2),
            loadAvg15: loadAvg[2].toFixed(2),
            cores: os.cpus().length
        },
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        timestamp: cairoNow()
    });
});

router.post('/login', (req, res) => {
    const ip = getClientIP(req);
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

let _logsCleared = false;
router.get('/logs', requireAdminAuth, (req, res) => {
    if (_logsCleared) return res.json([]);
    res.json(readLogs());
});

router.delete('/logs', requireAdminAuth, (req, res) => {
    try {
        _logsCleared = true;
        fs.writeFileSync(LOG_FILE, '[]\n', 'utf8');
        if (req.io) req.io.emit('logs-cleared', { time: cairoNow() });
        broadcastHealth(req.io);
        res.json({ success: true });
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

router.delete('/phi/audit/clear', requireAdminAuth, (req, res) => {
    const confirm = req.headers['x-confirm-audit-clear'];
    if (confirm !== 'CONFIRM-ERASE-PHI-AUDIT') {
        return res.status(400).json({
            error: 'Missing confirmation header.',
            hint: 'Add header: x-confirm-audit-clear: CONFIRM-ERASE-PHI-AUDIT'
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

router.get('/blocked-ips', requireAdminAuth, (req, res) => {
    res.json(getBlockedIPs());
});

router.get('/threats', requireAdminAuth, (req, res) => {
    res.json(getAllThreats());
});

router.get('/security-state', requireAdminAuth, (req, res) => {
    res.json({
        health: computeHealth(),
        blocked: getBlockedIPs(),
        threats: getAllThreats(),
        logs: readLogs(),
        traffic: getTrafficStats(),
        alarmThreshold: ALARM_HEALTH_THRESHOLD,
        shutdownThreshold: SHUTDOWN_HEALTH_THRESHOLD
    });
});

router.get('/fingerprints', requireAdminAuth, (req, res) => {
    const hist = wafMiddleware.getFingerprintHistory();
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const entries = Object.entries(hist)
        .map(([fp, records]) => ({
            fingerprint: fp,
            ipCount: new Set(records.map(r => r.ip)).size,
            ips: [...new Set(records.map(r => r.ip))],
            lastSeen: new Date(Math.max(...records.map(r => r.time))).toISOString()
        }))
        .sort((a, b) => b.ipCount - a.ipCount)
        .slice(0, limit);
    res.json({ total: entries.length, fingerprints: entries });
});

function validateIP(ip) {
    return typeof ip === 'string' && net.isIP(ip.trim()) !== 0;
}

router.post('/block-ip', requireAdminAuth, (req, res) => {
    const ip = cleanIP(req.body?.ip || '');
    const reason = String(req.body?.reason || 'manual').slice(0, 80);
    const incidentId = `IR-IP-${Date.now()}`;
    if (!validateIP(ip)) return res.status(400).json({ error: 'Valid IPv4 or IPv6 address required' });
    const blocked = blockIP(ip, reason);
    threatEngine.logIRAction({ action: 'BLOCK_IP', target: ip, reason, severity: 'HIGH', incidentId });
    if (req.io) {
        req.io.emit('ip-blocked', { ip, reason, incidentId, time: cairoNow() });
        req.io.emit('blocked-list', getBlockedIPs());
        req.io.emit('incident-response', { action: 'BLOCK_IP', ip, reason, severity: 'HIGH', incidentId, time: cairoNow() });
    }
    broadcastHealth(req.io);
    res.json({ success: true, incidentId, blocked });
});

router.post('/unblock-ip', requireAdminAuth, (req, res) => {
    const rawIp = String(req.body?.ip || '').trim();
    let ip = cleanIP(rawIp);
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    const incidentId = `IR-UNBLK-${Date.now()}`;
    if (!validateIP(ip)) {
        return res.status(400).json({ error: 'Valid IP required', received: rawIp });
    }
    const candidates = [ip, '::ffff:' + ip, rawIp];
    if (ip === '127.0.0.1') candidates.push('::1', 'localhost');
    candidates.forEach(candidate => { try { unblockIP(candidate); } catch(_) {} });
    try { wafMiddleware.clearBruteState(ip); } catch(_) {}
    try { threatEngine.logIRAction({ action: 'UNBLOCK_IP', target: ip, reason: 'manual-unblock', severity: 'INFO', incidentId }); } catch(_) {}
    const remaining = getBlockedIPs();
    if (req.io) {
        req.io.emit('ip-unblocked', { ip, incidentId, time: cairoNow() });
        req.io.emit('blocked-list', remaining);
        req.io.emit('incident-response', { action: 'UNBLOCK_IP', ip, incidentId, time: cairoNow() });
    }
    broadcastHealth(req.io);
    res.json({ success: true, incidentId, remaining: remaining.length });
});

router.post('/incident-response/quarantine', requireAdminAuth, (req, res) => {
    const ip = cleanIP(req.body?.ip || '');
    const reason = String(req.body?.reason || 'manual-ir').slice(0, 120);
    const severity = String(req.body?.severity || 'HIGH').slice(0, 20);
    const incidentId = `IR-${Date.now()}`;
    if (!validateIP(ip)) return res.status(400).json({ error: 'Valid IPv4 or IPv6 address required' });
    const blocked = blockIP(ip, reason);
    threatEngine.logIRAction({ action: 'QUARANTINE', target: ip, reason, severity, incidentId });
    const entry = {
        ip, type: 'INCIDENT_RESPONSE', score: threatEngine.getThreatScore(ip),
        action: 'QUARANTINE', time: cairoNow(),
        path: '/api/incident-response/quarantine', method: 'POST',
        payload: `Manual IR quarantine: ${reason} [${severity}] — ${incidentId}`,
        analysis: { type: 'INCIDENT_RESPONSE', risk: severity, target: ip, technique: 'Admin-initiated quarantine' }
    };
    if (entry.isoTime === undefined) entry.isoTime = new Date().toISOString();
    logger(entry);
    if (req.io) {
        req.io.emit('attack', entry);
        req.io.emit('ip-blocked', { ip, reason, severity, incidentId, time: cairoNow() });
        req.io.emit('blocked-list', getBlockedIPs());
        req.io.emit('incident-response', { action: 'QUARANTINE', ip, reason, severity, incidentId, time: cairoNow() });
    }
    broadcastHealth(req.io);
    res.json({ success: true, incidentId, blocked });
});

router.post('/incident-response/release', requireAdminAuth, (req, res) => {
    const ip = cleanIP(req.body?.ip || '');
    const incidentId = `IR-REL-${Date.now()}`;
    if (!validateIP(ip)) return res.status(400).json({ error: 'Valid IPv4 or IPv6 address required' });
    unblockIP(ip);
    wafMiddleware.clearBruteState(ip);
    threatEngine.logIRAction({ action: 'RELEASE', target: ip, reason: 'manual-release', severity: 'INFO', incidentId });
    if (req.io) {
        req.io.emit('ip-unblocked', { ip, incidentId, time: cairoNow() });
        req.io.emit('blocked-list', getBlockedIPs());
        req.io.emit('incident-response', { action: 'RELEASE', ip, incidentId, time: cairoNow() });
    }
    broadcastHealth(req.io);
    res.json({ success: true, incidentId });
});

router.post('/incident-response/quarantine-account', requireAdminAuth, (req, res) => {
    const userId = String(req.body?.userId || '').slice(0, 120);
    const reason = String(req.body?.reason || 'manual-ir').slice(0, 120);
    const severity = String(req.body?.severity || 'HIGH').slice(0, 20);
    const incidentId = `IR-ACC-${Date.now()}`;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const result = threatEngine.quarantineAccount(userId, reason, severity, incidentId);
    if (req.io) {
        req.io.emit('incident-response', { action: 'QUARANTINE_ACCOUNT', userId, reason, severity, incidentId, time: cairoNow() });
    }
    res.json({ success: true, incidentId, quarantined: result });
});

router.post('/incident-response/release-account', requireAdminAuth, (req, res) => {
    const userId = String(req.body?.userId || '').slice(0, 120);
    const incidentId = `IR-REL-ACC-${Date.now()}`;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    const released = threatEngine.releaseAccount(userId, incidentId);
    if (req.io) {
        req.io.emit('incident-response', { action: 'RELEASE_ACCOUNT', userId, incidentId, time: cairoNow() });
    }
    res.json({ success: true, incidentId, released });
});

router.get('/iam/quarantined-accounts', requireAdminAuth, (req, res) => {
    res.json(threatEngine.getQuarantinedAccounts());
});

router.get('/incident-response/log', requireAdminAuth, (req, res) => {
    res.json(threatEngine.getIRLog());
});

router.delete('/incident-response/log', requireAdminAuth, (req, res) => {
    clearIRLog();
    if (req.io) req.io.emit('ir-log-cleared', { time: cairoNow() });
    res.json({ success: true, message: 'Incident response log cleared. Bans and quarantines are untouched.' });
});

router.get('/incident-response/banned-entities', requireAdminAuth, (req, res) => {
    const blocked = getBlockedIPs().map(b => ({
        time: b.blockedAt || new Date().toISOString(),
        banTime: b.blockedAt || null,
        action: 'BLOCK_IP',
        target: b.ip,
        reason: b.reason || 'auto',
        severity: (b.score >= 100 ? 'CRITICAL' : b.score >= 70 ? 'HIGH' : 'MEDIUM'),
        score: b.score,
        hits: b.hits
    }));
    const quarantined = threatEngine.getQuarantinedAccounts().map(a => ({
        time: a.quarantinedAt || new Date().toISOString(),
        banTime: a.quarantinedAt || null,
        action: 'QUARANTINE_ACCOUNT',
        target: a.id,
        reason: a.reason || 'manual',
        severity: a.severity || 'HIGH',
        score: null,
        hits: null
    }));
    const all = [...blocked, ...quarantined].sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0));
    res.json(all);
});

// Data privacy rules
let privacyRules = {
    maskPatientName: true,
    maskNationalId: true,
    maskMRN: true,
    maskDiagnosis: true,
    maskDOB: false,
    maskPhone: true,
    encryptionAtRest: true,
    encryptionInTransit: true,
    fieldLevelEncryption: false,
    auditLogSigning: true,
    keyRotationDays: 90,
    bulkExportAlert: true,
    unusualAccessAlert: true,
    crossDeptAlert: false,
    screenshotBlock: false,
    updatedAt: null
};

router.get('/data-privacy/rules', requireAdminAuth, (req, res) => {
    res.json(privacyRules);
});

router.post('/data-privacy/rules', requireAdminAuth, (req, res) => {
    const allowed = Object.keys(privacyRules).filter(k => k !== 'updatedAt');
    allowed.forEach(key => {
        if (req.body && req.body[key] !== undefined) {
            privacyRules[key] = typeof privacyRules[key] === 'boolean'
                ? Boolean(req.body[key])
                : (typeof privacyRules[key] === 'number' ? Number(req.body[key]) : req.body[key]);
        }
    });
    privacyRules.updatedAt = cairoNow();
    if (req.io) req.io.emit('privacy-rules-updated', { rules: privacyRules, time: privacyRules.updatedAt });
    res.json({ success: true, rules: privacyRules });
});

router.post('/data-privacy/rotate-keys', requireAdminAuth, (req, res) => {
    const rotationId = `KR-${Date.now()}`;
    const entry = {
        type: 'KEY_ROTATION', action: 'ROTATED', time: cairoNow(),
        path: '/api/data-privacy/rotate-keys', method: 'POST',
        payload: `Encryption key rotation initiated — ${rotationId}`,
        analysis: { type: 'KEY_ROTATION', risk: 'INFO', target: 'Encryption keys', technique: 'Manual key rotation' }
    };
    if (entry.isoTime === undefined) entry.isoTime = new Date().toISOString();
    logger(entry);
    if (req.io) req.io.emit('key-rotation', { rotationId, time: cairoNow() });
    res.json({ success: true, rotationId, message: 'Key rotation initiated. Reload secrets from KMS.' });
});

router.post('/iam/impersonate', requireAdminAuth, (req, res) => {
    const targetRole = String(req.body?.role || 'Unknown').slice(0, 40);
    const adminId = String(req.body?.adminId || 'SOC-ADMIN').slice(0, 60);
    const sessionId = `IAM-${Date.now()}`;
    const entry = {
        type: 'IAM_IMPERSONATE', action: 'IMPERSONATE', time: cairoNow(),
        path: '/api/iam/impersonate', method: 'POST',
        payload: `Admin ${adminId} initiated impersonation as role: ${targetRole} — Session: ${sessionId}`,
        analysis: { type: 'IAM_IMPERSONATE', risk: 'INFO', target: `Role: ${targetRole}`, technique: 'Admin impersonation test' }
    };
    if (entry.isoTime === undefined) entry.isoTime = new Date().toISOString();
    logger(entry);
    if (req.io) req.io.emit('iam-impersonate', { adminId, targetRole, sessionId, time: cairoNow() });
    res.json({ success: true, sessionId, role: targetRole, message: `Impersonation session started as ${targetRole}` });
});

router.get('/audit/verify', requireAdminAuth, (req, res) => {
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

function makeSnapshot(label) {
    try {
        if (!fs.existsSync(SNAP_DIR)) fs.mkdirSync(SNAP_DIR, { recursive: true });
        const logs = readLogs();
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const safeLabel = String(label || 'SNAPSHOT').replace(/[^A-Z0-9_-]/gi, '_');
        const snapPath = path.join(SNAP_DIR, `${safeLabel}-${stamp}.json`);
        fs.writeFileSync(snapPath, JSON.stringify({ timestamp: cairoNow(), label: safeLabel, logs }, null, 2), 'utf8');
        return { filename: path.basename(snapPath), count: logs.length };
    } catch (err) {
        console.error('[Snapshot] Failed:', err.message);
        return null;
    }
}

router.post('/snapshot', requireAdminAuth, (req, res) => {
    const label = String(req.body?.label || 'MANUAL').slice(0, 40);
    const result = makeSnapshot(label);
    if (!result) return res.status(500).json({ error: 'Snapshot failed' });
    res.json({ success: true, ...result });
});

router.get('/snapshot', requireAdminAuth, (req, res) => {
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

router.post('/panic', requireAdminAuth, (req, res) => {
    panicState.set(true);
    wafMiddleware.setPanicMode(true);
    const snapshot = makeSnapshot('PANIC');
    if (req.io) req.io.emit('panic-mode', { active: true, time: cairoNow(), snapshot });
    res.json({ success: true, snapshot });
});

router.get('/panic-status', requireAdminAuth, (req, res) => {
    res.json({
        panicMode: panicState.get()
    });
});

router.post('/recover', (req, res) => {
    const ip = getClientIP(req);
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
    if (req.io) {
        req.io.emit('panic-mode', { active: false, time: cairoNow() });
        req.io.emit('lockdown-released', { time: cairoNow() });
    }
    broadcastHealth(req.io);
    res.json({ success: true });
});

// PHI Audit routes
router.get('/phi/audit', requireAdminAuth, (req, res) => {
    const limit = Math.min(Number(req.query.limit || 200), 2000);
    res.json(phiAudit.getRecentAccess(limit));
});

router.get('/phi/audit/verify', requireAdminAuth, (req, res) => {
    res.json(phiAudit.verifyLog());
});

router.get('/phi/audit/stats', requireAdminAuth, (req, res) => {
    const { userId, patientId, since } = req.query;
    res.json(phiAudit.getAccessStats({ userId, patientId, since }));
});

router.post('/phi/audit/log', requireAdminAuth, (req, res) => {
    const { userId, patientId, fields, reason, action, meta } = req.body || {};
    const validFields = Object.keys(phiAudit.PHI_FIELD_TAGS);
    const cleanFields = Array.isArray(fields) ? fields.filter(f => validFields.includes(f)) : [];
    phiAudit.logAccess({
        userId: String(userId || 'admin').slice(0, 80),
        patientId: String(patientId || 'N/A').slice(0, 80),
        fields: cleanFields,
        reason: String(reason || 'manual-admin').slice(0, 120),
        ip: getClientIP(req),
        action: action || 'READ',
        meta: meta || {}
    });
    res.json({ success: true });
});

// SIEM stream & export
router.get('/siem/stream', requireAdminAuth, siemExport.sseHandler());
router.get('/siem/events', requireAdminAuth, siemExport.restHandler(logger));
router.get('/siem/correlations', requireAdminAuth, (req, res) => {
    res.json(siemExport.getCorrelations(Number(req.query.limit || 50)));
});

// File scanner API
router.post('/upload/scan', requireAdminAuth, (req, res) => {
    const { base64Data, filename, mimeType } = req.body || {};
    if (!base64Data) return res.status(400).json({ error: 'base64Data required' });
    try {
        const buffer = Buffer.from(base64Data, 'base64');
        const result = fileScan.scan(buffer, filename || 'upload', mimeType || '');
        if (!result.safe) {
            const entry = {
                ip: getClientIP(req), type: 'MALICIOUS_UPLOAD', score: 80,
                action: 'BLOCKED', time: cairoNow(),
                path: '/api/upload/scan', method: 'POST',
                payload: `Malicious file rejected: ${result.reason} [${filename}] sha256=${result.sha256 || 'n/a'}`,
                analysis: { type: 'MALICIOUS_UPLOAD', risk: 'HIGH', target: 'File upload', technique: result.threats.join(', ') }
            };
            if (entry.isoTime === undefined) entry.isoTime = new Date().toISOString();
            logger(entry);
            if (req.io) req.io.emit('attack', entry);
            return res.status(400).json({ safe: false, reason: result.reason, threats: result.threats, sha256: result.sha256 });
        }
        res.json({
            safe: true,
            mime: result.mime,
            safeName: result.safeName,
            sizeBytes: result.sizeBytes,
            scanMs: result.scanMs,
            sha256: result.sha256,
            threats: result.threats || []
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Geolocation travel checking API
router.post('/geo/check', requireAdminAuth, async (req, res) => {
    const { userId, ip } = req.body || {};
    if (!userId || !ip) return res.status(400).json({ error: 'userId and ip required' });
    try {
        const result = await geoVelocity.check(String(userId).slice(0, 80), String(ip).slice(0, 45));
        if (result.impossible) {
            const entry = {
                ip, type: 'IMPOSSIBLE_TRAVEL', score: 95,
                action: 'ALERT', time: cairoNow(),
                path: '/api/geo/check', method: 'POST',
                payload: result.reason,
                analysis: { type: 'IMPOSSIBLE_TRAVEL', risk: 'CRITICAL', target: `User ${userId}`, technique: result.reason }
            };
            if (entry.isoTime === undefined) entry.isoTime = new Date().toISOString();
            logger(entry);
            if (req.io) {
                req.io.emit('attack', entry);
                req.io.emit('impossible-travel', { userId, ...result });
            }
        }
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/geo/location/:userId', requireAdminAuth, (req, res) => {
    const loc = geoVelocity.getLastLocation(req.params.userId);
    res.json(loc || { error: 'No location on record' });
});

// Appointment Guard endpoints
router.post('/appointments/check', requireAdminAuth, (req, res) => {
    const { userId, doctorId, ip } = req.body || {};
    if (!userId || !doctorId) return res.status(400).json({ error: 'userId and doctorId required' });
    const result = appointmentGuard.checkBooking({
        userId: String(userId).slice(0, 80),
        doctorId: String(doctorId).slice(0, 80),
        ip: ip || getClientIP(req)
    });
    res.json(result);
});

router.post('/appointments/record', requireAdminAuth, (req, res) => {
    const { bookingId, userId, doctorId, ip } = req.body || {};
    if (!bookingId || !userId || !doctorId) return res.status(400).json({ error: 'bookingId, userId, doctorId required' });
    appointmentGuard.recordBooking({ bookingId, userId, doctorId, ip: ip || getClientIP(req) });
    res.json({ success: true });
});

router.post('/appointments/paid', requireAdminAuth, (req, res) => {
    const { bookingId } = req.body || {};
    if (!bookingId) return res.status(400).json({ error: 'bookingId required' });
    res.json(appointmentGuard.recordPayment(bookingId));
});

router.post('/appointments/cancel', requireAdminAuth, (req, res) => {
    const { bookingId } = req.body || {};
    if (!bookingId) return res.status(400).json({ error: 'bookingId required' });
    res.json(appointmentGuard.checkCancellation(bookingId));
});

router.get('/appointments/expired', requireAdminAuth, (req, res) => {
    res.json(appointmentGuard.getExpiredUnpaidBookings());
});

router.get('/appointments/guard-stats', requireAdminAuth, (req, res) => {
    const { userId, doctorId } = req.query;
    res.json(appointmentGuard.getStats({ userId, doctorId }));
});

// Rating Guard endpoints
router.post('/ratings/check', requireAdminAuth, (req, res) => {
    const { userId, doctorId, rating, ip, hasAppointment } = req.body || {};
    if (!userId || !doctorId) return res.status(400).json({ error: 'userId and doctorId required' });
    const result = ratingGuard.checkRating({
        userId: String(userId).slice(0, 80),
        doctorId: String(doctorId).slice(0, 80),
        rating: Number(rating || 3),
        ip: ip || getClientIP(req),
        hasAppointment: Boolean(hasAppointment)
    });
    res.json(result);
});

router.post('/ratings/record', requireAdminAuth, (req, res) => {
    const { userId, doctorId, ip } = req.body || {};
    if (!userId || !doctorId) return res.status(400).json({ error: 'userId and doctorId required' });
    ratingGuard.recordRating({ userId, doctorId, ip: ip || getClientIP(req) });
    res.json({ success: true });
});

router.get('/ratings/stats/:doctorId', requireAdminAuth, (req, res) => {
    res.json(ratingGuard.getDoctorStats(req.params.doctorId));
});

// SOC Integration API endpoints
router.get('/soc-stats', requireAdminAuth, (req, res) => {
    res.json(computeHealth());
});

router.delete('/clear-logs', requireAdminAuth, (req, res) => {
    try {
        _logsCleared = true;
        fs.writeFileSync(LOG_FILE, '[]\n', 'utf8');
        if (req.io) req.io.emit('logs-cleared', { time: cairoNow() });
        broadcastHealth(req.io);
        res.json({ success: true });
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

router.post('/panic-off', requireAdminAuth, (req, res) => {
    panicState.set(false);
    wafMiddleware.setPanicMode(false);
    if (req.io) {
        req.io.emit('panic-mode', { active: false, time: cairoNow() });
        req.io.emit('lockdown-released', { time: cairoNow() });
    }
    broadcastHealth(req.io);
    res.json({ success: true });
});

router.post('/recommend-doc', async (req, res) => {
    const { symptoms } = req.body;
    if (!symptoms) {
        return res.status(400).json({ error: 'Symptoms field is required' });
    }
    try {
        const response = await fetch('http://127.0.0.1:8000/api/recommend-doc', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symptoms })
        });
        const data = await response.json();
        return res.status(response.status).json(data);
    } catch (err) {
        return res.status(503).json({ error: 'Django AI service is offline' });
    }
});

// Chatbot message persistence endpoints
router.get('/chatbot/messages', async (req, res) => {
    const { email } = req.query;
    if (!email) {
        return res.status(400).json({ error: 'Email parameter is required' });
    }
    try {
        const messages = await ChatbotMessage.find({ userEmail: email }).sort({ timestamp: 1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/chatbot/messages', async (req, res) => {
    const { userEmail, role, text, isEmergency, isOfflineFallback, isAr, doctors, specialty } = req.body;
    if (!userEmail || !role || !text) {
        return res.status(400).json({ error: 'userEmail, role, and text are required fields' });
    }
    try {
        const newMsg = new ChatbotMessage({
            userEmail,
            role,
            text,
            isEmergency: !!isEmergency,
            isOfflineFallback: !!isOfflineFallback,
            isAr: !!isAr,
            doctors: Array.isArray(doctors) ? doctors : [],
            specialty: specialty || ''
        });
        await newMsg.save();
        res.status(201).json(newMsg);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/chatbot/messages', async (req, res) => {
    const { email } = req.query;
    if (!email) {
        return res.status(400).json({ error: 'Email parameter is required' });
    }
    try {
        await ChatbotMessage.deleteMany({ userEmail: email });
        res.json({ success: true, message: 'Chatbot history cleared successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const ACTIVITY_LOGS_FILE = path.join(__dirname, '..', 'activity_logs.json');

// Get all activity logs
router.get('/activity-logs', (req, res) => {
    try {
        if (!fs.existsSync(ACTIVITY_LOGS_FILE)) {
            fs.writeFileSync(ACTIVITY_LOGS_FILE, '[]', 'utf8');
        }
        const data = fs.readFileSync(ACTIVITY_LOGS_FILE, 'utf8');
        res.json(JSON.parse(data || '[]'));
    } catch (err) {
        res.json([]);
    }
});

// Post a new activity log
router.post('/activity-logs', (req, res) => {
    try {
        const { type, message } = req.body;
        if (!type || !message) {
            return res.status(400).json({ error: 'type and message required' });
        }
        if (!fs.existsSync(ACTIVITY_LOGS_FILE)) {
            fs.writeFileSync(ACTIVITY_LOGS_FILE, '[]', 'utf8');
        }
        const data = fs.readFileSync(ACTIVITY_LOGS_FILE, 'utf8');
        const logs = JSON.parse(data || '[]');
        const newLog = {
            id: Date.now(),
            timestamp: new Date().toISOString(),
            type,
            message
        };
        logs.unshift(newLog);
        fs.writeFileSync(ACTIVITY_LOGS_FILE, JSON.stringify(logs.slice(0, 100), null, 2), 'utf8');
        res.json({ success: true, log: newLog });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Lightweight shared chat storage for multi-browser sync
const CHAT_FILE = path.join(__dirname, '..', 'chats.json');

async function migrateChatsToDB() {
    try {
        if (fs.existsSync(CHAT_FILE)) {
            const data = fs.readFileSync(CHAT_FILE, 'utf8');
            const chats = JSON.parse(data || '{}');
            let count = 0;
            for (const key in chats) {
                const messages = chats[key] || [];
                for (const msg of messages) {
                    const exists = await ChatMessage.findOne({
                        chatKey: key,
                        senderId: msg.senderId,
                        text: msg.text,
                        timestamp: msg.timestamp
                    });
                    if (!exists) {
                        await ChatMessage.create({
                            chatKey: key,
                            senderId: msg.senderId,
                            senderRole: msg.senderRole,
                            text: msg.text,
                            read: msg.read === true,
                            timestamp: msg.timestamp || new Date()
                        });
                        count++;
                    }
                }
            }
            if (count > 0) {
                console.log(`[Migration] Migrated ${count} messages from chats.json to MongoDB successfully.`);
            }
            try {
                fs.renameSync(CHAT_FILE, CHAT_FILE + '.bak');
                console.log(`[Migration] Renamed chats.json to chats.json.bak`);
            } catch (e) {
                console.error(`[Migration] Failed to rename chats.json:`, e.message);
            }
        }
    } catch (err) {
        console.error('[Migration] Chat migration failed:', err.message);
    }
}

// Trigger migration on startup
migrateChatsToDB();

const BACKEND_DEFAULT_DOCTORS = [
    { id: "6a3aaae8584cd708d428b0c3", name: "Dr. Ahmed Mansour", specialty: "General physician", available: true, img: "/assets/images/M1.png", email: "ahmed@tabibi.com" },
    { id: "6a3aaae9584cd708d428b0c5", name: "Dr. Maryam El-Gohary", specialty: "Gynecologist", available: true, img: "/assets/images/F1.png", email: "maryam@tabibi.com" },
    { id: "6a3aaae9584cd708d428b0c7", name: "Dr. Aya Sami", specialty: "Dermatologist", available: false, img: "/assets/images/F2.png", email: "aya@tabibi.com" },
    { id: "6a3aaae9584cd708d428b0c9", name: "Dr. Khaled Shouky", specialty: "Neurologist", available: true, img: "/assets/images/M2.png", email: "khaled@tabibi.com" },
    { id: "6a3aaaea584cd708d428b0cb", name: "Dr. Youssef Nabil", specialty: "Pediatricians", available: true, img: "/assets/images/image 419.png", email: "youssef@tabibi.com" }
];

router.get('/chats-active-contacts', async (req, res) => {
    try {
        const { email, role } = req.query;
        if (!email || !role) {
            return res.status(400).json({ error: 'Email and role query parameters are required' });
        }

        const chatKeys = await ChatMessage.distinct('chatKey');
        const relevant = [];

        // Find doctorId if role is doctor
        let dIdStr = '';
        if (role === 'doctor') {
            const user = await User.findOne({ email });
            if (user) {
                const doctor = await Doctor.findOne({ userId: user._id });
                if (doctor) {
                    dIdStr = doctor._id.toString();
                }
            }
        }

        for (let key of chatKeys) {
            const parts = key.split('_');
            if (parts.length < 2) continue;
            const dId = parts[0];
            const pEmail = parts.slice(1).join('_');

            if (!dId || !pEmail) continue;

            const lastMsg = await ChatMessage.findOne({ chatKey: key }).sort({ timestamp: -1 });
            if (!lastMsg) continue;

            const unreadCount = await ChatMessage.countDocuments({
                chatKey: key,
                senderRole: { $ne: role },
                read: false
            });
            const unread = unreadCount > 0;

            if (role === 'doctor') {
                if (String(dId) === String(dIdStr)) {
                    const pat = await User.findOne({ email: pEmail });
                    const patName = pat ? pat.name : pEmail;
                    const patImg = pat && pat.image ? pat.image : '';

                    relevant.push({
                        dId: dId,
                        pEmail: pEmail,
                        name: patName,
                        img: patImg,
                        last: lastMsg?.text || 'Click to chat',
                        available: false,
                        unread: unread
                    });
                }
            } else if (role === 'patient') {
                if (pEmail.toLowerCase() === email.toLowerCase()) {
                    let docName = 'Doctor';
                    let docImg = '';
                    let docEmail = '';
                    let docAvail = true;

                    const defaultDoc = BACKEND_DEFAULT_DOCTORS.find(d => String(d.id) === String(dId));
                    if (defaultDoc) {
                        docName = defaultDoc.name;
                        docImg = defaultDoc.img;
                        docEmail = defaultDoc.email;
                        docAvail = defaultDoc.available;
                    }

                    if (mongoose.Types.ObjectId.isValid(dId)) {
                        const doctorObj = await Doctor.findById(dId).populate('userId', 'name email image');
                        if (doctorObj) {
                            docName = doctorObj.userId?.name || doctorObj.name || docName;
                            docImg = doctorObj.userId?.image || doctorObj.image || doctorObj.img || docImg;
                            docEmail = doctorObj.userId?.email || doctorObj.email || docEmail;
                            docAvail = doctorObj.available !== false;
                        }
                    }

                    relevant.push({
                        dId: dId,
                        pEmail: pEmail,
                        email: docEmail,
                        name: docName,
                        img: docImg,
                        last: lastMsg?.text || 'Click to chat',
                        available: docAvail,
                        unread: unread
                    });
                }
            }
        }
        res.json(relevant);
    } catch (err) {
        console.error('Error fetching active contacts:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.post('/log-client-error', (req, res) => {
    const { message, stack, url } = req.body || {};
    const logEntry = `[${new Date().toISOString()}] URL: ${url}\nError: ${message}\nStack: ${stack}\n-----------------------------------\n`;
    try {
        fs.appendFileSync(path.join(__dirname, '..', 'client_errors.log'), logEntry, 'utf8');
    } catch (_) {}
    console.error('!!! CLIENT ERROR LOGGED !!!', message);
    res.json({ success: true });
});

router.get('/chats/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const messages = await ChatMessage.find({ chatKey: key }).sort({ timestamp: 1 });
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/chats/:key', async (req, res) => {
    try {
        const { key } = req.params;
        const { senderId, senderRole, text } = req.body;
        
        const newMsg = await ChatMessage.create({
            chatKey: key,
            senderId,
            senderRole,
            text,
            read: false,
            timestamp: new Date()
        });
        
        // Broadcast via socket.io if online
        if (req.io) {
            req.io.emit('chat-message', { key, message: newMsg });
        }
        
        res.json(newMsg);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/chats/:key/read', async (req, res) => {
    try {
        const { key } = req.params;
        const { role } = req.body;
        await ChatMessage.updateMany(
            { chatKey: key, senderRole: { $ne: role } },
            { $set: { read: true } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a single message
router.delete('/chats/message/:messageId', async (req, res) => {
    try {
        const { messageId } = req.params;
        const msg = await ChatMessage.findById(messageId);
        if (!msg) {
            return res.status(404).json({ error: 'Message not found' });
        }
        const key = msg.chatKey;
        await ChatMessage.findByIdAndDelete(messageId);

        // Broadcast deletion
        if (req.io) {
            req.io.emit('chat-message-deleted', { key, messageId });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete an entire chat conversation
router.delete('/chats/:key', async (req, res) => {
    try {
        const { key } = req.params;
        await ChatMessage.deleteMany({ chatKey: key });

        // Broadcast deletion
        if (req.io) {
            req.io.emit('chat-deleted', { key });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
