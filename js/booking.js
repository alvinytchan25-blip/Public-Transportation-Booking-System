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
  var state = { booked: false, cancelled: false };
  var lastBookingId = null;
  var lastDriverName = null;

  /* ---------- DOM refs ---------- */
  var pickupInput = document.getElementById('pickupName');
  var destInput = document.getElementById('destName');
  var distOut = document.getElementById('distOut');
  var paxCount = document.getElementById('paxCount');
  var fareBoard = document.getElementById('fareBoard');
  var fPerKm = document.getElementById('fPerKm');
  var fPerPax = document.getElementById('fPerPax');
  var fPax = document.getElementById('fPax');
  var fTotal = document.getElementById('fTotal');
  var mapHint = document.getElementById('mapHint');
  var confirmBtn = document.getElementById('confirmBtn');
  var clearBtn = document.getElementById('clearBtn');
  var overlay = document.getElementById('loadingOverlay');

  /* Post-confirmation blocks */
  var bookingForm = document.getElementById('bookingForm');
  var resultArea = document.getElementById('resultArea');
  var trackDriverBtn = document.getElementById('trackDriverBtn');
  var rideActions = document.getElementById('rideActions');
  var pageSub = document.querySelector('.page-sub');

  /* ---------- Static UI ---------- */

  var banner = document.getElementById('serviceBanner');
  banner.innerHTML =
    '<span class="sb-icon">' + service.icon + '</span>' +
    '<div class="sb-name">' + service.name + '</div>';

  mapHint.textContent = 'Tap the map to set your pickup.';

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
      })
      .catch(function () { /* offline or rate-limited: keep coordinates */ });
  }

  function onPointMoved(kind) {
    var point = kind === 'pickup' ? pickup : dest;
    var input = kind === 'pickup' ? pickupInput : destInput;
    input.value = coordsLabel(point);
    reverseGeocode(point);
    updateFare();
  }

  /* ---------- Map click flow ---------- */

  map.on('click', function (e) {
    if (state.booked) return;
    if (!pickup) {
      placePickup(e.latlng);
      mapHint.textContent = 'Now tap your destination.';
    } else if (!dest) {
      placeDest(e.latlng);
    } else {
      clearRoute();
      placePickup(e.latlng);
    }
  });

  /* ---------- Distance readout ---------- */

  /* The two fields are the route readout: renaming one has nothing else to
     refresh, only the measured distance can change on its own. */
  function syncDistance() {
    distOut.textContent = distance !== null ? distance + ' km' : '—';
  }

  pickupInput.addEventListener('input', function () {
    if (pickup) pickup.name = this.value;
  });

  destInput.addEventListener('input', function () {
    if (dest) dest.name = this.value;
  });

  /* ---------- Distance (haversine straight-line) + fare ---------- */

  var haversineKm = Track.haversineKm;

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
      fPerPax.textContent = PTB.formatMoney(service.pricePerPassenger);
      fPax.textContent = passengers;
      fTotal.textContent = PTB.formatMoney(computeFare());
    } else {
      distance = null;
      fareBoard.classList.add('hidden');
    }

    syncDistance();

    var ready = !!(pickup && dest && distance !== null);
    confirmBtn.disabled = !ready || state.booked;

    mapHint.textContent = state.booked
      ? ''
      : ready
        ? 'Route set — confirm to book.'
        : pickup
          ? 'Now tap your destination.'
          : 'Tap the map to set your pickup.';
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

    /* The form has served its purpose - the result is the only thing to read. */
    bookingForm.classList.add('hidden');
    if (pageSub) {
      pageSub.textContent = 'Your ride is confirmed. Track your driver below.';
    }
  }

  /* Keeps pickup / destination / distance / fare readable once the form is gone. */
  function showTripSummary(booking) {
    document.getElementById('tsPickup').textContent = booking.pickup;
    document.getElementById('tsDest').textContent = booking.destination;
    document.getElementById('tsDistance').textContent = booking.distance;
    document.getElementById('tsFare').textContent = PTB.formatMoney(booking.totalFare);
  }

  /* ---------- Confirm booking ---------- */

  confirmBtn.addEventListener('click', function () {
    if (!pickup || !dest || state.booked) return;

    var fare = Number(computeFare());
    overlay.classList.add('show');

    setTimeout(function () {
      var driver = PTB.findDriver(selectedDriverName) || PTB.randomDriver();

      /* Where the driver sets off from and how long the trip takes, decided
         once here. Every page replays the trip from these, so it carries on
         while the rider is looking at something else. */
      var schedule = Track.rideSchedule(pickup);

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
        driverStartLat: schedule.start.lat,
        driverStartLng: schedule.start.lng,
        rideMs: Math.round(schedule.rideMs),
        status: PTB.STATUS.ACTIVE,
        dateTime: new Date().toISOString()
      };

      PTB.saveBooking(booking);
      lastBookingId = booking.bookingId;
      lastDriverName = driver.name;
      overlay.classList.remove('show');
      lockAfterBooking();
      showTripSummary(booking);

      document.getElementById('driverName').textContent = driver.name;
      document.getElementById('driverPhone').textContent = driver.phone;
      document.getElementById('driverInitial').textContent =
        driver.name.split(' ').map(function (w) { return w[0]; }).join('').slice(0, 2).toUpperCase();

      resultArea.classList.remove('hidden');
      mapHint.textContent = '';
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Booking Confirmed';
      startTracking(booking);
    }, 2200);
  });

  /* ---------- Live driver tracking (simulation) ---------- */

  var trackMap = null;
  var trackingTimer = null;
  var trackActive = false;

  /* Road-following route. Each entry is {lat,lng,dist} where dist is the
     cumulative drive distance in meters along the road polyline. */
  var trackToPickup = [];   // driver start -> pickup, road-aware
  var trackLeg1 = 0;        // total meters on the driver -> pickup leg
  var trackBounds = null;   // start + pickup, kept so a late reveal can re-fit

  var formatTrackDist = Track.formatDist;
  var etaText = Track.etaText;
  var tripProgress = Track.tripProgress;
  var remainingRideMs = Track.remainingRideMs;
  var fetchOsrmRoute = Track.fetchRoute;
  var straightLeg = Track.straightLeg;

  function stopTracking() {
    trackActive = false;
    if (trackingTimer) {
      clearInterval(trackingTimer);
      trackingTimer = null;
    }
    if (trackMap) {
      trackMap.remove();
      trackMap = null;
    }
    trackToPickup = [];
    trackLeg1 = 0;
    trackBounds = null;
  }

  /* Stage 1 -> 2. The simulation is already running; this only opens the view. */
  function revealTracking() {
    var area = document.getElementById('trackingArea');
    if (area.classList.contains('hidden')) {
      area.classList.remove('hidden');
    }

    trackDriverBtn.classList.add('hidden');
    rideActions.classList.remove('hidden');

    /* The map was built inside a hidden box, so it has no size yet and its
       viewport is meaningless until it is re-measured and re-fitted. */
    if (trackMap) {
      trackMap.invalidateSize();
      if (trackBounds) trackMap.fitBounds(trackBounds, { padding: [30, 30] });
    }
  }

  trackDriverBtn.addEventListener('click', function () {
    revealTracking();
    document.getElementById('trackingArea').scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  });

  function startTracking(booking) {
    stopTracking();
    trackActive = true;

    /* The driver starts where the booking said he would, not somewhere new, so
       reopening the page mid-trip shows the same trip. */
    var start = Track.driverStartOf(booking);
    var pickupPt = { lat: booking.pickupLat, lng: booking.pickupLng };

    var area = document.getElementById('trackingArea');
    area.classList.add('hidden');

    var trackEl = document.getElementById('trackMap');
    trackMap = L.map(trackEl, {
      zoomControl: true,
      attributionControl: false,
      minZoom: 11,
      maxBounds: [[10.15, 123.72], [10.45, 124.05]],
      maxBoundsViscosity: 0.8
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(trackMap);

    trackBounds = L.latLngBounds([
      L.latLng(start.lat, start.lng),
      L.latLng(pickupPt.lat, pickupPt.lng)
    ]);

    L.marker(pickupPt, { icon: makeIcon('pickup') }).addTo(trackMap);

    var driverMarker = L.marker([start.lat, start.lng], {
      icon: Track.vehicleIcon(booking)
    }).addTo(trackMap);

    /* Live road-following line from the driver to the pickup */
    var proxLine = L.polyline([start, pickupPt], {
      color: '#4f46e5',
      weight: 4,
      opacity: 0.9
    }).addTo(trackMap);

    proxLine.bindTooltip('', {
      permanent: true,
      direction: 'center',
      className: 'proximity-tip',
      opacity: 0.95
    });

    var subEl = document.getElementById('trackSub');
    var distEl = document.getElementById('trackDist');
    var etaEl = document.getElementById('trackEta');
    var distLabel = document.getElementById('trackDistLabel');
    var etaLabel = document.getElementById('trackEtaLabel');
    var badgeEl = document.getElementById('trackBadge');
    var proxEl = document.getElementById('driverProximity');
    var statusBadge = document.getElementById('statusBadge');

    badgeEl.classList.remove('badge-cancelled');
    badgeEl.classList.add('badge-available');
    badgeEl.textContent = '● En Route';
    subEl.textContent = booking.driverName + ' is heading to your pickup point.';
    proxEl.textContent = 'Locating ' + booking.driverName + '...';

    /* The trip window is the single clock both this map and the rest of the app
       read, so the driver is always parked where he really is. */
    var trip = PTB.rideWindow(booking);

    var trackPosition = 0; // current meters traveled
    var trackArrived = false;

    /* Represent the driver's progress as an index along the to-pickup route,
       used to (a) move the marker, (b) trim the live line, (c) compute distance. */
    var driverIndex = Track.indexAt;

    function pluck(p) { return [p.lat, p.lng]; }

    function updateTracking() {
      var idx = driverIndex(trackToPickup, trackPosition);
      var d = trackToPickup[Math.floor(idx)];
      driverMarker.setLatLng([d.lat, d.lng]);

      var remainM = Math.max(0, trackLeg1 - trackPosition);
      var eta = etaText(Math.ceil(remainingRideMs(trip.dueAt, Date.now()) / 60000));

      distLabel.textContent = 'Distance to pickup';
      etaLabel.textContent = 'Estimated arrival at pickup';
      distEl.textContent = formatTrackDist(remainM);
      etaEl.textContent = eta;

      /* Trim the live driver -> pickup road line to the driver's spot */
      proxLine.setLatLngs(trackToPickup.slice(Math.floor(idx)).map(pluck));
      proxLine.setTooltipContent(
        formatTrackDist(remainM) + ' · arrives in ' + eta
      );

      subEl.textContent = booking.driverName + ' is heading to your pickup point.';
      proxEl.textContent = booking.driverName + ' is ' + formatTrackDist(remainM) +
        ' away · arrives in ' + eta;
    }

    /* Move the driver to wherever the clock says he should be. Called on open
       as well as on every tick, so returning to the page mid-trip catches the
       trip up instead of restarting it. */
    function advance() {
      var frac = tripProgress(trip.startedAt, trip.dueAt, Date.now());
      trackPosition = trackLeg1 * frac;

      if (frac >= 1) {
        arriveAtPickup();
        return;
      }
      updateTracking();
    }

    function arriveAtPickup() {
      trackArrived = true;
      clearInterval(trackingTimer);
      trackingTimer = null;

      /* The driver is here. The ride is no longer pending: it leaves the Active
         list for Completed, and cancelling is closed for good. Arrival is
         stamped from the schedule, so it is the scheduled arrival even if this
         page only noticed now. */
      PTB.completeOnArrival(lastBookingId, new Date(trip.dueAt).toISOString());
      lockCancelAfterArrival();

      /* Arriving ends the "track your driver" prompt. If the rider never opened
         the tracking view, surface the history + locked cancel anyway so they
         are never left without a way out. The tracking map itself stays closed
         - there is no longer anything to watch. */
      trackDriverBtn.classList.add('hidden');
      rideActions.classList.remove('hidden');

      /* Park the driver at the pickup point and freeze everything */
      driverMarker.setLatLng([pickupPt.lat, pickupPt.lng]);
      if (proxLine) { trackMap.removeLayer(proxLine); proxLine = null; }

      distLabel.textContent = 'Distance to pickup';
      distEl.textContent = 'Arrived';
      etaLabel.textContent = 'Estimated arrival';
      etaEl.textContent = 'Arrived';
      subEl.textContent = 'Your driver has arrived at your pickup point. 🎉';
      proxEl.textContent = 'Your driver has arrived. 🎉';
      badgeEl.textContent = '● At Pickup';

      /* Keep the booking card honest about where the record went. */
      statusBadge.classList.remove('badge-available', 'confirming');
      statusBadge.classList.add('badge-completed');
      statusBadge.textContent = '● Completed';
    }

    trackToPickup = null;
    trackLeg1 = 0;

    fetchOsrmRoute(start, pickupPt).then(function (route) {
      if (!trackActive) return;
      trackToPickup = route || straightLeg(start, pickupPt);
      trackLeg1 = trackToPickup[trackToPickup.length - 1].dist;

      /* The road shapes the line, the schedule decides the timing, so a slow
         or missing OSRM call cannot change when the driver turns up. */
      advance();
      if (trackArrived) return;

      trackingTimer = setInterval(function () {
        if (!trackActive || trackArrived) return;
        advance();
      }, 1000);
    });
  }

  /* ---------- Cancel the just-booked ride / book it again ---------- */

  var cancelBtn = document.getElementById('cancelBookingBtn');

  /* Shown once the driver is standing at the pickup point. */
  var ARRIVED_TITLE =
    'Your driver has already arrived at the pickup point, so this booking can no longer be cancelled.';

  function lockCancelAfterArrival() {
    cancelBtn.disabled = true;
    cancelBtn.classList.remove('confirming', 'btn-danger');
    cancelBtn.textContent = 'Driver Arrived';
    cancelBtn.title = ARRIVED_TITLE;
  }

  cancelBtn.addEventListener('click', function () {
    /* The cancelled ride has already been saved, so this button now means
       "book again": restart the booking form for the same service + driver. */
    if (state.cancelled) {
      location.href = 'booking.html?service=' + encodeURIComponent(service.type) +
        '&driver=' + encodeURIComponent(lastDriverName);
      return;
    }

    if (!lastBookingId) return;

    /* Driver already at the pickup: cancelling is closed. */
    var live = PTB.getBookings(user.id).find(function (b) {
      return b.bookingId === lastBookingId;
    });
    if (!PTB.canCancelBooking(live)) {
      if (live && PTB.hasDriverArrived(live)) lockCancelAfterArrival();
      return;
    }

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

    PTB.updateBookingStatus(lastBookingId, PTB.STATUS.CANCELLED);
    stopTracking();

    /* There is no driver to follow any more, so close the tracking view and the
       prompt that opens it. History + Book Again stay reachable. */
    document.getElementById('trackingArea').classList.add('hidden');
    trackDriverBtn.classList.add('hidden');
    rideActions.classList.remove('hidden');

    badge.classList.remove('badge-available', 'confirming');
    badge.classList.add('badge-cancelled');
    badge.textContent = '● Booking Cancelled';

    document.getElementById('driverProximity').textContent = 'Driver assignment cancelled.';

    state.cancelled = true;
    cancelBtn.textContent = 'Book Again';
    cancelBtn.classList.replace('btn-danger', 'btn-primary');
    cancelBtn.disabled = false;
    cancelBtn.title = '';
  });
})();