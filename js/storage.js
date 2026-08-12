
(function (global) {
  'use strict';

  var USERS_KEY = 'ptb_users';
  var SESSION_KEY = 'ptb_session';
  var BOOKINGS_KEY = 'ptb_bookings';

  /* Fixed service catalogue. Availability is simulated at runtime. */
  var DEFAULT_SERVICES = [
    { type: 'motorcycle', name: 'Motorcycle', icon: '🏍', pricePerKm: 15, pricePerPassenger: 45 },
    { type: 'taxi', name: 'Taxi', icon: '🚕', pricePerKm: 15, pricePerPassenger: 60 }
  ];

  /* Preset pool of sim driver identities */
  var DRIVERS = [
    { name: 'Juan Dela Cruz', phone: '0917 555 1234' },
    { name: 'Maria Santos', phone: '0918 444 8765' },
    { name: 'Carlo Reyes', phone: '0920 333 2211' },
    { name: 'Liza Ramirez', phone: '0921 222 9988' },
    { name: 'Dante Mendoza', phone: '0932 111 4433' },
    { name: 'Nina Garcia', phone: '0945 888 7766' }
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

  function getBookings(userId) {
    return getAllBookings()
      .filter(function (b) {
        return b.userId === userId;
      })
      .sort(function (a, b) {
        return new Date(b.dateTime) - new Date(a.dateTime);
      });
  }

  function saveBooking(booking) {
    var bookings = getAllBookings();
    bookings.push(booking);
    write(BOOKINGS_KEY, bookings);
  }

  function updateBookingStatus(bookingId, status) {
    var bookings = getAllBookings();
    var found = false;
    bookings.forEach(function (b) {
      if (b.bookingId === bookingId) {
        b.status = status;
        found = true;
      }
    });
    if (found) {
      write(BOOKINGS_KEY, bookings);
    }
    return found;
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
    saveUser: saveUser,
    findUserByEmail: findUserByEmail,
    updateUser: updateUser,
    isEmailTaken: isEmailTaken,
    setSession: setSession,
    clearSession: clearSession,
    getCurrentUser: getCurrentUser,
    getBookings: getBookings,
    saveBooking: saveBooking,
    updateBookingStatus: updateBookingStatus,
    randomDriver: randomDriver,
    findDriver: findDriver,
    randomDrivers: randomDrivers,
    isValidEmail: isValidEmail,
    normalizeEmail: normalizeEmail,
    formatDate: formatDate,
    formatMoney: formatMoney,
    uid: uid
  };
})(window);