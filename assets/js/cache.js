/**
 * Tabibi - In-Memory Cache Layer
 * Wraps localStorage with a Map-based cache to avoid repeated JSON parses.
 * All keys remain identical to the existing storage contract.
 */

(function() {
  'use strict';

  const _cache = new Map();

  /**
   * Read a value — from cache if warm, else from localStorage.
   * @param {string} key
   * @param {*} defaultValue - returned when key is missing
   */
  function getData(key, defaultValue) {
    if (_cache.has(key)) return _cache.get(key);

    try {
      const raw = localStorage.getItem(key);
      if (raw === null) {
        _cache.set(key, defaultValue !== undefined ? defaultValue : null);
        return _cache.get(key);
      }
      const parsed = JSON.parse(raw);
      _cache.set(key, parsed);
      return parsed;
    } catch(e) {
      console.warn('[Tabibi/cache] parse error for key:', key, e);
      return defaultValue !== undefined ? defaultValue : null;
    }
  }

  /**
   * Write a value — updates cache, localStorage, and fires a StorageEvent
   * so that the chat page's storage listener picks up same-tab changes.
   * @param {string} key
   * @param {*} value
   */
  function setData(key, value) {
    const serialized = JSON.stringify(value);
    _cache.set(key, value);
    localStorage.setItem(key, serialized);

    // Manually dispatch StorageEvent for same-tab listeners
    try {
      window.dispatchEvent(new StorageEvent('storage', {
        key,
        newValue: serialized,
        oldValue: null,
        storageArea: localStorage,
        url: window.location.href
      }));
    } catch(e) { /* silent — not all browsers support this */ }
  }

  /**
   * Remove a specific key from both cache and localStorage.
   */
  function removeData(key) {
    _cache.delete(key);
    localStorage.removeItem(key);
  }

  /**
   * Invalidate a single cache entry (forces next read from localStorage).
   */
  function invalidate(key) {
    _cache.delete(key);
  }

  // Expose on window for shared.js usage (non-module pattern)
  window.TabibiCache = { getData, setData, removeData, invalidate };

})();
