const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const Appointment = require('../models/Appointment');

async function testCancel() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB.');

        // Find the pending appointment
        const appt = await Appointment.findOne({ status: 'pending' });
        if (!appt) {
            console.log('No pending appointments found to cancel.');
            process.exit(0);
        }

        console.log(`Testing cancel on appointment: ${appt._id} (Patient: ${appt.patientId})`);

        // Generate JWT token for this patient
        const token = jwt.sign({ id: appt.patientId.toString() }, process.env.JWT_SECRET, { expiresIn: '1h' });
        console.log(`Generated JWT token.`);

        // Call the API endpoint
        console.log('Sending PATCH /api/appointments/cancel...');
        try {
            const response = await fetch('http://127.0.0.1:5000/api/appointments/cancel', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ appointmentId: appt._id.toString() })
            });

            console.log('STATUS:', response.status);
            const data = await response.json();
            console.log('RESPONSE DATA:', data);
        } catch (err) {
            console.error('API CALL FAILED:', err.message);
        }

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}

testCancel();
