/* Transpo — shared header loader */
(function () {
  'use strict';

  function init() {
    var host = document.getElementById('site-header');
    if (!host) return;

    fetch('header.html')
      .then(function (res) {
        if (!res.ok) throw new Error('header.html ' + res.status);
        return res.text();
      })
      .then(function (html) {
        host.innerHTML = html;
      })
      .catch(function () {
        /* Header is unavailable (e.g. opened over file://) - leave it empty. */
      });
  }

  init();
})();
