/**
 * Tabibi - Lazy Image Loader
 * Uses IntersectionObserver to load images only when they scroll into view.
 * Images need data-src attribute; native loading="lazy" acts as fallback.
 */

(function() {
  'use strict';

  function initLazyLoad() {
    const images = document.querySelectorAll('img[data-src]');
    if (!images.length) return;

    // Feature detect IntersectionObserver
    if (!('IntersectionObserver' in window)) {
      // Fallback: load all images immediately
      images.forEach(img => {
        img.src = img.dataset.src;
        img.classList.add('loaded');
      });
      return;
    }

    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const img = entry.target;
        img.src = img.dataset.src;
        img.classList.add('lazy-img');
        img.onload = () => img.classList.add('loaded');
        img.onerror = () => img.classList.add('loaded'); // don't hang on error
        obs.unobserve(img);
      });
    }, {
      rootMargin: '100px 0px', // start loading 100px before entering viewport
      threshold: 0
    });

    images.forEach(img => {
      img.classList.add('lazy-img');
      observer.observe(img);
    });
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLazyLoad);
  } else {
    initLazyLoad();
  }

  // Expose for manual re-runs (e.g., after dynamic card renders)
  window.TabibiLazy = { init: initLazyLoad };

})();
