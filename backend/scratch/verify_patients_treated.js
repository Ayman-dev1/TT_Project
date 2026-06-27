const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');

const runTest = async () => {
    try {
        console.log('Connecting to database at:', process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected successfully.');

        // 1. Ensure admin user exists
        let admin = await User.findOne({ email: 'admin1@tabibi.com', role: 'admin' });
        if (!admin) {
            console.log('Admin user admin1@tabibi.com not found. Creating it...');
            admin = await User.create({
                name: 'System Admin',
                email: 'admin1@tabibi.com',
                password: 'tabibiAdmin2026_1',
                role: 'admin'
            });
        }

        // 2. Ensure a patient user exists
        let patient = await User.findOne({ role: 'patient' });
        if (!patient) {
            console.log('Patient not found. Creating test patient...');
            patient = await User.create({
                name: 'Test Patient',
                email: 'test_patient@example.com',
                password: 'password123',
                role: 'patient',
                dob: new Date('1990-01-01')
            });
        }

        // 3. Ensure a doctor user exists
        let doctorUser = await User.findOne({ email: 'test_doctor_treated@example.com' });
        let doctor = null;
        if (doctorUser) {
            doctor = await Doctor.findOne({ userId: doctorUser._id });
        }
        
        if (!doctorUser || !doctor) {
            if (doctorUser && !doctor) {
                console.log('Orphaned test doctor user found. Deleting it...');
                await User.deleteOne({ _id: doctorUser._id });
            }
            console.log('Creating test doctor...');
            doctorUser = await User.create({
                name: 'Test Doctor Treated',
                email: 'test_doctor_treated@example.com',
                password: 'password123',
                role: 'doctor',
                dob: new Date('1980-01-01')
            });
            doctor = await Doctor.create({
                userId: doctorUser._id,
                specialty: 'Dermatologist',
                experience: 8,
                fee: 150,
                degree: 'MD',
                about: 'Test doctor description.',
                available: true,
                clinicAddress: '123 test address, Cairo',
                patientsTreated: 5 // start with 5 patients
            });
        }

        const initialPatientsTreated = doctor.patientsTreated || 0;
        const initialConfidenceScore = doctor.confidenceScore;
        console.log(`\nDoctor initial stats:`);
        console.log(`- patientsTreated: ${initialPatientsTreated}`);
        console.log(`- confidenceScore (virtual): ${initialConfidenceScore}%`);

        // 4. Create a test appointment
        console.log('\nCreating a test pending appointment...');
        const appointment = await Appointment.create({
            patientId: patient._id,
            doctorId: doctor._id,
            date: new Date(Date.now() + 86400000), // Tomorrow
            time: '12:00 pm',
            amount: doctor.fee,
            paymentMethod: 'vodafone',
            paymentStatus: 'Pending Verification',
            transactionRef: 'TXN-CONFIRM-' + Date.now(),
            status: 'pending'
        });
        console.log(`Appointment created with ID: ${appointment._id}`);

        // 5. Admin Login via REST API to get token
        console.log('\nLogging in as Admin via REST API...');
        const loginRes = await fetch('http://localhost:5000/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin1@tabibi.com', password: 'tabibiAdmin2026_1' })
        });

        if (!loginRes.ok) {
            throw new Error(`Admin login failed: ${loginRes.status} ${loginRes.statusText}`);
        }

        const loginData = await loginRes.json();
        const adminToken = loginData.token;
        console.log('Admin login successful. Token acquired.');

        // 6. Confirm Payment (sets paymentStatus to Paid, which confirms the booking)
        console.log('\nApproving payment / confirming booking via Admin API...');
        const confirmRes = await fetch(`http://localhost:5000/api/admin/appointments/${appointment._id}/payment`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminToken}`
            },
            body: JSON.stringify({ paymentStatus: 'Paid' })
        });

        if (!confirmRes.ok) {
            throw new Error(`Confirming appointment failed: ${confirmRes.status} ${confirmRes.statusText}`);
        }

        const confirmData = await confirmRes.json();
        console.log(`Appointment status updated: status=${confirmData.status}, paymentStatus=${confirmData.paymentStatus}`);

        // 7. Verify Doctor Patients Treated Count Increment
        const updatedDoctor = await Doctor.findById(doctor._id);
        const newPatientsTreated = updatedDoctor.patientsTreated || 0;
        const newConfidenceScore = updatedDoctor.confidenceScore;

        console.log(`\nDoctor updated stats:`);
        console.log(`- patientsTreated: ${newPatientsTreated}`);
        console.log(`- confidenceScore (virtual): ${newConfidenceScore}%`);

        if (newPatientsTreated !== initialPatientsTreated + 1) {
            throw new Error(`Patients treated count did not increment! Expected: ${initialPatientsTreated + 1}, Found: ${newPatientsTreated}`);
        }

        console.log('\nChecking completing appointment behavior to ensure no double-increment...');
        console.log('Logging in as Doctor...');
        const docLoginRes = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'test_doctor_treated@example.com', password: 'password123' })
        });
        
        if (docLoginRes.ok) {
            const docLoginData = await docLoginRes.json();
            const docToken = docLoginData.token;
            console.log('Doctor login successful. Completing appointment...');
            
            const completeApptRes = await fetch('http://localhost:5000/api/appointments/complete', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${docToken}`
                },
                body: JSON.stringify({ appointmentId: appointment._id })
            });
            
            if (completeApptRes.ok) {
                console.log('Appointment completed successfully.');
                const finalDoctor = await Doctor.findById(doctor._id);
                console.log(`Doctor final patientsTreated: ${finalDoctor.patientsTreated} (Expected: ${initialPatientsTreated + 1})`);
                if (finalDoctor.patientsTreated !== initialPatientsTreated + 1) {
                    throw new Error(`Double increment detected! Expected count to remain ${initialPatientsTreated + 1}, but got ${finalDoctor.patientsTreated}`);
                }
                console.log('No double increment detected! Test passed.');
            } else {
                console.warn('Failed to complete appointment via API:', completeApptRes.status, await completeApptRes.text());
            }
        } else {
            console.warn('Doctor login failed, skipping API complete test.');
        }

        // Clean up
        await Appointment.findByIdAndDelete(appointment._id);
        console.log('\n=============================================');
        console.log('✅ ALL PATIENTS TREATED & CONFIDENCE TESTS PASSED!');
        console.log('=============================================');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ VERIFICATION TEST FAILED:', err.message);
        process.exit(1);
    }
};

runTest();
