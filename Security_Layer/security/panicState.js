'use strict';

/**
 * Shared singleton panic/lockdown state.
 * When panic mode is active, the WAF blocks all non-exempt routes
 * and the dashboard emits a lockdown event to all connected clients.
 */
let _panic = false;

module.exports = {
  /** @returns {boolean} Whether panic/lockdown mode is currently active */
  get: () => _panic,

  /** @param {boolean} v - Set panic mode on or off */
  set: (v) => { _panic = Boolean(v); }
};