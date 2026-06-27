/**
 * Tabibi - Modal Component
 * Reusable Modal class that can wrap existing DOM elements or create new ones.
 * Supports: overlay-click to close, close button, Escape key dismissal.
 * Adds role="dialog" and aria-modal="true" for accessibility.
 */

(function() {
  'use strict';

  class Modal {
    /**
     * Bind to an existing overlay element by ID.
     * @param {string} id - The ID of the .modal-overlay element
     */
    constructor(id) {
      this.overlay = document.getElementById(id);
      if (!this.overlay) {
        console.warn('[Modal] element not found:', id);
        return;
      }

      const inner = this.overlay.querySelector('.modal, .success-modal');
      if (inner) {
        inner.setAttribute('role', 'dialog');
        inner.setAttribute('aria-modal', 'true');
      }

      // Close on overlay click (not on modal itself)
      this.overlay.addEventListener('click', e => {
        if (e.target === this.overlay) this.close();
      });
    }

    open() {
      if (!this.overlay) return;
      this.overlay.classList.add('show');
      // Focus first focusable element inside modal for accessibility
      const focusable = this.overlay.querySelector('input, button, select, textarea, [tabindex]');
      if (focusable) setTimeout(() => focusable.focus(), 50);
      this._escHandler = (e) => { if (e.key === 'Escape') this.close(); };
      document.addEventListener('keydown', this._escHandler);
    }

    close() {
      if (!this.overlay) return;
      this.overlay.classList.remove('show');
      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
        this._escHandler = null;
      }
    }

    /**
     * Create a modal dynamically from an HTML template string.
     * Appends it to <body> and returns a bound Modal instance.
     * @param {string} template - Full outer HTML of the modal-overlay div
     * @returns {Modal}
     */
    static create(template) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = template.trim();
      const el = wrapper.firstElementChild;
      document.body.appendChild(el);
      return new Modal(el.id);
    }
  }

  // Initialize all existing modals on the page
  function initModals() {
    document.querySelectorAll('.modal-overlay[id]').forEach(overlay => {
      new Modal(overlay.id);
    });

    // Escape key closes any open modal globally
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        const open = document.querySelector('.modal-overlay.show');
        if (open) open.classList.remove('show');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initModals);
  } else {
    initModals();
  }

  window.TabibiModal = Modal;

})();
