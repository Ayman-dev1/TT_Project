/**
 * Tabibi - Debounced Form Validation
 * Adds real-time inline feedback on auth form fields.
 * Does NOT block form submission — existing submit handlers unchanged.
 */

(function() {
  'use strict';

  function debounce(fn, delay) {
    let timer;
    return function(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function setFieldState(input, valid) {
    if (valid) {
      input.style.borderColor = '#0FBF00';
      input.style.background  = '';
    } else {
      input.style.borderColor = '#DF1F32';
      input.style.background  = '#FEF2F2';
    }
  }

  function clearFieldState(input) {
    input.style.borderColor = '';
    input.style.background  = '';
  }

  function attachValidation() {
    // Email fields
    document.querySelectorAll('input[type="email"]').forEach(input => {
      input.addEventListener('input', debounce(function() {
        const val = this.value.trim();
        if (!val) { clearFieldState(this); return; }
        setFieldState(this, isValidEmail(val));
      }, 300));
      input.addEventListener('blur', function() {
        if (!this.value.trim()) clearFieldState(this);
      });
    });

    // Password fields
    document.querySelectorAll('input[type="password"]').forEach(input => {
      input.addEventListener('input', debounce(function() {
        const val = this.value;
        if (!val) { clearFieldState(this); return; }
        setFieldState(this, val.length >= 6);
      }, 300));
      input.addEventListener('blur', function() {
        if (!this.value) clearFieldState(this);
      });
    });

    // Required text fields (name, etc.)
    document.querySelectorAll('input[type="text"][required], input[type="text"][id*="Name"], input[type="text"][id*="name"]').forEach(input => {
      input.addEventListener('input', debounce(function() {
        const val = this.value.trim();
        if (!val) { clearFieldState(this); return; }
        setFieldState(this, val.length >= 2);
      }, 300));
      input.addEventListener('blur', function() {
        if (!this.value.trim()) clearFieldState(this);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachValidation);
  } else {
    attachValidation();
  }

  window.TabibiValidation = { attach: attachValidation };

})();
