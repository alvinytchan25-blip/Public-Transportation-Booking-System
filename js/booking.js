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
      startTracking(driver);
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

  var TRACK_MPS = 25;   // simulated driver speed in m/s

  function trackClamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function formatTrackDist(m) {
    return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(1) + ' km';
  }

  function etaText(min) {
    return min < 1 ? 'under a minute' : '~' + min + ' min';
  }

  /* Convert a lat/lng pair into a flat array usable by OSRM: lng,lat;lng,lat */
  function osrmCoords(a, b) {
    return a.lng + ',' + a.lat + ';' + b.lng + ',' + b.lat;
  }

  /* Request a road-following route from OSRM (free, no key, CORS-enabled).
     Resolves to an array of {lat,lng,dist} points with cumulative road
     distance, or null if the request fails or times out. */
  function fetchOsrmRoute(a, b) {
    return new Promise(function (resolve) {
      var settled = false;

      function done(route) {
        if (!settled) { settled = true; resolve(route); }
      }

      fetch('https://router.project-osrm.org/route/v1/driving/' +
        osrmCoords(a, b) + '?overview=full&geometries=geojson')
        .then(function (res) {
          if (!res.ok) throw new Error('OSRM bad status');
          return res.json();
        })
        .then(function (data) {
          var coords = data.routes && data.routes[0] &&
            data.routes[0].geometry && data.routes[0].geometry.coordinates;
          if (!coords || !coords.length) throw new Error('OSRM empty route');

          var pts = [];
          var prev = null;
          var acc = 0;
          for (var i = 0; i < coords.length; i++) {
            var cur = { lat: coords[i][1], lng: coords[i][0] };
            if (prev) {
              acc += haversineKm(prev, cur) * 1000;
            }
            pts.push({ lat: cur.lat, lng: cur.lng, dist: acc });
            prev = cur;
          }
          /* Make sure the very ends match our picked points exactly so the
             pins sit on the drawn line. */
          pts[0].lat = a.lat; pts[0].lng = a.lng; pts[0].dist = 0;
          var end = pts[pts.length - 1];
          end.lat = b.lat; end.lng = b.lng;
          done(pts);
        })
        .catch(function () { done(null); });

      /* Don't wait on a stuck request forever */
      setTimeout(function () { done(null); }, 8000);
    });
  }

  /* Straight-line fallback (measured in meters) so tracking still works if
     OSRM is unreachable or offline. */
  function straightLeg(a, b) {
    var pts = [];
    var steps = 32;
    for (var s = 0; s <= steps; s++) {
      var t = s / steps;
      var cur = {
        lat: a.lat + (b.lat - a.lat) * t,
        lng: a.lng + (b.lng - a.lng) * t
      };
      cur.dist = haversineKm(a, cur) * 1000;
      pts.push(cur);
    }
    pts[steps].lat = b.lat;
    pts[steps].lng = b.lng;
    return pts;
  }

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
  }

  function startTracking(driver) {
    stopTracking();
    trackActive = true;

    /* Simulated driver starts somewhere near the pickup point */
    var start = {
      lat: trackClamp(pickup.lat + (Math.random() - 0.5) * 0.045, 10.18, 10.44),
      lng: trackClamp(pickup.lng + (Math.random() - 0.5) * 0.055, 123.75, 124.04)
    };
    var pickupPt = { lat: pickup.lat, lng: pickup.lng };

    var area = document.getElementById('trackingArea');
    area.classList.remove('hidden');

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

    var routeBounds = L.latLngBounds([
      L.latLng(start.lat, start.lng),
      L.latLng(pickupPt.lat, pickupPt.lng)
    ]);

    setTimeout(function () {
      trackMap.invalidateSize();
      trackMap.fitBounds(routeBounds, { padding: [30, 30] });
    }, 80);

    L.marker(pickupPt, { icon: makeIcon('pickup') }).addTo(trackMap);

    var vehicle = service.type === 'motorcycle' ? '🏍' : '🚕';
    var driverMarker = L.marker([start.lat, start.lng], {
      icon: L.divIcon({
        className: 'leaflet-pin',
        html: '<div class="driver-bubble">' + vehicle + '</div>',
        iconSize: [44, 44],
        iconAnchor: [22, 22]
      })
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

    badgeEl.classList.remove('badge-cancelled');
    badgeEl.classList.add('badge-available');
    badgeEl.textContent = '● En Route';
    subEl.textContent = driver.name + ' is heading to your pickup point.';
    proxEl.textContent = 'Locating ' + driver.name + '...';

    var trackPosition = 0; // current meters traveled
    var trackArrived = false;

    /* Represent the driver's progress as an index along the to-pickup route,
       used to (a) move the marker, (b) trim the live line, (c) compute distance. */
    function driverIndex(route, meters) {
      var stop = 0;
      for (var i = 0; i < route.length; i++) {
        if (route[i].dist >= meters) { stop = i; break; }
      }
      if (route[stop].dist < meters) stop = route.length - 1;
      var lo = Math.max(0, stop - 1);
      var hi = Math.min(route.length - 1, stop);
      var span = route[hi].dist - route[lo].dist || 1;
      return lo + (meters - route[lo].dist) / span;
    }

    function pluck(p) { return [p.lat, p.lng]; }

    function updateTracking() {
      var idx = driverIndex(trackToPickup, trackPosition);
      var d = trackToPickup[Math.floor(idx)];
      driverMarker.setLatLng([d.lat, d.lng]);

      var remainM = Math.max(0, trackLeg1 - trackPosition);
      var eta = etaText(Math.ceil(remainM / TRACK_MPS / 60));

      distLabel.textContent = 'Distance to pickup';
      etaLabel.textContent = 'Estimated arrival at pickup';
      distEl.textContent = formatTrackDist(remainM);
      etaEl.textContent = eta;

      /* Trim the live driver -> pickup road line to the driver's spot */
      proxLine.setLatLngs(trackToPickup.slice(Math.floor(idx)).map(pluck));
      proxLine.setTooltipContent(
        formatTrackDist(remainM) + ' · arrives in ' + eta
      );

      subEl.textContent = driver.name + ' is heading to your pickup point.';
      proxEl.textContent = driver.name + ' is ' + formatTrackDist(remainM) +
        ' away · arrives in ' + eta;
    }

    function arriveAtPickup() {
      trackArrived = true;
      clearInterval(trackingTimer);
      trackingTimer = null;

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
    }

    trackToPickup = null;
    trackLeg1 = 0;
    var trackPosition = 0; // current meters traveled
    var trackArrived = false;

    fetchOsrmRoute(start, pickupPt).then(function (route) {
      if (!trackActive) return;
      trackToPickup = route || straightLeg(start, pickupPt);
      trackLeg1 = trackToPickup[trackToPickup.length - 1].dist;

      updateTracking();

      trackingTimer = setInterval(function () {
        if (!trackActive || trackArrived) return;
        trackPosition += TRACK_MPS;

        if (trackPosition >= trackLeg1) {
          arriveAtPickup();
          return;
        }
        updateTracking();
      }, 1000);
    });
  }

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
    stopTracking();
    document.getElementById('trackingArea').classList.add('hidden');

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