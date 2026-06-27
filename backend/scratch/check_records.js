const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB.');

        const usersCount = await User.countDocuments();
        const doctorsCount = await Doctor.countDocuments();
        const apptsCount = await Appointment.countDocuments();

        console.log(`Counts -> Users: ${usersCount}, Doctors: ${doctorsCount}, Appointments: ${apptsCount}`);

        console.log('\n--- DOCTORS ---');
        const doctors = await Doctor.find().populate('userId', 'name email role');
        doctors.forEach(d => {
            console.log(`Doctor ID: ${d._id}, User: ${d.userId?.name} (${d.userId?.email}), Specialty: ${d.specialty}, Available: ${d.available}`);
        });

        console.log('\n--- LATEST APPOINTMENTS ---');
        const appts = await Appointment.find().populate('patientId', 'name email').populate({
            path: 'doctorId',
            populate: { path: 'userId', select: 'name email' }
        }).sort({ createdAt: -1 }).limit(10);

        appts.forEach(a => {
            console.log(`Appt ID: ${a._id}`);
            console.log(`  Patient: ${a.patientId?.name || 'unknown'} (${a.patientId?.email || 'unknown'}) [ID: ${a.patientId?._id || a.patientId}]`);
            console.log(`  Doctor: ${a.doctorId?.userId?.name || 'unknown'} (${a.doctorId?.userId?.email || 'unknown'}) [Doc ID: ${a.doctorId?._id || a.doctorId}]`);
            console.log(`  Date/Time: ${a.date.toISOString().slice(0, 10)} at ${a.time}`);
            console.log(`  Status: ${a.status}`);
        });

        process.exit(0);
    } catch (err) {
        console.error('Error running check:', err);
        process.exit(1);
    }
}

check();
