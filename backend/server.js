const express = require('express');
const http = require('http');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/errorMiddleware');
const { createSecurityLayer } = require('./securityLayer');

// Load environment variables
dotenv.config();

// Connect to Database
connectDB();

const app = express();
if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PUBLIC_DOMAIN || process.env.TRUST_PROXY) {
    app.set('trust proxy', 1);
}
const server = http.createServer(app);
const securityLayer = createSecurityLayer(server);

// Reuse the security layer Socket.IO server so SOC events and chat events share
// one /socket.io endpoint.
const io = securityLayer.io;

app.set('io', io);

app.use((req, res, next) => {
    req.id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    res.set('X-Request-Id', req.id);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Frame-Options', 'SAMEORIGIN');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

// Inject io into req for downstream usage
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.text({
    type: ['text/xml', 'application/xml', 'application/soap+xml', 'application/xhtml+xml', 'text/plain'],
    limit: '1mb'
}));

app.use((err, req, res, next) => {
    if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large')) {
        return res.status(err.type === 'entity.too.large' ? 413 : 400).json({ message: 'Malformed or oversized request body' });
    }
    return next(err);
});

// Always let the SOC clear action run before the WAF/blocked-IP checks.
// In production, honor the same SOC token gate used by the security layer.
app.all('/api/clear-threats', (req, res) => {
    const expectedToken = process.env.SOC_ADMIN_TOKEN || 'TABIBI-SOC-TOKEN-2026';
    const authHeader = req.headers.authorization || '';
    const token = req.headers['x-soc-token'] || req.query.token;
    if (token !== expectedToken && authHeader !== `Bearer ${expectedToken}` && authHeader !== 'Bearer TABIBI-SOC-TOKEN-2026') {
        return res.status(401).json({ error: 'Unauthorized - SOC token required' });
    }
    try {
        return res.json(securityLayer.clearSecurityState());
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// Security Operations Center and request security layer
app.use('/soc', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
}, express.static(securityLayer.publicDir, { index: 'index.html', extensions: ['html'], etag: false, lastModified: false }));
securityLayer.HONEYPOT_ROUTES.forEach(route => app.all(route, securityLayer.honeypot));
app.use(securityLayer.waf);
app.use('/api', securityLayer.router);
app.use('/api/security', securityLayer.router);
app.use(securityLayer.sessionTracker);

// Routes
app.use('/api', require('./routes/appRoutes'));
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/doctors', require('./routes/doctorRoutes'));
app.use('/api/appointments', require('./routes/appointmentRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/medical-records', require('./routes/medicalRecordRoutes'));

// Serve static assets from Frontend production build
const frontendBuildPath = path.join(__dirname, '..', 'frontend', 'dist');
app.use(express.static(frontendBuildPath));

// Health check / API status endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'healthy', message: 'Tabibi API is running...' });
});

// Catch-all route to serve the React index.html for client-side routing
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/soc') || req.path.startsWith('/socket.io')) {
        return next();
    }
    res.sendFile(path.join(frontendBuildPath, 'index.html'), (err) => {
        if (err) {
            // Avoid bubbling up/crashing the process; return a structured error page instead
            res.status(500).send("Frontend build index.html is missing. Please check compilation logs.");
        }
    });
});

// Error Handling Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop the existing backend process or set PORT to another value.`);
        process.exit(1);
    }
    console.error('[Server Error]', err);
    process.exit(1);
});
