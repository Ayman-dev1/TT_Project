'use strict';

const fs = require('fs');
const path = require('path');

const AUDIT_FILE = path.join(__dirname, '..', 'admin_audit.json');
const MAX_AUDIT = 1000;

function redact(value) {
  if (value == null) return value;
  if (typeof value !== 'object') return value;
  const out = Array.isArray(value) ? [] : {};
  Object.keys(value).forEach(key => {
    if (/password|token|cookie|authorization|fileData|secret/i.test(key)) {
      out[key] = '[REDACTED]';
    } else if (typeof value[key] === 'object' && value[key] !== null) {
      out[key] = redact(value[key]);
    } else {
      out[key] = value[key];
    }
  });
  return out;
}

function readAudit() {
  try {
    if (!fs.existsSync(AUDIT_FILE)) fs.writeFileSync(AUDIT_FILE, '[]\n', 'utf8');
    const parsed = JSON.parse(fs.readFileSync(AUDIT_FILE, 'utf8') || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAudit(entries) {
  fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });
  fs.writeFileSync(AUDIT_FILE, JSON.stringify(entries.slice(0, MAX_AUDIT), null, 2), 'utf8');
}

function recordAdminAction(req, action, target = {}, extra = {}) {
  try {
    const user = req.user || {};
    const entry = {
      id: `AUD-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      action,
      admin: {
        id: user._id ? String(user._id) : null,
        email: user.email || null,
        role: user.role || null
      },
      method: req.method,
      path: req.originalUrl || req.path,
      ip: req.ip || req.socket?.remoteAddress || null,
      target: redact(target),
      extra: redact(extra)
    };
    const entries = readAudit();
    entries.unshift(entry);
    writeAudit(entries);
    return entry;
  } catch (err) {
    console.error('[Audit] Could not write admin audit:', err.message);
    return null;
  }
}

module.exports = { AUDIT_FILE, readAudit, recordAdminAction, redact };
