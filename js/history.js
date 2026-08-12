/* Transpo — booking history */

(function () {
  'use strict';

  var user = PTB.getCurrentUser();
  if (!user) return;

  var listEl = document.getElementById('historyList');
  var emptyState = document.getElementById('emptyState');

  function statusBadge(status) {
    return status === 'Active'
      ? '<span class="badge badge-active">● Active</span>'
      : '<span class="badge badge-cancelled">● Cancelled</span>';
  }

  function renderItem(booking) {
    var item = document.createElement('div');
    item.className = 'booking-item';

    item.innerHTML =
      '<div class="booking-top">' +
        '<div class="booking-service">' +
          '<span class="bs-icon">' + (booking.serviceIcon || '🚗') + '</span>' +
          '<span>' + booking.serviceName + '</span>' +
        '</div>' +
        statusBadge(booking.status) +
      '</div>' +

      '<div class="booking-route">' +
        '<div class="br-label">Route</div>' +
        '<div><span class="br-stop">' + booking.pickup + '</span>' +
        '<span class="br-arrow">→</span>' +
        '<span class="br-stop">' + booking.destination + '</span></div>' +
      '</div>' +

      '<div class="booking-meta">' +
        '<div>Distance: <strong>' + booking.distance + ' km</strong></div>' +
        '<div>Passengers: <strong>' + booking.passengers + '</strong></div>' +
        '<div class="bm-fare">Total Fare: <strong>' + PTB.formatMoney(booking.totalFare) + '</strong></div>' +
        '<div>Driver: <strong>' + booking.driverName + '</strong></div>' +
      '</div>' +

      '<hr class="divider">' +

      '<div class="booking-driver">' +
        'Driver contact: <strong>' + booking.driverPhone + '</strong>' +
      '</div>' +

      '<div class="booking-footer">' +
        '<span class="booking-date">' + PTB.formatDate(booking.dateTime) + '</span>' +
        (booking.status === 'Active'
          ? '<button type="button" class="cancel-btn" data-cancel="' + booking.bookingId + '">Cancel Booking</button>'
          : '') +
      '</div>';

    listEl.appendChild(item);
  }

  function render() {
    var bookings = PTB.getBookings(user.id);
    listEl.innerHTML = '';

    if (bookings.length === 0) {
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    bookings.forEach(renderItem);

    listEl.querySelectorAll('[data-cancel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        // Two-step inline confirmation for good UX
        if (!btn.classList.contains('confirming')) {
          btn.classList.add('confirming');
          btn.textContent = 'Confirm Cancel?';
          setTimeout(function () {
            if (btn.classList.contains('confirming')) {
              btn.classList.remove('confirming');
              btn.textContent = 'Cancel Booking';
            }
          }, 4000);
          return;
        }

        var bookingId = btn.getAttribute('data-cancel');
        PTB.updateBookingStatus(bookingId, 'Cancelled');
        render();
      });
    });
  }

  render();
})();