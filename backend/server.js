const express = require('express');
const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/errorMiddleware');
const { initSecurity, wafMiddleware } = require('./middleware/securityMiddleware');

// Load environment variables
dotenv.config();

// Connect to Database
connectDB();

const app = express();
const server = http.createServer(app);

// Initialize Security (Socket.IO + WAF state)
initSecurity(app, server);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Global WAF middleware (payload check, panic state, brute-force checks)
app.use(wafMiddleware);

// Serve SOC Dashboard static files
app.use('/soc', express.static(path.join(__dirname, '..', 'Security_Layer', 'public')));

// Routes
app.use('/api', require('./routes/securityRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/doctors', require('./routes/doctorRoutes'));
app.use('/api/appointments', require('./routes/appointmentRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/medical-records', require('./routes/medicalRecordRoutes'));

// Root route
app.get('/', (req, res) => {
    res.send('Tabibi API is running...');
});

// Error Handling Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

