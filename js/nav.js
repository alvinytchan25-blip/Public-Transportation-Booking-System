/* Transpo — responsive navbar */

(function () {
  'use strict';

  var ready = false;

  function markActive(nav) {
    if (!nav) return;

    var links = nav.querySelectorAll('a');
    var current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

    for (var i = 0; i < links.length; i++) {
      var href = (links[i].getAttribute('href') || '').toLowerCase();
      links[i].classList.toggle('active', href === current);
    }
  }

  function init() {
    var topbar = document.querySelector('.topbar');
    if (!topbar || ready) return;

    var nav = topbar.querySelector('.nav-links');
    if (!nav) return;

    ready = true;
    markActive(nav);

    if (topbar.querySelector('.nav-toggle')) return;

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

  function start() {
    init();
    /* header.html is injected asynchronously - re-check until it lands. */
    var tries = 0;
    var timer = setInterval(function () {
      init();
      if (ready || ++tries > 40) clearInterval(timer);
    }, 50);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
