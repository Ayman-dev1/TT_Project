const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

dotenv.config();

const seedAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');

        const adminExists = await User.findOne({ email: 'admin1@tabibi.com' });

        if (adminExists) {
            console.log('Admin already exists. Deleting it to recreate with proper hash...');
            await User.deleteOne({ email: 'admin1@tabibi.com' });
        }

        const admin = await User.create({
            name: 'System Admin',
            email: 'admin1@tabibi.com',
            password: 'tabibiAdmin2026_1',
            role: 'admin'
        });

        console.log('Admin user created successfully');
        process.exit();
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

seedAdmin();
