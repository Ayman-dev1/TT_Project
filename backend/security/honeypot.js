'use strict';

const logger     = require('./logger');
const { addThreat, blockIP, getBlockedIPs, cleanIP } = require('./threatEngine');
const { cairoNow } = require('./timeUtils');
const { computeHealthFromLogs } = require('./healthUtils');

/**
 * Broadcasts the current security state (health, blocked IPs, counts) over Socket.IO.
 * Called after every honeypot trigger.
 * @param {object} io - Socket.IO server instance
 */
function emitSecurityState(io) {
  try {
    logger.flushSync?.();
    const logs     = logger.readLogsSync ? logger.readLogsSync() : [];
    const total    = Array.isArray(logs) ? logs.length : 0;
    const blocked  = getBlockedIPs();
    const critical = Array.isArray(logs) ? logs.filter(item => Number(item.score || 0) >= 100).length : 0;
    const health   = computeHealthFromLogs(logs);
    io.emit('health-update', {
      total, blocked: blocked.length, critical, health,
      patientDataSafety: health,
      decrementPerAttack: 2,
      time: cairoNow()
    });
    io.emit('blocked-list', blocked);
  } catch {}
}

/**
 * Returns an Express handler for honeypot trap routes.
 * Any request that reaches a honeypot route is treated as malicious reconnaissance:
 * the IP is immediately blocked, a 100-point threat score is added, and the
 * incident is emitted over Socket.IO.
 *
 * The response is deliberately friendly (200 OK) to deceive automated scanners.
 *
 * Mount example (server.js):
 *   const honeypot = require('./security/honeypot')(io);
 *   ['/trap', '/admin', '/wp-login.php', ...].forEach(r => app.all(r, honeypot));
 *
 * @param {object} io - Socket.IO server instance
 * @returns {Function} Express route handler
 */
module.exports = io => {
  return (req, res) => {
    const ip = cleanIP(
      // Allow test header in non-production environments
      process.env.NODE_ENV !== 'production' && req.headers['x-test-ip']
        ? req.headers['x-test-ip']
        : req.ip
    );

    const score = addThreat(ip, 100);
    blockIP(ip, 'honeypot');

    const entry = {
      ip,
      type:      'HONEYPOT',
      score,
      time:      cairoNow(),
      timeCairo: cairoNow(),
      isoTime:   new Date().toISOString(),
      path:      req.path,
      method:    req.method,
      payload:   `Honeypot trap triggered: ${req.path}`,
      analysis: {
        type:      'HONEYPOT',
        risk:      'HIGH',
        target:    'Reconnaissance trap',
        technique: 'Scanner touched a decoy endpoint'
      },
      simulationId: req.headers['x-attack-id'] || null
    };

    logger(entry);
    io.emit('attack',            entry);
    io.emit('new-threat',        entry);
    io.emit('ip-auto-banned',    { ip, reason: 'HONEYPOT', score, time: cairoNow() });
    io.emit('incident-response', {
      action:     'AUTO_QUARANTINE',
      ip,
      reason:     'HONEYPOT trap triggered',
      severity:   'HIGH',
      incidentId: `HP-${Date.now()}`,
      time:       cairoNow()
    });

    emitSecurityState(io);

    // Deceptive OK response — scanners should not know they were caught
    res.status(200).json({ status: 'ok', message: 'Welcome', data: {} });
  };
};