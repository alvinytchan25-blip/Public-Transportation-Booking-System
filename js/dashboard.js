/* Transpo — dashboard page */

(function () {
  'use strict';

  var user = PTB.getCurrentUser();
  if (!user) return;

  var firstName = user.fullName.split(' ')[0] || 'Rider';
  document.getElementById('userName').textContent = firstName;

  var bookings = PTB.getBookings(user.id);
  var active = bookings.filter(function (b) {
    return b.status === 'Active';
  }).length;

  document.getElementById('statActive').textContent = active;
  document.getElementById('statTotal').textContent = bookings.length;

  var welcomeLine = document.getElementById('welcomeLine');
  if (active > 0) {
    welcomeLine.textContent =
      'You have ' + active + ' active booking' + (active > 1 ? 's' : '') + '. Safe trip!';
  }

  var clickables = document.querySelectorAll('.menu-card[data-goto], .stat-card[data-goto]');
  clickables.forEach(function (el) {
    el.addEventListener('click', function () {
      location.href = el.getAttribute('data-goto');
    });
  });
})();