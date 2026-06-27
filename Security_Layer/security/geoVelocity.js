'use strict';

const https = require('https');

// ─── Config ───────────────────────────────────────────────────────────────────
const MAX_SPEED_KPH   = 1200;   // Max physical travel speed before "impossible" flag
const MIN_DISTANCE_KM = 100;    // Minimum distance (km) to bother checking speed
const SESSION_TTL_MS  = 30 * 24 * 60 * 60 * 1000; // 30 days — discard old logins

// ─── In-memory stores ─────────────────────────────────────────────────────────
const lastLogin = Object.create(null); // { userId: { ip, lat, lon, city, countryCode, time } }
const geoCache  = Object.create(null); // { ip: { lat, lon, country, ... , ts } }
const GEO_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// ─── Haversine distance ───────────────────────────────────────────────────────
/**
 * Calculates the great-circle distance between two lat/lon points in kilometres.
 * @returns {number} Distance in km
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── IP geolocation ───────────────────────────────────────────────────────────
/**
 * Geolocates an IP address using ip-api.com (free tier, no API key required).
 * Private/loopback addresses return null.
 * Results are cached for GEO_CACHE_TTL milliseconds.
 *
 * @param {string} ip
 * @returns {Promise<object|null>} Geo record or null if unavailable
 */
function geolocate(ip) {
  return new Promise((resolve) => {
    // Skip private / loopback addresses — no public geo data available
    if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|localhost)/.test(ip)) {
      return resolve(null);
    }

    const cached = geoCache[ip];
    if (cached && Date.now() - cached.ts < GEO_CACHE_TTL) {
      return resolve(cached);
    }

    const req = https.get(
      `https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,city,lat,lon,isp,mobile,proxy`,
      { timeout: 3000 },
      (res) => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            if (data.status !== 'success') return resolve(null);
            const geo = {
              lat: data.lat, lon: data.lon,
              country: data.country, countryCode: data.countryCode,
              city: data.city, isp: data.isp,
              mobile: data.mobile, proxy: data.proxy,
              ts: Date.now()
            };
            geoCache[ip] = geo;
            resolve(geo);
          } catch { resolve(null); }
        });
      }
    );
    req.on('error',   () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

// ─── Velocity check ───────────────────────────────────────────────────────────
/**
 * Checks whether the gap between a user's last login location and their current
 * login location is physically possible in the elapsed time.
 *
 * Wire this into your login flow:
 *   const result = await geoVelocity.check(userId, clientIP);
 *   if (result.impossible) { // fire alert, require MFA, etc. }
 *
 * @param {string} userId - Application user ID
 * @param {string} ip     - Current login IP
 * @returns {Promise<object>} Velocity check result
 */
async function check(userId, ip) {
  const currentGeo = await geolocate(ip);
  const last       = lastLogin[userId];

  if (!last) {
    if (currentGeo) lastLogin[userId] = { ip, ...currentGeo, time: Date.now() };
    return { impossible: false, reason: 'No previous login on record', currentGeo };
  }

  if (Date.now() - last.time > SESSION_TTL_MS) {
    if (currentGeo) lastLogin[userId] = { ip, ...currentGeo, time: Date.now() };
    return { impossible: false, reason: 'Previous login record expired', currentGeo };
  }

  if (!currentGeo || !last.lat) {
    if (currentGeo) lastLogin[userId] = { ip, ...currentGeo, time: Date.now() };
    return { impossible: false, reason: 'Geolocation unavailable', currentGeo };
  }

  const distanceKm = haversineKm(last.lat, last.lon, currentGeo.lat, currentGeo.lon);
  const elapsedMs  = Date.now() - last.time;
  const elapsedMin = elapsedMs / 60000;
  const elapsedH   = elapsedMs / 3600000;
  const speedKph   = elapsedH > 0 ? Math.round(distanceKm / elapsedH) : Infinity;

  const impossible = distanceKm > MIN_DISTANCE_KM && speedKph > MAX_SPEED_KPH;
  const suspicious = !impossible && distanceKm > MIN_DISTANCE_KM && speedKph > 500;

  // Always update to the current login position
  lastLogin[userId] = { ip, ...currentGeo, time: Date.now() };

  return {
    impossible,
    suspicious,
    speedKph,
    distanceKm: Math.round(distanceKm),
    elapsedMin: Math.round(elapsedMin),
    fromCity:   `${last.city || '?'}, ${last.countryCode || '?'}`,
    toCity:     `${currentGeo.city || '?'}, ${currentGeo.countryCode || '?'}`,
    fromIP:     last.ip,
    currentGeo,
    reason: impossible
      ? `Impossible travel: ${Math.round(distanceKm)}km in ${Math.round(elapsedMin)}min (${speedKph} km/h)`
      : suspicious
        ? `Suspicious travel: ${Math.round(distanceKm)}km in ${Math.round(elapsedMin)}min`
        : 'Normal'
  };
}

/**
 * Records a successful login for future velocity comparisons.
 * Call this after authentication succeeds.
 * @param {string} userId
 * @param {string} ip
 * @returns {Promise<object|null>} Geo record for the IP
 */
async function recordLogin(userId, ip) {
  const geo = await geolocate(ip);
  if (geo) lastLogin[userId] = { ip, ...geo, time: Date.now() };
  return geo;
}

/** Clears geo-velocity state for a user (e.g. after a forced logout) */
function clearUser(userId) { delete lastLogin[userId]; }

/** @returns {object|null} Last recorded login location for a user */
function getLastLocation(userId) { return lastLogin[userId] || null; }

// ─── Periodic cleanup ─────────────────────────────────────────────────────────
setInterval(() => {
  const cutoff    = Date.now() - SESSION_TTL_MS;
  const geoCutoff = Date.now() - GEO_CACHE_TTL;
  Object.keys(lastLogin).forEach(uid => {
    if (lastLogin[uid].time < cutoff) delete lastLogin[uid];
  });
  Object.keys(geoCache).forEach(ip => {
    if (geoCache[ip].ts < geoCutoff) delete geoCache[ip];
  });
}, 3600000).unref?.();

module.exports = { check, recordLogin, clearUser, getLastLocation, geolocate, haversineKm };