const $ = id => document.getElementById(id);
const form = $('applicationForm');
const status = $('applicationStatus');
let user = null;
let currentApplication = null;

if (!localStorage.getItem(DRIVE_TOKEN_KEY)) location.href = 'login.html';

function fillDriverApplication(application) {
  const value = String(application.license_number || '');
  const isNid = value.startsWith('NID:');
  form.elements.verification_type.value = isNid ? 'national_id' : 'driving_license';
  form.elements.license_number.value = value.replace(/^(NID|Driving licence):\\s*/, '');
  form.elements.experience_years.value = application.experience_years ?? 0;
  form.elements.requested_vehicle_type.value = application.requested_vehicle_type || 'bike';
  form.elements.note.value = application.note || '';
}

async function refresh() {
  try {
    user = await driveRequest('/users/me');
    localStorage.setItem('drive_user', JSON.stringify(user));

    if (user.role === 'driver') {
      form.hidden = true;
      status.textContent = 'Your driver account is active. Open the Driver workspace to continue.';
      return;
    }
    if (user.role !== 'passenger') {
      form.hidden = true;
      status.textContent = 'Only passenger accounts can apply to become a driver.';
      return;
    }

    currentApplication = await driveRequest('/drivers/application');
    if (!currentApplication) {
      form.hidden = false;
      status.textContent = 'No application submitted yet. Enter your NID or driving licence number to apply.';
      form.querySelector('button[type="submit"]').textContent = 'Submit application';
      return;
    }

    if (currentApplication.status === 'rejected') {
      form.hidden = false;
      fillDriverApplication(currentApplication);
      status.textContent = 'Your previous application was rejected. Review the note below, update your details, and resubmit. Reason: '
        + (currentApplication.rejection_reason || 'Please update your details.');
      form.querySelector('button[type="submit"]').textContent = 'Resubmit application';
      return;
    }

    form.hidden = true;
    const kind = currentApplication.license_number?.startsWith('NID:') ? 'National ID' : 'Driving licence';
    status.textContent = 'Application status: ' + String(currentApplication.status).toUpperCase()
      + ' · ' + kind + ' number: ' + currentApplication.license_number.replace(/^(NID|Driving licence):\\s*/, '');
    if (currentApplication.status === 'approved') {
      status.textContent += ' · Driver access is enabled.';
    }
  } catch (error) {
    form.hidden = false;
    status.textContent = error.message || 'Application status could not be loaded.';
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Submitting…';
  status.textContent = 'Submitting your application…';

  const values = Object.fromEntries(new FormData(form).entries());
  const kind = values.verification_type === 'national_id' ? 'NID' : 'Driving licence';
  const payload = {
    license_number: kind + ': ' + String(values.license_number || '').trim(),
    experience_years: Number(values.experience_years || 0),
    requested_vehicle_type: values.requested_vehicle_type || 'bike',
    note: values.note || '',
  };
  const endpoint = currentApplication?.status === 'rejected'
    ? '/drivers/application/resubmit'
    : '/drivers/application';

  try {
    const result = await driveRequest(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    status.textContent = result.message;
    await refresh();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
    if (currentApplication?.status !== 'rejected') button.textContent = original;
  }
});

refresh();
