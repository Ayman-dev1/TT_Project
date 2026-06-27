const Doctor = require('../models/Doctor');
const User = require('../models/User');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const ACTIVITY_LOGS_FILE = path.join(__dirname, '..', 'activity_logs.json');

const logBackendActivity = (type, message) => {
    try {
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
    } catch (err) {
        console.error('Error writing activity log:', err.message);
    }
};

// @desc    Get all doctors
// @route   GET /api/doctors
// @access  Public
const getDoctors = async (req, res) => {
    const doctors = await Doctor.find({}).populate('userId', 'name email image');
    res.json(doctors);
};

// @desc    Get doctor by ID
// @route   GET /api/doctors/:id
// @access  Public
const getDoctorById = async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: 'Invalid doctor ID' });
    }
    const doctor = await Doctor.findById(req.params.id).populate('userId', 'name email image phone address dob');

    if (doctor) {
        // Log PHI read access for doctor profile details
        if (process.env.SECURITY_LAYER_ENABLED !== 'false') {
            try {
                const phiAudit = require('../security/phiAudit');
                const threatEngine = require('../security/threatEngine');
                const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
                phiAudit.logAccess({
                    userId: req.user ? req.user._id.toString() : 'anonymous',
                    patientId: doctor.userId ? doctor.userId._id.toString() : 'unknown',
                    fields: ['patientName', 'email', 'phone', 'address'],
                    reason: 'Read doctor details by ID',
                    ip: threatEngine.cleanIP(clientIp),
                    action: 'READ'
                });
            } catch (err) {
                console.error('[Security] PHI log failure:', err.message);
            }
        }

        res.json(doctor);
    } else {
        res.status(404).json({ message: 'Doctor not found' });
    }
};

// @desc    Update doctor profile
// @route   PATCH /api/doctors/profile
// @access  Private (Doctor only)
const updateDoctorProfile = async (req, res) => {
    const doctor = await Doctor.findOne({ userId: req.user._id });

    if (doctor) {
        doctor.specialty = req.body.specialty || doctor.specialty;
        doctor.experience = req.body.experience || doctor.experience;
        doctor.fee = req.body.fee || doctor.fee;
        doctor.clinicAddress = req.body.clinicAddress || doctor.clinicAddress;

        if (req.file) {
            // Update user image as well
            const user = await User.findById(req.user._id);
            user.image = req.file.path;
            await user.save();
        }

        const updatedDoctor = await doctor.save();

        // Log PHI write access
        if (process.env.SECURITY_LAYER_ENABLED !== 'false') {
            try {
                const phiAudit = require('../security/phiAudit');
                const threatEngine = require('../security/threatEngine');
                const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
                phiAudit.logAccess({
                    userId: req.user._id.toString(),
                    patientId: req.user._id.toString(),
                    fields: ['patientName'],
                    reason: 'Update doctor profile',
                    ip: threatEngine.cleanIP(clientIp),
                    action: 'WRITE'
                });
            } catch (err) {
                console.error('[Security] PHI log failure:', err.message);
            }
        }

        res.json(updatedDoctor);
    } else {
        res.status(404).json({ message: 'Doctor profile not found' });
    }
};

// @desc    Toggle doctor availability
// @route   PATCH /api/doctors/availability
// @access  Private (Doctor only)
const toggleAvailability = async (req, res) => {
    const doctor = await Doctor.findOne({ userId: req.user._id });

    if (doctor) {
        if (req.body.available !== undefined) {
            doctor.available = req.body.available;
        } else {
            doctor.available = !doctor.available;
        }
        const updatedDoctor = await doctor.save();
        res.json({ available: updatedDoctor.available });
    } else {
        res.status(404).json({ message: 'Doctor profile not found' });
    }
};

// @desc    Request withdrawal from doctor wallet
// @route   POST /api/doctors/withdraw
// @access  Private (Doctor only)
const requestWithdrawal = async (req, res, next) => {
    try {
        const { amount } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: 'Please enter a valid withdrawal amount' });
        }

        const doctor = await Doctor.findOne({ userId: req.user._id });
        if (!doctor) {
            return res.status(404).json({ message: 'Doctor profile not found' });
        }

        if (amount > doctor.walletBalance) {
            return res.status(400).json({ message: 'Insufficient wallet balance' });
        }

        doctor.walletBalance = Number((doctor.walletBalance - amount).toFixed(2));
        doctor.walletTransactions.push({
            amount: amount,
            type: 'withdrawal',
            description: `Withdrawal processed (Amount: $${amount})`,
            status: 'completed',
            date: new Date()
        });

        const updated = await doctor.save();
        
        logBackendActivity('Withdrawal Processed', `Doctor ${req.user.email} withdrew $${amount}. New balance: $${doctor.walletBalance}`);

        res.json(updated);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getDoctors,
    getDoctorById,
    updateDoctorProfile,
    toggleAvailability,
    requestWithdrawal
};
