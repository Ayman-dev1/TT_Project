'use strict';

/**
 * Computes a 0-100 system health score from the attack log.
 * Each critical attack (score >= 100) subtracts 2 points.
 * Each high-severity attack (score >= 60) subtracts 1 point.
 * All others subtract 0.5 points.
 * Health floors at 0.
 *
 * @param {Array} logs - Array of attack log entries
 * @returns {number} Health percentage (0–100)
 */
function computeHealthFromLogs(logs) {
  const penalty = (Array.isArray(logs) ? logs : []).reduce((sum, a) => {
    const s = Number(a.score || 50);
    return sum + (s >= 100 ? 2 : s >= 60 ? 1 : 0.5);
  }, 0);
  return Math.max(0, Math.round(100 - Math.min(penalty, 99)));
}

module.exports = { computeHealthFromLogs };