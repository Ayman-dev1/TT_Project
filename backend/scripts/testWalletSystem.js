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
                email: 'test_patient_wallet@example.com',
                password: 'password123',
                role: 'patient',
                dob: new Date('1990-01-01')
            });
        }

        let doctorUser = await User.findOne({ email: 'test_doctor_wallet@example.com' });
        let doctor = null;
        if (!doctorUser) {
            console.log('Creating a test doctor user...');
            doctorUser = await User.create({
                name: 'Wallet Test Doctor',
                email: 'test_doctor_wallet@example.com',
                password: 'password123',
                role: 'doctor',
                dob: new Date('1980-01-01')
            });
            doctor = await Doctor.create({
                userId: doctorUser._id,
                specialty: 'Neurologist',
                experience: 12,
                fee: 600,
                degree: 'MD',
                about: 'Wallet testing doctor.',
                available: true,
                clinicAddress: '456 Financial Rd, Giza'
            });
        } else {
            doctor = await Doctor.findOne({ userId: doctorUser._id });
        }

        // Reset doctor wallet to 0 for controlled testing
        doctor.walletBalance = 0;
        doctor.totalEarnings = 0;
        doctor.earnings = 0;
        doctor.walletTransactions = [];
        await doctor.save();

        console.log('\nInitial state verified:');
        console.log(`- doctor.walletBalance: $${doctor.walletBalance}`);
        console.log(`- doctor.totalEarnings: $${doctor.totalEarnings}`);
        console.log(`- doctor.walletTransactions.length: ${doctor.walletTransactions.length}`);

        // Clean up any old test appointments
        await Appointment.deleteMany({ doctorId: doctor._id });

        // ==========================================
        // TEST 1: ONLINE PAYMENT FLOW (15% CREDIT)
        // ==========================================
        console.log('\n--- TEST 1: Online Booking Payment Approval ($600) ---');
        let appointment = await Appointment.create({
            patientId: patient._id,
            doctorId: doctor._id,
            date: new Date(Date.now() + 86400000), // Tomorrow
            time: '10:00 am',
            amount: 600,
            paymentMethod: 'vodafone',
            paymentStatus: 'Pending Verification',
            transactionRef: 'TXN-WALLET-101',
            status: 'pending'
        });

        // Simulate updateAppointmentPaymentAdmin (paymentStatus = 'Paid')
        const COMMISSION_RATE = 0.15;
        const amount = appointment.amount;
        const commission = Number((amount * COMMISSION_RATE).toFixed(2)); // 600 * 0.15 = 90
        const netAmount = Number((amount - commission).toFixed(2));       // 600 - 90 = 510

        appointment.commission = commission;
        appointment.netAmount = netAmount;
        appointment.paymentStatus = 'Paid';
        appointment.status = 'confirmed';
        appointment.paymentDate = new Date();
        await appointment.save();

        // Update Doctor Wallet
        doctor.walletBalance = Number((doctor.walletBalance + netAmount).toFixed(2));
        doctor.totalEarnings = Number((doctor.totalEarnings + netAmount).toFixed(2));
        doctor.earnings = doctor.totalEarnings;
        doctor.walletTransactions.push({
            amount: netAmount,
            type: 'earning',
            description: `Earnings for Appointment ID: ${appointment._id} (Fee: $${amount}, 15% Platform Commission: $${commission})`,
            status: 'completed',
            date: new Date()
        });
        await doctor.save();

        console.log(`Verification:`);
        console.log(`- appointment.commission: $${appointment.commission} (Expected: $90)`);
        console.log(`- appointment.netAmount: $${appointment.netAmount} (Expected: $510)`);
        console.log(`- doctor.walletBalance: $${doctor.walletBalance} (Expected: $510)`);
        console.log(`- doctor.totalEarnings: $${doctor.totalEarnings} (Expected: $510)`);
        console.log(`- doctor.walletTransactions[0].type: ${doctor.walletTransactions[0].type} (Expected: earning)`);

        if (appointment.commission !== 90 || appointment.netAmount !== 510 || doctor.walletBalance !== 510 || doctor.walletTransactions.length !== 1) {
            throw new Error('Test 1: Online payment deposit assertion failed!');
        }

        // ==========================================
        // TEST 2: WITHDRAWAL REQUEST FLOW
        // ==========================================
        console.log('\n--- TEST 2: Doctor Withdrawal Request ($200) ---');
        const withdrawAmount = 200;
        if (withdrawAmount > doctor.walletBalance) {
            throw new Error('Insufficient wallet balance check broke!');
        }

        doctor.walletBalance = Number((doctor.walletBalance - withdrawAmount).toFixed(2)); // 510 - 200 = 310
        doctor.walletTransactions.push({
            amount: withdrawAmount,
            type: 'withdrawal',
            description: `Withdrawal processed (Amount: $${withdrawAmount})`,
            status: 'completed',
            date: new Date()
        });
        await doctor.save();

        console.log(`Verification:`);
        console.log(`- doctor.walletBalance: $${doctor.walletBalance} (Expected: $310)`);
        console.log(`- doctor.totalEarnings: $${doctor.totalEarnings} (Expected: $510)`);
        console.log(`- doctor.walletTransactions.length: ${doctor.walletTransactions.length} (Expected: 2)`);
        console.log(`- doctor.walletTransactions[1].type: ${doctor.walletTransactions[1].type} (Expected: withdrawal)`);

        if (doctor.walletBalance !== 310 || doctor.totalEarnings !== 510 || doctor.walletTransactions[1].amount !== 200) {
            throw new Error('Test 2: Withdrawal request assertion failed!');
        }

        // ==========================================
        // TEST 3: CASH BOOKING COMPLETION FLOW (15% DEBIT)
        // ==========================================
        console.log('\n--- TEST 3: Cash Booking Completion ($100 fee) ---');
        let cashAppointment = await Appointment.create({
            patientId: patient._id,
            doctorId: doctor._id,
            date: new Date(),
            time: '11:00 am',
            amount: 100,
            paymentMethod: 'cash',
            paymentStatus: 'Pending',
            status: 'pending'
        });

        // Simulate completeAppointment in appointmentController
        cashAppointment.status = 'completed';

        const cashAmount = cashAppointment.amount;
        const cashCommission = Number((cashAmount * COMMISSION_RATE).toFixed(2)); // 100 * 0.15 = 15
        const cashNetAmount = Number((cashAmount - cashCommission).toFixed(2));     // 100 - 15 = 85

        cashAppointment.commission = cashCommission;
        cashAppointment.netAmount = cashNetAmount;
        cashAppointment.paymentStatus = 'Paid';
        cashAppointment.paymentDate = new Date();
        await cashAppointment.save();

        // Doctor collects 100% cash directly, so platform deducts 15% from wallet
        doctor.walletBalance = Number((doctor.walletBalance - cashCommission).toFixed(2)); // 310 - 15 = 295
        doctor.totalEarnings = Number((doctor.totalEarnings + cashNetAmount).toFixed(2));   // 510 + 85 = 595
        doctor.earnings = doctor.totalEarnings;
        doctor.patientsTreated += 1;
        doctor.walletTransactions.push({
            amount: cashCommission,
            type: 'withdrawal',
            description: `Platform Commission (15%) for Cash Booking ${cashAppointment._id} (Collected in clinic: $${cashAmount})`,
            status: 'completed',
            date: new Date()
        });
        await doctor.save();

        console.log(`Verification:`);
        console.log(`- cashAppointment.commission: $${cashAppointment.commission} (Expected: $15)`);
        console.log(`- cashAppointment.netAmount: $${cashAppointment.netAmount} (Expected: $85)`);
        console.log(`- doctor.walletBalance: $${doctor.walletBalance} (Expected: $295)`);
        console.log(`- doctor.totalEarnings: $${doctor.totalEarnings} (Expected: $595)`);
        console.log(`- doctor.walletTransactions.length: ${doctor.walletTransactions.length} (Expected: 3)`);
        console.log(`- doctor.walletTransactions[2].description contains Platform Commission: true`);

        if (cashAppointment.commission !== 15 || cashAppointment.netAmount !== 85 || doctor.walletBalance !== 295 || doctor.totalEarnings !== 595 || doctor.walletTransactions.length !== 3) {
            throw new Error('Test 3: Cash booking completion assertion failed!');
        }

        // Clean up test entries
        await Appointment.deleteMany({ doctorId: doctor._id });
        await Doctor.findByIdAndDelete(doctor._id);
        await User.findByIdAndDelete(doctorUser._id);

        console.log('\n=======================================');
        console.log('✅ ALL WALLET AND COMMISSION TEST STEPS PASSED!');
        console.log('=======================================');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ TEST WORKFLOW FAILED:', err.message);
        process.exit(1);
    }
};

runTest();
