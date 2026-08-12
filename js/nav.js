/* Transpo — responsive navbar */

(function () {
  'use strict';

  function init() {
    var topbar = document.querySelector('.topbar');
    if (!topbar) return;

    var nav = topbar.querySelector('.nav-links');
    if (!nav) return;

    var btn = document.createElement('button');
    btn.className = 'nav-toggle';
    btn.setAttribute('aria-label', 'Toggle navigation menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.type = 'button';
    btn.innerHTML = '<span></span><span></span><span></span>';

    topbar.appendChild(btn);

    function close() {
      nav.classList.remove('open');
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }

    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    });

    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) close();
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.topbar')) close();
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 560) close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();