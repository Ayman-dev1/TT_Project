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
        console.log('Connecting to database...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected successfully.');

        // 1. Get or create a patient and doctor for testing
        let patient = await User.findOne({ role: 'patient' });
        if (!patient) {
            console.log('No patient found. Creating a test patient...');
            patient = await User.create({
                name: 'Test Patient',
                email: 'test_patient@example.com',
                password: 'password123',
                role: 'patient',
                dob: new Date('1990-01-01')
            });
        }

        let doctor = await Doctor.findOne();
        if (!doctor) {
            console.log('No doctor found. Seeding first doctor...');
            const docUser = await User.create({
                name: 'Test Doctor',
                email: 'test_doctor@example.com',
                password: 'password123',
                role: 'doctor',
                dob: new Date('1980-01-01')
            });
            doctor = await Doctor.create({
                userId: docUser._id,
                specialty: 'General physician',
                experience: 10,
                fee: 100,
                degree: 'MD',
                about: 'Test doctor description.',
                available: true,
                clinicAddress: '123 Test St, Cairo'
            });
        }

        // Clean up any old test appointments
        await Appointment.deleteMany({ patientId: patient._id, transactionRef: { $in: ['VODAFONE-TEST-111', 'VODAFONE-TEST-222'] } });

        console.log('\n--- STEP 1: Submit Vodafone Cash Payment ---');
        const appointment = await Appointment.create({
            patientId: patient._id,
            doctorId: doctor._id,
            date: new Date(Date.now() + 86400000), // Tomorrow
            time: '9:00 am',
            amount: doctor.fee,
            paymentMethod: 'vodafone',
            paymentStatus: 'Pending Verification',
            transactionRef: 'VODAFONE-TEST-111',
            status: 'pending'
        });

        console.log(`Appointment created with ID: ${appointment._id}`);
        console.log(`- paymentMethod: ${appointment.paymentMethod}`);
        console.log(`- paymentStatus: ${appointment.paymentStatus} (Expected: Pending Verification)`);
        console.log(`- transactionRef: ${appointment.transactionRef}`);
        console.log(`- status: ${appointment.status} (Expected: pending)`);

        if (appointment.paymentStatus !== 'Pending Verification' || appointment.status !== 'pending') {
            throw new Error('Step 1 Verification Failed!');
        }

        console.log('\n--- STEP 2: Reject Payment from Admin Dashboard ---');
        // Simulate updateAppointmentPaymentAdmin (paymentStatus = 'Rejected')
        appointment.paymentStatus = 'Rejected';
        appointment.status = 'pending'; // MUST remain pending so patient can resubmit
        appointment.rejectionReason = 'Invalid Transaction Reference';
        appointment.paymentDate = null;
        await appointment.save();

        const rejectedAppt = await Appointment.findById(appointment._id);
        console.log(`- paymentStatus: ${rejectedAppt.paymentStatus} (Expected: Rejected)`);
        console.log(`- status: ${rejectedAppt.status} (Expected: pending)`);
        console.log(`- rejectionReason: "${rejectedAppt.rejectionReason}" (Expected: Invalid Transaction Reference)`);

        if (rejectedAppt.paymentStatus !== 'Rejected' || rejectedAppt.status !== 'pending' || rejectedAppt.rejectionReason !== 'Invalid Transaction Reference') {
            throw new Error('Step 2 Verification Failed!');
        }

        console.log('\n--- STEP 3: Patient Resubmits a New Transaction Reference ---');
        // Check duplicates excluding self (mimics appointmentController.resubmitAppointmentPayment check)
        const dupCheck = await Appointment.findOne({
            transactionRef: 'VODAFONE-TEST-222',
            paymentMethod: rejectedAppt.paymentMethod,
            _id: { $ne: rejectedAppt._id }
        });
        if (dupCheck) {
            throw new Error('Duplicate reference check broke!');
        }

        rejectedAppt.transactionRef = 'VODAFONE-TEST-222';
        rejectedAppt.paymentStatus = 'Pending Verification';
        rejectedAppt.rejectionReason = ''; // Cleared on resubmission
        await rejectedAppt.save();

        const resubmittedAppt = await Appointment.findById(appointment._id);
        console.log(`- transactionRef: ${resubmittedAppt.transactionRef} (Expected: VODAFONE-TEST-222)`);
        console.log(`- paymentStatus: ${resubmittedAppt.paymentStatus} (Expected: Pending Verification)`);
        console.log(`- rejectionReason: "${resubmittedAppt.rejectionReason}" (Expected: empty)`);
        console.log(`- status: ${resubmittedAppt.status} (Expected: pending)`);

        if (resubmittedAppt.transactionRef !== 'VODAFONE-TEST-222' || resubmittedAppt.paymentStatus !== 'Pending Verification' || resubmittedAppt.rejectionReason !== '' || resubmittedAppt.status !== 'pending') {
            throw new Error('Step 3/4 Verification Failed!');
        }

        console.log('\n--- STEP 5: Approve Payment from Admin Dashboard ---');
        // Simulate updateAppointmentPaymentAdmin (paymentStatus = 'Paid')
        resubmittedAppt.paymentStatus = 'Paid';
        resubmittedAppt.status = 'confirmed';
        resubmittedAppt.paymentDate = new Date();
        await resubmittedAppt.save();

        const approvedAppt = await Appointment.findById(appointment._id);
        console.log(`- status: ${approvedAppt.status} (Expected: confirmed)`);
        console.log(`- paymentStatus: ${approvedAppt.paymentStatus} (Expected: Paid)`);
        console.log(`- paymentDate: ${approvedAppt.paymentDate} (Expected: Date object)`);

        if (approvedAppt.status !== 'confirmed' || approvedAppt.paymentStatus !== 'Paid' || !approvedAppt.paymentDate) {
            throw new Error('Step 5/6 Verification Failed!');
        }

        // Clean up test entry
        await Appointment.findByIdAndDelete(appointment._id);
        console.log('\n=======================================');
        console.log('✅ ALL TEST WORKFLOW STEPS PASSED SUCCESSFULLY!');
        console.log('=======================================');

        process.exit(0);
    } catch (err) {
        console.error('\n❌ TEST WORKFLOW FAILED:', err.message);
        process.exit(1);
    }
};

runTest();
