/* Transpo — inline live driver tracking for one booking
   Mounted inside an active booking card when the rider taps Track Driver.
   On arrival it hands the booking back to the caller, because the booking
   stops being active at that moment. */

(function () {
  'use strict';

  var TICK_MS = 1000;

  /* Builds the tracking markup once; every booking reuses the same shape. */
  function markup() {
    return (
      '<div class="inline-track">' +
        '<div class="inline-track-head">' +
          '<span class="inline-track-title">🛣 Live Driver Tracking</span>' +
          '<span class="badge badge-available js-badge">● En Route</span>' +
        '</div>' +
        '<div class="map inline-track-map js-map"></div>' +
        '<div class="inline-track-row">' +
          '<span class="js-dist-label">Distance to pickup</span>' +
          '<strong class="js-dist">—</strong>' +
        '</div>' +
        '<div class="inline-track-row">' +
          '<span class="js-eta-label">Estimated arrival</span>' +
          '<strong class="eta-value js-eta">—</strong>' +
        '</div>' +
      '</div>'
    );
  }

  function pinIcon(kind) {
    return L.divIcon({
      className: 'leaflet-pin',
      html: '<div class="pin pin-' + kind + '"><span>' + (kind === 'pickup' ? 'P' : 'D') + '</span></div>',
      iconSize: [32, 32],
      iconAnchor: [16, 32]
    });
  }

/* mount(host, booking, opts) -> { stop() }
      opts.onArrive  called once when the driver reaches the pickup point
      The driver starts where the booking says he did, so this view is
      repeatable: reopening it mid-trip shows the trip where it got to. */
  function mount(host, booking, opts) {
    opts = opts || {};

    if (typeof booking.pickupLat !== 'number' || typeof booking.pickupLng !== 'number') {
      host.innerHTML = '<div class="inline-track-note">No pickup point recorded for this booking, so it cannot be tracked.</div>';
      return { stop: function () {} };
    }

    host.innerHTML = markup();
    var badge = host.querySelector('.js-badge');
    var distEl = host.querySelector('.js-dist');
    var etaEl = host.querySelector('.js-eta');
    var distLabel = host.querySelector('.js-dist-label');
    var etaLabel = host.querySelector('.js-eta-label');

    var pickupPt = { lat: booking.pickupLat, lng: booking.pickupLng };
    var start = Track.driverStartOf(booking);

    /* The same trip window the booking page and the storage sweep read, so all
       three always agree on where the driver is. */
    var trip = PTB.rideWindow(booking);

    var map = L.map(host.querySelector('.js-map'), {
      zoomControl: true,
      attributionControl: false,
      minZoom: 11,
      maxBounds: [[10.15, 123.72], [10.45, 124.05]],
      maxBoundsViscosity: 0.8
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

    L.marker(pickupPt, { icon: pinIcon('pickup') }).addTo(map);

    var driverMarker = L.marker([start.lat, start.lng], {
      icon: Track.vehicleIcon(booking)
    }).addTo(map);

    var roadLine = L.polyline([start, pickupPt], {
      color: '#4f46e5',
      weight: 4,
      opacity: 0.9
    }).addTo(map);

    roadLine.bindTooltip('', {
      permanent: true,
      direction: 'center',
      className: 'proximity-tip',
      opacity: 0.95
    });

    var bounds = L.latLngBounds([
      L.latLng(start.lat, start.lng),
      L.latLng(pickupPt.lat, pickupPt.lng)
    ]);

    /* The card may still be measured from a previous render. */
    requestAnimationFrame(function () {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [24, 24] });
    });

    var timer = null;
    var stopped = false;
    var arrived = false;
    var route = null;
    var legTotal = 0;
    var position = 0;

    function pluck(p) { return [p.lat, p.lng]; }

    function tick() {
      if (route && position >= legTotal) { arrive(); return; }

      if (badge.textContent !== '● En Route') {
        badge.textContent = '● En Route';
        badge.classList.add('badge-available');
        badge.classList.remove('badge-completed');
      }

      var idx = Track.indexAt(route, position);
      var here = route[Math.floor(idx)];
      driverMarker.setLatLng([here.lat, here.lng]);

      var remainM = Math.max(0, legTotal - position);
      var eta = Track.etaText(
        Math.ceil(Track.remainingRideMs(trip.dueAt, Date.now()) / 60000)
      );

      distLabel.textContent = 'Distance to pickup';
      etaLabel.textContent = 'Estimated arrival at pickup';
      distEl.textContent = Track.formatDist(remainM);
      etaEl.textContent = eta;

      roadLine.setLatLngs(route.slice(Math.floor(idx)).map(pluck));
      roadLine.setTooltipContent(Track.formatDist(remainM) + ' · arrives in ' + eta);
    }

    /* Put the driver where the clock says he is. Run on open as well as on every
       tick, so opening this view part-way through a trip does not show it from
       the start. */
    function advance() {
      var nowMs = Date.now();

      /* A confirmed request whose pickup is still ahead has no trip under way
         yet: the clock has not reached its window. Show it as scheduled rather
         than counting down towards a pickup that is still hours away. */
      if (nowMs < trip.startedAt) { standby(); return; }

      var frac = Track.tripProgress(trip.startedAt, trip.dueAt, nowMs);
      position = legTotal * frac;

      if (frac >= 1) { arrive(); return; }
      tick();
    }

    /* Waiting for the trip window to open. Kept as a state rather than a
       one-off so the countdown stays right until the driver actually sets off. */
    function standby() {
      badge.textContent = '● Scheduled';
      badge.classList.remove('badge-available', 'badge-completed');

      distLabel.textContent = 'Pickup scheduled';
      distEl.textContent = PTB.dayLabel(booking.dateTime);
      etaLabel.textContent = 'Estimated arrival';
      etaEl.textContent = '—';
    }

    function arrive() {
      arrived = true;
      stopTimer();

      /* The driver is here, so the ride stops being pending: record it once,
         here, so every surface that watches a driver agrees on where the
         booking went. The time comes from the schedule, so it is the arrival
         that was due even when this view was opened late. */
      PTB.completeOnArrival(booking.bookingId, new Date(trip.dueAt).toISOString());

      driverMarker.setLatLng([pickupPt.lat, pickupPt.lng]);
      if (roadLine) { map.removeLayer(roadLine); roadLine = null; }

      distLabel.textContent = 'Distance to pickup';
      distEl.textContent = 'Arrived';
      etaLabel.textContent = 'Estimated arrival';
      etaEl.textContent = 'Arrived';
      badge.textContent = '● At Pickup';
      badge.classList.remove('badge-available');
      badge.classList.add('badge-completed');

      if (opts.onArrive) opts.onArrive(booking);
    }

    function stopTimer() {
      if (timer) { clearInterval(timer); timer = null; }
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      stopTimer();
      map.remove();
    }

    badge.textContent = '● En Route';
    distEl.textContent = 'Locating...';
    etaEl.textContent = '—';

    Track.fetchRoute(start, pickupPt).then(function (road) {
      if (stopped) return;
      route = road || Track.straightLeg(start, pickupPt);
      legTotal = route[route.length - 1].dist;

      advance();
      if (arrived) return;

      timer = setInterval(function () {
        if (stopped || arrived) return;
        advance();
      }, TICK_MS);
    });

    return { stop: stop, arrived: function () { return arrived; } };
  }

  window.DriverTracking = { mount: mount, markup: markup };
})();
