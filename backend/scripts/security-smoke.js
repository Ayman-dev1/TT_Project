const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
const SOC_TOKEN = process.env.SOC_ADMIN_TOKEN || 'TABIBI-SOC-TOKEN-2026';
const fs = require('fs');
const path = require('path');

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body && typeof options.body === 'string' && !options.headers?.['content-type'] ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertJsonArrayEmpty(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8') || '[]');
  assert(Array.isArray(data), `${file} is not a JSON array`);
  assert(data.length === 0, `${file} should be empty, found ${data.length} records`);
}

async function clearSecurityState() {
  const result = await request('/api/clear-threats', {
    method: 'POST',
    headers: { 'x-soc-token': SOC_TOKEN }
  });
  assert(result.status === 200 && result.body?.success, `clear-threats failed: ${result.status} ${JSON.stringify(result.body)}`);
  return result.body;
}

(async () => {
  await clearSecurityState();

  const unauthState = await request('/api/security-state');
  assert(unauthState.status === 401, `security-state must require SOC token, got ${unauthState.status}`);

  const unauthClear = await request('/api/clear-threats', { method: 'POST' });
  assert(unauthClear.status === 401, `clear-threats must require SOC token, got ${unauthClear.status}`);

  const invalidUnblock = await request('/api/unblock-ip', {
    method: 'POST',
    headers: { 'x-soc-token': SOC_TOKEN },
    body: JSON.stringify({ ip: '../not-an-ip' })
  });
  assert(invalidUnblock.status === 400, `invalid unblock IP should be rejected, got ${invalidUnblock.status}`);

  const sqli = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: "admin@tabibi.local' OR 1=1 --", password: 'anything' })
  });
  assert(sqli.status === 403, `SQLi should be blocked, got ${sqli.status}`);

  const stateAfterAttack = await request('/api/security-state', { headers: { 'x-soc-token': SOC_TOKEN } });
  assert(stateAfterAttack.status === 200, `security-state failed after attack: ${stateAfterAttack.status}`);
  assert((stateAfterAttack.body?.threats || []).length >= 1, 'attack was not recorded before clear');
  assert((stateAfterAttack.body?.blocked || []).some(item => item.ip === '127.0.0.1' || item.ip === '::1' || item.ip === '::ffff:127.0.0.1'), 'attack IP was not blocked before clear');

  const unblock = await request('/api/unblock-ip', {
    method: 'POST',
    headers: { 'x-soc-token': SOC_TOKEN },
    body: JSON.stringify({ ip: '127.0.0.1' })
  });
  assert(unblock.status === 200 && unblock.body?.success && unblock.body?.removedFromBlockedIps, `unblock failed: ${unblock.status} ${JSON.stringify(unblock.body)}`);

  const unblockAgain = await request('/api/unblock-ip', {
    method: 'POST',
    headers: { 'x-soc-token': SOC_TOKEN },
    body: JSON.stringify({ ip: '127.0.0.1' })
  });
  assert(unblockAgain.status === 200 && unblockAgain.body?.alreadyUnblocked, `repeated unblock should be idempotent: ${unblockAgain.status} ${JSON.stringify(unblockAgain.body)}`);

  await clearSecurityState();

  const stateAfterClear = await request('/api/security-state', { headers: { 'x-soc-token': SOC_TOKEN } });
  assert(stateAfterClear.status === 200, `security-state failed after clear: ${stateAfterClear.status}`);
  assert((stateAfterClear.body?.threats || []).length === 0, 'threats remained after clear');
  assert((stateAfterClear.body?.blocked || []).length === 0, 'blocked IPs remained after clear');
  assert((stateAfterClear.body?.health?.total || 0) === 0, 'dashboard health counter did not reset after clear');
  assertJsonArrayEmpty(path.join(__dirname, '..', 'attacks.json'));
  assertJsonArrayEmpty(path.join(__dirname, '..', 'security', 'blocked_ips_persist.json'));
  assertJsonArrayEmpty(path.join(__dirname, '..', '..', 'Security_Layer', 'attacks.json'));
  assertJsonArrayEmpty(path.join(__dirname, '..', '..', 'Security_Layer', 'security', 'blocked_ips_persist.json'));

  const xml = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'text/xml' },
    body: '<!DOCTYPE x [ <!ENTITY xxe SYSTEM "file:///etc/passwd"> ]><x>&xxe;</x>'
  });
  assert(xml.status === 403, `XXE should be blocked, got ${xml.status}`);

  await clearSecurityState();
  console.log('Security smoke passed: auth gates, WAF detection, real unblock, idempotent unblock, persistent clear, dashboard reset, and XML attack blocking all work.');
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
