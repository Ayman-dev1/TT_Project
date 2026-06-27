'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const BACKEND_URL = 'http://localhost:5000';
const ATTACK_LOG_FILE = path.join(__dirname, '..', 'attacks.json');
const PHI_LOG_FILE = path.join(__dirname, '..', 'phi_audit.json');

// Helper to make HTTP requests
function request(method, urlPath, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BACKEND_URL);
    const options = {
      method: method.toUpperCase(),
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (body) {
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', err => reject(err));
    if (body) req.write(body);
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING SECURITY VERIFICATION TESTS ===\n');
  const results = [];

  // Test 1: Check baseline online status
  try {
    const res = await request('GET', '/api/test');
    results.push({
      test: 'Baseline Online Check',
      status: res.statusCode === 200 ? 'PASS' : 'FAIL',
      detail: `Status Code: ${res.statusCode}`
    });
  } catch (err) {
    results.push({ test: 'Baseline Online Check', status: 'FAIL', detail: err.message });
  }

  // Test 2: JWT authentication invalid token (Do this first before WAF bans IP)
  try {
    const res = await request('GET', '/api/auth/me', { 'Authorization': 'Bearer invalidtokenhere' });
    results.push({
      test: 'JWT Auth: Invalid Token Rejection',
      status: res.statusCode === 401 ? 'PASS' : 'FAIL',
      detail: `Status: ${res.statusCode}`
    });
  } catch (err) {
    results.push({ test: 'JWT Auth: Invalid Token Rejection', status: 'FAIL', detail: err.message });
  }

  // Test 3: SQL Injection payload
  try {
    const payload = JSON.stringify({ email: "admin@tabibi.com' OR 1=1 --", password: "password" });
    const res = await request('POST', '/api/auth/login', {}, payload);
    results.push({
      test: 'WAF: SQL Injection Detection',
      status: res.statusCode === 403 ? 'PASS' : 'FAIL',
      detail: `Status: ${res.statusCode}, Body: ${res.body}`
    });
  } catch (err) {
    results.push({ test: 'WAF: SQL Injection Detection', status: 'FAIL', detail: err.message });
  }

  // Test 4: XSS Injection payload
  try {
    const payload = JSON.stringify({ name: "<script>alert('XSS')</script>", email: "xss@tabibi.com", password: "password" });
    const res = await request('POST', '/api/auth/register', {}, payload);
    results.push({
      test: 'WAF: XSS Script Injection Detection',
      status: res.statusCode === 403 ? 'PASS' : 'FAIL',
      detail: `Status: ${res.statusCode}, Body: ${res.body}`
    });
  } catch (err) {
    results.push({ test: 'WAF: XSS Script Injection Detection', status: 'FAIL', detail: err.message });
  }

  // Test 5: Command Injection payload
  try {
    const payload = JSON.stringify({ email: "test@tabibi.com", password: ";cat /etc/passwd" });
    const res = await request('POST', '/api/auth/login', {}, payload);
    results.push({
      test: 'WAF: OS Command Injection Detection',
      status: res.statusCode === 403 ? 'PASS' : 'FAIL',
      detail: `Status: ${res.statusCode}, Body: ${res.body}`
    });
  } catch (err) {
    results.push({ test: 'WAF: OS Command Injection Detection', status: 'FAIL', detail: err.message });
  }

  // Trigger manual PHI Audit write to initialize the log file
  try {
    const phiAudit = require('../security/phiAudit');
    phiAudit.logAccess({
      userId: 'test-user',
      patientId: 'patient-123',
      fields: ['patientName', 'diagnosis'],
      reason: 'Automated verification test',
      ip: '127.0.0.1',
      action: 'READ'
    });
    // Wait for the async write queue flush
    await new Promise(resolve => setTimeout(resolve, 800));
  } catch (err) {
    console.error('Failed to trigger manual PHI log:', err.message);
  }

  // Test 6: Check audit log files exist
  const attacksExist = fs.existsSync(ATTACK_LOG_FILE);
  const phiExist = fs.existsSync(PHI_LOG_FILE);
  results.push({
    test: 'Audit Files Persistence Existence',
    status: (attacksExist && phiExist) ? 'PASS' : 'FAIL',
    detail: `attacks.json: ${attacksExist}, phi_audit.json: ${phiExist}`
  });

  // Test 7: Confirm signatures in audit logs are verifiable
  if (phiExist) {
    try {
      const phiAudit = require('../security/phiAudit');
      const verifyResult = phiAudit.verifyLog();
      results.push({
        test: 'HIPAA PHI Audit Signature integrity',
        status: verifyResult.integrity === 'CLEAN' ? 'PASS' : 'FAIL',
        detail: `Valid: ${verifyResult.valid}, Tampered: ${verifyResult.tampered}, Integrity: ${verifyResult.integrity}`
      });
    } catch (err) {
      results.push({ test: 'HIPAA PHI Audit Signature integrity', status: 'FAIL', detail: err.message });
    }
  }

  // Print results
  console.log('=== VERIFICATION TEST RESULTS ===');
  console.table(results);
  process.exit(results.every(r => r.status === 'PASS') ? 0 : 1);
}

runTests();
