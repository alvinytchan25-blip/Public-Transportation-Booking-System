/* Transpo — services page */

(function () {
  'use strict';

  var listEl = document.getElementById('servicesList');

  var SERVICE_LABELS = {
    motorcycle: 'Show Available Motorcycles',
    taxi: 'Show Available Taxis'
  };

  var SERVICE_HIDE = {
    motorcycle: 'Hide Available Motorcycles',
    taxi: 'Hide Available Taxis'
  };

  function render() {
    listEl.innerHTML = '';

    PTB.DEFAULT_SERVICES.forEach(function (s) {
      var card = document.createElement('div');
      card.className = 'service-card';

      card.innerHTML =
        '<div class="service-head">' +
          '<div class="service-icon">' + s.icon + '</div>' +
          '<div style="flex:1">' +
            '<div class="s-name">' + s.name + '</div>' +
            '<div class="s-sub">' + (s.type === 'motorcycle' ? 'Ride on two wheels' : 'Sit back and ride') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="service-prices">' +
          '<div class="price-chip">' +
            '<div class="pc-label">Price per km</div>' +
            '<div class="pc-value">' + PTB.formatMoney(s.pricePerKm) + '<span class="unit"> /km</span></div>' +
          '</div>' +
          '<div class="price-chip">' +
            '<div class="pc-label">Price per passenger</div>' +
            '<div class="pc-value">' + PTB.formatMoney(s.pricePerPassenger) + '<span class="unit"> /pax</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="driver-pool"></div>' +
        '<button class="btn btn-primary btn-block toggle-drivers" data-service="' + s.type + '">' +
          SERVICE_LABELS[s.type] +
        '</button>';

      listEl.appendChild(card);
    });

    listEl.querySelectorAll('.toggle-drivers').forEach(function (btn) {
      btn.addEventListener('click', function () {
        toggleDrivers(btn, btn.getAttribute('data-service'));
      });
    });
  }

  function toggleDrivers(btn, type) {
    var card = btn.closest('.service-card');
    var pool = card.querySelector('.driver-pool');

    if (pool.hasChildNodes()) {
      pool.innerHTML = '';
      pool.classList.remove('show');
      btn.classList.remove('btn-outline');
      btn.classList.add('btn-primary');
      btn.textContent = SERVICE_LABELS[type];
      return;
    }

    var drivers = PTB.randomDrivers();
    if (!drivers.length) {
      pool.innerHTML =
        '<div class="empty-state small">' +
          '<div class="em-icon">🚫</div>' +
          '<h3>No drivers online right now</h3>' +
          '<p>All ' + (type === 'motorcycle' ? 'motorcycles' : 'taxis') +
            ' are currently offline. Please check back in a moment.</p>' +
        '</div>';
    } else {
      pool.innerHTML = drivers.map(function (d) {
        return (
          '<div class="driver-pool-card">' +
            '<div class="driver-avatar">' + d.name.charAt(0) + '</div>' +
            '<div class="dp-info">' +
              '<div class="dp-name">' + d.name + '</div>' +
              '<div class="dp-phone">' + d.phone + '</div>' +
            '</div>' +
            '<button class="btn btn-accent btn-sm" data-book="' + type + '" data-driver="' +
              d.name.replace(/"/g, '&quot;') + '">Book Now</button>' +
          '</div>'
        );
      }).join('');
    }

    pool.classList.add('show');
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-outline');
    btn.textContent = SERVICE_HIDE[type];

    pool.querySelectorAll('[data-book]').forEach(function (bookBtn) {
      bookBtn.addEventListener('click', function () {
        var driver = encodeURIComponent(bookBtn.getAttribute('data-driver'));
        location.href = 'booking.html?service=' + type + '&driver=' + driver;
      });
    });
  }

  render();
})();