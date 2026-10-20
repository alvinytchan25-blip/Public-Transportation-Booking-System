/* Transpo — active bookings
   The bookings that are still active, shown when the page is opened as
   history.html?status=Active. Scheduled requests awaiting a driver's
   acceptance live here too, so an open request never disappears from view. */

(function () {
  'use strict';

  var STATUS = PTB.STATUS.ACTIVE;
  var PENDING = PTB.STATUS.PENDING;

  /* Active trips plus requests still awaiting a driver's acceptance. */
  function list(userId) {
    return PTB.getBookings(userId).filter(function (b) {
      return b.status === STATUS || b.status === PENDING;
    });
  }

  window.ActiveBookings = {
    status: STATUS,
    list: list
  };
})();
