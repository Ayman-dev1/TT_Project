const User = require('../models/User');
const Doctor = require('../models/Doctor');
const generateToken = require('../utils/generateToken');

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res, next) => {
    try {
        const { name, email, password, role } = req.body;

        const userExists = await User.findOne({ email });

        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        if (role === 'doctor' && !req.body.clinicAddress) {
            return res.status(400).json({ message: 'Clinic address is required for doctor accounts' });
        }

        const user = await User.create({
            name,
            email,
            password,
            role: role || 'patient',
            image: req.body.image || ''
        });

        if (user) {
            // If user is a doctor, create a doctor profile
            if (user.role === 'doctor') {
                await Doctor.create({
                    userId: user._id,
                    specialty: req.body.specialty || 'General',
                    experience: req.body.experience || 0,
                    fee: req.body.fee || 0,
                    degree: req.body.degree || 'MBBS',
                    about: req.body.about || '',
                    clinicAddress: req.body.clinicAddress
                });
            }

            const responseData = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: generateToken(user._id)
            };

            if (user.role === 'doctor') {
                const doctor = await Doctor.findOne({ userId: user._id });
                if (doctor) responseData.doctorId = doctor._id;
            }

            // Record initial login in geoVelocity
            if (process.env.SECURITY_LAYER_ENABLED !== 'false' && process.env.SECURITY_GEO_VELOCITY_ENABLED !== 'false') {
                try {
                    const geoVelocity = require('../security/geoVelocity');
                    const threatEngine = require('../security/threatEngine');
                    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
                    const cleanIp = threatEngine.cleanIP(clientIp);
                    await geoVelocity.recordLogin(user._id.toString(), cleanIp);
                } catch (err) {
                    console.error('[Security] Geo registration failure:', err.message);
                }
            }

            // PHI write logging
            if (process.env.SECURITY_LAYER_ENABLED !== 'false') {
                try {
                    const phiAudit = require('../security/phiAudit');
                    const threatEngine = require('../security/threatEngine');
                    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
                    phiAudit.logAccess({
                        userId: user._id.toString(),
                        patientId: user._id.toString(),
                        fields: ['patientName', 'email'],
                        reason: 'User registration',
                        ip: threatEngine.cleanIP(clientIp),
                        action: 'WRITE'
                    });
                } catch (err) {
                    console.error('[Security] PHI log failure:', err.message);
                }
            }

            res.status(201).json(responseData);
        } else {
            res.status(400).json({ message: 'Invalid user data' });
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Authenticate a user & check geo velocity
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });

        if (user && (await user.matchPassword(password))) {
            // Run travel anomaly check BEFORE logging the user in fully
            if (process.env.SECURITY_LAYER_ENABLED !== 'false' && process.env.SECURITY_GEO_VELOCITY_ENABLED !== 'false') {
                try {
                    const geoVelocity = require('../security/geoVelocity');
                    const threatEngine = require('../security/threatEngine');
                    const logger = require('../security/logger');
                    const { cairoNow } = require('../security/timeUtils');
                    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
                    const cleanIp = threatEngine.cleanIP(clientIp);

                    const result = await geoVelocity.check(user._id.toString(), cleanIp);
                    if (result.impossible) {
                        const entry = {
                            ip: cleanIp, type: 'IMPOSSIBLE_TRAVEL', score: 95,
                            action: 'ALERT', time: cairoNow(),
                            path: req.originalUrl, method: req.method,
                            payload: result.reason,
                            analysis: { type: 'IMPOSSIBLE_TRAVEL', risk: 'CRITICAL', target: `User ${user._id}`, technique: result.reason }
                        };
                        entry.isoTime = new Date().toISOString();
                        logger(entry);
                        if (req.app && req.app.get('io')) {
                            req.app.get('io').emit('attack', entry);
                            req.app.get('io').emit('impossible-travel', { userId: user._id, ...result });
                        }
                        console.warn(`[Security] Impossible travel flagged for user ${user._id}: ${result.reason}`);
                    }
                } catch (err) {
                    console.error('[Security] Geo-velocity anomaly check failed:', err.message);
                }
            }

            // PHI write logging for login
            if (process.env.SECURITY_LAYER_ENABLED !== 'false') {
                try {
                    const phiAudit = require('../security/phiAudit');
                    const threatEngine = require('../security/threatEngine');
                    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
                    phiAudit.logAccess({
                        userId: user._id.toString(),
                        patientId: user._id.toString(),
                        fields: ['patientName', 'email'],
                        reason: 'User authentication',
                        ip: threatEngine.cleanIP(clientIp),
                        action: 'READ'
                    });
                } catch (err) {
                    console.error('[Security] PHI log failure:', err.message);
                }
            }

            const responseData = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                token: generateToken(user._id)
            };

            if (user.role === 'doctor') {
                const doctor = await Doctor.findOne({ userId: user._id });
                if (doctor) {
                    responseData.doctorId = doctor._id;
                    responseData.available = doctor.available;
                }
            }

            res.json(responseData);
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Get user profile
// @route   GET /api/auth/me
// @access  Private
const getUserProfile = async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);

        if (user) {
            // PHI read log
            if (process.env.SECURITY_LAYER_ENABLED !== 'false') {
                try {
                    const phiAudit = require('../security/phiAudit');
                    const threatEngine = require('../security/threatEngine');
                    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
                    phiAudit.logAccess({
                        userId: req.user._id.toString(),
                        patientId: user._id.toString(),
                        fields: ['patientName', 'email', 'phone', 'address', 'dateOfBirth'],
                        reason: 'Read user profile',
                        ip: threatEngine.cleanIP(clientIp),
                        action: 'READ'
                    });
                } catch (err) {
                    console.error('[Security] PHI log failure:', err.message);
                }
            }

            const responseData = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                image: user.image,
                dob: user.dob,
                phone: user.phone,
                address: user.address
            };

            if (user.role === 'doctor') {
                const doctor = await Doctor.findOne({ userId: user._id });
                if (doctor) {
                    responseData.available = doctor.available;
                }
            }

            res.json(responseData);
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        next(error);
    }
};

module.exports = {
    registerUser,
    loginUser,
    getUserProfile
};
