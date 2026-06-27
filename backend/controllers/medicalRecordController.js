const MedicalRecord = require('../models/MedicalRecord');
const User = require('../models/User');

// @desc    Create a new medical record
// @route   POST /api/medical-records
// @access  Private (Patient only)
const createMedicalRecord = async (req, res, next) => {
    try {
        const { fileName, fileType, fileData, fileSize } = req.body;

        if (!fileName || !fileType || !fileData) {
            return res.status(400).json({ message: 'Please provide fileName, fileType, and fileData' });
        }

        const medicalRecord = await MedicalRecord.create({
            userEmail: req.user.email,
            fileName,
            fileType,
            fileData,
            fileSize,
            uploadDate: new Date()
        });

        // PHI write logging
        if (process.env.SECURITY_LAYER_ENABLED !== 'false') {
            try {
                const phiAudit = require('../security/phiAudit');
                const threatEngine = require('../security/threatEngine');
                const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
                phiAudit.logAccess({
                    userId: req.user._id.toString(),
                    patientId: req.user._id.toString(),
                    fields: ['medicalRecords'],
                    reason: 'Upload medical record',
                    ip: threatEngine.cleanIP(clientIp),
                    action: 'WRITE'
                });
            } catch (err) {
                console.error('[Security] PHI log failure:', err.message);
            }
        }

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

        if (req.user.role === 'doctor') {
            targetEmail = req.query.email;
            if (!targetEmail) {
                return res.status(400).json({ message: 'Patient email query parameter is required for doctor access' });
            }
        } else {
            // Patients can only view their own records
            targetEmail = req.user.email;
        }

        const records = await MedicalRecord.find({ userEmail: targetEmail }).sort({ uploadDate: -1 });

        // PHI read logging
        if (process.env.SECURITY_LAYER_ENABLED !== 'false') {
            try {
                const phiAudit = require('../security/phiAudit');
                const threatEngine = require('../security/threatEngine');
                const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
                
                // Find patient user id if possible for audit logs
                const patientUser = await User.findOne({ email: targetEmail });
                const patientId = patientUser ? patientUser._id.toString() : targetEmail;

                phiAudit.logAccess({
                    userId: req.user._id.toString(),
                    patientId,
                    fields: ['medicalRecords'],
                    reason: req.user.role === 'doctor' ? 'Doctor read patient medical records' : 'Read own medical records',
                    ip: threatEngine.cleanIP(clientIp),
                    action: 'READ'
                });
            } catch (err) {
                console.error('[Security] PHI log failure:', err.message);
            }
        }

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
        if (record.userEmail !== req.user.email) {
            return res.status(403).json({ message: 'Not authorized to delete this medical record' });
        }

        await record.deleteOne();

        // PHI write logging
        if (process.env.SECURITY_LAYER_ENABLED !== 'false') {
            try {
                const phiAudit = require('../security/phiAudit');
                const threatEngine = require('../security/threatEngine');
                const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip;
                phiAudit.logAccess({
                    userId: req.user._id.toString(),
                    patientId: req.user._id.toString(),
                    fields: ['medicalRecords'],
                    reason: 'Delete medical record',
                    ip: threatEngine.cleanIP(clientIp),
                    action: 'WRITE'
                });
            } catch (err) {
                console.error('[Security] PHI log failure:', err.message);
            }
        }

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
