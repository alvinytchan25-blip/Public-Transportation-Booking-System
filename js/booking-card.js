/* Transpo — shared booking card
   Used by history.js and activebookings.js so the card is written only once.
   An active booking carries two actions: Track Driver (opens live tracking in
   place) and Cancel Booking. Once the driver reaches the pickup point the
   booking is no longer active, so it leaves this card entirely. */

(function () {
  'use strict';

  /* How long the "Confirm Cancel?" button waits before going back to normal. */
  var CONFIRM_MS = 4000;

  /* One badge per status, so a new status only needs an entry here. */
  var BADGES = {};
  var BADGE_CLASS = {};

  BADGES[PTB.STATUS.PENDING] = 'Pending Acceptance';
  BADGES[PTB.STATUS.ACTIVE] = 'Active';
  BADGES[PTB.STATUS.CANCELLED] = 'Cancelled';
  BADGES[PTB.STATUS.COMPLETED] = 'Completed';

  BADGE_CLASS[PTB.STATUS.PENDING] = 'badge-pending';
  BADGE_CLASS[PTB.STATUS.ACTIVE] = 'badge-active';
  BADGE_CLASS[PTB.STATUS.CANCELLED] = 'badge-cancelled';
  BADGE_CLASS[PTB.STATUS.COMPLETED] = 'badge-completed';

  /* A booking that is still upcoming says the day it is for rather than a bare
     status, so a confirmed ride for tomorrow reads as "Tomorrow", not "Active".
     Once the day is further out than Today/Tomorrow/Yesterday the status word
     comes back, so the badge never turns into a full date. */
  var DAY_WORDS = { Today: true, Tomorrow: true, Yesterday: true };

  function statusBadge(booking) {
    var status = booking.status;
    var label = BADGES[status] || BADGES[PTB.STATUS.CANCELLED];
    var cls = BADGE_CLASS[status] || BADGE_CLASS[PTB.STATUS.CANCELLED];

    if (status === PTB.STATUS.ACTIVE || status === PTB.STATUS.PENDING) {
      var day = PTB.dayLabel(booking.dateTime);
      if (DAY_WORDS[day]) label = day;
    }

    return '<span class="badge ' + cls + '">● ' + label + '</span>';
  }

  /* Footer controls for an active booking. */
  function activeActions(booking) {
    return (
      '<div class="booking-actions">' +
        '<button type="button" class="track-btn" data-track="' + booking.bookingId + '">' +
          'Track Driver' +
        '</button>' +
        '<button type="button" class="cancel-btn" data-cancel="' + booking.bookingId + '">' +
          'Cancel Booking' +
        '</button>' +
      '</div>'
    );
  }

  /* A request still awaiting the driver's acceptance has no live trip to
     follow yet, so the only action is to cancel the request. */
  function pendingActions(booking) {
    return (
      '<div class="booking-actions">' +
        '<button type="button" class="cancel-btn" data-cancel="' + booking.bookingId + '">' +
          'Cancel Request' +
        '</button>' +
      '</div>'
    );
  }

  /* A finished ride the rider has not judged yet: one button, which reveals the
     stars in the slot below. It sits beside the driver, because that is who the
     rider is judging. */
  function rateActions(booking) {
    return (
      '<button type="button" class="btn btn-accent" data-rate="' + booking.bookingId + '">' +
        'Rate' +
      '</button>'
    );
  }

  /* Once judged, the stars take the button's place, so the ride keeps a record
     of what it was given. */
  function ratedActions(booking) {
    return (
      '<span class="rate-saved">' +
        PTB.formatStars(booking.rating) +
        '<span class="stars-caption">Your rating</span>' +
      '</span>'
    );
  }

  /* The rating question, above five separate stars so each one is its own tap
     target. data-saved is what the row falls back to when the pointer leaves. */
  function ratePicker(booking) {
    var stars = '';
    for (var i = 1; i <= PTB.RATING_MAX; i++) {
      stars +=
        '<button type="button" class="star" data-star="' + i + '" ' +
          'aria-label="Give ' + i + ' ' + (i === 1 ? 'star' : 'stars') + '">★</button>';
    }

    return (
      '<div class="rate-picker" data-rate-for="' + booking.bookingId + '">' +
        '<div class="rate-question">How\'s your experience?</div>' +
        '<div class="stars" data-saved="0">' + stars + '</div>' +
      '</div>'
    );
  }

  /* Fill the first n stars. Used for the pointer preview and for the saved
     rating, so the row behaves like one control rather than five. */
  function paintStars(row, upTo) {
    row.querySelectorAll('.star').forEach(function (s) {
      s.classList.toggle('on', Number(s.getAttribute('data-star')) <= upTo);
    });
  }

  /* How long a cancelled booking has left before it is purged, said plainly.
     Null when the booking is not cancelled, so the note is simply omitted. */
  function retentionNote(booking) {
    var left = PTB.cancelledRetention(booking);
    if (left == null) return '';

    var hours = left / 3600000;
    var text = hours >= 1
      ? 'Removed in ~' + Math.ceil(hours) + 'h'
      : 'Removed in under an hour';

    return '<div class="retention-note">🗑 ' + text + '</div>';
  }

  function markup(booking) {
    var isPending = booking.status === PTB.STATUS.PENDING;
    var isActive = booking.status === PTB.STATUS.ACTIVE;
    var isCompleted = booking.status === PTB.STATUS.COMPLETED;
    var rated = isCompleted && booking.rating;

    /* A finished ride shows either the Rate button or its saved stars, never
       both, and only ever one slot open at a time per card. The rating control
       rides with the driver; the footer's own actions stay with an active trip
       (or, for a pending request, just the cancel action). */
    var footerActions = isActive
      ? activeActions(booking)
      : isPending
        ? pendingActions(booking)
        : '';

    var driverActions = isCompleted
      ? rated
        ? ratedActions(booking)
        : rateActions(booking)
      : '';

    return (
      '<div class="booking-item"' +
        (isActive ? ' data-booking="' + booking.bookingId + '"' : '') + '>' +
        '<div class="booking-top">' +
          '<div class="booking-service">' +
            '<span class="bs-icon">' + (booking.serviceIcon || '🚗') + '</span>' +
            '<span>' + booking.serviceName + '</span>' +
          '</div>' +
          statusBadge(booking) +
        '</div>' +

        (isPending
          ? '<div class="booking-note">⏳ Waiting for driver acceptance · usually under 10 minutes</div>'
          : '') +

        '<div class="booking-route">' +
          '<div class="br-label">Route</div>' +
          '<div><span class="br-stop">' + booking.pickup + '</span>' +
          '<span class="br-arrow">→</span>' +
          '<span class="br-stop">' + booking.destination + '</span></div>' +
        '</div>' +

        '<div class="booking-meta">' +
          '<div class="bm-item">' +
            '<span class="bm-label">Distance</span>' +
            '<strong>' + booking.distance + ' km</strong>' +
          '</div>' +
          '<div class="bm-item">' +
            '<span class="bm-label">Passengers</span>' +
            '<strong>' + booking.passengers + '</strong>' +
          '</div>' +
          '<div class="bm-item bm-fare">' +
            '<span class="bm-label">Total Fare</span>' +
            '<strong>' + PTB.formatMoney(booking.totalFare) + '</strong>' +
          '</div>' +
        '</div>' +

        '<hr class="divider">' +

        /* Name and phone live in one block: who drove, then how to reach them,
           never split across the card. The rating control shares that row. */
        '<div class="booking-driver">' +
          '<span class="bd-avatar">' + String(booking.driverName || '?').charAt(0) + '</span>' +
          '<span class="bd-info">' +
            '<span class="bd-name">' + booking.driverName + '</span>' +
            '<span class="bd-phone">' + booking.driverPhone + '</span>' +
          '</span>' +
          (driverActions
            ? '<div class="booking-actions bd-action">' + driverActions + '</div>'
            : '') +
        '</div>' +

        '<div class="booking-footer">' +
          '<span class="booking-date">' + PTB.dayLabel(booking.dateTime) + '</span>' +
          footerActions +
        '</div>' +

        retentionNote(booking) +

        (isActive ? '<div class="inline-track-slot hidden" data-track-slot="' +
          booking.bookingId + '"></div>' : '') +

        (isCompleted && !rated ? '<div class="inline-rate-slot hidden" data-rate-slot="' +
          booking.bookingId + '">' + ratePicker(booking) + '</div>' : '') +
      '</div>'
    );
  }

  /* Puts the given bookings into the list element. */
  function render(listEl, bookings) {
    /* Any live tracking from the previous render must be torn down, otherwise
       its interval keeps running against a detached map. */
    stopAll(listEl);
    listEl.innerHTML = bookings.map(markup).join('');
  }

  var running = [];

  function stopAll(listEl) {
    running = running.filter(function (c) {
      if (listEl.contains(c.host)) { c.stop(); return false; }
      return true;
    });
  }

  function findBooking(bookingId) {
    var user = PTB.getCurrentUser();
    if (!user) return null;
    return PTB.getBookings(user.id).find(function (b) {
      return b.bookingId === bookingId;
    }) || null;
  }

  /* Wires Track Driver + Cancel Booking + the rating stars.
       onChange() re-renders the view. */
  function bindActions(listEl, onChange) {
    stopAll(listEl);

    listEl.querySelectorAll('[data-track]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-track');
        var slot = listEl.querySelector('[data-track-slot="' + id + '"]');

        /* Already open, so this tap puts it away and stops the simulation. */
        if (!slot.classList.contains('hidden')) {
          stopAll(listEl);
          slot.classList.add('hidden');
          btn.textContent = 'Track Driver';
          btn.classList.remove('tracking-open');
          return;
        }

        var booking = findBooking(id);
        if (!booking || !PTB.canCancelBooking(booking)) { onChange(); return; }

        stopAll(listEl);
        slot.classList.remove('hidden');
        btn.textContent = 'Hide Tracking';
        btn.classList.add('tracking-open');

        var ctrl = DriverTracking.mount(slot, booking, {
          onArrive: function () {
            /* Arrival retires the booking, so this card is about to disappear
               from the Active list. Refresh and let it go. */
            onChange();
          }
        });
        running.push({ host: slot, stop: ctrl.stop });
      });
    });

    /* Rating a finished ride. Tapping Rate opens the stars in place; a second
       tap puts them away again, the same way Track Driver does. */
    listEl.querySelectorAll('[data-rate]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var slot = listEl.querySelector(
          '[data-rate-slot="' + btn.getAttribute('data-rate') + '"]'
        );
        if (!slot) return;

        var opening = slot.classList.contains('hidden');
        slot.classList.toggle('hidden', !opening);
        btn.textContent = opening ? 'Close' : 'Rate';
      });
    });

    /* Hover fills the row up to the star under the pointer, so the five read as
       one scale. Moving away drops back to nothing: the ride is unrated until a
       star is actually clicked. */
    listEl.querySelectorAll('.stars').forEach(function (row) {
      row.addEventListener('mouseleave', function () {
        paintStars(row, Number(row.getAttribute('data-saved')) || 0);
      });

      row.querySelectorAll('.star').forEach(function (star) {
        var value = Number(star.getAttribute('data-star'));

        star.addEventListener('mouseenter', function () {
          paintStars(row, value);
        });

        star.addEventListener('click', function () {
          var id = row.closest('.rate-picker').getAttribute('data-rate-for');
          /* Redraw either way: saved shows the stars, refused means another
             card already rated this ride. */
          PTB.rateBooking(id, value);
          onChange();
        });
      });
    });

    listEl.querySelectorAll('[data-cancel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var booking = findBooking(btn.getAttribute('data-cancel'));

        /* Re-check against storage: the driver may have arrived since render. */
        if (!PTB.canCancelBooking(booking)) { onChange(); return; }

        // Two-step inline confirmation for good UX
        if (!btn.classList.contains('confirming')) {
          btn.classList.add('confirming');
          btn.textContent = 'Confirm Cancel?';
          setTimeout(function () {
            if (btn.classList.contains('confirming')) {
              btn.classList.remove('confirming');
              btn.textContent = 'Cancel Booking';
            }
          }, CONFIRM_MS);
          return;
        }

        PTB.updateBookingStatus(btn.getAttribute('data-cancel'), PTB.STATUS.CANCELLED);
        onChange();
      });
    });
  }

  window.BookingCard = {
    render: render,
    bindActions: bindActions,
    stopAll: stopAll
  };
})();
