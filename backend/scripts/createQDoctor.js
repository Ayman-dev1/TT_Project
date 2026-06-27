const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const Doctor = require('../models/Doctor');

dotenv.config();

const createQDoctor = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');

        // Check if user already exists
        const userExists = await User.findOne({ email: 'Q@gmail.com' });
        if (userExists) {
            console.log('User already exists. Deleting to recreate...');
            await Doctor.deleteOne({ userId: userExists._id });
            await User.deleteOne({ email: 'Q@gmail.com' });
        }

        const user = await User.create({
            name: 'Dr. Q',
            email: 'Q@gmail.com',
            password: 'password123', // Hashes automatically
            role: 'doctor',
            image: ''
        });

        await Doctor.create({
            userId: user._id,
            specialty: 'General physician',
            experience: 5,
            fee: 50,
            degree: 'MBBS',
            about: 'Specialist General Physician.',
            clinicAddress: '12 Cairo St'
        });

        console.log('Doctor user Q@gmail.com created successfully with password: password123');
        process.exit();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

createQDoctor();
