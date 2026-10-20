
(function (global) {
  'use strict';

  var USERS_KEY = 'ptb_users';
  var SESSION_KEY = 'ptb_session';
  var BOOKINGS_KEY = 'ptb_bookings';

  /* The only statuses a booking can ever have. */
  var STATUS = {
    PENDING: 'Pending Acceptance',
    ACTIVE: 'Active',
    CANCELLED: 'Cancelled',
    COMPLETED: 'Completed'
  };

  /* How the history page is asked for a single status: history.html?status=Active */
  var HISTORY_PAGE = 'history.html';
  var HISTORY_PARAM = 'status';

  /* Fired on the document when a trip's driver reaches the pickup point, so any
     page on screen can redraw itself. */
  var ARRIVED_EVENT = 'ptb:arrived';

  /* Fired on the document when a request awaiting acceptance is confirmed, so
     pages showing it can move it from Pending to Active without a reload. */
  var ACCEPTED_EVENT = 'ptb:accepted';

  /* A scheduled request is confirmed (Pending Acceptance -> Active) a short
     while after it is sent. This project has no driver-side channel, so the
     delay is simulated; it never runs longer than this, and never past the
     pickup it was scheduled for. */
  var ACCEPT_DELAY_MIN_MS = 15 * 1000;
  var ACCEPT_DELAY_MAX_MS = 10 * 60 * 1000;

  /* How many stars a rider can give a driver. */
  var RATING_MAX = 5;

  /* Cancelled bookings are not kept forever: 24h after they were cancelled
     they are dropped from storage for good. */
  var CANCELLED_RETENTION_MS = 24 * 60 * 60 * 1000;

  /* Fixed service catalogue. Availability is simulated at runtime. */
  var DEFAULT_SERVICES = [
    { type: 'motorcycle', name: 'Motorcycle', icon: '🏍', pricePerKm: 15, pricePerPassenger: 45 },
    { type: 'taxi', name: 'Taxi', icon: '🚕', pricePerKm: 15, pricePerPassenger: 60 }
  ];

  /* Preset pool of sim driver identities. Each driver serves one or both of
     the service types, so a scheduled request can list only the drivers that
     actually provide the chosen vehicle type. */
  var DRIVERS = [
    { name: 'Juan', phone: '0917 555 1234', vehicleTypes: ['motorcycle'] },
    { name: 'John', phone: '0918 444 8765', vehicleTypes: ['motorcycle'] },
    { name: 'Carlo', phone: '0920 333 2211', vehicleTypes: ['motorcycle'] },
    { name: 'Mark', phone: '0921 222 9988', vehicleTypes: ['taxi'] },
    { name: 'Dante', phone: '0932 111 4433', vehicleTypes: ['taxi'] },
    { name: 'James', phone: '0945 888 7766', vehicleTypes: ['taxi'] }
  ];

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  /* Tell the page something changed. Deferred to the next tick so a listener
     that redraws (which reads storage again) cannot run in the middle of the
     sweep that fired the event. */
  function emit(name, detail) {
    if (!global.document) return;
    setTimeout(function () {
      global.document.dispatchEvent(new CustomEvent(name, { detail: detail }));
    }, 0);
  }

  function uid(prefix) {
    return (
      (prefix ? prefix + '-' : '') +
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function formatDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      });
    } catch (e) {
      return iso;
    }
  }

  function formatMoney(n) {
    return '₱' + Number(n).toFixed(2);
  }

  /* The day a booking falls on, said the way a person would: Today, Tomorrow,
     Yesterday, or the full date once it is further out. Compared by calendar
     day (not elapsed hours), so an 11pm booking for 1am tomorrow reads as
     Tomorrow, not "in two hours". */
  function dayLabel(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return iso;

    var now = new Date();
    var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = Math.round((day.getTime() - today.getTime()) / 86400000);

    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    return formatDate(iso);
  }

  /* A row of stars filled to a value out of five, with optional words beside it.
     Filled by width rather than by counting whole stars, so an average of 4.6
     reads as 4.6 instead of five. The same row serves a rider's own rating and a
     driver's standing. */
  function formatStars(value, caption) {
    var pct = Math.max(0, Math.min(100, (Number(value) || 0) / RATING_MAX * 100));
    return (
      '<span class="stars-track">' +
        '<span class="stars-fill" style="width:' + pct.toFixed(1) + '%">★★★★★</span>' +
        '★★★★★' +
      '</span>' +
      (caption ? '<span class="stars-caption">' + caption + '</span>' : '')
    );
  }

  /* ---------------- Users ---------------- */

  function getUsers() {
    return read(USERS_KEY, []);
  }

  function saveUser(user) {
    var users = getUsers();
    users.push(user);
    write(USERS_KEY, users);
  }

  function findUserByEmail(email) {
    var target = String(email || '').trim().toLowerCase();
    return getUsers().find(function (u) {
      return String(u.email).trim().toLowerCase() === target;
    }) || null;
  }

  function findUserById(id) {
    return getUsers().find(function (u) {
      return u.id === id;
    }) || null;
  }

  function updateUser(updated) {
    var users = getUsers();
    var i = users.findIndex(function (u) {
      return u.id === updated.id;
    });
    if (i !== -1) {
      users[i] = updated;
      write(USERS_KEY, users);
      return true;
    }
    return false;
  }

  function isEmailTaken(email, excludeId) {
    var target = String(email || '').trim().toLowerCase();
    return getUsers().some(function (u) {
      return (
        String(u.email).trim().toLowerCase() === target &&
        u.id !== excludeId
      );
    });
  }

  /* ---------------- Session ---------------- */

  function setSession(userId) {
    write(SESSION_KEY, userId);
  }

  function getSessionUserId() {
    return read(SESSION_KEY, null);
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function getCurrentUser() {
    var id = getSessionUserId();
    if (!id) return null;
    return findUserById(id);
  }

  /* ---------------- Bookings ---------------- */

  function getAllBookings() {
    return read(BOOKINGS_KEY, []);
  }

  /* Arrival and the Active -> Completed move used to be saved separately, so
     older records can still be sitting in Active with the driver already there.
     Fold those into Completed on read so no view disagrees with another.

     The same sweep also lands the driver for a trip whose scheduled arrival has
     passed while the rider was elsewhere. A trip is replayed from the clock, so
     it carries on without a page watching it, and whichever page is open next
     moves it to where it would have got to. */
  function retireArrivedBookings() {
    var bookings = getAllBookings();
    var nowMs = Date.now();
    var changed = false;

    bookings.forEach(function (b) {
      if (b.status !== STATUS.ACTIVE) return;

      if (hasDriverArrived(b)) {
        b.status = STATUS.COMPLETED;
        changed = true;
        return;
      }

      var trip = rideWindow(b);
      if (nowMs < trip.dueAt) return;

      /* arrivedAt is the moment the driver actually got there, not the moment
         this page happened to be opened. */
      var arrivedMs = trip.dueAt > trip.startedAt ? trip.dueAt : nowMs;
      b.driverArrived = true;
      b.arrivedAt = new Date(arrivedMs).toISOString();
      b.status = STATUS.COMPLETED;
      changed = true;
    });

    if (changed) write(BOOKINGS_KEY, bookings);
    return changed;
  }

  function acceptDelayMs() {
    return ACCEPT_DELAY_MIN_MS +
      Math.random() * (ACCEPT_DELAY_MAX_MS - ACCEPT_DELAY_MIN_MS);
  }

  /* With no driver-side channel, acceptance is simulated: a request that has
     waited its delay is confirmed (Pending Acceptance -> Active). The moment is
     fixed on the booking when it is saved and is never later than the pickup it
     was scheduled for, so a request can never still be pending at its pickup
     time. Runs on read, like the other sweeps, so it lands wherever the rider
     happens to be. */
  function acceptPendingBookings() {
    var bookings = getAllBookings();
    var now = Date.now();
    var changed = false;
    var accepted = false;

    bookings.forEach(function (b) {
      if (b.status !== STATUS.PENDING) return;

      /* Records saved before acceptance existed have no moment set; give them
         one now so they release instead of sitting Pending forever. */
      if (!b.acceptAt) {
        b.acceptAt = new Date(now + acceptDelayMs()).toISOString();
        changed = true;
      }

      if (now < new Date(b.acceptAt).getTime()) return;

      b.status = STATUS.ACTIVE;
      b.acceptedAt = new Date(now).toISOString();
      changed = true;
      accepted = true;
    });

    if (changed) write(BOOKINGS_KEY, bookings);
    if (accepted) emit(ACCEPTED_EVENT);
    return changed;
  }

  /* The trip window of a booking: when the driver set off and when he is due at
     the pickup point, in milliseconds. Both come from the schedule saved when
     the booking was made, so every page agrees on the same trip. Bookings made
     before trips had a schedule have a zero-length window, which reads as
     already due. */
  function rideWindow(booking) {
    var startedAt = new Date(booking && booking.dateTime).getTime();
    var rideMs = Number(booking && booking.rideMs) || 0;
    return { startedAt: startedAt, dueAt: startedAt + rideMs };
  }

  /* Trips whose driver has arrived and whose reminder has not been dismissed
     yet, oldest arrival first so reminders play out in the order they happened. */
  function pendingArrivalNotices(userId) {
    acceptPendingBookings();
    retireArrivedBookings();
    return getAllBookings()
      .filter(function (b) {
        return b.userId === userId && hasDriverArrived(b) && !b.noticeAckedAt;
      })
      .sort(function (a, b) {
        return new Date(a.arrivedAt || a.dateTime) - new Date(b.arrivedAt || b.dateTime);
      });
  }

  /* The reminder has been dealt with, by OK or by its own timer, so it must
     not come back on the next page. */
  function ackArrivalNotice(bookingId) {
    var bookings = getAllBookings();
    var found = false;
    bookings.forEach(function (b) {
      if (b.bookingId === bookingId && !b.noticeAckedAt) {
        b.noticeAckedAt = new Date().toISOString();
        found = true;
      }
    });
    if (found) write(BOOKINGS_KEY, bookings);
    return found;
  }

  /* Cancellation is not a permanent record: once a cancelled booking has sat
     around for 24h it is deleted from storage. There is no server to run a
     nightly job, so the sweep happens on read -- every page that lists
     bookings goes through getBookings(). Cancelled records saved before
     this existed have no cancelledAt, so they are stamped now and keep a full
     24h of grace rather than vanishing on sight. */
  function purgeExpiredCancellations() {
    var bookings = getAllBookings();
    var now = Date.now();
    var changed = false;
    var kept = bookings.filter(function (b) {
      if (b.status !== STATUS.CANCELLED) return true;

      if (!b.cancelledAt) {
        b.cancelledAt = new Date(now).toISOString();
        changed = true;
        return true;
      }

      var age = now - new Date(b.cancelledAt).getTime();
      if (!(age >= CANCELLED_RETENTION_MS)) return true;

      changed = true;
      return false;
    });

    if (changed) write(BOOKINGS_KEY, kept);
    return changed;
  }

  function getBookings(userId) {
    purgeExpiredCancellations();
    acceptPendingBookings();
    retireArrivedBookings();
    return getAllBookings()
      .filter(function (b) {
        return b.userId === userId;
      })
      .sort(function (a, b) {
        return new Date(b.dateTime) - new Date(a.dateTime);
      });
  }

  /* Same list, but only the bookings matching one status (Active, Cancelled, ...). */
  function getBookingsByStatus(userId, status) {
    return getBookings(userId).filter(function (b) {
      return b.status === status;
    });
  }

  /* Link that opens the history page showing one status. */
  function historyUrl(status) {
    return HISTORY_PAGE + '?' + HISTORY_PARAM + '=' + status;
  }

  /* The status the history page was asked for, or null when it was not. */
  function historyStatus() {
    return new URLSearchParams(location.search).get(HISTORY_PARAM);
  }

  function saveBooking(booking) {
    var bookings = getAllBookings();

    if (!booking.createdAt) booking.createdAt = new Date().toISOString();

    /* A request is confirmed a short while after it is sent, but never later
       than its own pickup: if the pickup is sooner than the delay, acceptance
       is pulled forward to it. */
    if (booking.status === STATUS.PENDING && !booking.acceptAt) {
      var pickupMs = new Date(booking.dateTime).getTime();
      var acceptMs = Date.now() + acceptDelayMs();
      if (!isNaN(pickupMs) && pickupMs < acceptMs) acceptMs = pickupMs;
      booking.acceptAt = new Date(acceptMs).toISOString();
    }

    bookings.push(booking);
    write(BOOKINGS_KEY, bookings);
  }

  /* How long a cancelled booking has left before the 24h purge removes it, in
     milliseconds, or null when the booking is not cancelled. Lets a card show
     the rider the deadline rather than just saying it exists. */
  function cancelledRetention(booking) {
    if (!booking || booking.status !== STATUS.CANCELLED || !booking.cancelledAt) {
      return null;
    }
    var left = CANCELLED_RETENTION_MS -
      (Date.now() - new Date(booking.cancelledAt).getTime());
    return Math.max(0, left);
  }

  function updateBookingStatus(bookingId, status) {
    var bookings = getAllBookings();
    var found = false;
    bookings.forEach(function (b) {
      if (b.bookingId === bookingId) {
        /* Once the driver is at the pickup point the ride can no longer be
           called off, so refuse the Active -> Cancelled move. */
        if (status === STATUS.CANCELLED && hasDriverArrived(b)) return;
        b.status = status;
        /* Stamped so purgeExpiredCancellations knows when the grace period
           starts; dropped again if the booking ever leaves Cancelled. */
        if (status === STATUS.CANCELLED) {
          b.cancelledAt = new Date().toISOString();
        } else {
          delete b.cancelledAt;
        }
        found = true;
      }
    });
    if (found) {
      write(BOOKINGS_KEY, bookings);
    }
    return found;
  }

  /* Whether the driver has reached the pickup point for a booking. */
  function hasDriverArrived(booking) {
    return !!(booking && booking.driverArrived);
  }

  /* A booking is cancellable while it is active (or still awaiting a driver's
     acceptance) and the driver is still on the way. Once the driver is at the
     pickup point, cancelling is closed. */
  function canCancelBooking(booking) {
    return !!(
      booking &&
      (booking.status === STATUS.ACTIVE || booking.status === STATUS.PENDING) &&
      !hasDriverArrived(booking)
    );
  }

  /* The driver reached the pickup point. From that moment the ride is no
     longer pending, so it leaves the Active list and lands in Completed.
     One write, so no other reader can see a half-moved booking. atIso lets
     the caller record when the driver really got there. */
  function completeOnArrival(bookingId, atIso) {
    var bookings = getAllBookings();
    var found = false;
    bookings.forEach(function (b) {
      if (b.bookingId === bookingId && !hasDriverArrived(b)) {
        b.driverArrived = true;
        b.arrivedAt = atIso || new Date().toISOString();
        b.status = STATUS.COMPLETED;
        found = true;
      }
    });
    if (found) {
      write(BOOKINGS_KEY, bookings);
    }
    return found;
  }

  /* A rider's verdict on one finished ride. Only finished rides can be rated,
     and only once: a second attempt is refused, so "one rating per ride" holds
     from any card, however stale. */
  function rateBooking(bookingId, stars) {
    var value = Math.round(Number(stars));
    if (!(value >= 1 && value <= RATING_MAX)) return false;

    var bookings = getAllBookings();
    var found = false;
    bookings.forEach(function (b) {
      if (b.bookingId !== bookingId) return;
      if (b.status !== STATUS.COMPLETED || b.rating) return;
      b.rating = value;
      b.ratedAt = new Date().toISOString();
      found = true;
    });
    if (found) write(BOOKINGS_KEY, bookings);
    return found;
  }

  /* A driver's standing across every rider's rides, so the number is the same
     whoever is looking at it. count 0 means nobody has rated them yet. */
  function driverRating(driverName) {
    var total = 0;
    var count = 0;
    getAllBookings().forEach(function (b) {
      if (b.driverName !== driverName || !b.rating) return;
      total += b.rating;
      count++;
    });
    return {
      average: count ? Math.round(total / count * 10) / 10 : 0,
      count: count
    };
  }

  /* ---------------- Simulators ---------------- */

  function randomDriver() {
    var d = DRIVERS[Math.floor(Math.random() * DRIVERS.length)];
    return { name: d.name, phone: d.phone };
  }

  function findDriver(name) {
    return DRIVERS.find(function (d) {
      return d.name === name;
    }) || null;
  }

  /* Random subset of currently available drivers (may be empty = all offline) */
  function randomDrivers() {
    if (Math.random() < 0.15) return []; // every so often all drivers are offline
    var pool = DRIVERS.slice();
    var count = 1 + Math.floor(Math.random() * pool.length);
    var chosen = [];
    while (chosen.length < count && pool.length) {
      var i = Math.floor(Math.random() * pool.length);
      chosen.push(pool.splice(i, 1)[0]);
    }
    return chosen;
  }

  /* Available drivers who actually provide the given vehicle type. Same
     availability simulation as randomDrivers(), scoped to that type's pool,
     so a scheduled request is never offered a driver of the wrong type. An
     empty result means none of that type are online right now. */
  function availableDrivers(type) {
    var pool = DRIVERS.filter(function (d) {
      return (d.vehicleTypes || []).indexOf(type) !== -1;
    });
    if (!pool.length || Math.random() < 0.15) return [];

    var count = 1 + Math.floor(Math.random() * pool.length);
    var chosen = [];
    while (chosen.length < count && pool.length) {
      var i = Math.floor(Math.random() * pool.length);
      var d = pool.splice(i, 1)[0];
      chosen.push({ name: d.name, phone: d.phone, vehicleTypes: (d.vehicleTypes || []).slice() });
    }
    return chosen;
  }

  /* Whether a known driver provides a given vehicle type. Used to re-check a
     scheduled request's driver is eligible for the chosen type at submit. */
  function driverServesType(name, type) {
    var d = findDriver(name);
    return !!(d && (d.vehicleTypes || []).indexOf(type) !== -1);
  }

  /* ---------------- Validation helpers ---------------- */

  function isValidEmail(value) {
    var re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(value || '').trim());
  }

  function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
  }

  global.PTB = {
    DEFAULT_SERVICES: DEFAULT_SERVICES,
    STATUS: STATUS,
    ARRIVED_EVENT: ARRIVED_EVENT,
    ACCEPTED_EVENT: ACCEPTED_EVENT,
    saveUser: saveUser,
    findUserByEmail: findUserByEmail,
    updateUser: updateUser,
    isEmailTaken: isEmailTaken,
    setSession: setSession,
    clearSession: clearSession,
    getCurrentUser: getCurrentUser,
    getBookings: getBookings,
    getBookingsByStatus: getBookingsByStatus,
    rideWindow: rideWindow,
    pendingArrivalNotices: pendingArrivalNotices,
    ackArrivalNotice: ackArrivalNotice,
    historyUrl: historyUrl,
    historyStatus: historyStatus,
    saveBooking: saveBooking,
    updateBookingStatus: updateBookingStatus,
    rateBooking: rateBooking,
    driverRating: driverRating,
    RATING_MAX: RATING_MAX,
    purgeExpiredCancellations: purgeExpiredCancellations,
    cancelledRetention: cancelledRetention,
    hasDriverArrived: hasDriverArrived,
    canCancelBooking: canCancelBooking,
    completeOnArrival: completeOnArrival,
    randomDriver: randomDriver,
    findDriver: findDriver,
    randomDrivers: randomDrivers,
    availableDrivers: availableDrivers,
    driverServesType: driverServesType,
    isValidEmail: isValidEmail,
    normalizeEmail: normalizeEmail,
    formatDate: formatDate,
    formatMoney: formatMoney,
    formatStars: formatStars,
    dayLabel: dayLabel,
    uid: uid
  };
})(window);