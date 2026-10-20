/* Transpo — completed bookings
   The finished rides, which is what the history page shows when the URL
   asks for no status: history.html */

(function () {
  'use strict';

  var STATUS = PTB.STATUS.COMPLETED;

  /* Only the bookings that finished. */
  function list(userId) {
    return PTB.getBookingsByStatus(userId, STATUS);
  }

  window.CompletedBookings = {
    status: STATUS,
    list: list
  };
})();
