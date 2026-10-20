/* Transpo — booking history
   Every booking lives here, split by status. The URL picks the view, which is
   how the dashboard opens one: history.html?status=Active
   The page names the view it is showing, so a filtered arrival never looks
   like the unfiltered history.

   Switching tabs does not reload the page: the URL is pushed into history so
   the view stays shareable and Back/Forward still move between tabs. */
(function () {
  'use strict';

  var user = PTB.getCurrentUser();
  if (!user) return;

  /* How many bookings a view shows before it offers to show more. */
  var PAGE_SIZE = 10;

  var listEl = document.getElementById('historyList');
  var emptyState = document.getElementById('emptyState');
  var tabsEl = document.getElementById('historyTabs');
  var titleEl = document.getElementById('historyTitle');
  var subEl = document.getElementById('historySub');
  var emptyTitleEl = document.getElementById('emptyTitle');
  var emptyTextEl = document.getElementById('emptyText');
  var emptyCtaEl = document.getElementById('emptyCta');
  var noticeEl = document.getElementById('historyNotice');
  var moreEl = document.getElementById('historyMore');

  /* The views the page can show, in tab order. */
  var VIEWS = [
    {
      status: PTB.STATUS.ACTIVE,
      /* Requests awaiting acceptance are shown here too, so they never vanish
         from the rider's view while they wait. */
      statuses: [PTB.STATUS.PENDING, PTB.STATUS.ACTIVE],
      source: ActiveBookings,
      short: 'Active',
      title: 'Active Bookings',
      sub: 'Bookings you placed and have not cancelled.',
      empty: 'You have no active bookings right now.',
      cta: 'Book Now'
    },
    {
      status: PTB.STATUS.CANCELLED,
      source: CancelledBookings,
      short: 'Cancelled',
      title: 'Cancelled Bookings',
      sub: 'Deleted after 24 hours.',
      empty: 'You have not cancelled any bookings.',
      notice: 'Cancelled bookings are automatically deleted 24 hours after cancellation.',
      hideCta: true
    },
    {
      status: PTB.STATUS.COMPLETED,
      source: CompletedBookings,
      short: 'Completed',
      title: 'Completed Bookings',
      sub: 'Your completed bookings will be saved here.',
      empty: 'Your booking history will appear here once you finish your first ride.'
    }
  ];

  /* How many of the current view's bookings are on screen. Grows with "Show
     more" and resets whenever the view changes. */
  var visible = PAGE_SIZE;

  function countFor(view) {
    var statuses = view.statuses || [view.status];
    return statuses.reduce(function (sum, status) {
      return sum + PTB.getBookingsByStatus(user.id, status).length;
    }, 0);
  }

  /* The view the URL asked for, or the default one. */
  function currentView() {
    var wanted = PTB.historyStatus();
    for (var i = 0; i < VIEWS.length; i++) {
      if (VIEWS[i].status === wanted) return VIEWS[i];
    }
    return VIEWS[VIEWS.length - 1];
  }

  function renderTabs(active) {
    tabsEl.innerHTML = VIEWS.map(function (v) {
      var on = v.status === active.status;
      return '<button type="button" class="tab' + (on ? ' active' : '') + '"' +
        ' data-status="' + v.status + '"' +
        (on ? ' aria-current="page"' : '') + '>' +
        v.short +
        ' <span class="tab-count">' + countFor(v) + '</span>' +
        '</button>';
    }).join('');
  }

  function render() {
    var view = currentView();

    document.title = view.title + ' — Transpo';
    titleEl.textContent = view.title;
    subEl.textContent = view.sub;
    emptyTitleEl.textContent = 'Nothing here yet';
    emptyTextEl.textContent = view.empty;
    /* An empty Active list is the one place a new booking is the obvious next
       step, so that view asks for it by name. */
    emptyCtaEl.textContent = view.cta || 'Book Your First Ride';
    emptyCtaEl.classList.toggle('hidden', view.hideCta === true);

    /* The Cancelled view carries a note about the retention window. */
    noticeEl.textContent = view.notice || '';
    noticeEl.classList.toggle('hidden', !view.notice);

    renderTabs(view);

    var bookings = view.source.list(user.id);
    var shown = bookings.slice(0, visible);

    BookingCard.render(listEl, shown);
    BookingCard.bindActions(listEl, render);

    emptyState.classList.toggle('hidden', bookings.length > 0);

    var remaining = bookings.length - shown.length;
    moreEl.classList.toggle('hidden', remaining <= 0);
    if (remaining > 0) {
      moreEl.textContent = 'Show more (' + remaining + ' remaining)';
    }
  }

  /* Move to another view without a reload: push the URL so it stays
     shareable, then redraw. */
  function go(status) {
    if (currentView().status === status) return;
    visible = PAGE_SIZE;
    window.history.pushState({ status: status }, '', PTB.historyUrl(status));
    render();
  }

  tabsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.tab');
    if (!btn) return;
    go(btn.getAttribute('data-status'));
  });

  moreEl.addEventListener('click', function () {
    visible += PAGE_SIZE;
    render();
  });

  /* Back and Forward walk the pushed views, so the URL and the tabs stay in
     step without the page reloading. */
  window.addEventListener('popstate', function () {
    visible = PAGE_SIZE;
    render();
  });

  /* A trip can run out while this page is open, which moves the booking into a
     different view. Redraw so the card and the tab counts follow it. */
  document.addEventListener(PTB.ARRIVED_EVENT, render);

  /* A request awaiting acceptance can be confirmed while this page is open,
     which turns a Pending card into an Active one in place. */
  document.addEventListener(PTB.ACCEPTED_EVENT, render);

  render();
})();
