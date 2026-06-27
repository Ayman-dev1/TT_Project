const mongoose = require('mongoose');

const appointmentSchema = mongoose.Schema({
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    time: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'completed', 'cancelled'],
        default: 'pending'
    },
    payment: {
        type: String,
        enum: ['cash', 'card', 'online', 'vodafone', 'instapay'],
        default: 'cash'
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'vodafone', 'instapay'],
        default: 'cash'
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Pending Verification', 'Paid', 'Rejected'],
        default: 'Pending'
    },
    transactionRef: {
        type: String,
        default: ''
    },
    rejectionReason: {
        type: String,
        default: ''
    },
    paymentDate: {
        type: Date,
        default: null
    },
    commission: {
        type: Number,
        default: 0
    },
    netAmount: {
        type: Number,
        default: 0
    },
    amount: {
        type: Number,
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Appointment', appointmentSchema);
