/* Transpo — arrival reminder
   A trip is replayed from the schedule saved on the booking, so the driver keeps
   moving even while the rider is reading some other page. Nothing has to be
   watching for that to happen: whichever page is open picks the trip up from
   the clock and says so here.

   One reminder at a time, oldest arrival first, dismissed with OK or by its own
   timer. A reminder that is not dealt with stays pending, so it is still waiting
   on the next page opened. */

(function () {
  'use strict';

  /* How long a reminder stays on screen before it dismisses itself. */
  var NOTICE_MS = 30 * 1000;

  /* How often the pending arrivals are checked. */
  var TICK_MS = 1000;

  var user = PTB.getCurrentUser();
  if (!user) return;

  var overlay = null;
  var current = null;
  var queue = [];
  var seenCount = 0;
  var dismissTimer = null;

  /* Same overlay the booking page shows while it looks for a driver, so a
     reminder needs no styling of its own. */
  function build() {
    overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML =
      '<div class="overlay-box">' +
        '<div class="pulse-road" data-icon>🚗</div>' +
        '<div class="ov-title" data-title></div>' +
        '<div class="ov-sub" data-sub></div>' +
        '<button type="button" class="btn btn-primary btn-block btn-lg mt-8" ' +
          'data-ok>OK</button>' +
      '</div>';

    overlay.querySelector('[data-ok]').addEventListener('click', dismiss);
    document.body.appendChild(overlay);
  }

  function describe(booking) {
    var where = booking.pickup || 'your pickup point';
    return booking.serviceName + ' · ' + where + ' · ' +
      PTB.formatDate(booking.arrivedAt || booking.dateTime);
  }

  function showNext() {
    current = queue[0] || null;
    if (!current) return;

    if (!overlay) build();

    overlay.querySelector('[data-icon]').textContent =
      current.serviceIcon || '🚗';
    overlay.querySelector('[data-title]').textContent =
      current.driverName + ' has arrived';
    overlay.querySelector('[data-sub]').textContent = describe(current);
    overlay.classList.add('show');

    clearTimeout(dismissTimer);
    dismissTimer = setTimeout(dismiss, NOTICE_MS);
  }

  /* OK and the timer both end the same way: the reminder is dealt with and the
     next one takes its place. The queue is rebuilt from storage rather than
     stepped through, so the reminder just handled cannot come back. */
  function dismiss() {
    clearTimeout(dismissTimer);
    dismissTimer = null;

    if (current) PTB.ackArrivalNotice(current.bookingId);
    if (overlay) overlay.classList.remove('show');

    current = null;
    poll();
  }

  /* Pending arrivals are the source of truth, so a reminder opened on another
     page, or missed entirely, is still waiting here. */
  function poll() {
    var pending = PTB.pendingArrivalNotices(user.id);

    /* More reminders than last time means a driver just got here. Say so, so
       pages on screen can redraw themselves. */
    if (pending.length > seenCount) {
      document.dispatchEvent(new CustomEvent(PTB.ARRIVED_EVENT, {
        detail: pending[pending.length - 1]
      }));
    }
    seenCount = pending.length;

    queue = pending.filter(function (b) {
      return !current || b.bookingId !== current.bookingId;
    });

    if (!current) showNext();
  }

  /* Background tabs get their timers throttled, so a reminder can be late but
     never lost. Catch up the moment the rider looks at the page again. */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) poll();
  });
  window.addEventListener('focus', poll);

  poll();
  setInterval(poll, TICK_MS);
})();