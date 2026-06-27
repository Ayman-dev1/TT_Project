const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

console.log('Using MONGO_URI:', process.env.MONGO_URI);

async function testConnection() {
    try {
        await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
        console.log('SUCCESS: Connected to MongoDB successfully!');
        process.exit(0);
    } catch (err) {
        console.error('ERROR: Failed to connect to MongoDB:', err.message);
        process.exit(1);
    }
}

testConnection();
