const mongoose = require('mongoose');

const connectDB = async () => {
    const uri = process.env.MONGO_URI;

    if (!uri) {
        console.error('[MongoDB] FATAL: MONGO_URI environment variable is not set. '
            + 'Please add it to your Railway service environment variables.');
        process.exit(1);
    }

    // Mask the credentials for safe logging
    const safeUri = uri.replace(/:\/\/([^:]+):([^@]+)@/, '://<user>:<password>@');
    console.log(`[MongoDB] Attempting to connect to: ${safeUri}`);

    try {
        const conn = await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 10000, // fail fast if Atlas is unreachable
        });
        console.log(`[MongoDB] Connected successfully — host: ${conn.connection.host}`);
    } catch (error) {
        console.error('[MongoDB] Connection FAILED:', error.message);
        // Exit so Railway restarts the container and shows the error clearly in logs
        process.exit(1);
    }
};

module.exports = connectDB;
