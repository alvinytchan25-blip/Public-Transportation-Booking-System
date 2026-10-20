/* Transpo — dashboard page */

(function () {
  'use strict';

  var user = PTB.getCurrentUser();
  if (!user) return;

  var firstName = user.fullName.split(' ')[0] || 'Rider';
  document.getElementById('userName').textContent = firstName;

  var welcomeLine = document.getElementById('welcomeLine');

  function renderStats() {
    var active = PTB.getBookingsByStatus(user.id, PTB.STATUS.ACTIVE).length +
      PTB.getBookingsByStatus(user.id, PTB.STATUS.PENDING).length;

    document.getElementById('statActive').textContent = active;
    document.getElementById('statCancelled').textContent =
      PTB.getBookingsByStatus(user.id, PTB.STATUS.CANCELLED).length;

    if (active > 0) {
      welcomeLine.textContent =
        'You have ' + active + ' active booking' + (active > 1 ? 's' : '') + '. Safe trip!';
    }
  }

  renderStats();

  /* A trip can run out while this page is open, so the counts move on their own. */
  document.addEventListener(PTB.ARRIVED_EVENT, renderStats);

  /* A menu card opens a page; a stat card opens that status of the history. */
  document.querySelectorAll('[data-goto], [data-status]').forEach(function (el) {
    el.addEventListener('click', function () {
      var status = el.getAttribute('data-status');
      location.href = status
        ? PTB.historyUrl(status)
        : el.getAttribute('data-goto');
    });
  });
})();
