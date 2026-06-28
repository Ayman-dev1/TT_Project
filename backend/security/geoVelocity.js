'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const MAX_SPEED_KPH = Number(process.env.GEO_VELOCITY_MAX_KPH || 1200);
const SUSPICIOUS_SPEED_KPH = Number(process.env.GEO_VELOCITY_SUSPICIOUS_KPH || 500);
const MIN_DISTANCE_KM = Number(process.env.GEO_VELOCITY_MIN_DISTANCE_KM || 100);
const SESSION_TTL_MS = Number(process.env.GEO_VELOCITY_TTL_MS || 30 * 24 * 60 * 60 * 1000);
const GEO_CACHE_TTL = Number(process.env.GEO_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const PERSIST_FILE = process.env.GEO_VELOCITY_STORE || path.join(__dirname, 'geo_velocity_state.json');
const GEO_PROVIDER_BASE = process.env.GEO_VELOCITY_PROVIDER_URL || 'http://ip-api.com/json';

const lastLogin = Object.create(null);
const geoCache = Object.create(null);
const events = [];
const MAX_EVENTS = Number(process.env.GEO_VELOCITY_MAX_EVENTS || 500);

function loadState() {
  try {
    if (!fs.existsSync(PERSIST_FILE)) return;
    const parsed = JSON.parse(fs.readFileSync(PERSIST_FILE, 'utf8'));
    Object.assign(lastLogin, parsed.lastLogin || {});
    Object.assign(geoCache, parsed.geoCache || {});
    if (Array.isArray(parsed.events)) events.splice(0, events.length, ...parsed.events.slice(0, MAX_EVENTS));
  } catch (_) {}
}

function saveState() {
  try {
    fs.mkdirSync(path.dirname(PERSIST_FILE), { recursive: true });
    fs.writeFileSync(PERSIST_FILE, JSON.stringify({ lastLogin, geoCache, events: events.slice(0, MAX_EVENTS) }, null, 2), 'utf8');
  } catch (_) {}
}

loadState();

function isPrivateIP(ip) {
  const value = String(ip || '').replace(/^::ffff:/, '').trim();
  return !value ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0$|::1$|localhost$)/i.test(value);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function geolocate(ip) {
  const clean = String(ip || '').replace(/^::ffff:/, '').trim();
  return new Promise((resolve) => {
    if (isPrivateIP(clean)) return resolve(null);

    const cached = geoCache[clean];
    if (cached && Date.now() - Number(cached.ts || 0) < GEO_CACHE_TTL) return resolve(cached);

    const url = `${GEO_PROVIDER_BASE.replace(/\/$/, '')}/${encodeURIComponent(clean)}?fields=status,country,countryCode,regionName,city,lat,lon,isp,org,mobile,proxy,hosting,query`;
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(
      url,
      { timeout: 3000 },
      (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.status !== 'success') return resolve(null);
            const geo = {
              ip: data.query || clean,
              lat: data.lat,
              lon: data.lon,
              country: data.country,
              countryCode: data.countryCode,
              region: data.regionName,
              city: data.city,
              isp: data.isp,
              org: data.org,
              mobile: Boolean(data.mobile),
              proxy: Boolean(data.proxy),
              hosting: Boolean(data.hosting),
              ts: Date.now()
            };
            geoCache[clean] = geo;
            saveState();
            resolve(geo);
          } catch (_) {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function formatPlace(geo) {
  if (!geo) return 'Unknown';
  return `${geo.city || geo.region || '?'}${geo.countryCode ? ', ' + geo.countryCode : ''}`;
}

async function check(userId, ip, meta = {}) {
  const id = String(userId || '').slice(0, 160);
  const cleanIP = String(ip || '').replace(/^::ffff:/, '').trim();
  if (!id) return { impossible: false, suspicious: false, reason: 'No user id supplied', currentGeo: null };

  const currentGeo = await geolocate(cleanIP);
  const last = lastLogin[id];
  const now = Date.now();

  if (!last) {
    if (currentGeo) {
      lastLogin[id] = { ip: cleanIP, ...currentGeo, time: now, user: meta.user || id, email: meta.email || '' };
      saveState();
    }
    return { impossible: false, suspicious: false, reason: 'No previous login on record', currentGeo };
  }

  if (now - Number(last.time || 0) > SESSION_TTL_MS) {
    if (currentGeo) {
      lastLogin[id] = { ip: cleanIP, ...currentGeo, time: now, user: meta.user || id, email: meta.email || '' };
      saveState();
    }
    return { impossible: false, suspicious: false, reason: 'Previous login record expired', currentGeo, previousGeo: last };
  }

  if (!currentGeo || !last.lat || !last.lon) {
    if (currentGeo) {
      lastLogin[id] = { ip: cleanIP, ...currentGeo, time: now, user: meta.user || id, email: meta.email || '' };
      saveState();
    }
    return { impossible: false, suspicious: false, reason: 'Geolocation unavailable', currentGeo, previousGeo: last };
  }

  const distanceKm = haversineKm(Number(last.lat), Number(last.lon), Number(currentGeo.lat), Number(currentGeo.lon));
  const elapsedMs = Math.max(1, now - Number(last.time || now));
  const elapsedMin = elapsedMs / 60000;
  const speedKph = Math.round(distanceKm / (elapsedMs / 3600000));
  const impossible = distanceKm > MIN_DISTANCE_KM && speedKph > MAX_SPEED_KPH;
  const suspicious = !impossible && distanceKm > MIN_DISTANCE_KM && speedKph > SUSPICIOUS_SPEED_KPH;

  const result = {
    id: `GEO-${now}-${Math.random().toString(16).slice(2, 8)}`,
    userId: id,
    user: meta.user || last.user || id,
    email: meta.email || last.email || '',
    ip: cleanIP,
    fromIP: last.ip,
    impossible,
    suspicious,
    speedKph,
    distanceKm: Math.round(distanceKm),
    elapsedMin: Math.round(elapsedMin),
    fromCity: formatPlace(last),
    toCity: formatPlace(currentGeo),
    previousGeo: last,
    currentGeo,
    time: new Date(now).toISOString(),
    reason: impossible
      ? `Impossible travel: ${Math.round(distanceKm)}km in ${Math.round(elapsedMin)}min (${speedKph} km/h)`
      : suspicious
        ? `Suspicious travel: ${Math.round(distanceKm)}km in ${Math.round(elapsedMin)}min (${speedKph} km/h)`
        : 'Normal'
  };

  lastLogin[id] = { ip: cleanIP, ...currentGeo, time: now, user: result.user, email: result.email };
  if (impossible || suspicious) events.unshift(result);
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;
  saveState();
  return result;
}

async function recordLogin(userId, ip, meta = {}) {
  const geo = await geolocate(ip);
  if (geo && userId) {
    lastLogin[String(userId)] = {
      ip: String(ip || '').replace(/^::ffff:/, '').trim(),
      ...geo,
      time: Date.now(),
      user: meta.user || String(userId),
      email: meta.email || ''
    };
    saveState();
  }
  return geo;
}

function clearUser(userId) {
  delete lastLogin[String(userId || '')];
  saveState();
}

function getLastLocation(userId) {
  return lastLogin[String(userId || '')] || null;
}

function getEvents() {
  return events.slice();
}

function clearAll(options = {}) {
  const clearCache = Boolean(options && options.clearCache);

  events.length = 0;
  Object.keys(lastLogin).forEach(userId => {
    delete lastLogin[userId];
  });

  if (clearCache) {
    Object.keys(geoCache).forEach(ip => {
      delete geoCache[ip];
    });
  }

  saveState();
  return getSnapshot();
}

// Backward-compatible behavior for the existing DELETE /api/geo-velocity/events route.
// Clearing the Geo Velocity panel must also remove tracked-user baselines, otherwise
// USERS TRACKED is immediately restored from geo_velocity_state.json after refresh.
function clearEvents() {
  return clearAll();
}

function getSnapshot() {
  return {
    events: getEvents(),
    usersTracked: Object.keys(lastLogin).length,
    cacheSize: Object.keys(geoCache).length,
    thresholds: { maxSpeedKph: MAX_SPEED_KPH, suspiciousSpeedKph: SUSPICIOUS_SPEED_KPH, minDistanceKm: MIN_DISTANCE_KM }
  };
}

setInterval(() => {
  const loginCutoff = Date.now() - SESSION_TTL_MS;
  const geoCutoff = Date.now() - GEO_CACHE_TTL;
  Object.keys(lastLogin).forEach(uid => {
    if (Number(lastLogin[uid].time || 0) < loginCutoff) delete lastLogin[uid];
  });
  Object.keys(geoCache).forEach(ip => {
    if (Number(geoCache[ip].ts || 0) < geoCutoff) delete geoCache[ip];
  });
  saveState();
}, 3600000).unref?.();

module.exports = {
  check,
  recordLogin,
  clearUser,
  getLastLocation,
  getEvents,
  clearEvents,
  clearAll,
  getSnapshot,
  geolocate,
  haversineKm
};
