(() => {
  const $ = id => document.getElementById(id);
  const state = {
    profile: null,
    queues: { applications: [], owners: [], vehicles: [], safety: [], payments: [] },
    errors: {},
    search: ''
  };

  const queueConfig = [
    { key: 'applications', element: 'applications', count: 'countApplications', endpoint: '/admin/driver-applications', empty: 'No driver applications are waiting for review.' },
    { key: 'owners', element: 'ownerApplications', count: 'countOwners', endpoint: '/admin/owner-applications', empty: 'No vehicle owner applications are waiting for review.' },
    { key: 'vehicles', element: 'vehicles', count: 'countVehicles', endpoint: '/admin/vehicles', empty: 'No vehicles are waiting for verification.' },
    { key: 'safety', element: 'safetyAlerts', count: 'countSafety', endpoint: '/admin/safety-alerts', empty: 'No active safety alerts.' },
    { key: 'payments', element: 'payments', count: 'countPayments', endpoint: '/admin/payments', empty: 'No payments are waiting for settlement.' }
  ];

  function setMessage(message, type) {
    const node = $('adminMessage');
    node.textContent = message;
    node.className = 'admin-message' + (type ? ' ' + type : '');
  }

  function profileFor(row) {
    if (Array.isArray(row?.profiles)) return row.profiles[0] || {};
    return row?.profiles || {};
  }

  function addText(parent, tag, value, className) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value == null || value === '' ? '—' : String(value);
    parent.append(node);
    return node;
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

  function formatDate(value) {
    if (!value) return 'Date unavailable';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
  }

  function profileName(row, fallback) {
    const profile = profileFor(row);
    return profile.full_name || fallback || 'DRIVE user';
  }

  function renderDriverApplication(box, application) {
    const profile = profileFor(application);
    const meta = [
      profile.phone || 'No phone number',
      application.license_number || 'No ID number',
      (application.requested_vehicle_type || 'vehicle type not specified').toUpperCase(),
      (application.experience_years ?? 0) + ' years experience',
      'Submitted ' + formatDate(application.created_at)
    ].join(' · ');
    const card = makeItem(profileName(application, 'Driver applicant'), meta, application.note || '');
    addAction(card.actions, 'Approve driver', () => confirmAction(
      'Approve this driver? Their account will receive the Driver role and verified status.',
      () => driveRequest('/admin/driver-applications/' + encodeURIComponent(application.id), {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' })
      }),
      'Driver approved. Their Driver workspace is now enabled.'
    ));
    addAction(card.actions, 'Reject', async () => {
      const reason = window.prompt('Enter a reason for rejecting this application:', 'Please contact DRIVE support for more information.');
      if (reason === null) return;
      await confirmAction(
        'Reject this driver application?',
        () => driveRequest('/admin/driver-applications/' + encodeURIComponent(application.id), {
          method: 'PATCH',
          body: JSON.stringify({ status: 'rejected', rejection_reason: reason.trim() || 'Application did not meet verification requirements.' })
        }),
        'Driver application rejected.'
      );
    }, 'reject');
    box.append(card.item);
  }

  function renderOwnerApplication(box, application) {
    const profile = profileFor(application);
    const meta = [
      profileName(application, 'Owner applicant'),
      application.contact_phone || profile.phone || 'No contact phone',
      application.business_address || 'No business address',
      'Submitted ' + formatDate(application.created_at)
    ].join(' · ');
    const card = makeItem(application.business_name || 'Vehicle owner application', meta, application.note || '');
    addAction(card.actions, 'Approve owner', () => confirmAction(
      'Approve this vehicle owner? Their account will receive the Vehicle Owner role.',
      () => driveRequest('/admin/owner-applications/' + encodeURIComponent(application.id), {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' })
      }),
      'Vehicle owner approved.'
    ));
    addAction(card.actions, 'Reject', async () => {
      const reason = window.prompt('Enter a reason for rejecting this application:', 'Please contact DRIVE support for more information.');
      if (reason === null) return;
      await confirmAction(
        'Reject this vehicle owner application?',
        () => driveRequest('/admin/owner-applications/' + encodeURIComponent(application.id), {
          method: 'PATCH',
          body: JSON.stringify({ status: 'rejected', rejection_reason: reason.trim() || 'Application did not meet verification requirements.' })
        }),
        'Vehicle owner application rejected.'
      );
    }, 'reject');
    box.append(card.item);
  }

  function renderVehicle(box, vehicle) {
    const meta = [
      vehicle.plate_number || 'No plate number',
      (vehicle.vehicle_type || 'Vehicle').toUpperCase(),
      vehicle.city || 'City not specified',
      vehicle.model_year || '',
      vehicle.seats ? vehicle.seats + ' seats' : ''
    ].filter(Boolean).join(' · ');
    const card = makeItem([vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle listing', meta, vehicle.description || '');
    addAction(card.actions, 'Verify vehicle', () => confirmAction(
      'Verify this vehicle? It may become eligible for the public vehicle catalogue.',
      () => driveRequest('/admin/vehicles/' + encodeURIComponent(vehicle.id), {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' })
      }),
      'Vehicle verified.'
    ));
    addAction(card.actions, 'Reject', () => confirmAction(
      'Reject this vehicle verification?',
      () => driveRequest('/admin/vehicles/' + encodeURIComponent(vehicle.id), {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected' })
      }),
      'Vehicle verification rejected.'
    ), 'reject');
    box.append(card.item);
  }

  function renderSafetyAlert(box, alert) {
    const profile = profileFor(alert);
    const status = (alert.status || 'open').toUpperCase();
    const meta = [
      profile.full_name || 'Passenger',
      profile.phone || 'No phone number',
      'Status: ' + status,
      formatDate(alert.created_at)
    ].join(' · ');
    const card = makeItem((alert.alert_type || 'SOS').toUpperCase() + ' incident', meta, alert.message || 'Emergency alert recorded.');
    if (alert.latitude != null && alert.longitude != null) {
      const link = document.createElement('a');
      link.href = 'https://www.openstreetmap.org/?mlat=' + encodeURIComponent(alert.latitude) + '&mlon=' + encodeURIComponent(alert.longitude) + '#map=17/' + encodeURIComponent(alert.latitude) + '/' + encodeURIComponent(alert.longitude);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open reported location ↗';
      card.item.append(link);
    }
    if (alert.status === 'open') {
      addAction(card.actions, 'Acknowledge', () => confirmAction(
        'Acknowledge this safety incident? This records that an admin has seen it.',
        () => driveRequest('/admin/safety-alerts/' + encodeURIComponent(alert.id), {
          method: 'PATCH',
          body: JSON.stringify({ status: 'acknowledged' })
        }),
        'Safety alert acknowledged.'
      ));
    }
    if (alert.status === 'open' || alert.status === 'acknowledged') {
      addAction(card.actions, 'Resolve', () => confirmAction(
        'Mark this safety incident as resolved? Confirm that the incident has been reviewed.',
        () => driveRequest('/admin/safety-alerts/' + encodeURIComponent(alert.id), {
          method: 'PATCH',
          body: JSON.stringify({ status: 'resolved' })
        }),
        'Safety alert marked as resolved.'
      ));
      addAction(card.actions, 'False alarm', () => confirmAction(
        'Mark this incident as a false alarm?',
        () => driveRequest('/admin/safety-alerts/' + encodeURIComponent(alert.id), {
          method: 'PATCH',
          body: JSON.stringify({ status: 'false_alarm' })
        }),
        'Safety alert marked as a false alarm.'
      ), 'secondary');
    }
    box.append(card.item);
  }

  function renderPayment(box, payment) {
    const reference = payment.ride_id ? 'Ride: ' + payment.ride_id : payment.rental_booking_id ? 'Rental: ' + payment.rental_booking_id : 'No booking reference';
    const meta = [
      (payment.method || 'method unavailable').toUpperCase(),
      payment.currency || 'BDT',
      'Created ' + formatDate(payment.created_at)
    ].join(' · ');
    const card = makeItem((payment.currency || 'BDT') + ' ' + payment.amount, meta, reference);
    if (String(payment.method || '').toLowerCase() === 'cash') {
      addAction(card.actions, 'Confirm cash received', () => confirmAction(
        'Confirm that the cash amount has physically been received in full?',
        () => driveRequest('/admin/payments/' + encodeURIComponent(payment.id), {
          method: 'PATCH',
          body: JSON.stringify({ status: 'paid' })
        }),
        'Cash payment marked as paid.'
      ));
    } else {
      addText(card.item, 'small', 'Online gateway is not connected. Do not mark this payment as collected.');
    }
    addAction(card.actions, 'Mark failed', () => confirmAction(
      'Mark this payment intent as failed?',
      () => driveRequest('/admin/payments/' + encodeURIComponent(payment.id), {
        method: 'PATCH',
        body: JSON.stringify({ status: 'failed' })
      }),
      'Payment marked as failed.'
    ), 'reject');
    box.append(card.item);
  }

  const renderers = {
    applications: renderDriverApplication,
    owners: renderOwnerApplication,
    vehicles: renderVehicle,
    safety: renderSafetyAlert,
    payments: renderPayment
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
    const rows = (state.queues[config.key] || []).filter(searchMatch);
    if (config.key === 'safety') {
      const active = rows.filter(row => row.status === 'open' || row.status === 'acknowledged');
      if (!active.length) {
        addText(box, 'div', state.search ? 'No matching active incidents.' : config.empty, 'admin-empty');
        return;
      }
      active.forEach(row => renderers[config.key](box, row));
      return;
    }
    if (!rows.length) {
      addText(box, 'div', state.search ? 'No matching records in this queue.' : config.empty, 'admin-empty');
      return;
    }
    rows.forEach(row => renderers[config.key](box, row));
  }

  function updateCounts() {
    const activeSafety = (state.queues.safety || []).filter(row => row.status === 'open' || row.status === 'acknowledged').length;
    const counts = {
      applications: (state.queues.applications || []).length,
      owners: (state.queues.owners || []).length,
      vehicles: (state.queues.vehicles || []).length,
      safety: activeSafety,
      payments: (state.queues.payments || []).length
    };
    const ids = {
      applications: ['statDrivers', 'countApplications'],
      owners: ['statOwners', 'countOwners'],
      vehicles: ['statVehicles', 'countVehicles'],
      safety: ['statSafety', 'countSafety'],
      payments: ['statPayments', 'countPayments']
    };
    Object.entries(ids).forEach(([key, targets]) => targets.forEach(id => {
      $(id).textContent = state.errors[key] ? '—' : String(counts[key]);
    }));
  }

  function renderQueues() {
    queueConfig.forEach(renderQueue);
    updateCounts();
  }

  async function loadQueues() {
    $('refreshButton').disabled = true;
    $('refreshButton').textContent = 'Refreshing…';
    state.errors = {};
    const results = await Promise.allSettled(queueConfig.map(config => driveRequest(config.endpoint)));
    results.forEach((result, index) => {
      const config = queueConfig[index];
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        state.queues[config.key] = result.value;
      } else if (result.status === 'fulfilled') {
        state.queues[config.key] = [];
        state.errors[config.key] = 'The server returned an unexpected response for this queue.';
      } else {
        state.errors[config.key] = result.reason?.message || 'This queue could not be loaded.';
      }
    });
    renderQueues();
    const failed = Object.values(state.errors).length;
    $('lastUpdated').textContent = 'Last refreshed ' + new Date().toLocaleTimeString();
    $('refreshButton').disabled = false;
    $('refreshButton').textContent = '↻ Refresh queues';
    if (failed) setMessage(failed + ' queue(s) could not be loaded. Other queues remain available; refresh after checking the error.', 'error');
    else setMessage('All five review queues are up to date.', 'success');
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
      // Do not trust the cached role in localStorage. Ask the authenticated API
      // for the current profile role before showing any admin data.
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
    } catch (error) {
      const message = error.message || 'Administrator access could not be verified.';
      if (/session has expired|log in again|invalid session/i.test(message)) {
        setMessage('Your session has expired. Redirecting you to sign in…', 'error');
        setTimeout(() => location.replace('login.html?next=admin'), 900);
        return;
      }
      setMessage(message, 'error');
      $('adminStatus').textContent = 'Could not verify access';
    }
  }

  boot();
})();