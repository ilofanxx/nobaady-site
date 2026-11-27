/* Shows the fixed download bar once the hero button has scrolled away. No network calls. */
(function () {
  'use strict';
  var bar = document.querySelector('[data-stick]');
  var hero = document.querySelector('.hero .btn-dl');
  if (!bar) return;
  if (!hero || !('IntersectionObserver' in window)) { bar.classList.add('on'); return; }
  new IntersectionObserver(function (es) {
    bar.classList.toggle('on', !es[0].isIntersecting);
  }, { threshold: 0 }).observe(hero);
})();
