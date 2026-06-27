'use strict';

// ─── In-memory state ──────────────────────────────────────────────────────────
const userBookTracker   = Object.create(null); // { userId: { count, window, doctors: Set } }
const bookingRegistry   = Object.create(null); // { bookingId: { userId, doctorId, ip, bookedAt, paid, paidAt } }
const ipTracker         = Object.create(null); // { ip: { count, window } }
const subnetTracker     = Object.create(null); // { subnet: { count, window } }
const doctorTargetMap   = Object.create(null); // { doctorId: Set<userId> }

// ─── Tunable thresholds (all overridable via .env) ───────────────────────────
const USER_BOOK_LIMIT      = Number(process.env.GUARD_USER_BOOK_LIMIT      || 5);
const USER_WINDOW_MS       = Number(process.env.GUARD_USER_WINDOW_MS       || 3600000);  // 1 hour
const PAYMENT_TIMEOUT_MS   = Number(process.env.GUARD_PAYMENT_TIMEOUT_MS   || 600000);   // 10 min
const RAPID_CANCEL_MS      = Number(process.env.GUARD_RAPID_CANCEL_MS      || 30000);    // 30 sec
const DOCTOR_TARGET_LIMIT  = Number(process.env.GUARD_DOCTOR_TARGET_LIMIT  || 20);
const SUBNET_LIMIT         = Number(process.env.GUARD_SUBNET_LIMIT         || 10);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function nowMs()  { return Date.now(); }

function ipToSubnet(ip) {
  if (!ip || ip.includes(':')) return ip || '0';
  const parts = ip.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.0` : ip;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Checks whether a booking attempt should be blocked or flagged.
 * Call this BEFORE saving the booking to your database.
 *
 * @param {object} opts
 * @param {string}  opts.userId   - User trying to book
 * @param {string}  opts.doctorId - Doctor being booked
 * @param {string}  opts.ip       - Client IP
 * @returns {{ blocked: boolean, suspicious: boolean, score: number, reason: string, threat?: string }}
 */
function checkBooking({ userId, doctorId, ip }) {
  const now    = nowMs();
  const subnet = ipToSubnet(ip);

  // ── Per-user rate limit ───────────────────────────────────────────────────
  let uRec = userBookTracker[userId];
  if (!uRec || now - uRec.window > USER_WINDOW_MS) {
    uRec = { count: 0, window: now, doctors: new Set() };
    userBookTracker[userId] = uRec;
  }
  if (uRec.count >= USER_BOOK_LIMIT) {
    return {
      blocked: true, suspicious: true, score: 70, threat: 'APPOINTMENT_SPAM',
      reason: `User ${userId} has made ${uRec.count} bookings in the last hour — rate limit exceeded.`
    };
  }

  // ── Doctor targeting (many different users booking one doctor from one subnet) ─
  let sRec = subnetTracker[subnet];
  if (!sRec || now - sRec.window > USER_WINDOW_MS) {
    sRec = { count: 0, window: now };
    subnetTracker[subnet] = sRec;
  }
  if (sRec.count >= SUBNET_LIMIT) {
    return {
      blocked: true, suspicious: true, score: 75, threat: 'COORDINATED_BOOKING',
      reason: `Coordinated booking attack: ${sRec.count} bookings from subnet ${subnet} in the last hour.`
    };
  }

  // ── One doctor getting bombarded by many unique users ─────────────────────
  if (!doctorTargetMap[doctorId]) doctorTargetMap[doctorId] = new Set();
  if (doctorTargetMap[doctorId].size >= DOCTOR_TARGET_LIMIT) {
    return {
      blocked: true, suspicious: true, score: 80, threat: 'DOCTOR_TARGETING',
      reason: `Doctor ${doctorId} has been targeted by ${doctorTargetMap[doctorId].size} unique users — potential coordinated attack.`
    };
  }

  return { blocked: false, suspicious: false, score: 0, reason: '' };
}

/**
 * Records a successful booking. Call this AFTER saving to your database.
 *
 * @param {object} opts
 * @param {string} opts.bookingId
 * @param {string} opts.userId
 * @param {string} opts.doctorId
 * @param {string} opts.ip
 */
function recordBooking({ bookingId, userId, doctorId, ip }) {
  const now    = nowMs();
  const subnet = ipToSubnet(ip);

  bookingRegistry[bookingId] = {
    userId, doctorId, ip, subnet,
    bookedAt: now,
    paid: false,
    paidAt: null,
    cancelled: false,
    cancelledAt: null
  };

  // Update user tracker
  let uRec = userBookTracker[userId];
  if (!uRec || now - uRec.window > USER_WINDOW_MS) {
    uRec = { count: 0, window: now, doctors: new Set() };
    userBookTracker[userId] = uRec;
  }
  uRec.count++;
  uRec.doctors.add(doctorId);

  // Update subnet tracker
  let sRec = subnetTracker[subnet];
  if (!sRec || now - sRec.window > USER_WINDOW_MS) {
    sRec = { count: 0, window: now };
    subnetTracker[subnet] = sRec;
  }
  sRec.count++;

  // Update doctor target map
  if (!doctorTargetMap[doctorId]) doctorTargetMap[doctorId] = new Set();
  doctorTargetMap[doctorId].add(userId);
}

/**
 * Records payment for a booking.
 *
 * @param {string} bookingId
 * @returns {{ success: boolean, alreadyPaid?: boolean, notFound?: boolean }}
 */
function recordPayment(bookingId) {
  const rec = bookingRegistry[bookingId];
  if (!rec) return { success: false, notFound: true };
  if (rec.paid) return { success: true, alreadyPaid: true };
  rec.paid   = true;
  rec.paidAt = nowMs();
  return { success: true, bookingId, paidAt: new Date(rec.paidAt).toISOString() };
}

/**
 * Checks whether a cancellation is suspicious (too rapid after booking).
 *
 * @param {string} bookingId
 * @returns {{ suspicious: boolean, reason: string, booking?: object }}
 */
function checkCancellation(bookingId) {
  const rec = bookingRegistry[bookingId];
  if (!rec) return { suspicious: false, reason: 'Booking not found in guard registry' };

  const elapsed   = nowMs() - rec.bookedAt;
  const rapid     = elapsed < RAPID_CANCEL_MS;
  const unpaid    = !rec.paid;

  rec.cancelled   = true;
  rec.cancelledAt = nowMs();

  if (rapid && unpaid) {
    return {
      suspicious: true,
      reason: `Booking ${bookingId} cancelled within ${Math.round(elapsed / 1000)}s without payment — possible slot squatting.`,
      booking: { bookingId, userId: rec.userId, doctorId: rec.doctorId, elapsedMs: elapsed }
    };
  }

  return { suspicious: false, reason: '', booking: { bookingId, userId: rec.userId, doctorId: rec.doctorId } };
}

/**
 * Returns all bookings that were never paid within the payment timeout window.
 *
 * @returns {Array<{ bookingId, userId, doctorId, bookedAt, elapsedMs }>}
 */
function getExpiredUnpaidBookings() {
  const now     = nowMs();
  const expired = [];
  for (const [bookingId, rec] of Object.entries(bookingRegistry)) {
    if (!rec.paid && !rec.cancelled && (now - rec.bookedAt) > PAYMENT_TIMEOUT_MS) {
      expired.push({
        bookingId,
        userId:    rec.userId,
        doctorId:  rec.doctorId,
        ip:        rec.ip,
        bookedAt:  new Date(rec.bookedAt).toISOString(),
        elapsedMs: now - rec.bookedAt
      });
    }
  }
  return expired;
}

/**
 * Returns booking statistics, optionally filtered by userId or doctorId.
 *
 * @param {object} [opts]
 * @param {string} [opts.userId]
 * @param {string} [opts.doctorId]
 * @returns {object}
 */
function getStats({ userId, doctorId } = {}) {
  const all = Object.entries(bookingRegistry);
  const filtered = all.filter(([, rec]) => {
    if (userId   && rec.userId   !== userId)   return false;
    if (doctorId && rec.doctorId !== doctorId) return false;
    return true;
  });

  const total     = filtered.length;
  const paid      = filtered.filter(([, r]) => r.paid).length;
  const cancelled = filtered.filter(([, r]) => r.cancelled).length;
  const unpaid    = filtered.filter(([, r]) => !r.paid && !r.cancelled).length;

  return {
    total, paid, cancelled, unpaid,
    uniqueUsers:   new Set(filtered.map(([, r]) => r.userId)).size,
    uniqueDoctors: new Set(filtered.map(([, r]) => r.doctorId)).size,
  };
}

// ─── Periodic cleanup ─────────────────────────────────────────────────────────
setInterval(() => {
  const now    = nowMs();
  const cutoff = now - USER_WINDOW_MS * 2;

  // Clean user trackers
  Object.keys(userBookTracker).forEach(uid => {
    if (now - userBookTracker[uid].window > USER_WINDOW_MS * 2) delete userBookTracker[uid];
  });

  // Clean subnet trackers
  Object.keys(subnetTracker).forEach(s => {
    if (now - subnetTracker[s].window > USER_WINDOW_MS * 2) delete subnetTracker[s];
  });

  // Reset doctor target map daily
  Object.keys(doctorTargetMap).forEach(did => {
    delete doctorTargetMap[did];
  });

  // Clean old booking registry entries (keep 48 hours)
  const registryCutoff = now - 48 * 3600000;
  Object.keys(bookingRegistry).forEach(bid => {
    if (bookingRegistry[bid].bookedAt < registryCutoff) delete bookingRegistry[bid];
  });
}, 3600000).unref?.();

module.exports = {
  checkBooking,
  recordBooking,
  recordPayment,
  checkCancellation,
  getExpiredUnpaidBookings,
  getStats
};
