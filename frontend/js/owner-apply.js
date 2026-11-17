const $ = id => document.getElementById(id);
const form = $('ownerApplicationForm');
const status = $('applicationStatus');
let user = null;
let currentApplication = null;

if (!localStorage.getItem(DRIVE_TOKEN_KEY)) location.href = 'login.html';

async function refreshApplication() {
  try {
    user = await driveRequest('/users/me');
    localStorage.setItem('drive_user', JSON.stringify(user));

    if (user.role === 'vehicle_owner') {
      location.replace('owner.html');
      return;
    }
    if (user.role !== 'passenger') {
      form.hidden = true;
      $('ownerApplyMessage').textContent = 'Only passenger accounts can submit a vehicle-owner application.';
      return;
    }

    currentApplication = await driveRequest('/owners/application');
    if (!currentApplication) {
      form.hidden = false;
      status.hidden = true;
      form.querySelector('button[type="submit"]').textContent = 'Submit application →';
      return;
    }

    status.hidden = false;
    if (currentApplication.status === 'rejected') {
      form.hidden = false;
      form.elements.business_name.value = currentApplication.business_name || '';
      form.elements.contact_phone.value = currentApplication.contact_phone || '';
      form.elements.business_address.value = currentApplication.business_address || '';
      form.elements.note.value = currentApplication.note || '';
      status.textContent = 'Your previous application was rejected. Update the details and resubmit. Reason: '
        + (currentApplication.rejection_reason || 'Please update your details.');
      form.querySelector('button[type="submit"]').textContent = 'Resubmit application →';
      return;
    }

    form.hidden = true;
    status.textContent = 'Application status: ' + currentApplication.status.toUpperCase()
      + '. Submitted ' + new Date(currentApplication.created_at).toLocaleString()
      + '. You will be notified when an administrator reviews it.';
  } catch (error) {
    form.hidden = false;
    $('ownerApplyMessage').textContent = error.message || 'Application status could not be loaded.';
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const payload = Object.fromEntries(new FormData(form).entries());
    const endpoint = currentApplication?.status === 'rejected'
      ? '/owners/application/resubmit'
      : '/owners/application';
    const result = await driveRequest(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    $('ownerApplyMessage').textContent = result.message;
    await refreshApplication();
  } catch (error) {
    $('ownerApplyMessage').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

refreshApplication();
