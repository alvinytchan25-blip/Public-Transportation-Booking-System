/* Transpo — shared driver-tracking geometry
   Helpers used by the booking page and by the inline tracking view on the
   history page, so both drive the driver the same way and draw the driver the
   same way. */

(function (global) {
  'use strict';

  var MPS = 25;              // simulated driver speed, meters per second
  var ROUTE_TIMEOUT_MS = 8000;

  /* How long a simulated trip lasts from booking to arrival. The trip is
     replayed as a fraction of this window (tripProgress) rather than counted
     out by a timer, so it keeps moving on pages nobody is watching. MPS stays
     the fallback for bookings made before trips had a schedule. */
  var RIDE_MIN_MS = 5 * 60 * 1000;
  var RIDE_MAX_MS = 10 * 60 * 1000;

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

  function formatDist(m) {
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
  function fetchRoute(a, b) {
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
      setTimeout(function () { done(null); }, ROUTE_TIMEOUT_MS);
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

  /* Where the simulated driver starts: near the pickup point. */
  function driverStart(pickup, rand) {
    var r = typeof rand === 'function' ? rand : Math.random;
    function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
    return {
      lat: clamp(pickup.lat + (r() - 0.5) * 0.045, 10.18, 10.44),
      lng: clamp(pickup.lng + (r() - 0.5) * 0.055, 123.75, 124.04)
    };
  }

  /* Fractional index along the route for a distance in meters. */
  function indexAt(route, meters) {
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

  /* The trip schedule saved on a booking when it is made: where the driver
     starts and how long the whole trip takes. Decided once, so every page
     works out the same trip from the clock alone. */
  function rideSchedule(pickup, rand) {
    var r = typeof rand === 'function' ? rand : Math.random;
    return {
      start: driverStart(pickup, rand),
      rideMs: RIDE_MIN_MS + r() * (RIDE_MAX_MS - RIDE_MIN_MS)
    };
  }

  /* Where the driver set off from, read back off the booking so a trip looks
     the same when it is reopened. Bookings without one get a fresh start. */
  function driverStartOf(booking) {
    if (typeof booking.driverStartLat === 'number' &&
        typeof booking.driverStartLng === 'number') {
      return { lat: booking.driverStartLat, lng: booking.driverStartLng };
    }
    return driverStart({ lat: booking.pickupLat, lng: booking.pickupLng });
  }

  /* How far along the trip the driver is, 0..1. Works from the booking's
     window (PTB.rideWindow) and the clock, so the answer is the same wherever
     it is asked and does not need a timer to have been running. */
  function tripProgress(startedAt, dueAt, nowMs) {
    var span = dueAt - startedAt;
    if (!(span > 0)) return 1;
    return Math.min(1, Math.max(0, (nowMs - startedAt) / span));
  }

  /* Milliseconds until the driver is due at the pickup point, never negative. */
  function remainingRideMs(dueAt, nowMs) {
    return Math.max(0, dueAt - nowMs);
  }

  /* ---------- The moving driver on the map ---------- */

  /* Drawn as SVG rather than an emoji: an emoji renders differently on every
     device and the two vehicles end up hard to tell apart at map zoom. These
     are plain shapes, so the motorcycle always looks like a motorcycle. The
     windows and wheel hubs are filled with --bubble-cut, the colour the beacon
     itself is painted, so they read as cut-outs. */
  function vehicleSvg(serviceType) {
    var cut = 'var(--bubble-cut, #f97316)';

    if (serviceType === 'taxi') {
      return (
        '<svg viewBox="0 0 48 32" aria-hidden="true" focusable="false">' +
          '<path d="M6 20.5v-3.4c0-.9.5-1.7 1.3-2.1l5.6-2.8 3.4-4.3c.6-.8 1.6-1.3 2.6-1.3h10.2c1 0 2 .5 2.6 1.3l3.4 4.3 5.6 2.8c.8.4 1.3 1.2 1.3 2.1v3.4H6z" fill="#fff"/>' +
          '<rect x="18.4" y="10" width="11.2" height="4.2" rx="1.2" fill="' + cut + '"/>' +
          '<circle cx="15" cy="21" r="5.4" fill="#fff"/>' +
          '<circle cx="33" cy="21" r="5.4" fill="#fff"/>' +
          '<circle cx="15" cy="21" r="2.1" fill="' + cut + '"/>' +
          '<circle cx="33" cy="21" r="2.1" fill="' + cut + '"/>' +
        '</svg>'
      );
    }

    return (
      '<svg viewBox="0 0 48 32" aria-hidden="true" focusable="false">' +
        '<circle cx="12" cy="22" r="6" fill="none" stroke="#fff" stroke-width="3"/>' +
        '<circle cx="36" cy="22" r="6" fill="none" stroke="#fff" stroke-width="3"/>' +
        '<path d="M12 22 L19 13 L27 13 L30 22" fill="none" stroke="#fff" stroke-width="3" ' +
          'stroke-linecap="round" stroke-linejoin="round"/>' +
        '<path d="M27 13 L36 22" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M19 13 L17 9.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M31.5 10.5 L39.5 10.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>' +
      '</svg>'
    );
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* The marker that moves along the road: the vehicle itself, pulsing, with the
     driver's name on a tag underneath. The name is on the map because the rider
     needs to know *who* is driving towards them, not just that something is. */
  function vehicleIcon(booking) {
    var name = escapeHtml((booking && booking.driverName) || 'Your driver');
    var label = (booking && booking.serviceName) || '';

    return L.divIcon({
      className: 'leaflet-pin',
      html:
        '<div class="driver-marker">' +
          '<span class="driver-bubble' +
            (booking && booking.serviceType === 'taxi' ? ' is-taxi' : '') + '">' +
            vehicleSvg(booking && booking.serviceType) +
          '</span>' +
          '<span class="driver-tag">' +
            '<span class="driver-tag-name">' + name + '</span>' +
            (label ? '<span class="driver-tag-service">' + escapeHtml(label) + '</span>' : '') +
          '</span>' +
        '</div>',
      iconSize: [48, 88],
      iconAnchor: [24, 24]
    });
  }

  global.Track = {
    MPS: MPS,
    RIDE_MIN_MS: RIDE_MIN_MS,
    RIDE_MAX_MS: RIDE_MAX_MS,
    haversineKm: haversineKm,
    formatDist: formatDist,
    etaText: etaText,
    fetchRoute: fetchRoute,
    straightLeg: straightLeg,
    driverStart: driverStart,
    driverStartOf: driverStartOf,
    rideSchedule: rideSchedule,
    tripProgress: tripProgress,
    remainingRideMs: remainingRideMs,
    indexAt: indexAt,
    vehicleSvg: vehicleSvg,
    vehicleIcon: vehicleIcon
  };
})(window);
