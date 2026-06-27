'use strict';

// ─── In-memory state ──────────────────────────────────────────────────────────
const ipDoctorTracker   = Object.create(null); // { 'ip:doctorId': { count, window, ratings[] } }
const subnetTracker     = Object.create(null); // { 'subnet:doctorId': count }
const doctorRateTracker = Object.create(null); // { doctorId: [timestampMs, ...] }
const userRateTracker   = Object.create(null); // { userId: { count, window, doctors: Set } }

// ─── Tunable thresholds ───────────────────────────────────────────────────────
const IP_LIMIT        = Number(process.env.RATING_IP_LIMIT     || 3);   // per IP per doctor per window
const SUBNET_LIMIT    = Number(process.env.RATING_SUBNET_LIMIT || 8);   // per /24 subnet per doctor per day
const USER_LIMIT      = Number(process.env.RATING_USER_LIMIT   || 5);   // per user per window
const WINDOW_MS       = Number(process.env.RATING_WINDOW_MS    || 3600000); // 1 hour
const BURST_WINDOW_MS = 60000;  // 1 minute window for burst detection
const BURST_LIMIT     = 10;     // max ratings for one doctor in 1 minute

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ipToSubnet(ip) {
  if (!ip || ip.includes(':')) return ip || '0';
  const parts = ip.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0` : ip;
}

function nowMs() { return Date.now(); }

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Checks whether a rating submission should be blocked or flagged.
 * Call this BEFORE saving the rating to your database.
 *
 * @param {object} opts
 * @param {string}  opts.userId         - User submitting the rating
 * @param {string}  opts.doctorId       - Doctor being rated
 * @param {number}  opts.rating         - Rating value (1–5)
 * @param {string}  opts.ip             - Client IP
 * @param {boolean} [opts.hasAppointment=false] - Whether the user had a verified appointment
 * @returns {{ blocked: boolean, suspicious: boolean, score: number, reason: string }}
 */
function checkRating({ userId, doctorId, rating, ip, hasAppointment = false }) {
  const now    = nowMs();
  const subnet = ipToSubnet(ip);

  const unverified = !hasAppointment;

  // ── IP-per-doctor limit ───────────────────────────────────────────────────
  const ipKey = `${ip}:${doctorId}`;
  let ipRec   = ipDoctorTracker[ipKey];
  if (!ipRec || now - ipRec.window > WINDOW_MS) {
    ipRec = { count: 0, window: now, ratings: [] };
    ipDoctorTracker[ipKey] = ipRec;
  }
  if (ipRec.count >= IP_LIMIT) {
    return {
      blocked: true, suspicious: true, score: 80,
      reason: `Review bombing: ${ipRec.count} ratings for the same doctor from IP ${ip} in the last hour.`
    };
  }

  // ── Subnet coordinated attack ─────────────────────────────────────────────
  const subnetKey   = `${subnet}:${doctorId}`;
  const subnetCount = subnetTracker[subnetKey] || 0;
  if (subnetCount >= SUBNET_LIMIT) {
    return {
      blocked: true, suspicious: true, score: 75,
      reason: `Coordinated rating attack: ${subnetCount} ratings from subnet ${subnet} for the same doctor.`
    };
  }

  // ── Burst detection (many ratings for one doctor in 1 minute) ────────────
  let dRec = doctorRateTracker[doctorId];
  if (!dRec) { dRec = []; doctorRateTracker[doctorId] = dRec; }
  const burstCutoff = now - BURST_WINDOW_MS;
  while (dRec.length > 0 && dRec[0] < burstCutoff) dRec.shift();
  if (dRec.length >= BURST_LIMIT) {
    return {
      blocked: true, suspicious: true, score: 85,
      reason: `Rating burst: ${dRec.length} ratings in 1 minute for doctor ${doctorId} — coordinated attack suspected.`
    };
  }

  // ── Per-user rate limit ───────────────────────────────────────────────────
  let uRec = userRateTracker[userId];
  if (!uRec || now - uRec.window > WINDOW_MS) {
    uRec = { count: 0, window: now, doctors: new Set() };
    userRateTracker[userId] = uRec;
  }
  if (uRec.count >= USER_LIMIT) {
    return {
      blocked: true, suspicious: true, score: 70,
      reason: `User ${userId} has submitted ${uRec.count} ratings in the last hour — rate limit exceeded.`
    };
  }

  // ── Unverified appointment flag (soft suspicious, not blocked) ────────────
  return {
    blocked:    false,
    suspicious: unverified,
    score:      unverified ? 20 : 0,
    reason:     unverified ? 'Rating submitted without verified appointment — flagged for review' : ''
  };
}

/**
 * Records a rating submission so future calls to checkRating can count it.
 * Call this AFTER saving the rating to your database (if not blocked).
 *
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.doctorId
 * @param {string} opts.ip
 */
function recordRating({ userId, doctorId, ip }) {
  const now       = nowMs();
  const subnet    = ipToSubnet(ip);
  const ipKey     = `${ip}:${doctorId}`;
  const subnetKey = `${subnet}:${doctorId}`;

  let ipRec = ipDoctorTracker[ipKey];
  if (!ipRec || now - ipRec.window > WINDOW_MS) {
    ipRec = { count: 0, window: now, ratings: [] };
    ipDoctorTracker[ipKey] = ipRec;
  }
  ipRec.count++;
  ipRec.ratings.push(now);

  subnetTracker[subnetKey] = (subnetTracker[subnetKey] || 0) + 1;

  if (!doctorRateTracker[doctorId]) doctorRateTracker[doctorId] = [];
  doctorRateTracker[doctorId].push(now);

  let uRec = userRateTracker[userId];
  if (!uRec || now - uRec.window > WINDOW_MS) {
    uRec = { count: 0, window: now, doctors: new Set() };
    userRateTracker[userId] = uRec;
  }
  uRec.count++;
  uRec.doctors.add(doctorId);
}

/**
 * Returns burst detection stats for a specific doctor.
 * @param {string} doctorId
 * @returns {{ doctorId, ratingsLastMinute, burstDetected }}
 */
function getDoctorStats(doctorId) {
  const burstCutoff = nowMs() - 60000;
  const recent      = (doctorRateTracker[doctorId] || []).filter(t => t >= burstCutoff);
  return {
    doctorId,
    ratingsLastMinute: recent.length,
    burstDetected:     recent.length >= BURST_LIMIT
  };
}

// ─── Periodic cleanup ─────────────────────────────────────────────────────────
let _lastSubnetClean = Date.now();

setInterval(() => {
  const now = nowMs();
  Object.keys(ipDoctorTracker).forEach(k => {
    if (now - ipDoctorTracker[k].window > WINDOW_MS * 2) delete ipDoctorTracker[k];
  });
  Object.keys(userRateTracker).forEach(k => {
    if (now - userRateTracker[k].window > WINDOW_MS * 2) delete userRateTracker[k];
  });
  if (now - _lastSubnetClean >= 86400000) {
    Object.keys(subnetTracker).forEach(k => delete subnetTracker[k]);
    _lastSubnetClean = now;
  }
}, 3600000).unref?.();

module.exports = { checkRating, recordRating, getDoctorStats };