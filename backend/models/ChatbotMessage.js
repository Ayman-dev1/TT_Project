const mongoose = require('mongoose');

const chatbotMessageSchema = mongoose.Schema({
    userEmail: {
        type: String,
        required: true,
        index: true
    },
    role: {
        type: String,
        enum: ['user', 'ai'],
        required: true
    },
    text: {
        type: String,
        required: true
    },
    isEmergency: {
        type: Boolean,
        default: false
    },
    isOfflineFallback: {
        type: Boolean,
        default: false
    },
    isAr: {
        type: Boolean,
        default: false
    },
    doctors: {
        type: Array,
        default: []
    },
    specialty: {
        type: String,
        default: ''
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ChatbotMessage', chatbotMessageSchema);
