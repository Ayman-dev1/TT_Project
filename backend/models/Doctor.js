const mongoose = require('mongoose');

const doctorSchema = mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    specialty: {
        type: String,
        required: [true, 'Please add a specialty']
    },
    clinicAddress: {
        type: String,
        required: [true, 'Please add a clinic address']
    },
    experience: {
        type: Number,
        required: [true, 'Please add experience']
    },
    fee: {
        type: Number,
        required: [true, 'Please add a fee']
    },
    available: {
        type: Boolean,
        default: true
    },
    certificates: [{
        type: String
    }],
    degree: {
        type: String,
        default: 'MBBS'
    },
    about: {
        type: String,
        default: ''
    },
    earnings: {
        type: Number,
        default: 0
    },
    walletBalance: {
        type: Number,
        default: 0
    },
    totalEarnings: {
        type: Number,
        default: 0
    },
    walletTransactions: [{
        amount: {
            type: Number,
            required: true
        },
        type: {
            type: String,
            enum: ['earning', 'withdrawal'],
            required: true
        },
        description: {
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: ['pending', 'completed', 'failed'],
            default: 'completed'
        },
        date: {
            type: Date,
            default: Date.now
        }
    }],
    patientsTreated: {
        type: Number,
        default: 0
    },
    rating: {
        type: Number,
        default: 4.8
    },
    reviewsCount: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Calculate ratings-based confidence score
doctorSchema.virtual('confidenceScore').get(function() {
    const R = this.rating || 0;
    const v = this.reviewsCount || 0;
    const p = this.patientsTreated || 0;
    if (R === 0) return 0;
    const ratingPercentage = (R / 5) * 100;
    const reviewsFactor = v / (v + 5);
    const patientsFactor = p / (p + 15);
    const confidenceFactor = 0.5 * reviewsFactor + 0.5 * patientsFactor;
    return Math.round(ratingPercentage * confidenceFactor);
});

module.exports = mongoose.model('Doctor', doctorSchema);
