'use strict';

const path = require('path');
const { Server } = require('socket.io');

const panicState = require('../security/panicState');
const threatEngine = require('../security/threatEngine');
const logger = require('../security/logger');
const wafMiddleware = require('../security/waf');
const phiAudit = require('../security/phiAudit');
const geoVelocity = require('../security/geoVelocity');
const appointmentGuard = require('../security/appointmentGuard');
const ratingGuard = require('../security/ratingGuard');
const { cairoNow } = require('../security/timeUtils');

let ioInstance = null;
let wafHandler = null;

// Initialize Security Layer Socket.IO and binds
function initSecurity(app, server) {
    if (process.env.SECURITY_LAYER_ENABLED === 'false') {
        console.log('[Security] Security Layer is disabled globally.');
        return;
    }

    // Initialize Socket.io on the backend HTTP server
    const allowedOrigins = (process.env.SOC_ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173')
        .split(',').map(o => o.trim()).filter(Boolean);

    ioInstance = new Server(server, {
        cors: {
            origin: (origin, cb) => {
                if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
                    cb(null, true);
                } else {
                    cb(new Error(`Socket CORS blocked: ${origin}`));
                }
            },
            methods: ['GET', 'POST'],
            credentials: true
        }
    });

    app.set('io', ioInstance);

    // Initialize modules
    wafHandler = wafMiddleware(ioInstance);
    logger.setIO(ioInstance);

    // Set up Socket.IO connections for the SOC dashboard
    ioInstance.on('connection', socket => {
        console.log('[SOC] Socket connected:', socket.id);
        const blockedIPs = threatEngine.getBlockedIPs();
        const logs = logger.readLogsSync();
        const total = logs.length;
        const critical = logs.filter(item => Number(item.score || 0) >= 100).length;
        const health = require('../security/healthUtils').computeHealthFromLogs(logs);

        const healthData = {
            total, blocked: blockedIPs.length, critical, health,
            patientDataSafety: health,
            time: cairoNow()
        };

        socket.emit('blocked-list', blockedIPs);
        socket.emit('panic-mode', { active: panicState.get() });
        socket.emit('health-update', healthData);
        socket.emit('security-state', { health: healthData, blocked: blockedIPs, threats: threatEngine.getAllThreats() });

        try {
            const recentLogs = logs.slice(-50);
            recentLogs.forEach(entry => {
                if (!entry.isoTime) entry.isoTime = new Date(entry.time || Date.now()).toISOString();
            });
            if (recentLogs.length > 0) socket.emit('recent-attacks', recentLogs);
        } catch (_) {}
    });

    console.log('[Security] Security Layer initialized successfully with Socket.IO.');
}

// Global WAF Express Middleware
function globalWafMiddleware(req, res, next) {
    if (process.env.SECURITY_LAYER_ENABLED === 'false' || process.env.SECURITY_WAF_ENABLED === 'false') {
        return next();
    }
    
    // Inject ioInstance to req for downstream usage
    req.io = ioInstance;
    
    if (wafHandler) {
        return wafHandler(req, res, next);
    }
    next();
}

// Appointment Booking Guard
function appointmentGuardMiddleware(req, res, next) {
    if (process.env.SECURITY_LAYER_ENABLED === 'false' || process.env.SECURITY_APPOINTMENT_GUARD_ENABLED === 'false') {
        return next();
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    const cleanIp = threatEngine.cleanIP(clientIp);
    const userId = req.user ? req.user._id.toString() : 'anonymous';
    const { doctorId } = req.body;

    if (!doctorId) return next(); // Let validation handle missing body fields

    const result = appointmentGuard.checkBooking({ userId, doctorId, ip: cleanIp });
    if (result.blocked) {
        const entry = {
            ip: cleanIp, type: 'APPOINTMENT_ABUSE', score: result.score,
            action: 'BLOCKED', time: cairoNow(),
            path: req.originalUrl, method: req.method,
            payload: result.reason,
            analysis: { type: result.threat || 'APPOINTMENT_ABUSE', risk: 'HIGH', target: `Doctor ${doctorId}`, technique: result.reason }
        };
        logger(entry);
        if (ioInstance) {
            ioInstance.emit('attack', entry);
            ioInstance.emit('new-threat', entry);
        }
        return res.status(400).json({ message: result.reason });
    }

    next();
}

// Rating Submissions Guard
function ratingGuardMiddleware(req, res, next) {
    if (process.env.SECURITY_LAYER_ENABLED === 'false' || process.env.SECURITY_RATING_GUARD_ENABLED === 'false') {
        return next();
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    const cleanIp = threatEngine.cleanIP(clientIp);
    const userId = req.user ? req.user._id.toString() : 'anonymous';
    const { doctorId, rating, hasAppointment } = req.body;

    if (!doctorId) return next();

    const result = ratingGuard.checkRating({
        userId,
        doctorId,
        rating: Number(rating || 3),
        ip: cleanIp,
        hasAppointment: Boolean(hasAppointment)
    });

    if (result.blocked) {
        const entry = {
            ip: cleanIp, type: 'RATING_MANIPULATION', score: result.score,
            action: 'BLOCKED', time: cairoNow(), isoTime: new Date().toISOString(),
            path: req.originalUrl, method: req.method,
            payload: result.reason,
            analysis: { type: 'RATING_MANIPULATION', risk: 'HIGH', target: `Doctor ${doctorId}`, technique: result.reason }
        };
        logger(entry);
        if (ioInstance) {
            ioInstance.emit('attack', entry);
            ioInstance.emit('new-threat', entry);
        }
        return res.status(400).json({ message: result.reason });
    }

    next();
}

// Helper to record rating success
function recordRatingSuccess(req, doctorId) {
    if (process.env.SECURITY_LAYER_ENABLED === 'false' || process.env.SECURITY_RATING_GUARD_ENABLED === 'false') {
        return;
    }
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
    const cleanIp = threatEngine.cleanIP(clientIp);
    const userId = req.user ? req.user._id.toString() : 'anonymous';
    ratingGuard.recordRating({ userId, doctorId, ip: cleanIp });
}

module.exports = {
    initSecurity,
    wafMiddleware: globalWafMiddleware,
    appointmentGuardMiddleware,
    ratingGuardMiddleware,
    recordRatingSuccess
};
