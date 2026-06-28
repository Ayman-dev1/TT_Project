const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const generateToken = require('../utils/generateToken');
const fs = require('fs');
const path = require('path');
const { readAudit, recordAdminAction } = require('../security/auditLog');
const ACTIVITY_LOGS_FILE = path.join(__dirname, '..', 'activity_logs.json');
const asString = (value) => typeof value === 'string' ? value.trim() : '';
const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

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

// @desc    Admin login
// @route   POST /api/admin/login
// @access  Public
const adminLogin = async (req, res) => {
    const email = asString(req.body?.email).toLowerCase();
    const password = asString(req.body?.password);
    if (!isValidEmail(email) || !password) {
        return res.status(401).json({ message: 'Invalid admin credentials' });
    }

    const user = await User.findOne({ email, role: 'admin' });

    if (user && (await user.matchPassword(password))) {
        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            token: generateToken(user._id)
        });
    } else {
        res.status(401).json({ message: 'Invalid admin credentials' });
    }
};

// @desc    Get dashboard stats
// @route   GET /api/admin/stats
// @access  Private (Admin only)
const getStats = async (req, res) => {
    const totalDoctors = await Doctor.countDocuments();
    const totalPatients = await User.countDocuments({ role: 'patient' });
    const totalAppointments = await Appointment.countDocuments();
    const completedAppointments = await Appointment.find({ status: 'completed' });
    
    const totalEarnings = completedAppointments.reduce((acc, curr) => acc + curr.amount, 0);

    const latestAppointments = await Appointment.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('patientId', 'name')
        .populate({
            path: 'doctorId',
            populate: { path: 'userId', select: 'name' }
        });

    res.json({
        totalDoctors,
        totalPatients,
        totalAppointments,
        totalEarnings,
        latestAppointments
    });
};

// @desc    Get all doctors for admin
// @route   GET /api/admin/doctors
// @access  Private (Admin only)
const getAllDoctorsAdmin = async (req, res) => {
    const doctors = await Doctor.find({}).populate('userId', 'name email image');
    res.json(doctors);
};

// @desc    Delete a doctor
// @route   DELETE /api/admin/doctors/:id
// @access  Private (Admin only)
const deleteDoctor = async (req, res) => {
    const doctor = await Doctor.findById(req.params.id);

    if (doctor) {
        await User.findByIdAndDelete(doctor.userId);
        await Doctor.findByIdAndDelete(req.params.id);
        recordAdminAction(req, 'DOCTOR_DELETE', { doctorId: req.params.id, userId: doctor.userId });
        res.json({ message: 'Doctor and associated user removed' });
    } else {
        res.status(404).json({ message: 'Doctor not found' });
    }
};

// @desc    Get all appointments for admin
// @route   GET /api/admin/appointments
// @access  Private (Admin only)
const getAllAppointmentsAdmin = async (req, res) => {
    const appointments = await Appointment.find({})
        .populate('patientId', 'name email')
        .populate({
            path: 'doctorId',
            populate: { path: 'userId', select: 'name' }
        })
        .sort({ date: -1 });
    res.json(appointments);
};

// @desc    Update a doctor
// @route   PATCH /api/admin/doctors/:id
// @access  Private (Admin only)
const updateDoctorAdmin = async (req, res) => {
    const doctor = await Doctor.findById(req.params.id);

    if (doctor) {
        doctor.specialty = req.body.specialty || doctor.specialty;
        doctor.fee = req.body.fee || doctor.fee;
        doctor.experience = req.body.experience || doctor.experience;
        doctor.degree = req.body.degree || doctor.degree;
        doctor.about = req.body.about || doctor.about;
        doctor.clinicAddress = req.body.clinicAddress || doctor.clinicAddress;
        doctor.available = req.body.available !== undefined ? req.body.available : doctor.available;

        const user = await User.findById(doctor.userId);
        if (user) {
            user.name = req.body.name || user.name;
            user.email = req.body.email || user.email;
            if (req.body.image) user.image = req.body.image;
            await user.save();
        }

        await doctor.save();
        recordAdminAction(req, 'DOCTOR_UPDATE', { doctorId: req.params.id, userId: doctor.userId }, req.body);
        res.json({ message: 'Doctor updated successfully' });
    } else {
        res.status(404).json({ message: 'Doctor not found' });
    }
};

// @desc    Get all patients for admin
// @route   GET /api/admin/patients
// @access  Private (Admin only)
const getAllPatientsAdmin = async (req, res, next) => {
    try {
        const patients = await User.find({ role: 'patient' }).select('-password');
        res.json(patients);
    } catch (error) {
        next(error);
    }
};

// @desc    Delete a patient
// @route   DELETE /api/admin/patients/:id
// @access  Private (Admin only)
const deletePatient = async (req, res, next) => {
    try {
        const user = await User.findOne({ _id: req.params.id, role: 'patient' });
        if (user) {
            await User.findByIdAndDelete(req.params.id);
            // Delete all appointments of this patient
            await Appointment.deleteMany({ patientId: req.params.id });
            recordAdminAction(req, 'PATIENT_DELETE', { patientId: req.params.id, email: user.email });
            res.json({ message: 'Patient removed successfully' });
        } else {
            res.status(404).json({ message: 'Patient not found' });
        }
    } catch (error) {
        next(error);
    }
};

// @desc    Update appointment payment status (Approve/Reject)
// @route   PATCH /api/admin/appointments/:id/payment
// @access  Private (Admin only)
const updateAppointmentPaymentAdmin = async (req, res, next) => {
    try {
        const appointment = await Appointment.findById(req.params.id)
            .populate('patientId', 'email');
        if (appointment) {
            const { paymentStatus, rejectionReason } = req.body;
            
            const patientEmail = appointment.patientId?.email || 'Patient';

            if (paymentStatus === 'Paid') {
                if (appointment.paymentStatus !== 'Paid') {
                    const COMMISSION_RATE = 0.15; // 15% platform fee
                    const amount = appointment.amount;
                    const commission = Number((amount * COMMISSION_RATE).toFixed(2));
                    const netAmount = Number((amount - commission).toFixed(2));

                    appointment.commission = commission;
                    appointment.netAmount = netAmount;
                    appointment.paymentStatus = 'Paid';
                    appointment.status = 'confirmed';
                    appointment.paymentDate = new Date();
                    appointment.rejectionReason = ''; // Clear rejection reason

                    const doctor = await Doctor.findById(appointment.doctorId);
                    if (doctor) {
                        doctor.walletBalance = Number((doctor.walletBalance + netAmount).toFixed(2));
                        doctor.totalEarnings = Number((doctor.totalEarnings + netAmount).toFixed(2));
                        // Keep legacy earnings field in sync
                        doctor.earnings = doctor.totalEarnings;
                        doctor.patientsTreated = (doctor.patientsTreated || 0) + 1;
                        doctor.walletTransactions.push({
                            amount: netAmount,
                            type: 'earning',
                            description: `Earnings for Appointment ID: ${appointment._id} (Fee: $${amount}, 15% Platform Commission: $${commission})`,
                            status: 'completed',
                            date: new Date()
                        });
                        await doctor.save();
                    }
                }
                
                logBackendActivity('Payment Approved', `Admin approved payment for Booking ${appointment._id} (${patientEmail})`);
            } else if (paymentStatus === 'Rejected') {
                appointment.paymentStatus = 'Rejected';
                appointment.status = 'pending'; // Keep status as pending as requested
                appointment.rejectionReason = rejectionReason || 'Payment Not Received';
                appointment.paymentDate = null; // Clear if rejected
                
                logBackendActivity('Payment Rejected', `Admin rejected payment for Booking ${appointment._id} (${patientEmail}). Reason: ${rejectionReason}`);
            }

            const updatedAppointment = await appointment.save();
            recordAdminAction(req, 'APPOINTMENT_PAYMENT_UPDATE', { appointmentId: req.params.id, patientEmail }, { paymentStatus, rejectionReason });
            res.json(updatedAppointment);
        } else {
            res.status(404).json({ message: 'Appointment not found' });
        }
    } catch (error) {
        next(error);
    }
};

const getAdminAudit = async (req, res) => {
    res.json(readAudit().slice(0, 250));
};

module.exports = {
    adminLogin,
    getStats,
    getAllDoctorsAdmin,
    deleteDoctor,
    getAllAppointmentsAdmin,
    updateDoctorAdmin,
    getAllPatientsAdmin,
    deletePatient,
    updateAppointmentPaymentAdmin,
    getAdminAudit
};
