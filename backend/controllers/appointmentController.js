const Appointment = require('../models/Appointment');
const Doctor = require('../models/Doctor');
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

// @desc    Book an appointment
// @route   POST /api/appointments
// @access  Private (Patient only)
const bookAppointment = async (req, res, next) => {
    try {
        const { doctorId, date, time, amount, payment, paymentMethod: inputMethod, transactionRef } = req.body;

        // Check if doctor exists and is available
        if (!mongoose.Types.ObjectId.isValid(doctorId)) {
            return res.status(400).json({ message: 'Invalid doctor ID format' });
        }
        const doctor = await Doctor.findById(doctorId);
        if (!doctor) {
            return res.status(404).json({ message: 'Doctor not found' });
        }
        if (!doctor.available) {
            return res.status(400).json({ message: 'This doctor is currently unavailable and cannot accept new bookings' });
        }

        let paymentMethod = inputMethod || payment || 'cash';
        if (!['cash', 'vodafone', 'instapay'].includes(paymentMethod)) {
            paymentMethod = 'cash';
        }

        // Validate that online payments have a transaction reference
        if ((paymentMethod === 'vodafone' || paymentMethod === 'instapay') && (!transactionRef || transactionRef.trim() === '')) {
            return res.status(400).json({ message: 'Transaction reference is required' });
        }

        // Check for duplicate references
        if (transactionRef && transactionRef.trim() !== '') {
            const existing = await Appointment.findOne({ transactionRef, paymentMethod });
            if (existing) {
                logBackendActivity('Suspicious Attempt', `Patient ${req.user.email} attempted to book with duplicate reference ${transactionRef} for ${paymentMethod}`);
                return res.status(400).json({ message: 'Transaction reference already used' });
            }
        }

        const paymentStatus = paymentMethod === 'cash' ? 'Pending' : 'Pending Verification';

        const appointment = await Appointment.create({
            patientId: req.user._id,
            doctorId,
            date,
            time,
            amount,
            payment: paymentMethod, // Keep for backward compatibility
            paymentMethod,
            paymentStatus,
            transactionRef: transactionRef || ''
        });

        if (appointment) {
            logBackendActivity('Payment Submitted', `Patient ${req.user.email} submitted payment details for Booking ${appointment._id}`);

            // Record appointment booking in security guard
            if (process.env.SECURITY_LAYER_ENABLED !== 'false' && process.env.SECURITY_APPOINTMENT_GUARD_ENABLED !== 'false') {
                try {
                    const appointmentGuard = require('../security/appointmentGuard');
                    const threatEngine = require('../security/threatEngine');
                    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
                    appointmentGuard.recordBooking({
                        bookingId: appointment._id.toString(),
                        userId: req.user._id.toString(),
                        doctorId,
                        ip: threatEngine.cleanIP(clientIp)
                    });
                } catch (err) {
                    console.error('[Security] Failed to record booking in guard:', err.message);
                }
            }

            // Log PHI write access
            if (process.env.SECURITY_LAYER_ENABLED !== 'false') {
                try {
                    const phiAudit = require('../security/phiAudit');
                    const threatEngine = require('../security/threatEngine');
                    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
                    phiAudit.logAccess({
                        userId: req.user._id.toString(),
                        patientId: req.user._id.toString(),
                        fields: ['patientName', 'phone'],
                        reason: 'Book appointment',
                        ip: threatEngine.cleanIP(clientIp),
                        action: 'WRITE',
                        meta: { appointmentId: appointment._id.toString() }
                    });
                } catch (err) {
                    console.error('[Security] PHI log failure:', err.message);
                }
            }

            res.status(201).json(appointment);
        } else {
            res.status(400).json({ message: 'Invalid appointment data' });
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Get patient's appointments
// @route   GET /api/appointments/user
// @access  Private (Patient only)
const getUserAppointments = async (req, res, next) => {
    try {
        const appointments = await Appointment.find({ patientId: req.user._id })
            .populate({
                path: 'doctorId',
                populate: { path: 'userId', select: 'name image' }
            });

        // Log PHI read access
        if (process.env.SECURITY_LAYER_ENABLED !== 'false') {
            try {
                const phiAudit = require('../security/phiAudit');
                const threatEngine = require('../security/threatEngine');
                const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
                phiAudit.logAccess({
                    userId: req.user._id.toString(),
                    patientId: req.user._id.toString(),
                    fields: ['patientName', 'diagnosis'],
                    reason: 'Get patient appointments list',
                    ip: threatEngine.cleanIP(clientIp),
                    action: 'READ',
                    meta: { count: appointments.length }
                });
            } catch (err) {
                console.error('[Security] PHI log failure:', err.message);
            }
        }

        res.json(appointments);
    } catch (error) {
        next(error);
    }
};

// @desc    Get doctor's appointments
// @route   GET /api/appointments/doctor
// @access  Private (Doctor only)
const getDoctorAppointments = async (req, res, next) => {
    try {
        const doctor = await Doctor.findOne({ userId: req.user._id });
        
        if (!doctor) {
            return res.status(404).json({ message: 'Doctor profile not found' });
        }

        const appointments = await Appointment.find({ doctorId: doctor._id })
            .populate('patientId', 'name email phone');

        // Log PHI read access
        if (process.env.SECURITY_LAYER_ENABLED !== 'false') {
            try {
                const phiAudit = require('../security/phiAudit');
                const threatEngine = require('../security/threatEngine');
                const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
                phiAudit.logAccess({
                    userId: req.user._id.toString(),
                    patientId: 'MULTIPLE_PATIENTS',
                    fields: ['patientName', 'phone', 'email', 'diagnosis'],
                    reason: 'Get doctor appointments list',
                    ip: threatEngine.cleanIP(clientIp),
                    action: 'READ',
                    meta: { count: appointments.length }
                });
            } catch (err) {
                console.error('[Security] PHI log failure:', err.message);
            }
        }

        res.json(appointments);
    } catch (error) {
        next(error);
    }
};

// @desc    Cancel an appointment
// @route   PATCH /api/appointments/cancel
// @access  Private
const cancelAppointment = async (req, res, next) => {
    try {
        const { appointmentId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
            return res.status(400).json({ message: 'Invalid appointment ID format' });
        }

        const appointment = await Appointment.findById(appointmentId);

        if (appointment) {
            // Check cancellation speed/abuse
            if (process.env.SECURITY_LAYER_ENABLED !== 'false' && process.env.SECURITY_APPOINTMENT_GUARD_ENABLED !== 'false') {
                try {
                    const appointmentGuard = require('../security/appointmentGuard');
                    const logger = require('../security/logger');
                    const { cairoNow } = require('../security/timeUtils');
                    const result = appointmentGuard.checkCancellation(appointmentId);
                    if (result.suspicious) {
                        const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
                        const cleanIp = require('../security/threatEngine').cleanIP(clientIp);
                        const entry = {
                            ip: cleanIp, type: 'RAPID_CANCEL', score: 40,
                            action: 'FLAGGED', time: cairoNow(),
                            path: req.originalUrl, method: req.method,
                            payload: result.reason,
                            analysis: { type: 'RAPID_CANCEL', risk: 'MEDIUM', target: `Booking ${appointmentId}`, technique: result.reason }
                        };
                        entry.isoTime = new Date().toISOString();
                        logger(entry);
                        if (req.io) req.io.emit('attack', entry);
                    }
                } catch (err) {
                    console.error('[Security] Failed to check booking cancellation:', err.message);
                }
            }

            appointment.status = 'cancelled';
            const updatedAppointment = await appointment.save();

            // Log PHI delete/cancel access
            if (process.env.SECURITY_LAYER_ENABLED !== 'false') {
                try {
                    const phiAudit = require('../security/phiAudit');
                    const threatEngine = require('../security/threatEngine');
                    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
                    phiAudit.logAccess({
                        userId: req.user._id.toString(),
                        patientId: appointment.patientId.toString(),
                        fields: ['patientName'],
                        reason: 'Cancel appointment',
                        ip: threatEngine.cleanIP(clientIp),
                        action: 'DELETE',
                        meta: { appointmentId: appointment._id.toString() }
                    });
                } catch (err) {
                    console.error('[Security] PHI log failure:', err.message);
                }
            }

            res.json(updatedAppointment);
        } else {
            res.status(404).json({ message: 'Appointment not found' });
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Complete an appointment
// @route   PATCH /api/appointments/complete
// @access  Private (Doctor only)
const completeAppointment = async (req, res, next) => {
    try {
        const { appointmentId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(appointmentId)) {
            return res.status(400).json({ message: 'Invalid appointment ID format' });
        }

        const appointment = await Appointment.findById(appointmentId);

        if (appointment) {
            const wasConfirmed = appointment.status === 'confirmed';
            appointment.status = 'completed';
            
            // Get the Doctor
            const doctor = await Doctor.findById(appointment.doctorId);
            if (doctor) {
                if (appointment.paymentMethod === 'cash') {
                    // For Cash at clinic, doctor gets 100% in hand. Platform deducts 15% commission from doctor's wallet.
                    const COMMISSION_RATE = 0.15;
                    const amount = appointment.amount;
                    const commission = Number((amount * COMMISSION_RATE).toFixed(2));
                    const netAmount = Number((amount - commission).toFixed(2));

                    appointment.commission = commission;
                    appointment.netAmount = netAmount;
                    appointment.paymentStatus = 'Paid';
                    appointment.paymentDate = new Date();

                    doctor.walletBalance = Number((doctor.walletBalance - commission).toFixed(2));
                    doctor.totalEarnings = Number((doctor.totalEarnings + netAmount).toFixed(2));
                    doctor.earnings = doctor.totalEarnings;
                    doctor.walletTransactions.push({
                        amount: commission,
                        type: 'withdrawal',
                        description: `Platform Commission (15%) for Cash Booking ${appointment._id} (Collected in clinic: $${amount})`,
                        status: 'completed',
                        date: new Date()
                    });
                }
                
                if (!wasConfirmed) {
                    doctor.patientsTreated = (doctor.patientsTreated || 0) + 1;
                }
                await doctor.save();
            }

            const updatedAppointment = await appointment.save();

            // Log PHI completion access
            if (process.env.SECURITY_LAYER_ENABLED !== 'false') {
                try {
                    const phiAudit = require('../security/phiAudit');
                    const threatEngine = require('../security/threatEngine');
                    const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
                    phiAudit.logAccess({
                        userId: req.user._id.toString(),
                        patientId: appointment.patientId.toString(),
                        fields: ['patientName', 'diagnosis'],
                        reason: 'Complete appointment',
                        ip: threatEngine.cleanIP(clientIp),
                        action: 'WRITE',
                        meta: { appointmentId: appointment._id.toString() }
                    });
                } catch (err) {
                    console.error('[Security] PHI log failure:', err.message);
                }
            }

            res.json(updatedAppointment);
        } else {
            res.status(404).json({ message: 'Appointment not found' });
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Resubmit transaction reference for rejected/pending verification payment
// @route   PATCH /api/appointments/:id/resubmit-payment
// @access  Private (Patient only)
const resubmitAppointmentPayment = async (req, res, next) => {
    try {
        const { transactionRef } = req.body;
        const appointmentId = req.params.id;

        if (!transactionRef || transactionRef.trim() === '') {
            return res.status(400).json({ message: 'Transaction reference is required' });
        }

        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) {
            return res.status(404).json({ message: 'Appointment not found' });
        }

        // Enforce duplicate check, excluding current appointment
        const existing = await Appointment.findOne({ 
            transactionRef, 
            paymentMethod: appointment.paymentMethod,
            _id: { $ne: appointmentId }
        });
        if (existing) {
            logBackendActivity('Suspicious Attempt', `Patient ${req.user.email} attempted to resubmit duplicate reference ${transactionRef} for ${appointment.paymentMethod}`);
            return res.status(400).json({ message: 'Transaction reference already used' });
        }

        appointment.transactionRef = transactionRef;
        appointment.paymentStatus = 'Pending Verification';
        appointment.rejectionReason = ''; // Clear previous rejection reason
        
        const updated = await appointment.save();

        logBackendActivity('Reference Resubmitted', `Patient ${req.user.email} resubmitted payment reference ${transactionRef} for Booking ${appointmentId}`);

        res.json(updated);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    bookAppointment,
    getUserAppointments,
    getDoctorAppointments,
    cancelAppointment,
    completeAppointment,
    resubmitAppointmentPayment
};
