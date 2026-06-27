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
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
}));
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

// Root route (API health check)
app.get('/api', (req, res) => {
    res.send('Tabibi API is running...');
});

// -------------------------------------------------------
// Serve React front-end in production
// The Vite build outputs to frontend/dist (relative to repo root)
// -------------------------------------------------------
const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'dist');
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(frontendBuildPath));
    // Catch-all: send React's index.html for any non-API route
    app.get('*', (req, res) => {
        res.sendFile(path.join(frontendBuildPath, 'index.html'));
    });
} else {
    app.get('/', (req, res) => {
        res.send('Tabibi API is running (development mode)...');
    });
}

// Error Handling Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

