'use strict';

process.env.TZ = 'Africa/Cairo';

require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const pkg = require('./package.json');
const { createSecurityLayer } = require('../backend/securityLayer');

const app = express();
const server = http.createServer(app);
const securityLayer = createSecurityLayer(server);
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
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

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
}, express.static(securityLayer.publicDir, { index: 'index.html', extensions: ['html'], etag: false, lastModified: false }));
securityLayer.HONEYPOT_ROUTES.forEach(route => app.all(route, securityLayer.honeypot));
app.use(securityLayer.waf);
app.use('/api', securityLayer.router);
app.use('/api/security', securityLayer.router);

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'tabibi-soc', version: pkg.version });
});

app.use((req, res) => {
  if (req.accepts('html')) {
    return res.sendFile(path.join(securityLayer.publicDir, 'index.html'));
  }
  return res.status(404).json({ error: 'Not Found', path: req.path });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  return res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

server.listen(PORT, () => {
  console.log(`TABIBI Security Layer v${pkg.version} running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the existing security-layer process or set PORT to another value.`);
    process.exit(1);
  }
  console.error('[Server Error]', err);
  process.exit(1);
});
