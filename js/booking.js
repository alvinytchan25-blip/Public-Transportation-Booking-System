/* Transpo - booking page */

(function () {
  'use strict';

  var user = PTB.getCurrentUser();
  if (!user) return;

  var service = PTB.DEFAULT_SERVICES.find(function (s) {
    return s.type === new URLSearchParams(location.search).get('service');
  });
  if (!service) {
    location.replace('services.html');
    return;
  }

  var selectedDriverName = new URLSearchParams(location.search).get('driver');

  /* ---------- State ---------- */
  var pickup = null, dest = null;
  var pickupMarker = null, destMarker = null;
  var passengers = 1, distance = null;
  var state = { booked: false };
  var lastBookingId = null;

  /* ---------- DOM refs ---------- */
  var pickupInput = document.getElementById('pickupName');
  var destInput = document.getElementById('destName');
  var pickupOut = document.getElementById('pickupOut');
  var destOut = document.getElementById('destOut');
  var distOut = document.getElementById('distOut');
  var paxCount = document.getElementById('paxCount');
  var fareBoard = document.getElementById('fareBoard');
  var fPerKm = document.getElementById('fPerKm');
  var fDistance = document.getElementById('fDistance');
  var fPerPax = document.getElementById('fPerPax');
  var fPax = document.getElementById('fPax');
  var fTotal = document.getElementById('fTotal');
  var mapHint = document.getElementById('mapHint');
  var confirmBtn = document.getElementById('confirmBtn');
  var clearBtn = document.getElementById('clearBtn');
  var overlay = document.getElementById('loadingOverlay');

  /* ---------- Static UI ---------- */

  var banner = document.getElementById('serviceBanner');
  banner.innerHTML =
    '<span class="sb-icon">' + service.icon + '</span>' +
    '<div><div class="sb-name">' + service.name + '</div>' +
    '<div class="sb-sub">' + PTB.formatMoney(service.pricePerKm) + '/km - ' +
    PTB.formatMoney(service.pricePerPassenger) + '/passenger</div></div>';

  mapHint.textContent = 'Tap the map to set your pickup point.';

  /* ============ Real map (Leaflet + OpenStreetMap) ============ */

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

  /* ---------- Marker placement ---------- */

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
    updateFare();
  }

  /* ---------- Reverse geocoding helper (OSM Nominatim, best effort) ---------- */

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
        syncRouteReadout();
      })
      .catch(function () { /* offline or rate-limited: keep coordinates */ });
  }

  function onPointMoved(kind) {
    var point = kind === 'pickup' ? pickup : dest;
    var input = kind === 'pickup' ? pickupInput : destInput;
    input.value = coordsLabel(point);
    reverseGeocode(point);
    syncRouteReadout();
    updateFare();
  }

  /* ---------- Map click flow ---------- */

  map.on('click', function (e) {
    if (state.booked) return;
    if (!pickup) {
      placePickup(e.latlng);
      mapHint.textContent = 'Now tap your destination on the map.';
    } else if (!dest) {
      placeDest(e.latlng);
    } else {
      clearRoute();
      placePickup(e.latlng);
    }
  });

  /* ---------- Route readout ---------- */

  function syncRouteReadout() {
    pickupOut.textContent = pickup ? (pickupInput.value || '---') : '---';
    destOut.textContent = dest ? (destInput.value || '---') : '---';
    distOut.textContent = distance !== null ? distance + ' km' : '---';
  }

  pickupInput.addEventListener('input', function () {
    if (pickup) pickup.name = this.value;
    syncRouteReadout();
  });

  destInput.addEventListener('input', function () {
    if (dest) dest.name = this.value;
    syncRouteReadout();
  });

  /* ---------- Distance (haversine straight-line) + fare ---------- */

  function haversineKm(a, b) {
    var R = 6371;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var la1 = a.lat * Math.PI / 180;
    var la2 = b.lat * Math.PI / 180;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function computeFare() {
    if (!pickup || !dest) return null;
    return (
      (service.pricePerKm * distance) + (service.pricePerPassenger * passengers)
    ).toFixed(2);
  }

  function updateFare() {
    if (pickup && dest) {
      distance = Number(haversineKm(pickup, dest).toFixed(2));
      fareBoard.classList.remove('hidden');
      fPerKm.textContent = PTB.formatMoney(service.pricePerKm);
      fDistance.textContent = distance + ' km';
      fPerPax.textContent = PTB.formatMoney(service.pricePerPassenger);
      fPax.textContent = passengers;
      fTotal.textContent = PTB.formatMoney(computeFare());
    } else {
      distance = null;
      fareBoard.classList.add('hidden');
    }

    syncRouteReadout();

    var ready = !!(pickup && dest && distance !== null);
    confirmBtn.disabled = !ready || state.booked;

    mapHint.textContent = state.booked
      ? ''
      : ready
        ? 'Everything looks good - confirm your booking below.'
        : pickup
          ? 'Now tap your destination on the map.'
          : 'Tap the map to set your pickup point.';
  }

  /* ---------- Passenger stepper ---------- */

  document.getElementById('paxMinus').addEventListener('click', function () {
    if (passengers > 1) {
      passengers -= 1;
      paxCount.textContent = passengers;
      updateFare();
    }
  });

  document.getElementById('paxPlus').addEventListener('click', function () {
    if (passengers < 6) {
      passengers += 1;
      paxCount.textContent = passengers;
      updateFare();
    }
  });

  clearBtn.addEventListener('click', function () {
    if (!state.booked) clearRoute();
  });

  /* Lock every editable control once the booking is confirmed */
  function lockAfterBooking() {
    state.booked = true;
    document.getElementById('paxMinus').disabled = true;
    document.getElementById('paxPlus').disabled = true;
    pickupInput.setAttribute('readonly', 'true');
    pickupInput.classList.add('readonly');
    destInput.setAttribute('readonly', 'true');
    destInput.classList.add('readonly');
    clearBtn.disabled = true;
    if (pickupMarker) pickupMarker.dragging.disable();
    if (destMarker) destMarker.dragging.disable();
  }

  /* ---------- Confirm booking ---------- */

  confirmBtn.addEventListener('click', function () {
    if (!pickup || !dest || state.booked) return;

    var fare = Number(computeFare());
    overlay.classList.add('show');

    setTimeout(function () {
      var driver = PTB.findDriver(selectedDriverName) || PTB.randomDriver();
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
        passengers: passengers,
        totalFare: fare,
        driverName: driver.name,
        driverPhone: driver.phone,
        status: 'Active',
        dateTime: new Date().toISOString()
      };

      PTB.saveBooking(booking);
      lastBookingId = booking.bookingId;
      overlay.classList.remove('show');
      lockAfterBooking();

      document.getElementById('driverName').textContent = driver.name;
      document.getElementById('driverPhone').textContent = driver.phone;
      document.getElementById('driverInitial').textContent =
        driver.name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();

      document.getElementById('resultArea').classList.remove('hidden');
      mapHint.textContent = '';
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Booking Confirmed';
    }, 2200);
  });

  /* ---------- Cancel the just-booked ride ---------- */

  document.getElementById('cancelBookingBtn').addEventListener('click', function () {
    if (!lastBookingId) return;

    var badge = document.getElementById('statusBadge');
    if (!badge.classList.contains('confirming')) {
      badge.classList.add('confirming');
      badge.textContent = '● Confirm Cancel?';
      setTimeout(function () {
        if (badge.classList.contains('confirming')) {
          badge.classList.remove('confirming');
          badge.textContent = '● Booking Accepted';
        }
      }, 4000);
      return;
    }

    PTB.updateBookingStatus(lastBookingId, 'Cancelled');

    badge.classList.remove('badge-available', 'confirming');
    badge.classList.add('badge-cancelled');
    badge.textContent = '● Booking Cancelled';

    document.getElementById('successMsg').textContent = '🚫 Booking Cancelled. A new booking was not created.';
    document.getElementById('successMsg').classList.add('cancelled');

    var cancelBtn = document.getElementById('cancelBookingBtn');
    cancelBtn.disabled = true;
    cancelBtn.textContent = 'Booking Cancelled';
  });
})();