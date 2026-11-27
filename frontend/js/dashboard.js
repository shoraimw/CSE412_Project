(() => {
  const $=id=>document.getElementById(id);
  if(!driveRequireAuth('dashboard.html'))return;
  const activeStates=['requested','matched','driver_arriving','in_progress'];
  const trackableStates=['matched','driver_arriving','in_progress'];
  let payments=[],tripMap=null,driverMarker=null,pickupMarker=null,destinationMarker=null,routeLine=null;
  let trackedRideId=null,trackingTimer=null,paymentRide=null,pendingPaymentId=null,pendingPaymentMethod=null;

  const statusLabel=s=>String(s||'unknown').replaceAll('_',' ');
  const statusClass=s=>['completed','paid','approved','success'].includes(s)?'success':['pending','requested','matched','driver_arriving','in_progress','new'].includes(s)?'warning':['rejected','cancelled','failed'].includes(s)?'danger':'';
  const item=(title,meta,status,action='')=>'<div class="list-item"><div class="list-item-main"><strong>'+driveEscape(title)+'</strong><small>'+driveEscape(meta)+'</small></div><div class="row-actions">'+(status?'<span class="pill '+statusClass(status)+'">'+driveEscape(statusLabel(status))+'</span>':'')+action+'</div></div>';
  const miniButton=(label,attr,id)=>'<button class="button-mini dark" '+attr+'="'+driveEscape(id)+'">'+label+'</button>';

  function paymentFor(ride){return payments.find(p=>p.ride_id===ride.rideId)||null;}
  function ridePaymentAction(ride){
    if(!ride.rideId||!['in_progress','completed'].includes(ride.status))return '';
    const payment=paymentFor(ride);
    if(payment?.status==='paid')return '<span class="pill success">Paid</span>';
    if(payment?.status==='pending'){
      if(['bkash','nagad'].includes(String(payment.method).toLowerCase())&&!payment.provider_reference)
        return miniButton('Add transaction ID','data-reference',payment.id);
      return '<span class="pill warning">Payment pending</span>';
    }
    return miniButton(payment?.status==='failed'?'Pay again':'Pay fare','data-pay',ride.rideId);
  }

  function initTrackingMap(){
    if(tripMap||!window.L)return;
    tripMap=L.map('tripMap',{zoomControl:true}).setView([23.8103,90.4125],12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(tripMap);
  }
  function setTrackingMarker(existing,point,label){
    if(existing){tripMap.removeLayer(existing);existing=null;}
    if(point&&Number.isFinite(Number(point.lat))&&Number.isFinite(Number(point.lng)))
      existing=L.marker([Number(point.lat),Number(point.lng)]).addTo(tripMap).bindPopup(label);
    return existing;
  }
  async function refreshTracking(ride){
    if(!ride?.rideId||!trackableStates.includes(ride.status))return;
    try{
      const data=await driveRequest('/rides/'+encodeURIComponent(ride.rideId)+'/track');
      $('trackingStatus').textContent=data.currentLocation
        ?'Driver location updated '+driveDate(data.currentLocation.updatedAt)+'. Trip status: '+statusLabel(data.status)+'.'
        :'Waiting for the driver to share a GPS location. Trip status: '+statusLabel(data.status)+'.';
      if(!window.L)return;
      initTrackingMap();
      driverMarker=setTrackingMarker(driverMarker,data.currentLocation,'Driver location');
      pickupMarker=setTrackingMarker(pickupMarker,data.pickup,'Pickup');
      destinationMarker=setTrackingMarker(destinationMarker,data.destination,'Drop-off');
      if(routeLine){tripMap.removeLayer(routeLine);routeLine=null;}
      const points=[data.currentLocation,data.pickup,data.destination].filter(p=>p&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)));
      if(data.pickup&&data.destination)routeLine=L.polyline([[data.pickup.lat,data.pickup.lng],[data.destination.lat,data.destination.lng]],{color:'#555',weight:4,dashArray:'7 8'}).addTo(tripMap);
      if(points.length){const bounds=L.latLngBounds(points.map(p=>[Number(p.lat),Number(p.lng)]));tripMap.fitBounds(bounds,{padding:[30,30],maxZoom:15});}
      setTimeout(()=>tripMap.invalidateSize(),100);
    }catch(error){$('trackingStatus').textContent='Live tracking is temporarily unavailable: '+error.message;}
  }
  function setupTracking(active){
    const ride=active.find(r=>trackableStates.includes(r.status)&&r.rideId);
    if(!ride){
      $('trackingCard').hidden=true;trackedRideId=null;
      if(trackingTimer){clearInterval(trackingTimer);trackingTimer=null;}
      return;
    }
    $('trackingCard').hidden=false;
    if(trackedRideId!==ride.rideId){
      trackedRideId=ride.rideId;
      if(trackingTimer)clearInterval(trackingTimer);
      refreshTracking(ride);
      trackingTimer=setInterval(()=>refreshTracking(ride),10000);
    }else refreshTracking(ride);
  }

  function openPayment(ride,existing=null){
    paymentRide=ride||null;pendingPaymentId=existing?.id||null;pendingPaymentMethod=existing?.method||null;
    $('paymentRideSummary').textContent=ride?'Ride fare · '+driveMoney(ride.estimatedFare):'Submit your wallet transaction ID';
    $('paymentMethod').value=existing?.method||'cash';
    $('paymentMethod').disabled=Boolean(existing);
    $('paymentReferenceWrap').hidden=!existing;
    $('paymentReference').required=Boolean(existing);
    $('paymentReference').value='';
    $('paymentMessage').textContent=existing?'Enter the transaction ID from your bKash or Nagad demo transfer. No real money is collected.':'Choose a method. Wallet payments require a transaction ID for manual admin review.';
    $('paymentSubmit').textContent=existing?'Submit transaction ID':'Continue';
    $('paymentDialog').showModal();
  }
  $('paymentMethod').addEventListener('change',()=>{
    const wallet=['bkash','nagad'].includes($('paymentMethod').value);
    $('paymentReferenceWrap').hidden=!wallet;
    $('paymentReference').required=false;
  });
  $('paymentForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const button=$('paymentSubmit');button.disabled=true;
    try{
      if(!pendingPaymentId){
        if(!paymentRide?.rideId)throw new Error('The ride is not available for payment.');
        const method=$('paymentMethod').value;
        const result=await driveRequest('/payments/intent',{method:'POST',body:JSON.stringify({rideId:paymentRide.rideId,method,currency:'BDT'})});
        pendingPaymentId=result.payment?.id;
        pendingPaymentMethod=method;
        if(!pendingPaymentId)throw new Error('Payment intent was not created.');
        if(['bkash','nagad'].includes(method)){
          $('paymentReferenceWrap').hidden=false;$('paymentReference').required=true;
          $('paymentMessage').textContent=result.message+' Enter the demo transaction ID below. No money has been collected.';
          $('paymentSubmit').textContent='Submit transaction ID';
          return;
        }
        $('paymentMessage').textContent=result.message||'Cash payment recorded as pending.';
      }
      if(['bkash','nagad'].includes(String(pendingPaymentMethod).toLowerCase())){
        const reference=$('paymentReference').value.trim();
        if(!reference)throw new Error('Enter the transaction ID before continuing.');
        const result=await driveRequest('/payments/'+encodeURIComponent(pendingPaymentId)+'/reference',{method:'POST',body:JSON.stringify({reference})});
        $('paymentMessage').textContent=result.message||'Transaction ID submitted for review.';
      }
      driveToast('Payment information saved.');
      $('paymentDialog').close();await load();
    }catch(error){$('paymentMessage').textContent=error.message;$('paymentMessage').className='message error';}
    finally{button.disabled=false;}
  });
  $('closePayment').addEventListener('click',()=>$('paymentDialog').close());

  async function load(){
    try{
      const user=await driveRequest('/users/me');
      $('welcomeText').textContent='Welcome, '+(user.full_name||user.name||'there')+'. Your journeys, all in one place.';
    }catch(error){$('welcomeText').textContent=error.message;}

    let rides=[],notifications={items:[],unreadCount:0};
    try{rides=await driveRequest('/rides');}catch(error){$('activeRides').innerHTML='<div class="empty-state">'+driveEscape(error.message)+'</div>';}
    try{notifications=await driveRequest('/notifications');}catch{}
    try{payments=await driveRequest('/payments/me');if(!Array.isArray(payments))payments=[];}catch{payments=[];}

    const active=rides.filter(r=>activeStates.includes(r.status));
    const history=rides.filter(r=>!activeStates.includes(r.status));
    $('tripCount').textContent=rides.length;$('activeCount').textContent=active.length;
    $('unreadCount').textContent=notifications.unreadCount??0;$('paymentCount').textContent=payments.length;

    $('activeRides').innerHTML=active.length?active.map(ride=>{
      const canCancel=ride.requestId&&ride.requestStatus==='requested';
      const cancel=canCancel?miniButton('Cancel','data-cancel',ride.requestId):'';
      return item((ride.pickupAddress||'Pickup')+' → '+(ride.destinationAddress||'Destination'),driveDate(ride.createdAt)+' · '+driveMoney(ride.estimatedFare),ride.status,cancel+ridePaymentAction(ride));
    }).join(''):'<div class="empty-state">No active trips. Your next journey starts here.</div>';
    $('rideHistory').innerHTML=history.length?history.slice(0,8).map(ride=>item((ride.pickupAddress||'Pickup')+' → '+(ride.destinationAddress||'Destination'),driveDate(ride.createdAt)+' · '+driveMoney(ride.estimatedFare),ride.status,ridePaymentAction(ride))).join(''):'<div class="empty-state">Completed and cancelled trips will appear here.</div>';

    $('activeRides').querySelectorAll('[data-cancel]').forEach(button=>button.addEventListener('click',async()=>{
      button.disabled=true;
      try{await driveRequest('/rides/requests/'+encodeURIComponent(button.dataset.cancel)+'/cancel',{method:'POST'});driveToast('Ride request cancelled.');await load();}
      catch(error){driveToast(error.message);button.disabled=false;}
    }));
    document.querySelectorAll('[data-pay]').forEach(button=>button.addEventListener('click',()=>{
      const ride=rides.find(r=>r.rideId===button.dataset.pay);if(ride)openPayment(ride);
    }));
    ['activeRides','rideHistory'].forEach(containerId=>{
      $(containerId).querySelectorAll('[data-reference]').forEach(button=>button.addEventListener('click',()=>{
        const payment=payments.find(p=>p.id===button.dataset.reference);
        const ride=rides.find(r=>r.rideId===payment?.ride_id);
        openPayment(ride,payment);
      }));
    });

    $('recentActivity').innerHTML=notifications.items?.length?notifications.items.slice(0,5).map(note=>item(note.title,note.body,note.read_at?'':'new')).join(''):'<div class="empty-state">No new updates.</div>';
    $('paymentHistory').innerHTML=payments.length?payments.slice(0,8).map(payment=>{
      const refAction=['bkash','nagad'].includes(String(payment.method).toLowerCase())&&payment.status==='pending'&&!payment.provider_reference
        ?miniButton('Add transaction ID','data-reference',payment.id):'';
      const meta=driveDate(payment.created_at)+(payment.provider_reference?' · ID: '+payment.provider_reference:'');
      return item(driveMoney(payment.amount)+' · '+payment.method,meta,payment.status,refAction);
    }).join(''):'<div class="empty-state">No payments yet. Eligible trips can be paid from the trip list.</div>';
    $('paymentHistory').querySelectorAll('[data-reference]').forEach(button=>button.addEventListener('click',()=>{
      const payment=payments.find(p=>p.id===button.dataset.reference);const ride=rides.find(r=>r.rideId===payment?.ride_id);openPayment(ride,payment);
    }));

    try{
      const settings=await driveRequest('/safety/settings');
      $('safetyPreferences').innerHTML=
        '<label class="check-row"><input type="checkbox" id="womenSafetyToggle" '+(settings.womenSafetyEnabled?'checked':'')+'> Women Safety Mode</label>'+
        '<label class="check-row"><input type="checkbox" id="verifiedDriverToggle" '+(settings.preferVerifiedDrivers!==false?'checked':'')+'> Prefer verified drivers</label>'+
        '<button class="button button-outline button-small" id="saveSafety">Save preferences</button>';
      $('saveSafety').addEventListener('click',async()=>{
        $('saveSafety').disabled=true;
        try{
          await driveRequest('/safety/settings',{method:'PUT',body:JSON.stringify({womenSafetyEnabled:$('womenSafetyToggle').checked,preferVerifiedDrivers:$('verifiedDriverToggle').checked})});
          $('safetyMessage').textContent='Safety preferences saved.';$('safetyMessage').className='message success';
        }catch(error){$('safetyMessage').textContent=error.message;$('safetyMessage').className='message error';}
        finally{$('saveSafety').disabled=false;}
      });
    }catch{$('safetyPreferences').innerHTML='<div class="empty-state">Safety preferences are unavailable.</div>';}

    setupTracking(active);
    setupShareLink();
  }

  function setupShareLink(){
    let url=null;try{url=sessionStorage.getItem('drive_pending_share_url');}catch{}
    if(!url)return;
    $('shareTripBanner').hidden=false;$('openShareLink').href=url;
    $('copyShareLink').onclick=async()=>{
      try{await navigator.clipboard.writeText(url);$('shareLinkMessage').textContent='Private trip link copied. Share it only with trusted contacts.';$('shareLinkMessage').className='message success';}
      catch{$('shareLinkMessage').textContent='Copy is unavailable. Open the link and copy the address from your browser.';$('shareLinkMessage').className='message error';}
    };
  }

  $('sosButton')?.addEventListener('click',async()=>{
    if(!confirm('Send an SOS alert to the DRIVE administrator with your current location?'))return;
    const button=$('sosButton');button.disabled=true;$('sosMessage').textContent='Sending alert…';
    const send=async location=>{
      try{
        const result=await driveRequest('/safety/sos',{method:'POST',body:JSON.stringify({message:'Emergency assistance requested from passenger dashboard.',location})});
        $('sosMessage').textContent=result.message||'SOS alert recorded in the DRIVE admin console.';$('sosMessage').className='message success';
      }catch(error){$('sosMessage').textContent=error.message;$('sosMessage').className='message error';}
      finally{button.disabled=false;}
    };
    if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>send({lat:p.coords.latitude,lng:p.coords.longitude}),()=>send(undefined),{timeout:7000});
    else send(undefined);
  });
  $('logoutButton')?.addEventListener('click',()=>{driveClearSession();location.href='index.html';});
  load();
})();