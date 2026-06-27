'use strict';

/**
 * Returns current time formatted as Cairo local time string.
 * Falls back to ISO string if locale API fails.
 */
function cairoNow() {
  try {
    return new Date().toLocaleString('en-GB', {
      timeZone: 'Africa/Cairo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    }) + ' CAI';
  } catch (e) {
    return new Date().toISOString();
  }
}

/** Returns current time as ISO 8601 string. */
function isoNow() {
  return new Date().toISOString();
}

module.exports = { cairoNow, isoNow };