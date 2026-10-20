/* Transpo — scheduled booking page (Book a Ride)
   A separate flow from Quick Book. The rider sets a future pickup date and
   time, chooses a vehicle type, picks an available driver of that type, and
   submits a request. The request is stored as Pending Acceptance and appears
   in the Active bookings list.

   This project has no driver-side channel, so acceptance is simulated: a
   submitted request is confirmed automatically a short while after it is sent,
   and never later than its own pickup time (see PTB.acceptPendingBookings).
   Until then it sits as Pending Acceptance in the Active list. */

(function () {
  'use strict';

  var user = PTB.getCurrentUser();
  if (!user) return;

  var TYPE_LABEL = { motorcycle: 'Motorcycle', taxi: 'Taxi' };

  /* ---------- State ---------- */
  var pickup = null, dest = null;
  var pickupMarker = null, destMarker = null;
  var distance = null;
  var serviceType = null;
  var availableList = [];
  var selectedDriver = null;
  var submitting = false;
  var done = false;
  var resultBooking = null;

  /* ---------- DOM refs ---------- */
  var pickupInput = document.getElementById('pickupName');
  var destInput = document.getElementById('destName');
  var distOut = document.getElementById('distOut');
  var mapHint = document.getElementById('mapHint');
  var dateInput = document.getElementById('schedDate');
  var timeInput = document.getElementById('schedTime');
  var dateError = document.getElementById('dateError');
  var timeError = document.getElementById('timeError');
  var vehicleError = document.getElementById('vehicleError');
  var driverError = document.getElementById('driverError');
  var vehicleToggle = document.getElementById('vehicleToggle');
  var driverList = document.getElementById('driverList');
  var submitBtn = document.getElementById('submitBtn');
  var resetBtn = document.getElementById('resetBtn');
  var formCard = document.getElementById('scheduledForm');
  var resultArea = document.getElementById('resultArea');
  var pageSub = document.getElementById('pageSub');

  var haversineKm = Track.haversineKm;

  function serviceOf(type) {
    return PTB.DEFAULT_SERVICES.find(function (s) { return s.type === type; });
  }

  /* ============ Map (same pattern as the quick booking page) ============ */

  var map = L.map('rideMap', {
    zoomControl: true,
    attributionControl: true,
    minZoom: 11,
    maxBounds: [[10.15, 123.72], [10.45, 124.05]],
    maxBoundsViscosity: 0.8
  }).setView([10.3157, 123.8854], 13); // Cebu City

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  map.getContainer().style.cursor = 'crosshair';

  function makeIcon(kind) {
    return L.divIcon({
      className: 'leaflet-pin',
      html: '<div class="pin pin-' + kind + '"><span>' + (kind === 'pickup' ? 'P' : 'D') + '</span></div>',
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });
  }

  function coordsLabel(point) {
    return point.lat.toFixed(5) + ', ' + point.lng.toFixed(5);
  }

  function placePickup(latlng) {
    if (pickupMarker) map.removeLayer(pickupMarker);
    pickup = { lat: latlng.lat, lng: latlng.lng, name: null };
    pickupMarker = L.marker(latlng, {
      icon: makeIcon('pickup'), draggable: true, bubblingMouseEvents: false
    }).addTo(map);
    pickupMarker.on('dragend', function () {
      var p = pickupMarker.getLatLng();
      pickup.lat = p.lat; pickup.lng = p.lng;
      onPointMoved('pickup');
    });
    onPointMoved('pickup');
  }

  function placeDest(latlng) {
    if (destMarker) map.removeLayer(destMarker);
    dest = { lat: latlng.lat, lng: latlng.lng, name: null };
    destMarker = L.marker(latlng, {
      icon: makeIcon('dest'), draggable: true, bubblingMouseEvents: false
    }).addTo(map);
    destMarker.on('dragend', function () {
      var p = destMarker.getLatLng();
      dest.lat = p.lat; dest.lng = p.lng;
      onPointMoved('dest');
    });
    onPointMoved('dest');
  }

  function clearRoute() {
    if (pickupMarker) { map.removeLayer(pickupMarker); pickupMarker = null; }
    if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
    pickup = null; dest = null; distance = null;
    pickupInput.value = '';
    destInput.value = '';
    syncDistance();
  }

  /* ---------- Reverse geocoding (OSM Nominatim, best effort) ---------- */

  var geocodeSeq = 0;

  function reverseGeocode(point) {
    geocodeSeq += 1;
    var seq = geocodeSeq;
    var url = 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&lat=' +
      point.lat + '&lon=' + point.lng;

    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (seq !== geocodeSeq) return;
        if (!data || !data.display_name) return;
        var name = data.display_name.split(',').slice(0, 3).join(',');
        point.name = name;
        var input = point === pickup ? pickupInput : destInput;
        input.value = name;
      })
      .catch(function () { /* offline or rate-limited: keep coordinates */ });
  }

  function onPointMoved(kind) {
    var point = kind === 'pickup' ? pickup : dest;
    var input = kind === 'pickup' ? pickupInput : destInput;
    input.value = coordsLabel(point);
    reverseGeocode(point);
    updateDistance();
  }

  map.on('click', function (e) {
    if (done) return;
    if (!pickup) {
      placePickup(e.latlng);
      mapHint.textContent = 'Now tap your destination.';
    } else if (!dest) {
      placeDest(e.latlng);
    } else {
      clearRoute();
      placePickup(e.latlng);
      mapHint.textContent = 'Now tap your destination.';
    }
  });

  function syncDistance() {
    distOut.textContent = distance !== null ? distance + ' km' : '—';
  }

  function updateDistance() {
    if (pickup && dest) {
      distance = Number(haversineKm(pickup, dest).toFixed(2));
      mapHint.classList.remove('error');
      mapHint.textContent = 'Route set. Now choose your schedule.';
    } else {
      distance = null;
      mapHint.textContent = pickup ? 'Now tap your destination.' : 'Tap the map to set your pickup.';
    }
    syncDistance();
    refreshEstimate();
  }

  /* A running total, so the price is known before the request is sent. */
  function refreshEstimate() {
    var box = document.getElementById('estimate');
    var out = document.getElementById('estFare');
    if (distance !== null && serviceType) {
      var s = serviceOf(serviceType);
      out.textContent = PTB.formatMoney(s.pricePerKm * distance + s.pricePerPassenger * 1);
      box.classList.remove('hidden');
    } else {
      box.classList.add('hidden');
    }
  }

  pickupInput.addEventListener('input', function () {
    if (pickup) pickup.name = this.value;
  });

  destInput.addEventListener('input', function () {
    if (dest) dest.name = this.value;
  });

  /* ============ Date & time ============ */

  function pad(n) { return String(n).padStart(2, '0'); }

  function todayValue() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  dateInput.min = todayValue();

  function scheduledAt() {
    if (!dateInput.value || !timeInput.value) return null;
    var dt = new Date(dateInput.value + 'T' + timeInput.value);
    return isNaN(dt.getTime()) ? null : dt;
  }

  /* null when the schedule is fine, otherwise which field is at fault. */
  function scheduleFault() {
    if (!dateInput.value) return 'date';
    if (!timeInput.value) return 'time';
    var dt = scheduledAt();
    if (!dt || dt.getTime() <= Date.now()) return 'past';
    return null;
  }

  /* ============ Vehicle type & driver list ============ */

  /* Availability is sampled for the chosen type and schedule, reusing the
     project's existing driver simulator (scoped to the type). Changing the
     type, date, or time re-samples, which is also the rider's way out of an
     empty result. */
  function refreshAvailability() {
    selectedDriver = null;
    availableList = serviceType ? PTB.availableDrivers(serviceType) : [];
    renderDrivers();
    driverError.classList.remove('show');
    refreshEstimate();
  }

  function ratingFor(name) {
    var r = PTB.driverRating(name);
    if (!r.count) return '<span class="stars-static">New driver</span>';
    return PTB.formatStars(r.average, r.average.toFixed(1) + ' · ' + r.count);
  }

  function renderDrivers() {
    if (!serviceType) {
      driverList.innerHTML =
        '<p class="driver-select-hint">Select a vehicle type to see available drivers.</p>';
      return;
    }

    if (!availableList.length) {
      driverList.innerHTML =
        '<div class="empty-state small">' +
          '<div class="em-icon">🚫</div>' +
          '<h3>No drivers available</h3>' +
          '<p>No ' + TYPE_LABEL[serviceType].toLowerCase() +
            ' drivers are available for this schedule. Try another vehicle type or time.</p>' +
        '</div>';
      return;
    }

    driverList.innerHTML = availableList.map(function (d, i) {
      return (
        '<div class="driver-pool-card driver-choice" data-index="' + i +
          '" role="button" tabindex="0" aria-pressed="false" aria-label="Select driver ' + d.name + '">' +
          '<div class="driver-avatar">' + d.name.charAt(0) + '</div>' +
          '<div class="dp-info">' +
            '<div class="dp-name">' + d.name + '</div>' +
            '<div class="dp-phone">' + d.phone + '</div>' +
            '<div class="dp-type">' + TYPE_LABEL[serviceType] + ' · Available</div>' +
          '</div>' +
          '<div class="dp-rate">' +
            '<span class="dp-rating">' + ratingFor(d.name) + '</span>' +
            '<span class="driver-check">Select</span>' +
          '</div>' +
        '</div>'
      );
    }).join('');

    driverList.querySelectorAll('.driver-choice').forEach(function (card) {
      function pick() { chooseDriver(Number(card.getAttribute('data-index'))); }
      card.addEventListener('click', pick);
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
      });
    });
  }

  function chooseDriver(index) {
    if (done) return;
    selectedDriver = availableList[index] || null;
    driverError.classList.remove('show');
    driverList.querySelectorAll('.driver-choice').forEach(function (card) {
      var on = Number(card.getAttribute('data-index')) === index;
      card.classList.toggle('selected', on);
      card.setAttribute('aria-pressed', String(on));
      var check = card.querySelector('.driver-check');
      if (check) check.textContent = on ? 'Selected' : 'Select';
    });
  }

  vehicleToggle.addEventListener('click', function (e) {
    var btn = e.target.closest('.vehicle-option');
    if (!btn || done) return;
    var type = btn.getAttribute('data-type');
    if (type === serviceType) return;

    serviceType = type;
    vehicleToggle.querySelectorAll('.vehicle-option').forEach(function (b) {
      b.classList.toggle('selected', b === btn);
    });
    vehicleError.classList.remove('show');
    refreshAvailability();
  });

  /* ============ Validation ============ */

  function clearErrors() {
    dateError.classList.remove('show');
    timeError.classList.remove('show');
    vehicleError.classList.remove('show');
    driverError.classList.remove('show');
    mapHint.classList.remove('error');
  }

  function onScheduleChange() {
    clearErrors();
    if (serviceType && !done) refreshAvailability();
  }

  dateInput.addEventListener('input', onScheduleChange);
  timeInput.addEventListener('input', onScheduleChange);

  function validate() {
    clearErrors();
    var ok = true;

    if (!(pickup && dest && distance !== null)) {
      mapHint.classList.add('error');
      mapHint.textContent = 'Set both pickup and destination on the map.';
      ok = false;
    }

    var fault = scheduleFault();
    if (fault === 'date') { dateError.classList.add('show'); ok = false; }
    if (fault === 'time') { timeError.classList.add('show'); ok = false; }
    if (fault === 'past') {
      dateError.classList.add('show');
      timeError.classList.add('show');
      ok = false;
    }

    if (!serviceType) { vehicleError.classList.add('show'); ok = false; }

    if (!selectedDriver) {
      driverError.textContent = 'Select an available driver.';
      driverError.classList.add('show');
      ok = false;
    }

    return ok;
  }

  /* ============ Submit ============ */

  submitBtn.addEventListener('click', function () {
    if (submitting || done) return;
    if (!validate()) return;

    /* Re-check eligibility against the project's driver data before saving. */
    if (!PTB.driverServesType(selectedDriver.name, serviceType)) {
      selectedDriver = null;
      availableList = PTB.availableDrivers(serviceType);
      renderDrivers();
      driverError.textContent = 'That driver no longer serves this vehicle type. Please pick another.';
      driverError.classList.add('show');
      return;
    }

    /* Guard against repeated clicks while the request is being saved. */
    submitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending request...';

    var dt = scheduledAt();
    var service = serviceOf(serviceType);
    var schedule = Track.rideSchedule(pickup);
    var fare = (service.pricePerKm * distance + service.pricePerPassenger * 1).toFixed(2);

    var booking = {
      bookingId: PTB.uid('bk'),
      userId: user.id,
      serviceType: service.type,
      serviceName: service.name,
      serviceIcon: service.icon,
      riderName: user.fullName,
      pickup: pickupInput.value || coordsLabel(pickup),
      pickupLat: pickup.lat,
      pickupLng: pickup.lng,
      destination: destInput.value || coordsLabel(dest),
      destinationLat: dest.lat,
      destinationLng: dest.lng,
      distance: distance,
      passengers: 1,
      totalFare: fare,
      driverName: selectedDriver.name,
      driverPhone: selectedDriver.phone,
      driverStartLat: schedule.start.lat,
      driverStartLng: schedule.start.lng,
      rideMs: Math.round(schedule.rideMs),
      status: PTB.STATUS.PENDING,
      scheduled: true,
      dateTime: dt.toISOString()
    };

    /* Saved as Pending Acceptance: the driver's acceptance is simulated and
       lands within a few minutes, always before the pickup time. */
    PTB.saveBooking(booking);

    done = true;
    submitting = false;
    showResult(booking);
  });

  function showResult(booking) {
    resultBooking = booking;

    document.getElementById('tsPickup').textContent = booking.pickup;
    document.getElementById('tsDest').textContent = booking.destination;
    document.getElementById('tsWhen').textContent = PTB.formatDate(booking.dateTime);
    document.getElementById('tsFare').textContent = PTB.formatMoney(booking.totalFare);
    document.getElementById('driverName').textContent = booking.driverName;
    document.getElementById('driverPhone').textContent = booking.driverPhone;
    document.getElementById('driverInitial').textContent =
      booking.driverName.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();

    formCard.classList.add('hidden');
    resultArea.classList.remove('hidden');
    if (pageSub) pageSub.textContent = 'Your request is pending driver acceptance. This usually takes under 10 minutes.';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* Acceptance is simulated on read, so while this page is still open the
     request can be confirmed. Say so rather than leaving "pending" on screen. */
  document.addEventListener(PTB.ACCEPTED_EVENT, function () {
    if (!resultBooking || !pageSub) return;
    var fresh = PTB.getBookings(user.id).find(function (b) {
      return b.bookingId === resultBooking.bookingId;
    });
    if (fresh && fresh.status === PTB.STATUS.ACTIVE) {
      pageSub.textContent = 'Driver accepted your request. Track it from Active Bookings.';
    }
  });

  /* ============ Reset ============ */

  resetBtn.addEventListener('click', function () {
    if (done || submitting) return;
    clearRoute();
    dateInput.value = '';
    timeInput.value = '';
    serviceType = null;
    availableList = [];
    selectedDriver = null;
    vehicleToggle.querySelectorAll('.vehicle-option').forEach(function (b) {
      b.classList.remove('selected');
    });
    renderDrivers();
    refreshEstimate();
    clearErrors();
    mapHint.textContent = 'Tap the map to set your pickup.';
  });

  /* ============ Init ============ */
  renderDrivers();
  syncDistance();
})();
