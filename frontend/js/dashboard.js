(() => {
  const $ = id => document.getElementById(id);
  if (!driveRequireAuth('dashboard.html')) return;
  const activeStates = ['requested','matched','driver_arriving','in_progress'];
  const statusLabel = status => String(status || 'unknown').replaceAll('_',' ');
  const statusClass = status => ['completed','paid','approved'].includes(status) ? 'success' : ['pending','requested','matched','driver_arriving','in_progress'].includes(status) ? 'warning' : ['rejected','cancelled','failed'].includes(status) ? 'danger' : '';
  const item = (title,meta,status,action='') => '<div class="list-item"><div class="list-item-main"><strong>'+driveEscape(title)+'</strong><small>'+driveEscape(meta)+'</small></div><div class="row-actions">'+(status?'<span class="pill '+statusClass(status)+'">'+driveEscape(statusLabel(status))+'</span>':'')+action+'</div></div>';
  async function load() {
    try {
      const user = await driveRequest('/users/me');
      $('welcomeText').textContent = 'Welcome, '+(user.full_name || user.name || 'there')+'. Your journeys, all in one place.';
    } catch (error) { $('welcomeText').textContent = error.message; }
    let rides = [];
    try { rides = await driveRequest('/rides'); } catch (error) { $('activeRides').innerHTML='<div class="empty-state">'+driveEscape(error.message)+'</div>'; }
    const active = rides.filter(ride => activeStates.includes(ride.status));
    const history = rides.filter(ride => !activeStates.includes(ride.status));
    $('tripCount').textContent = rides.length;
    $('activeCount').textContent = active.length;
    $('activeRides').innerHTML = active.length ? active.map(ride => {
      const canCancel = ride.requestId && ride.requestStatus === 'requested';
      const action = canCancel ? '<button class="button-mini danger" data-cancel="'+driveEscape(ride.requestId)+'">Cancel</button>' : '';
      return item((ride.pickupAddress || 'Pickup')+' → '+(ride.destinationAddress || 'Destination'),driveDate(ride.createdAt)+' · '+driveMoney(ride.estimatedFare),ride.status,action);
    }).join('') : '<div class="empty-state">No active trips. Your next journey starts here.</div>';
    $('rideHistory').innerHTML = history.length ? history.slice(0,8).map(ride => item((ride.pickupAddress||'Pickup')+' → '+(ride.destinationAddress||'Destination'),driveDate(ride.createdAt)+' · '+driveMoney(ride.estimatedFare),ride.status)).join('') : '<div class="empty-state">Completed and cancelled trips will appear here.</div>';
    $('activeRides').querySelectorAll('[data-cancel]').forEach(button => button.addEventListener('click', async () => {
      button.disabled = true;
      try { await driveRequest('/rides/requests/'+button.dataset.cancel+'/cancel',{method:'POST'}); driveToast('Ride request cancelled.'); load(); }
      catch (error) { driveToast(error.message); button.disabled=false; }
    }));
    try {
      const notifications = await driveRequest('/notifications');
      $('unreadCount').textContent = notifications.unreadCount ?? 0;
      $('recentActivity').innerHTML = notifications.items?.length ? notifications.items.slice(0,5).map(note => item(note.title,note.body, note.read_at ? '' : 'new')).join('') : '<div class="empty-state">No new updates.</div>';
    } catch { $('unreadCount').textContent='—'; $('recentActivity').innerHTML='<div class="empty-state">Activity is unavailable.</div>'; }
    try {
      const payments = await driveRequest('/payments/me');
      $('paymentCount').textContent = payments.length ?? payments.items?.length ?? 0;
      const rows = Array.isArray(payments) ? payments : (payments.items || []);
      $('paymentHistory').innerHTML = rows.length ? rows.slice(0,6).map(payment => item(driveMoney(payment.amount)+' · '+(payment.method||'Payment'),driveDate(payment.created_at||payment.createdAt),payment.status)).join('') : '<div class="empty-state">No payments yet.</div>';
    } catch { $('paymentCount').textContent='—'; $('paymentHistory').innerHTML='<div class="empty-state">Payment history is unavailable.</div>'; }
    try {
      const settings = await driveRequest('/safety/settings');
      $('safetyPreferences').innerHTML =
        '<label class="check-row"><input type="checkbox" id="womenSafetyToggle" '+(settings.womenSafetyEnabled?'checked':'')+'> Women Safety Mode</label>'+
        '<label class="check-row"><input type="checkbox" id="verifiedDriverToggle" '+(settings.preferVerifiedDrivers !== false?'checked':'')+'> Prefer verified drivers</label>'+
        '<button class="button button-outline button-small" id="saveSafety">Save preferences</button>';
      $('saveSafety').addEventListener('click',async()=>{
        $('saveSafety').disabled=true;
        try {
          await driveRequest('/safety/settings',{method:'PUT',body:JSON.stringify({
            womenSafetyEnabled:$('womenSafetyToggle').checked,
            preferVerifiedDrivers:$('verifiedDriverToggle').checked
          })});
          $('safetyMessage').textContent='Safety preferences saved.'; $('safetyMessage').className='message success';
        } catch(error) { $('safetyMessage').textContent=error.message; $('safetyMessage').className='message error'; }
        finally {$('saveSafety').disabled=false;}
      });
    } catch { $('safetyPreferences').innerHTML='<div class="empty-state">Safety preferences are unavailable.</div>'; }
  }
  $('sosButton')?.addEventListener('click', async () => {
    if (!confirm('Send an SOS alert to the DRIVE administrator with your current location?')) return;
    const button=$('sosButton'); button.disabled=true; $('sosMessage').textContent='Sending alert…';
    const send = async location => {
      try {
        await driveRequest('/safety/sos',{method:'POST',body:JSON.stringify({message:'Emergency assistance requested from passenger dashboard.',location})});
        $('sosMessage').textContent='SOS alert recorded and sent to the DRIVE admin console.'; $('sosMessage').className='message success';
      } catch(error) { $('sosMessage').textContent=error.message; $('sosMessage').className='message error'; }
      finally {button.disabled=false;}
    };
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(p=>send({lat:p.coords.latitude,lng:p.coords.longitude}),()=>send(undefined),{timeout:7000});
    else send(undefined);
  });
  $('logoutButton')?.addEventListener('click',()=>{driveClearSession();location.href='index.html';});
  load();
})();