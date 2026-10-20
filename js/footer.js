/* Transpo — shared footer loader */

(function () {
  'use strict';

  function init() {
    var host = document.getElementById('site-footer');
    if (!host) return;

    fetch('footer.html')
      .then(function (res) {
        if (!res.ok) throw new Error('footer.html ' + res.status);
        return res.text();
      })
      .then(function (html) {
        host.innerHTML = html;

        var year = document.getElementById('footerYear');
        if (year) year.textContent = String(new Date().getFullYear());
      })
      .catch(function () {
        /* Footer is unavailable (e.g. opened over file://) - leave it empty. */
      });
  }

  init();
})();
