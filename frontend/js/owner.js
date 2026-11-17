const $ = id => document.getElementById(id);
let owner = null;

if (!localStorage.getItem(DRIVE_TOKEN_KEY)) location.href = 'login.html';

function item(title, meta) {
  const node = document.createElement('article');
  node.className = 'owner-item';
  const heading = document.createElement('strong');
  heading.textContent = title;
  const detail = document.createElement('small');
  detail.textContent = meta;
  node.append(heading, detail);
  return node;
}

function addOwnerAction(parent, label, handler) {
  const button = document.createElement('button');
  button.className = 'button button-dark';
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await handler();
      await loadOwner();
    } catch (error) {
      $('ownerMessage').textContent = error.message || 'The action could not be completed.';
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  });
  parent.append(button);
}

async function loadOwner() {
  const [vehicles, bookings] = await Promise.all([
    driveRequest('/rental/owner/vehicles'),
    driveRequest('/rental/owner/bookings')
  ]);

  $('ownerVehicles').replaceChildren();
  if (!vehicles.length) $('ownerVehicles').textContent = 'No vehicles submitted yet.';
  vehicles.forEach(vehicle => {
    const status = vehicle.verification_status || (vehicle.is_verified ? 'approved' : 'pending');
    const row = item(
      [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Vehicle listing',
      vehicle.city + ' · ' + vehicle.vehicle_type + ' · ৳' + (vehicle.price_per_day ?? '—')
        + '/day · ' + status.toUpperCase()
    );
    if (status === 'rejected' && vehicle.verification_rejection_reason) {
      const reason = document.createElement('p');
      reason.textContent = 'Review note: ' + vehicle.verification_rejection_reason;
      row.append(reason);
      addOwnerAction(row, 'Resubmit for verification', async () => {
        const result = await driveRequest('/rental/vehicles/' + encodeURIComponent(vehicle.id) + '/resubmit', {
          method: 'POST'
        });
        $('ownerMessage').textContent = result.message;
      });
    }
    $('ownerVehicles').append(row);
  });

  $('ownerBookings').replaceChildren();
  if (!bookings.length) $('ownerBookings').textContent = 'No rental requests yet.';
  bookings.forEach(booking => {
    const vehicle = booking.vehicles || {};
    const row = item(
      (vehicle.make || 'Vehicle') + ' ' + (vehicle.model || ''),
      '৳' + booking.total_amount + ' · ' + booking.start_at.slice(0, 10)
        + ' → ' + booking.end_at.slice(0, 10) + ' · ' + booking.status.toUpperCase()
    );
    if (booking.status === 'pending') {
      const select = document.createElement('select');
      [['approved', 'Approve'], ['rejected', 'Reject']].forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.append(option);
      });
      const button = document.createElement('button');
      button.className = 'button button-dark';
      button.type = 'button';
      button.textContent = 'Update request';
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await driveRequest('/rental/bookings/' + encodeURIComponent(booking.id) + '/status', {
            method: 'PATCH',
            body: JSON.stringify({ status: select.value })
          });
          await loadOwner();
        } catch (error) {
          $('ownerMessage').textContent = error.message;
        } finally {
          button.disabled = false;
        }
      });
      row.append(select, button);
    }
    $('ownerBookings').append(row);
  });

  $('ownerMessage').textContent = 'Workspace updated.';
}

$('vehicleForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  const values = Object.fromEntries(new FormData(form).entries());
  values.seats = Number(values.seats);
  if (values.price_per_day === '') delete values.price_per_day;
  else values.price_per_day = Number(values.price_per_day);
  if (values.price_per_km === '') delete values.price_per_km;
  else values.price_per_km = Number(values.price_per_km);
  if (values.model_year === '') delete values.model_year;
  else values.model_year = Number(values.model_year);
  values.photo_paths = (values.photo_paths || '').split(',').map(value => value.trim()).filter(Boolean);

  try {
    const result = await driveRequest('/rental/vehicles', {
      method: 'POST',
      body: JSON.stringify(values)
    });
    $('ownerMessage').textContent = result.message;
    form.reset();
    await loadOwner();
  } catch (error) {
    $('ownerMessage').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('ownerLogout').addEventListener('click', () => {
  clearDriveSession();
  location.href = 'login.html';
});

async function bootOwnerWorkspace() {
  try {
    owner = await driveRequest('/users/me');
    localStorage.setItem('drive_user', JSON.stringify(owner));
    if (!['vehicle_owner', 'admin'].includes(owner.role)) {
      $('ownerMessage').textContent = 'Only approved Vehicle Owner accounts can use this workspace. Your current role is ' + (owner.role || 'unknown') + '.';
      $('vehicleForm').hidden = true;
      return;
    }
    await loadOwner();
  } catch (error) {
    $('ownerMessage').textContent = error.message || 'Your owner workspace could not be loaded.';
  }
}

bootOwnerWorkspace();
