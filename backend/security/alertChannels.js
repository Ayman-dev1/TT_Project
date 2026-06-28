'use strict';

const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');
const https = require('https');
const crypto = require('crypto');

const STORE_FILE = process.env.ALERT_CHANNELS_STORE || path.join(__dirname, 'alert_channels_state.json');
const MAX_LOG = Number(process.env.ALERT_CHANNELS_MAX_LOG || 500);

const state = {
  emails: [],
  phones: [],
  triggers: { critical: false, brute: false, all: false },
  smtp: {
    host: process.env.ALERT_SMTP_HOST || '',
    port: Number(process.env.ALERT_SMTP_PORT || 587),
    user: process.env.ALERT_SMTP_USER || '',
    pass: process.env.ALERT_SMTP_PASS || '',
    secure: String(process.env.ALERT_SMTP_SECURE || '').toLowerCase() === 'true'
  },
  twilio: {
    sid: process.env.TWILIO_ACCOUNT_SID || '',
    token: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_FROM || ''
  },
  alertLog: []
};

function ensureStore() {
  try {
    if (!fs.existsSync(STORE_FILE)) fs.writeFileSync(STORE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
}

function load() {
  try {
    if (!fs.existsSync(STORE_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    if (Array.isArray(parsed.emails)) state.emails = parsed.emails;
    if (Array.isArray(parsed.phones)) state.phones = parsed.phones;
    if (parsed.triggers) state.triggers = { ...state.triggers, ...parsed.triggers };
    if (parsed.smtp) state.smtp = { ...state.smtp, ...parsed.smtp };
    if (parsed.twilio) state.twilio = { ...state.twilio, ...parsed.twilio };
    if (Array.isArray(parsed.alertLog)) state.alertLog = parsed.alertLog.slice(0, MAX_LOG);
  } catch (_) {}
}

function save() {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (_) {}
}

ensureStore();
load();

function publicConfig() {
  return {
    emails: state.emails,
    phones: state.phones,
    triggers: state.triggers,
    smtp: { ...state.smtp, pass: state.smtp.pass ? '********' : '' },
    twilio: { ...state.twilio, token: state.twilio.token ? '********' : '' },
    alertLog: state.alertLog,
    sentToday: countSentToday()
  };
}

function mergeSecret(current, incoming, key) {
  if (incoming[key] === undefined) return current[key] || '';
  if (incoming[key] === '********') return current[key] || '';
  return incoming[key] || '';
}

function updateConfig(config = {}) {
  if (Array.isArray(config.emails)) state.emails = config.emails.filter(e => e && e.address);
  if (Array.isArray(config.phones)) state.phones = config.phones.filter(p => p && p.number);
  if (config.triggers) state.triggers = { ...state.triggers, ...config.triggers };
  if (config.smtp) {
    state.smtp = {
      ...state.smtp,
      ...config.smtp,
      port: Number(config.smtp.port || state.smtp.port || 587),
      pass: mergeSecret(state.smtp, config.smtp, 'pass')
    };
  }
  if (config.twilio) {
    state.twilio = {
      ...state.twilio,
      ...config.twilio,
      token: mergeSecret(state.twilio, config.twilio, 'token')
    };
  }
  save();
  return publicConfig();
}

function logAlert(entry) {
  const item = {
    id: entry.id || `ALERT-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    isoTime: entry.isoTime || new Date().toISOString(),
    time: entry.time || new Date().toLocaleString('en-GB', { timeZone: 'Africa/Cairo' }) + ' CAI',
    type: entry.type || 'ALERT',
    trigger: entry.trigger || 'manual',
    channel: entry.channel || 'system',
    to: entry.to || '',
    message: entry.message || '',
    status: entry.status || 'SENT',
    error: entry.error || ''
  };
  state.alertLog.unshift(item);
  if (state.alertLog.length > MAX_LOG) state.alertLog.length = MAX_LOG;
  save();
  return item;
}

function countSentToday() {
  const today = new Date().toISOString().slice(0, 10);
  return state.alertLog.filter(item => item.status === 'SENT' && String(item.isoTime || '').slice(0, 10) === today).length;
}

function clearLog() {
  state.alertLog = [];
  save();
}

function readLine(socket) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = chunk => {
      buf += chunk.toString('utf8');
      if (/\r?\n$/.test(buf)) {
        socket.off('data', onData);
        socket.off('error', onError);
        resolve(buf);
      }
    };
    const onError = err => {
      socket.off('data', onData);
      reject(err);
    };
    socket.on('data', onData);
    socket.once('error', onError);
  });
}

async function expect(socket, code) {
  const line = await readLine(socket);
  if (!String(line).startsWith(String(code))) throw new Error(`SMTP expected ${code}, got ${line.trim()}`);
  while (/^\d{3}-/.test(line)) {
    const next = await readLine(socket);
    if (!/^\d{3}-/.test(next)) break;
  }
}

function write(socket, line) {
  socket.write(line + '\r\n');
}

function connectSocket(smtp) {
  const port = Number(smtp.port || 587);
  const secure = smtp.secure || port === 465;
  return new Promise((resolve, reject) => {
    const opts = { host: smtp.host, port, servername: smtp.host, timeout: 10000 };
    const socket = secure ? tls.connect(opts, () => resolve(socket)) : net.connect(opts, () => resolve(socket));
    socket.once('error', reject);
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('SMTP connection timed out'));
    });
  });
}

async function sendEmail({ smtp = state.smtp, to, subject, body }) {
  if (!smtp.host || !smtp.user || !smtp.pass) throw new Error('SMTP host, user, and password are required');
  if (!to) throw new Error('Email recipient is required');

  let socket = await connectSocket(smtp);
  try {
    await expect(socket, 220);
    write(socket, `EHLO tabibi.local`);
    await expect(socket, 250);
    const port = Number(smtp.port || 587);
    if (!smtp.secure && port !== 465) {
      write(socket, 'STARTTLS');
      await expect(socket, 220);
      socket = tls.connect({ socket, servername: smtp.host });
      write(socket, `EHLO tabibi.local`);
      await expect(socket, 250);
    }
    write(socket, 'AUTH LOGIN');
    await expect(socket, 334);
    write(socket, Buffer.from(smtp.user).toString('base64'));
    await expect(socket, 334);
    write(socket, Buffer.from(smtp.pass).toString('base64'));
    await expect(socket, 235);
    write(socket, `MAIL FROM:<${smtp.user}>`);
    await expect(socket, 250);
    write(socket, `RCPT TO:<${to}>`);
    await expect(socket, 250);
    write(socket, 'DATA');
    await expect(socket, 354);
    const msg = [
      `From: TABIBI SOC <${smtp.user}>`,
      `To: ${to}`,
      `Subject: ${subject || 'TABIBI SOC Alert'}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      String(body || '')
    ].join('\r\n').replace(/\r?\n\./g, '\r\n..');
    socket.write(msg + '\r\n.\r\n');
    await expect(socket, 250);
    write(socket, 'QUIT');
    return { success: true };
  } finally {
    socket.end();
  }
}

function sendSms({ twilio = state.twilio, to, body }) {
  return new Promise((resolve) => {
    if (!twilio.sid || !twilio.token || !twilio.from) return resolve({ success: false, error: 'Twilio SID, token, and from number are required' });
    if (!to) return resolve({ success: false, error: 'SMS recipient is required' });
    const postData = new URLSearchParams({ To: to, From: twilio.from, Body: body || '' }).toString();
    const req = https.request({
      method: 'POST',
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${encodeURIComponent(twilio.sid)}/Messages.json`,
      headers: {
        Authorization: `Basic ${Buffer.from(`${twilio.sid}:${twilio.token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 10000
    }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        let parsed = {};
        try { parsed = JSON.parse(raw); } catch (_) {}
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve({ success: true, sid: parsed.sid });
        resolve({ success: false, error: parsed.message || `Twilio HTTP ${res.statusCode}` });
      });
    });
    req.on('error', err => resolve({ success: false, error: err.message }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Twilio request timed out' }); });
    req.write(postData);
    req.end();
  });
}

function classifyTrigger(entry) {
  const type = entry.type || 'Unknown';
  const score = Number(entry.score || 0);
  if (/^FILE_SCAN_/i.test(type) && type !== 'FILE_SCAN_THREAT') return '';
  if (state.triggers.all) return 'All Attacks';
  if (state.triggers.critical && score >= 100) return 'Critical Attacks';
  if (state.triggers.brute && type === 'Brute') return 'Brute Force';
  return '';
}

async function dispatchAttack(entry) {
  const trigger = classifyTrigger(entry);
  if (!trigger) return [];
  const results = [];
  const type = entry.type || 'Unknown';
  const score = Number(entry.score || 0);
  const body = '[TABIBI SOC ALERT] ' + trigger + ' detected!\n'
    + `Type: ${type} | Score: ${score} | Action: ${entry.action || 'LOGGED'}\n`
    + `Source IP: ${entry.ip || 'unknown'}\n`
    + `Path: ${entry.path || '/'}\n`
    + `Time: ${entry.isoTime || new Date().toISOString()}`;

  if (state.emails.length && state.smtp.host && state.smtp.user && state.smtp.pass) {
    for (const recipient of state.emails) {
      const to = recipient.address;
      try {
        await sendEmail({ to, subject: `[TABIBI SOC] ${trigger}: ${type}`, body });
        results.push(logAlert({ type: 'ALERT', trigger, channel: 'email', to, message: `${type} attack (score:${score}) from ${entry.ip || '?'}`, status: 'SENT' }));
      } catch (err) {
        results.push(logAlert({ type: 'ALERT', trigger, channel: 'email', to, message: `${type} attack delivery failed`, status: 'FAILED', error: err.message }));
      }
    }
  }

  if (state.phones.length && state.twilio.sid && state.twilio.token && state.twilio.from) {
    for (const phone of state.phones) {
      const to = phone.number;
      const result = await sendSms({ to, body: body.slice(0, 1500) });
      results.push(logAlert({ type: 'ALERT', trigger, channel: 'sms', to, message: `${type} attack (score:${score}) from ${entry.ip || '?'}`, status: result.success ? 'SENT' : 'FAILED', error: result.error }));
    }
  }
  return results;
}

module.exports = {
  publicConfig,
  updateConfig,
  logAlert,
  clearLog,
  sendEmail,
  sendSms,
  dispatchAttack,
  state
};
