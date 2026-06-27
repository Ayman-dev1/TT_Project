const mongoose = require('mongoose');

const chatMessageSchema = mongoose.Schema({
    chatKey: {
        type: String,
        required: true,
        index: true // e.g., "DoctorID_PatientEmail"
    },
    senderId: {
        type: String, // email
        required: true
    },
    senderRole: {
        type: String,
        enum: ['patient', 'doctor', 'admin'],
        required: true
    },
    text: {
        type: String,
        required: true
    },
    read: {
        type: Boolean,
        default: false
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
