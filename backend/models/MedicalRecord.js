const mongoose = require('mongoose');

const medicalRecordSchema = mongoose.Schema({
    userEmail: {
        type: String,
        required: true,
        index: true
    },
    fileName: {
        type: String,
        required: true
    },
    fileType: {
        type: String,
        required: true,
        enum: ['xray', 'lab', 'report'] // xray: X-Rays, lab: Lab Tests, report: Prescriptions
    },
    fileData: {
        type: String, // Base64 data URI
        required: true
    },
    fileSize: {
        type: Number
    },
    uploadDate: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('MedicalRecord', medicalRecordSchema);
