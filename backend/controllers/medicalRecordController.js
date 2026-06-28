const MedicalRecord = require('../models/MedicalRecord');
const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');
const fileScan = require('../security/fileScan');
const { recordAdminAction } = require('../security/auditLog');

const decodeFileData = (fileData) => {
    const raw = String(fileData || '');
    const match = raw.match(/^data:([^;]+);base64,(.*)$/);
    if (match) {
        return {
            mime: match[1],
            buffer: Buffer.from(match[2], 'base64')
        };
    }
    return {
        mime: '',
        buffer: Buffer.from(raw, 'base64')
    };
};

// @desc    Create a new medical record
// @route   POST /api/medical-records
// @access  Private (Patient only)
const createMedicalRecord = async (req, res, next) => {
    try {
        const { fileName, fileType, fileData, fileSize } = req.body;

        if (!fileName || !fileType || !fileData) {
            return res.status(400).json({ message: 'Please provide fileName, fileType, and fileData' });
        }

        const decoded = decodeFileData(fileData);
        const scanResult = fileScan.scan(decoded.buffer, fileName, fileType || decoded.mime);
        fileScan.recordScan({
            file: {
                originalname: fileName,
                mimetype: fileType || decoded.mime,
                size: decoded.buffer.length,
                buffer: decoded.buffer
            },
            result: scanResult,
            req,
            userInfo: {
                username: req.user.name,
                email: req.user.email,
                role: req.user.role
            },
            uploadLocation: 'Medical records',
            accountActivity: 'Upload medical record'
        });

        if (!scanResult.safe) {
            return res.status(400).json({
                message: 'File failed security validation',
                reason: scanResult.reason || 'Blocked by file scanner',
                threats: scanResult.threats || []
            });
        }

        const medicalRecord = await MedicalRecord.create({
            userEmail: req.user.email,
            fileName,
            fileType,
            fileData,
            fileSize,
            uploadDate: new Date()
        });

        // Return expected frontend structure
        res.status(201).json({
            id: medicalRecord._id,
            _id: medicalRecord._id,
            userEmail: medicalRecord.userEmail,
            fileName: medicalRecord.fileName,
            fileType: medicalRecord.fileType,
            fileData: medicalRecord.fileData,
            fileSize: medicalRecord.fileSize,
            uploadDate: medicalRecord.uploadDate
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Get medical records for a patient
// @route   GET /api/medical-records
// @access  Private (Patient or Doctor)
const getMedicalRecords = async (req, res, next) => {
    try {
        let targetEmail;

        if (req.user.role === 'admin') {
            targetEmail = req.query.email;
            if (!targetEmail) {
                return res.status(400).json({ message: 'Patient email query parameter is required for admin access' });
            }
            recordAdminAction(req, 'MEDICAL_RECORDS_VIEW_AS_ADMIN', { patientEmail: targetEmail });
        } else if (req.user.role === 'doctor') {
            targetEmail = req.query.email;
            if (!targetEmail) {
                return res.status(400).json({ message: 'Patient email query parameter is required for doctor access' });
            }
            const patient = await User.findOne({ email: targetEmail, role: 'patient' }).select('_id email');
            if (!patient) {
                return res.status(404).json({ message: 'Patient not found' });
            }
            const doctor = await Doctor.findOne({ userId: req.user._id }).select('_id');
            if (!doctor) {
                return res.status(403).json({ message: 'Doctor profile not found' });
            }
            const relationship = await Appointment.exists({
                doctorId: doctor._id,
                patientId: patient._id,
                status: { $in: ['confirmed', 'completed'] }
            });
            if (!relationship) {
                return res.status(403).json({ message: 'Not authorized to access records for this patient' });
            }
        } else {
            // Patients can only view their own records
            targetEmail = req.user.email;
        }

        const records = await MedicalRecord.find({ userEmail: targetEmail }).sort({ uploadDate: -1 });

        // Format for frontend mapping
        const formattedRecords = records.map(rec => ({
            id: rec._id,
            _id: rec._id,
            userEmail: rec.userEmail,
            fileName: rec.fileName,
            fileType: rec.fileType,
            fileData: rec.fileData,
            fileSize: rec.fileSize,
            uploadDate: rec.uploadDate
        }));

        res.json(formattedRecords);
    } catch (error) {
        next(error);
    }
};

// @desc    Delete a medical record
// @route   DELETE /api/medical-records/:id
// @access  Private (Patient owner only)
const deleteMedicalRecord = async (req, res, next) => {
    try {
        const record = await MedicalRecord.findById(req.params.id);

        if (!record) {
            return res.status(404).json({ message: 'Medical record not found' });
        }

        // Check ownership
        if (req.user.role === 'admin') {
            recordAdminAction(req, 'MEDICAL_RECORD_DELETE_AS_ADMIN', { recordId: req.params.id, patientEmail: record.userEmail });
        } else if (record.userEmail !== req.user.email) {
            return res.status(403).json({ message: 'Not authorized to delete this medical record' });
        }

        await record.deleteOne();

        res.json({ message: 'Medical record deleted successfully' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createMedicalRecord,
    getMedicalRecords,
    deleteMedicalRecord
};
