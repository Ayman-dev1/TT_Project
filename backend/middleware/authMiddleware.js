const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { isAccountQuarantined } = require('../security/threatEngine');
const logger = require('../security/logger');
const { cleanIP } = require('../security/threatEngine');

const deniedLogThrottle = Object.create(null);

const logAccessDenied = (req, type, message, score = 40) => {
    const ip = cleanIP(req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '0.0.0.0');
    const key = `${ip}:${type}:${req.method}:${req.originalUrl || req.path}`;
    const now = Date.now();
    if (deniedLogThrottle[key] && now - deniedLogThrottle[key] < 60000) return;
    deniedLogThrottle[key] = now;

    logger({
        ip,
        type,
        score,
        action: 'DENIED',
        method: req.method,
        path: req.originalUrl || req.path,
        payload: message,
        user: req.user ? {
            id: req.user._id,
            email: req.user.email,
            role: req.user.role
        } : null,
        explanation: {
            route: req.originalUrl || req.path,
            action: req.method,
            reason: message,
            finalDecision: 'DENIED'
        }
    });
};

const protect = async (req, res, next) => {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = await User.findById(decoded.id).select('-password');
            if (!req.user) {
                logAccessDenied(req, 'AUTH_USER_NOT_FOUND', 'JWT resolved to a missing user account', 60);
                return res.status(401).json({ message: 'Not authorized, user not found' });
            }
            if (isAccountQuarantined(req.user._id)) {
                logAccessDenied(req, 'QUARANTINED_ACCOUNT', 'Quarantined account attempted to access a protected route', 100);
                return res.status(403).json({ message: 'Account is quarantined by security operations' });
            }
            return next();
        } catch (error) {
            console.error(error);
            logAccessDenied(req, 'AUTH_TOKEN_FAILED', 'Invalid or expired token attempted to access a protected route', 50);
            return res.status(401).json({ message: 'Not authorized, token failed' });
        }
    }

    if (!token) {
        logAccessDenied(req, 'AUTH_REQUIRED', 'Anonymous request attempted to access a protected route', 30);
        return res.status(401).json({ message: 'Not authorized, no token' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            logAccessDenied(req, 'ROLE_DENIED', `Role ${req.user.role} attempted restricted route requiring: ${roles.join(', ')}`, 70);
            return res.status(403).json({ message: `Role ${req.user.role} is not authorized to access this route` });
        }
        next();
    };
};

module.exports = { protect, authorize };
