(() => {
  const $ = id => document.getElementById(id);
  const state = {
    profile: null,
    overview: null,
    queues: {
      applications: [], owners: [], vehicles: [], safety: [], payments: [],
      users: [], rides: [], rentals: [], audit: []
    },
    errors: {},
    search: '',
    loading: false
  };

  const queues = [
    { key: 'applications', element: 'applications', count: 'countApplications', endpoint: '/admin/driver-applications', empty: 'No driver applications are waiting for review.' },
    { key: 'owners', element: 'ownerApplications', count: 'countOwners', endpoint: '/admin/owner-applications', empty: 'No vehicle owner applications are waiting for review.' },
    { key: 'vehicles', element: 'vehicles', count: 'countVehicles', endpoint: '/admin/vehicles', empty: 'No vehicles are waiting for verification.' },
    { key: 'safety', element: 'safetyAlerts', count: 'countSafety', endpoint: '/admin/safety-alerts', empty: 'No active safety alerts.' },
    { key: 'payments', element: 'payments', count: 'countPayments', endpoint: '/admin/payments', empty: 'No payments are waiting for settlement.' },
    { key: 'users', element: 'users', count: 'countUsers', endpoint: '/admin/users', empty: 'No user accounts were found.' },
    { key: 'rides', element: 'rides', count: 'countRides', endpoint: '/admin/rides', empty: 'No ride requests have been recorded.' },
    { key: 'rentals', element: 'rentalBookings', count: 'countRentals', endpoint: '/admin/rental-bookings', empty: 'No rental bookings have been recorded.' },
    { key: 'audit', element: 'auditLogs', count: 'countAudit', endpoint: '/admin/audit-logs', empty: 'No administrator actions have been recorded yet.' }
  ];

  function setMessage(message, type) {
    const node = $('adminMessage');
    node.textContent = message;
    node.className = 'admin-message' + (type ? ' ' + type : '');
  }

  function relation(row, key) {
    const value = row?.[key];
    return Array.isArray(value) ? (value[0] || {}) : (value || {});
  }

  function addText(parent, tag, value, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
    parent.append(node);
    return node;
  }

  function addLink(parent, label, href) {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = label;
    parent.append(link);
    return link;
  }

  function makeItem(title, meta, note) {
    const item = document.createElement('article');
    item.className = 'admin-item';
    const top = document.createElement('div');
    top.className = 'admin-item-top';
    addText(top, 'strong', title);
    item.append(top);
    if (meta) addText(item, 'small', meta);
    if (note) addText(item, 'p', note);
    const actions = document.createElement('div');
    actions.className = 'admin-actions';
    item.append(actions);
    return { item, actions };
  }

  function addAction(parent, label, handler, kind) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'admin-action' + (kind ? ' ' + kind : '');
    button.textContent = label;
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await handler();
        if (button.isConnected) button.disabled = false;
      } catch (error) {
        setMessage(error.message || 'The action could not be completed.', 'error');
        button.disabled = false;
      }
    });
    parent.append(button);
    return button;
  }

  async function confirmAction(message, task, successMessage) {
    if (!window.confirm(message)) return;
    await task();
    setMessage(successMessage, 'success');
    await loadQueues();
  }

  async function rejectWithReason(label, task, successMessage) {
    const reason = window.prompt('Enter a reason for ' + label + ':', 'Please contact DRIVE support for more information.');
    if (reason === null) return;
    await confirmAction(
      'Confirm ' + label + '?',
      () => task(reason.trim() || 'Did not meet DRIVE requirements.'),
      successMessage
    );
  }

  function formatDate(value) {
    if (!value) return 'Date unavailable';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
  }

  function formatMoney(amount, currency) {
    const value = Number(amount);
    if (!Number.isFinite(value)) return (currency || 'BDT') + ' —';
    return (currency || 'BDT') + ' ' + value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function applicantName(row, fallback) {
    const profile = relation(row, 'profiles');
    return profile.full_name || fallback || 'DRIVE user';
  }

  function renderDriverApplication(box, application) {
    const profile = relation(application, 'profiles');
    const meta = [
      profile.phone || 'No phone number',
      'NID / licence: ' + (application.license_number || 'Not supplied'),
      (application.requested_vehicle_type || 'vehicle type not specified').toUpperCase(),
      (application.experience_years ?? 0) + ' years experience',
      'Submitted ' + formatDate(application.created_at)
    ].join(' · ');
    const card = makeItem(applicantName(application, 'Driver applicant'), meta, application.note || '');
    addAction(card.actions, 'Approve driver', () => confirmAction(
      'Approve this driver? Their profile role and verified status will be updated atomically.',
      () => driveRequest('/admin/driver-applications/' + encodeURIComponent(application.id), {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' })
      }),
      'Driver approved. Driver access is now enabled.'
    ));
    addAction(card.actions, 'Reject', () => rejectWithReason(
      'rejecting this driver application',
      reason => driveRequest('/admin/driver-applications/' + encodeURIComponent(application.id), {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected', rejection_reason: reason })
      }),
      'Driver application rejected.'
    ), 'reject');
    box.append(card.item);
  }

  function renderOwnerApplication(box, application) {
    const profile = relation(application, 'profiles');
    const meta = [
      profile.full_name || 'Owner applicant',
      application.contact_phone || profile.phone || 'No contact phone',
      application.business_address || 'No business address',
      'Submitted ' + formatDate(application.created_at)
    ].join(' · ');
    const card = makeItem(application.business_name || 'Vehicle owner application', meta, application.note || '');
    addAction(card.actions, 'Approve owner', () => confirmAction(
      'Approve this vehicle owner? Their account role will be changed to Vehicle Owner.',
      () => driveRequest('/admin/owner-applications/' + encodeURIComponent(application.id), {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' })
      }),
      'Vehicle owner approved.'
    ));
    addAction(card.actions, 'Reject', () => rejectWithReason(
      'rejecting this vehicle owner application',
      reason => driveRequest('/admin/owner-applications/' + encodeURIComponent(application.id), {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected', rejection_reason: reason })
      }),
      'Vehicle owner application rejected.'
    ), 'reject');
    box.append(card.item);
  }

  function renderVehicle(box, vehicle) {
    const owner = relation(vehicle, 'owner');
    const meta = [
      vehicle.plate_number || 'No registration plate',
      (vehicle.vehicle_type || 'Vehicle').toUpperCase(),
      vehicle.city || 'City not specified',
      vehicle.model_year || '',
      vehicle.seats ? vehicle.seats + ' seats' : '',
      owner.full_name || 'Owner not available',
      owner.phone || ''
    ].filter(Boolean).join(' · ');
    const card = makeItem([vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle listing', meta, vehicle.description || '');
    if (Array.isArray(vehicle.photo_paths) && vehicle.photo_paths.length) {
      addText(card.item, 'small', vehicle.photo_paths.length + ' vehicle photo(s) attached');
    }
    addAction(card.actions, 'Verify vehicle', () => confirmAction(
      'Verify this vehicle? It will become eligible for the public rental catalogue.',
      () => driveRequest('/admin/vehicles/' + encodeURIComponent(vehicle.id), {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' })
      }),
      'Vehicle verified and approved.'
    ));
    addAction(card.actions, 'Reject', () => rejectWithReason(
      'rejecting this vehicle',
      reason => driveRequest('/admin/vehicles/' + encodeURIComponent(vehicle.id), {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected', rejection_reason: reason })
      }),
      'Vehicle verification rejected.'
    ), 'reject');
    box.append(card.item);
  }

  function renderSafetyAlert(box, alert) {
    const profile = relation(alert, 'profiles');
    const meta = [
      profile.full_name || 'Passenger',
      profile.phone || 'No phone number',
      'Status: ' + String(alert.status || 'open').toUpperCase(),
      formatDate(alert.created_at)
    ].join(' · ');
    const card = makeItem((alert.alert_type || 'SOS').toUpperCase() + ' incident', meta, alert.message || 'Emergency alert recorded.');
    if (alert.latitude != null && alert.longitude != null) {
      const lat = Number(alert.latitude), lng = Number(alert.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        addLink(card.item, 'Open reported location ↗',
          'https://www.openstreetmap.org/?mlat=' + encodeURIComponent(lat) + '&mlon=' + encodeURIComponent(lng) + '#map=17/' + encodeURIComponent(lat) + '/' + encodeURIComponent(lng));
      }
    }
    if (alert.status === 'open') {
      addAction(card.actions, 'Acknowledge', () => confirmAction(
        'Acknowledge this safety incident? This records that an administrator has seen it.',
        () => driveRequest('/admin/safety-alerts/' + encodeURIComponent(alert.id), {
          method: 'PATCH', body: JSON.stringify({ status: 'acknowledged' })
        }),
        'Safety alert acknowledged.'
      ));
    }
    if (alert.status === 'open' || alert.status === 'acknowledged') {
      addAction(card.actions, 'Resolve', () => confirmAction(
        'Mark this safety incident as resolved after reviewing it?',
        () => driveRequest('/admin/safety-alerts/' + encodeURIComponent(alert.id), {
          method: 'PATCH', body: JSON.stringify({ status: 'resolved' })
        }),
        'Safety alert marked as resolved.'
      ));
      addAction(card.actions, 'False alarm', () => confirmAction(
        'Mark this incident as a false alarm?',
        () => driveRequest('/admin/safety-alerts/' + encodeURIComponent(alert.id), {
          method: 'PATCH', body: JSON.stringify({ status: 'false_alarm' })
        }),
        'Safety alert marked as a false alarm.'
      ), 'secondary');
    }
    box.append(card.item);
  }

  function renderPayment(box, payment) {
    const payer = relation(payment, 'payer');
    const reference = payment.ride_id ? 'Ride: ' + payment.ride_id : payment.rental_booking_id ? 'Rental: ' + payment.rental_booking_id : 'No booking reference';
    const meta = [
      payer.full_name || 'Customer not available',
      payer.phone || '',
      (payment.method || 'method unavailable').toUpperCase(),
      'Created ' + formatDate(payment.created_at)
    ].filter(Boolean).join(' · ');
    const card = makeItem(formatMoney(payment.amount, payment.currency), meta, reference);
    const method = String(payment.method || '').toLowerCase();
    if (payment.provider_reference) {
      addText(card.item, 'small', 'Customer transaction ID: ' + payment.provider_reference);
    }
    if (method === 'cash') {
      addAction(card.actions, 'Confirm cash received', () => confirmAction(
        'Confirm that the full cash amount has physically been received?',
        () => driveRequest('/admin/payments/' + encodeURIComponent(payment.id), {
          method: 'PATCH', body: JSON.stringify({ status: 'paid' })
        }),
        'Cash payment marked as paid.'
      ));
    } else if (['bkash', 'nagad'].includes(method) && payment.provider_reference) {
      addAction(card.actions, 'Verify transfer & mark paid', () => confirmAction(
        'Verify transaction ID ' + payment.provider_reference + ' in the official ' + method.toUpperCase() + ' merchant account. Only continue after the amount and receiver are confirmed.',
        () => driveRequest('/admin/payments/' + encodeURIComponent(payment.id), {
          method: 'PATCH', body: JSON.stringify({ status: 'paid' })
        }),
        'Wallet transaction marked as verified and paid.'
      ));
    } else {
      addText(card.item, 'small', 'Waiting for the customer to submit a bKash/Nagad transaction ID. No automatic gateway confirmation is configured.');
    }
    addAction(card.actions, 'Mark failed', () => confirmAction(
      'Mark this pending payment intent as failed?',
      () => driveRequest('/admin/payments/' + encodeURIComponent(payment.id), {
        method: 'PATCH', body: JSON.stringify({ status: 'failed' })
      }),
      'Payment marked as failed.'
    ), 'reject');
    box.append(card.item);
  }

  function renderUser(box, user) {
    const meta = [
      String(user.role || 'passenger').replaceAll('_', ' ').toUpperCase(),
      user.phone || 'No phone number',
      user.is_verified ? 'Verified' : 'Not verified',
      user.is_active ? 'Active' : 'Suspended',
      'Joined ' + formatDate(user.created_at)
    ].join(' · ');
    const card = makeItem(user.full_name || 'DRIVE user', meta, user.id);
    if (user.role !== 'admin') {
      const active = !!user.is_active;
      addAction(card.actions, active ? 'Suspend account' : 'Reactivate account', () => confirmAction(
        active
          ? 'Suspend this account? The user will no longer be able to access protected DRIVE features.'
          : 'Reactivate this account?',
        () => driveRequest('/admin/users/' + encodeURIComponent(user.id) + '/status', {
          method: 'PATCH', body: JSON.stringify({ is_active: !active })
        }),
        active ? 'Account suspended.' : 'Account reactivated.'
      ), active ? 'reject' : 'secondary');
    } else {
      addText(card.item, 'small', 'Administrator account is protected from suspension here.');
    }
    box.append(card.item);
  }

  function renderRide(box, request) {
    const passenger = relation(request, 'profiles');
    const ride = request.ride || {};
    const driver = relation(ride, 'profiles');
    const meta = [
      (request.requested_vehicle || 'car').toUpperCase(),
      'Status: ' + String(request.status || 'requested').replaceAll('_', ' ').toUpperCase(),
      passenger.full_name || 'Passenger',
      passenger.phone || 'No phone',
      driver.full_name ? 'Driver: ' + driver.full_name : (ride.driver_id ? 'Driver assigned' : 'Awaiting driver'),
      request.is_shared ? 'Shared ride' : 'Private ride',
      request.women_safety_preference ? 'Women Safety enabled' : '',
      formatDate(request.created_at)
    ].filter(Boolean).join(' · ');
    const fare = request.estimated_fare == null ? 'Fare pending' : formatMoney(request.estimated_fare, request.currency || 'BDT');
    const card = makeItem((request.pickup_label || 'Pickup') + ' → ' + (request.destination_label || 'Destination'), meta, fare + ' · ' + (request.estimated_distance_km ?? '—') + ' km estimated');
    const lat = Number(request.pickup_lat), lng = Number(request.pickup_lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      addLink(card.item, 'Open pickup location ↗', 'https://www.openstreetmap.org/?mlat=' + encodeURIComponent(lat) + '&mlon=' + encodeURIComponent(lng) + '#map=15/' + encodeURIComponent(lat) + '/' + encodeURIComponent(lng));
    }
    if (ride.id) addText(card.item, 'small', 'Ride ID: ' + ride.id);
    box.append(card.item);
  }

  function renderRental(box, booking) {
    const vehicle = relation(booking, 'vehicles');
    const renter = relation(booking, 'renter');
    const status = String(booking.status || 'pending');
    const meta = [
      renter.full_name || 'Renter',
      renter.phone || 'No phone number',
      vehicle.plate_number || 'No plate',
      vehicle.city || '',
      formatDate(booking.start_at) + ' – ' + formatDate(booking.end_at),
      'Status: ' + status.toUpperCase()
    ].filter(Boolean).join(' · ');
    const card = makeItem([vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Rental booking', meta,
      formatMoney(booking.total_amount, booking.currency) + (booking.pickup_note ? ' · ' + booking.pickup_note : ''));
    if (status === 'pending') {
      addAction(card.actions, 'Approve booking', () => confirmAction(
        'Approve this rental booking?',
        () => driveRequest('/admin/rental-bookings/' + encodeURIComponent(booking.id), {
          method: 'PATCH', body: JSON.stringify({ status: 'approved' })
        }),
        'Rental booking approved.'
      ));
      addAction(card.actions, 'Reject', () => confirmAction(
        'Reject this rental booking?',
        () => driveRequest('/admin/rental-bookings/' + encodeURIComponent(booking.id), {
          method: 'PATCH', body: JSON.stringify({ status: 'rejected' })
        }),
        'Rental booking rejected.'
      ), 'reject');
    } else if (status === 'approved') {
      addAction(card.actions, 'Cancel booking', () => confirmAction(
        'Cancel this approved rental booking?',
        () => driveRequest('/admin/rental-bookings/' + encodeURIComponent(booking.id), {
          method: 'PATCH', body: JSON.stringify({ status: 'cancelled' })
        }),
        'Rental booking cancelled.'
      ), 'reject');
    } else if (status === 'active') {
      addAction(card.actions, 'Mark completed', () => confirmAction(
        'Confirm that this rental has been completed?',
        () => driveRequest('/admin/rental-bookings/' + encodeURIComponent(booking.id), {
          method: 'PATCH', body: JSON.stringify({ status: 'completed' })
        }),
        'Rental booking marked completed.'
      ), 'secondary');
      addAction(card.actions, 'Cancel booking', () => confirmAction(
        'Cancel this active rental booking? Confirm that the customer and owner have been contacted.',
        () => driveRequest('/admin/rental-bookings/' + encodeURIComponent(booking.id), {
          method: 'PATCH', body: JSON.stringify({ status: 'cancelled' })
        }),
        'Rental booking cancelled.'
      ), 'reject');
    }
    box.append(card.item);
  }

  function renderAudit(box, entry) {
    const admin = relation(entry, 'admin');
    const details = entry.details && typeof entry.details === 'object'
      ? JSON.stringify(entry.details)
      : String(entry.details || '');
    const card = makeItem(
      String(entry.action || 'Admin action').replaceAll('.', ' ').replaceAll('_', ' ').toUpperCase(),
      [admin.full_name || 'Administrator', entry.entity_type || 'record', formatDate(entry.created_at)].join(' · '),
      (entry.entity_id ? 'Record: ' + entry.entity_id + ' · ' : '') + details
    );
    box.append(card.item);
  }

  const renderers = {
    applications: renderDriverApplication,
    owners: renderOwnerApplication,
    vehicles: renderVehicle,
    safety: renderSafetyAlert,
    payments: renderPayment,
    users: renderUser,
    rides: renderRide,
    rentals: renderRental,
    audit: renderAudit
  };

  function searchMatch(row) {
    if (!state.search) return true;
    return JSON.stringify(row).toLowerCase().includes(state.search);
  }

  function renderQueue(config) {
    const box = $(config.element);
    box.replaceChildren();
    if (state.errors[config.key]) {
      addText(box, 'div', state.errors[config.key], 'admin-queue-error');
      return;
    }
    let rows = (state.queues[config.key] || []).filter(searchMatch);
    if (config.key === 'safety') rows = rows.filter(row => row.status === 'open' || row.status === 'acknowledged');
    if (!rows.length) {
      addText(box, 'div', state.search ? 'No matching records in this queue.' : config.empty, 'admin-empty');
      return;
    }
    rows.forEach(row => renderers[config.key](box, row));
  }

  function updateCounts() {
    const q = state.queues;
    const overview = state.overview?.counts || {};
    const activeSafety = q.safety.filter(row => row.status === 'open' || row.status === 'acknowledged').length;
    const counts = {
      applications: q.applications.length,
      owners: q.owners.length,
      vehicles: q.vehicles.length,
      safety: activeSafety,
      payments: q.payments.length,
      users: q.users.length,
      rides: q.rides.length,
      rentals: q.rentals.length,
      audit: q.audit.length
    };
    const statValues = {
      statUsers: overview.users ?? counts.users,
      statDrivers: overview.pendingDrivers ?? counts.applications,
      statOwners: overview.pendingOwners ?? counts.owners,
      statVehicles: overview.pendingVehicles ?? counts.vehicles,
      statRides: overview.activeRides ?? q.rides.filter(row => ['matched','driver_arriving','in_progress'].includes(row.status)).length,
      statRentals: overview.pendingRentals ?? q.rentals.filter(row => row.status === 'pending').length,
      statSafety: overview.activeSafetyAlerts ?? counts.safety,
      statPayments: overview.pendingPayments ?? counts.payments
    };
    Object.entries(statValues).forEach(([id, value]) => {
      $(id).textContent = state.overviewError ? '—' : String(value);
    });
    const ids = {
      applications: 'countApplications', owners: 'countOwners', vehicles: 'countVehicles',
      safety: 'countSafety', payments: 'countPayments', users: 'countUsers',
      rides: 'countRides', rentals: 'countRentals', audit: 'countAudit'
    };
    Object.entries(ids).forEach(([key, id]) => {
      $(id).textContent = state.errors[key] ? '—' : String(counts[key]);
    });
  }

  function renderQueues() {
    queues.forEach(renderQueue);
    updateCounts();
  }

  async function loadQueues() {
    if (state.loading) return;
    state.loading = true;
    $('refreshButton').disabled = true;
    $('refreshButton').textContent = 'Refreshing…';
    state.errors = {};
    state.overviewError = null;
    const results = await Promise.allSettled([
      driveRequest('/admin/overview'),
      ...queues.map(config => driveRequest(config.endpoint))
    ]);
    if (results[0].status === 'fulfilled') state.overview = results[0].value;
    else state.overviewError = results[0].reason?.message || 'Overview metrics could not be loaded.';
    results.slice(1).forEach((result, index) => {
      const config = queues[index];
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        state.queues[config.key] = result.value;
      } else if (result.status === 'fulfilled') {
        state.queues[config.key] = [];
        state.errors[config.key] = 'The server returned an unexpected response for this section.';
      } else {
        state.errors[config.key] = result.reason?.message || 'This section could not be loaded.';
      }
    });
    renderQueues();
    const failed = Object.keys(state.errors).length + (state.overviewError ? 1 : 0);
    $('lastUpdated').textContent = 'Last refreshed ' + new Date().toLocaleTimeString();
    $('refreshButton').disabled = false;
    $('refreshButton').textContent = '↻ Refresh all data';
    state.loading = false;
    if (failed) {
      setMessage(failed + ' section(s) could not be loaded. Check the section error and retry; working sections remain available.', 'error');
    } else {
      setMessage('All operations, review queues and audit records are up to date.', 'success');
    }
  }

  function signOut() {
    if (typeof clearDriveSession === 'function') clearDriveSession();
    else {
      localStorage.removeItem('drive_access_token');
      localStorage.removeItem('drive_refresh_token');
      localStorage.removeItem('drive_user');
    }
    location.replace('login.html');
  }

  function showAccessDenied(profile) {
    $('adminStatus').textContent = 'Access restricted';
    $('adminIdentity').textContent = profile?.name || profile?.full_name || 'Signed-in account';
    $('adminAccessPanel').hidden = false;
    $('adminShell').hidden = true;
    $('refreshButton').hidden = true;
    setMessage('Your account is signed in, but the database does not grant it the admin role.', 'error');
  }

  async function boot() {
    $('logoutButton').addEventListener('click', signOut);
    $('accessLogoutButton').addEventListener('click', signOut);
    $('refreshButton').addEventListener('click', loadQueues);
    $('queueSearch').addEventListener('input', event => {
      state.search = event.target.value.trim().toLowerCase();
      renderQueues();
    });

    if (!localStorage.getItem('drive_access_token')) {
      location.replace('login.html?next=admin');
      return;
    }

    try {
      state.profile = await driveRequest('/users/me');
      if (state.profile.role !== 'admin') {
        showAccessDenied(state.profile);
        return;
      }
      $('adminIdentity').textContent = state.profile.name || state.profile.full_name || 'Administrator';
      $('adminStatus').textContent = 'Administrator verified';
      $('adminShell').hidden = false;
      $('refreshButton').hidden = false;
      await loadQueues();
      window.setInterval(() => {
        if (!document.hidden) loadQueues();
      }, 60000);
    } catch (error) {
      const message = error.message || 'Administrator access could not be verified.';
      if (/session has expired|log in again|invalid session/i.test(message)) {
        setMessage('Your session has expired. Redirecting you to sign in…', 'error');
        window.setTimeout(() => location.replace('login.html?next=admin'), 900);
        return;
      }
      setMessage(message, 'error');
      $('adminStatus').textContent = 'Could not verify access';
    }
  }

  boot();
})();