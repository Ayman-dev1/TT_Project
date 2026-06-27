const mongoose = require('mongoose');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const Doctor = require('../models/Doctor');
const Appointment = require('../models/Appointment');

dotenv.config();

const doctorsData = [
    {
        user: {
            _id: "6a3aaae8584cd708d428b0c2",
            name: "Dr. Ahmed Mansour",
            email: "ahmed@tabibi.com",
            password: "password123",
            role: "doctor",
            image: "PICS/M1.png",
            dob: new Date('1980-05-15')
        },
        doctor: {
            _id: "6a3aaae8584cd708d428b0c3",
            specialty: "General physician",
            experience: 12,
            fee: 50,
            degree: "MBBS, General Medicine",
            about: "Dedicated to providing comprehensive primary care with a patient-first approach.",
            available: true,
            certificates: ["certificate_1.png"],
            patientsTreated: 45,
            rating: 4.8,
            reviewsCount: 24,
            clinicAddress: "12 El-Galaa St, Cairo"
        }
    },
    {
        user: {
            _id: "6a3aaae9584cd708d428b0c4",
            name: "Dr. Maryam El-Gohary",
            email: "maryam@tabibi.com",
            password: "password123",
            role: "doctor",
            image: "PICS/F1.png",
            dob: new Date('1985-08-22')
        },
        doctor: {
            _id: "6a3aaae9584cd708d428b0c5",
            specialty: "Gynecologist",
            experience: 8,
            fee: 70,
            degree: "MBBS, MSc Gynecology",
            about: "Specialist in women's health with compassionate, evidence-based care.",
            available: true,
            patientsTreated: 120,
            rating: 4.9,
            reviewsCount: 31,
            clinicAddress: "45 Sphinx Square, Giza"
        }
    },
    {
        user: {
            _id: "6a3aaae9584cd708d428b0c6",
            name: "Dr. Aya Sami",
            email: "aya@tabibi.com",
            password: "password123",
            role: "doctor",
            image: "PICS/F2.png",
            dob: new Date('1990-11-10')
        },
        doctor: {
            _id: "6a3aaae9584cd708d428b0c7",
            specialty: "Dermatologist",
            experience: 4,
            fee: 60,
            degree: "MBBS, Dermatology Board",
            about: "Expert in medical and cosmetic dermatology treatments.",
            available: false,
            patientsTreated: 18,
            rating: 4.7,
            reviewsCount: 18,
            clinicAddress: "88 El-Bahr St, Tanta"
        }
    },
    {
        user: {
            _id: "6a3aaae9584cd708d428b0c8",
            name: "Dr. Khaled Shouky",
            email: "khaled@tabibi.com",
            password: "password123",
            role: "doctor",
            image: "PICS/M2.png",
            dob: new Date('1975-02-05')
        },
        doctor: {
            _id: "6a3aaae9584cd708d428b0c9",
            specialty: "Neurologist",
            experience: 15,
            fee: 90,
            degree: "MBBS, Neurology Fellowship",
            about: "Specialist in neurological disorders and brain health.",
            available: true,
            patientsTreated: 210,
            rating: 4.9,
            reviewsCount: 42,
            clinicAddress: "105 El-Nasr St, Heliopolis, Cairo"
        }
    },
    {
        user: {
            _id: "6a3aaaea584cd708d428b0ca",
            name: "Dr. Youssef Nabil",
            email: "youssef@tabibi.com",
            password: "password123",
            role: "doctor",
            image: "PICS/image 419.png",
            dob: new Date('1988-12-30')
        },
        doctor: {
            _id: "6a3aaaea584cd708d428b0cb",
            specialty: "Pediatricians",
            experience: 7,
            fee: 55,
            degree: "MBBS, Pediatrics",
            about: "Gentle, child-focused care for infants and adolescents.",
            available: true,
            patientsTreated: 75,
            rating: 4.8,
            reviewsCount: 27,
            clinicAddress: "32 El-Tahrir St, Dokki, Giza"
        }
    }
];

const patientsData = [
    {
        name: "Ali Hassan",
        email: "ali@example.com",
        password: "password123",
        role: "patient",
        dob: new Date('1995-04-12')
    },
    {
        name: "Sara Mahmoud",
        email: "sara@example.com",
        password: "password123",
        role: "patient",
        dob: new Date('1998-09-25')
    }
];

const seedData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected for Seeding...');

        // Clear existing data (but keep admin user if you want, here we just wipe doctors/appointments and non-admin users)
        await Doctor.deleteMany();
        await Appointment.deleteMany();
        await User.deleteMany({ role: { $ne: 'admin' } });

        console.log('Cleared existing non-admin data...');

        // Insert Patients
        const createdPatients = [];
        for (let pt of patientsData) {
            const user = await User.create(pt);
            createdPatients.push(user);
        }
        console.log('Inserted Patients...');

        // Insert Doctors
        const createdDoctors = [];
        for (let docData of doctorsData) {
            const user = await User.create(docData.user);
            const doctor = await Doctor.create({
                ...docData.doctor,
                userId: user._id
            });
            createdDoctors.push(doctor);
        }
        console.log('Inserted Doctors...');

        // Insert some Appointments
        // Ali books with Dr. Ahmed
        await Appointment.create({
            patientId: createdPatients[0]._id,
            doctorId: createdDoctors[0]._id,
            date: new Date(Date.now() + 86400000 * 2), // 2 days from now
            time: "10:00 am",
            amount: createdDoctors[0].fee,
            status: "pending",
            payment: "cash"
        });

        // Sara books with Dr. Maryam
        await Appointment.create({
            patientId: createdPatients[1]._id,
            doctorId: createdDoctors[1]._id,
            date: new Date(Date.now() + 86400000 * 4), // 4 days from now
            time: "1:00 pm",
            amount: createdDoctors[1].fee,
            status: "confirmed",
            payment: "card"
        });

        console.log('Inserted Appointments...');
        console.log('Seeding Complete! All passwords are: password123');
        process.exit();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

seedData();
