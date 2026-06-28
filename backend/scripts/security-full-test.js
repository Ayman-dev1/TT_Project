const BASE_URL = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const SOC_TOKEN = process.env.SOC_ADMIN_TOKEN || 'TABIBI-SOC-TOKEN-2026';

const ADMIN_HEADERS = { 'x-soc-token': SOC_TOKEN };
const LOCAL_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);

const results = [];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`[PASS] ${name}${detail ? ` - ${detail}` : ''}`);
}

function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error(`[FAIL] ${name}${detail ? ` - ${detail}` : ''}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && typeof options.body === 'string' && !headers['content-type'] && !headers['Content-Type']) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: response.status, ok: response.ok, body, text };
}

async function admin(path, options = {}) {
  return request(path, {
    ...options,
    headers: { ...ADMIN_HEADERS, ...(options.headers || {}) }
  });
}

async function clearSecurityState() {
  const result = await admin('/api/clear-threats', { method: 'POST' });
  assert(result.status === 200 && result.body?.success, `clear failed: ${result.status} ${JSON.stringify(result.body)}`);
}

async function getLogs() {
  const result = await admin('/api/logs', { cache: 'no-store' });
  assert(result.status === 200 && Array.isArray(result.body), `logs failed: ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

async function getSecurityState() {
  const result = await admin('/api/security-state', { cache: 'no-store' });
  assert(result.status === 200, `security-state failed: ${result.status} ${JSON.stringify(result.body)}`);
  return result.body || {};
}

async function waitFor(label, predicate, timeoutMs = 2500) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await predicate();
    if (last) return last;
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${label}`);
}

function normalizeIp(ip) {
  return String(ip || '').replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');
}

function hasBlockedIp(state) {
  const blocked = Array.isArray(state.blocked) ? state.blocked : [];
  return blocked.some(item => LOCAL_IPS.has(String(item.ip)) || LOCAL_IPS.has(normalizeIp(item.ip)));
}

async function verifyEmptyState(name) {
  const state = await getSecurityState();
  const logs = await getLogs();
  assert(logs.length === 0, `${name}: logs still has ${logs.length} item(s)`);
  assert((state.threats || []).length === 0, `${name}: threats not empty`);
  assert((state.blocked || []).length === 0, `${name}: blocked IPs not empty`);
  assert((state.health?.total || 0) === 0, `${name}: dashboard total did not reset`);
}

async function runCase(test) {
  const name = test.name;
  try {
    await clearSecurityState();
    const response = await test.send();

    if (test.expectStatus) {
      const expected = Array.isArray(test.expectStatus) ? test.expectStatus : [test.expectStatus];
      assert(expected.includes(response.status), `expected HTTP ${expected.join('/')} but got ${response.status}: ${JSON.stringify(response.body)}`);
    }

    const logs = await waitFor(`${name} log`, async () => {
      const items = await getLogs();
      return items.find(item => String(item.type).toLowerCase() === String(test.type).toLowerCase()) || null;
    });

    const state = await getSecurityState();
    if (test.expectBlocked !== false) {
      assert(hasBlockedIp(state), `${name}: attack was logged but IP was not blocked`);
    }

    pass(name, `${test.type} logged, HTTP ${response.status}`);
    return { response, logs, state };
  } catch (err) {
    fail(name, err.message);
  } finally {
    try {
      await clearSecurityState();
      await verifyEmptyState(`${name} cleanup`);
    } catch (cleanupErr) {
      fail(`${name} cleanup`, cleanupErr.message);
    }
  }
}

async function testAuthGates() {
  const openState = await request('/api/security-state');
  assert(openState.status === 401, `security-state without token should be 401, got ${openState.status}`);

  const openClear = await request('/api/clear-threats', { method: 'POST' });
  assert(openClear.status === 401, `clear-threats without token should be 401, got ${openClear.status}`);

  const badUnblock = await admin('/api/unblock-ip', {
    method: 'POST',
    body: JSON.stringify({ ip: '../not-an-ip' })
  });
  assert(badUnblock.status === 400, `invalid unblock should be 400, got ${badUnblock.status}`);

  pass('SOC auth gates', 'protected endpoints reject missing/invalid input');
}

async function testIncidentResponseUnblock() {
  await clearSecurityState();
  await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: "admin@tabibi.local' OR 1=1 --", password: 'anything' })
  });

  await waitFor('blocked IP after SQLi', async () => {
    const state = await getSecurityState();
    return hasBlockedIp(state) ? state : null;
  });

  const unblock = await admin('/api/unblock-ip', {
    method: 'POST',
    body: JSON.stringify({ ip: '127.0.0.1' })
  });
  assert(unblock.status === 200 && unblock.body?.success, `unblock failed: ${unblock.status} ${JSON.stringify(unblock.body)}`);

  const state = await getSecurityState();
  assert(!hasBlockedIp(state), 'IP still blocked after unblock');
  pass('Incident Response unblock', 'blocked IP removed from backend state');

  await clearSecurityState();
  await verifyEmptyState('incident response cleanup');
}

async function testSessionMonitor() {
  await admin('/api/sessions', { method: 'DELETE' });
  const sessionId = `security-full-test-${Date.now()}`;
  const track = await request('/api/sessions/track', {
    method: 'POST',
    headers: { 'x-tabibi-session-id': sessionId },
    body: JSON.stringify({
      id: 'security-test-user',
      email: 'security-test@tabibi.local',
      name: 'Security Test User',
      role: 'admin',
      sessionId
    })
  });
  assert(track.status === 200 && track.body?.success, `session track failed: ${track.status} ${JSON.stringify(track.body)}`);

  const sessions = await admin('/api/sessions');
  const active = sessions.body?.active || sessions.body?.sessions || [];
  assert(JSON.stringify(active).includes(sessionId), 'tracked session did not appear in session monitor');

  const end = await request('/api/sessions/end', {
    method: 'POST',
    headers: { 'x-tabibi-session-id': sessionId },
    body: JSON.stringify({ id: 'security-test-user', email: 'security-test@tabibi.local', sessionId })
  });
  assert(end.status === 200 && end.body?.success, `session end failed: ${end.status} ${JSON.stringify(end.body)}`);
  pass('Session Monitor', 'track and end session succeeded');
}

async function testGeoVelocity() {
  await admin('/api/geo-velocity/events', { method: 'DELETE' });
  const userId = `geo-test-${Date.now()}`;
  const first = await admin('/api/geo-velocity/record', {
    method: 'POST',
    body: JSON.stringify({ userId, email: `${userId}@tabibi.local`, ip: '8.8.8.8' })
  });
  assert(first.status === 200 && first.body?.success, `geo record failed: ${first.status} ${JSON.stringify(first.body)}`);

  const second = await admin('/api/geo-velocity/check', {
    method: 'POST',
    body: JSON.stringify({ userId, email: `${userId}@tabibi.local`, ip: '1.1.1.1' })
  });
  assert(second.status === 200, `geo check failed: ${second.status} ${JSON.stringify(second.body)}`);

  const snapshot = await admin('/api/geo-velocity');
  assert(snapshot.status === 200 && snapshot.body && Array.isArray(snapshot.body.events), 'geo snapshot did not return events array');
  pass('Geo Velocity', `API responded (${second.body?.reason || 'checked'})`);
}

async function testAlertAndFileScanPanels() {
  const alerts = await admin('/api/alerts/config');
  assert(alerts.status === 200 && alerts.body, `alerts config failed: ${alerts.status}`);

  const alertLog = await admin('/api/alerts/log');
  assert(alertLog.status === 200 && Array.isArray(alertLog.body?.log), `alerts log failed: ${alertLog.status}`);

  const stats = await admin('/api/filescan/stats');
  assert(stats.status === 200 && stats.body, `file scan stats failed: ${stats.status}`);

  const form = new FormData();
  form.append('file', new Blob(['X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'], { type: 'text/plain' }), 'eicar-test.txt');
  form.append('username', 'Security Full Test');
  form.append('email', 'security-test@tabibi.local');
  form.append('uploadLocation', 'Security Layer full test');

  const scan = await request('/api/upload/scan', { method: 'POST', body: form });
  assert([400, 202].includes(scan.status), `EICAR file should be blocked/flagged, got ${scan.status}: ${JSON.stringify(scan.body)}`);
  assert(scan.body?.record?.scanStatus && scan.body.record.scanStatus !== 'SAFE', 'EICAR scan was not marked unsafe');

  await admin('/api/filescan/records', { method: 'DELETE' });
  pass('Alerts and File Scan', 'config readable and EICAR test file detected');
}

async function main() {
  console.log(`TABIBI security full test`);
  console.log(`Target: ${BASE_URL}`);
  console.log('Warning: this test clears security logs and blocked IP state before/after cases.\n');

  await clearSecurityState();
  await testAuthGates();

  const attackCases = [
    {
      name: 'SQL Injection',
      type: 'SQLi',
      expectStatus: 403,
      send: () => request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: "admin@tabibi.local' OR 1=1 --", password: 'anything' })
      })
    },
    {
      name: 'XSS Attack',
      type: 'XSS',
      expectStatus: 403,
      send: () => request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name: '<img src=x onerror=alert(1)>', email: `xss-${Date.now()}@tabibi.local`, password: 'Password123!' })
      })
    },
    {
      name: 'NoSQL Injection',
      type: 'NoSQLi',
      expectStatus: 403,
      send: () => request('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: { $ne: '' }, password: { $ne: '' } })
      })
    },
    {
      name: 'Path Traversal',
      type: 'PathTraversal',
      expectStatus: 403,
      send: () => request('/api/doctors?search=../../../../etc/passwd')
    },
    {
      name: 'Command Injection',
      type: 'CmdInjection',
      expectStatus: 403,
      send: () => request('/api/doctors?search=test%3Bcat%20%2Fetc%2Fpasswd')
    },
    {
      name: 'SSRF',
      type: 'SSRF',
      expectStatus: 403,
      send: () => request('/api/doctors', {
        method: 'POST',
        body: JSON.stringify({ image: 'http://169.254.169.254/latest/meta-data/iam/security-credentials/' })
      })
    },
    {
      name: 'XXE',
      type: 'XXE',
      expectStatus: 403,
      send: () => request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'text/xml' },
        body: '<!DOCTYPE x [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]><x>&xxe;</x>'
      })
    },
    {
      name: 'Honeypot Route',
      type: 'HONEYPOT',
      expectStatus: 200,
      send: () => request('/trap')
    },
    {
      name: 'Honeypot Field',
      type: 'HONEYPOT',
      expectStatus: 200,
      send: () => request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name: 'Bot', email: `bot-${Date.now()}@tabibi.local`, password: 'Password123!', website: 'https://spam.example' })
      })
    },
    {
      name: 'Brute Force',
      type: 'Brute',
      expectStatus: [401, 403, 429],
      send: async () => {
        let last;
        for (let i = 0; i < 8; i += 1) {
          last = await request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email: 'admin@tabibi.local', password: `wrong-${Date.now()}-${i}` })
          });
          await sleep(80);
        }
        return last;
      }
    }
  ];

  for (const item of attackCases) {
    await runCase(item);
  }

  await testIncidentResponseUnblock();
  await testSessionMonitor();
  await testGeoVelocity();
  await testAlertAndFileScanPanels();

  await clearSecurityState();
  await verifyEmptyState('final cleanup');

  const failed = results.filter(item => !item.ok);
  console.log(`\nSecurity full test complete: ${results.length - failed.length}/${results.length} passed.`);
  if (failed.length) {
    console.log('\nFailures:');
    failed.forEach(item => console.log(`- ${item.name}: ${item.detail}`));
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n[FATAL] ${err.message}`);
  process.exit(1);
});
