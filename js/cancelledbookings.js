/* Transpo — cancelled bookings
   The bookings that were cancelled, shown when the page is opened as
   history.html?status=Cancelled */

(function () {
  'use strict';

  var STATUS = PTB.STATUS.CANCELLED;

  /* Only the bookings that were cancelled. */
  function list(userId) {
    return PTB.getBookingsByStatus(userId, STATUS);
  }

  window.CancelledBookings = {
    status: STATUS,
    list: list
  };
})();
