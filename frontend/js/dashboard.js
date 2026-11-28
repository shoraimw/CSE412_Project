(() => {
  const $=id=>document.getElementById(id);
  window.addEventListener('drive:arrival-dismissed',()=>{const first=$('reviewQueue')?.querySelector('[data-review]');if(first)first.click();});
  const ratingLabels={1:'Very poor',2:'Poor',3:'Average',4:'Good',5:'Excellent'};
  function setReviewRating(value){
    const rating=Math.max(0,Math.min(5,Number(value)||0));
    $('reviewRating').value=String(rating);
    $('reviewStars')?.querySelectorAll('[data-rating]').forEach(button=>{
      const active=Number(button.dataset.rating)<=rating;
      button.textContent=active?'★':'☆';
      button.classList.toggle('selected',active);
      button.setAttribute('aria-checked',String(Number(button.dataset.rating)===rating));
    });
    if($('reviewRatingLabel'))$('reviewRatingLabel').textContent=rating?rating+' / 5 · '+ratingLabels[rating]:'Select 1–5 stars';
  }
  $('reviewStars')?.querySelectorAll('[data-rating]').forEach(button=>button.addEventListener('click',()=>setReviewRating(button.dataset.rating)));
  if(!driveRequireAuth('dashboard.html'))return;
  const activeStates=['requested','matched','driver_arriving','in_progress'];
  const trackableStates=['matched','driver_arriving','in_progress'];
  let payments=[],tripMap=null,driverMarker=null,pickupMarker=null,destinationMarker=null,routeLine=null;
  let trackedRideId=null,trackingTimer=null,paymentRide=null,pendingPaymentId=null,pendingPaymentMethod=null;
  let safetySessions=[],safetyWatchId=null,safetyLocationSending=false,safetyHeartbeatTimer=null,lastSafetyPosition=null;
  const knownRideStatuses=new Map();let firstRideLoad=true;

  const statusLabel=s=>String(s||'unknown').replaceAll('_',' ');
  const statusClass=s=>['completed','paid','approved','success'].includes(s)?'success':['pending','requested','matched','driver_arriving','in_progress','new'].includes(s)?'warning':['rejected','cancelled','failed'].includes(s)?'danger':'';
  const item=(title,meta,status,action='')=>'<div class="list-item"><div class="list-item-main"><strong>'+driveEscape(title)+'</strong><small>'+driveEscape(meta)+'</small></div><div class="row-actions">'+(status?'<span class="pill '+statusClass(status)+'">'+driveEscape(statusLabel(status))+'</span>':'')+action+'</div></div>';
  const miniButton=(label,attr,id)=>'<button class="button-mini dark" '+attr+'="'+driveEscape(id)+'">'+label+'</button>';

  function paymentFor(ride){return payments.find(p=>p.ride_id===ride.rideId)||null;}
  function ridePaymentAction(ride){
    if(!ride.rideId||ride.status!=='completed')return '';
    if(ride.actualFare===null||ride.actualFare===undefined)return '<span class="pill warning">Final fare pending</span>';
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
    $('paymentRideSummary').textContent=ride?'Your passenger fare share · '+driveMoney(ride.passengerFare??ride.actualFare??ride.estimatedFare):'Submit your wallet transaction ID';
    $('paymentMethod').value=existing?.method||'cash';
    $('paymentMethod').disabled=Boolean(existing);
    $('paymentCurrency').value='BDT';
    $('paymentCurrency').disabled=Boolean(existing);
    $('paymentReferenceWrap').hidden=!existing;
    $('paymentReference').required=Boolean(existing);
    $('paymentReference').value='';
    $('paymentMessage').textContent=existing?'Enter the transaction ID from your bKash or Nagad transfer. No money is collected by DRIVE.':'Cash is confirmed by the driver/admin. bKash/Nagad references require manual review. Online card payments open the SSLCOMMERZ secure checkout.';
    $('paymentSubmit').textContent=existing?'Submit transaction ID':'Continue';
    syncPaymentOptions();
    $('paymentDialog').showModal();
  }
  function syncPaymentOptions(){
    const method=$('paymentMethod').value;
    const wallet=['bkash','nagad'].includes(method);
    const card=method==='card';
    $('paymentReferenceWrap').hidden=!wallet;
    $('paymentReference').required=wallet;
    $('paymentCurrencyWrap').hidden=!card;
    $('paymentCurrency').required=card;
    if(wallet)$('paymentMessage').textContent='Enter the bKash/Nagad transaction reference after transferring. An administrator must verify it in the merchant account.';
    if(card)$('paymentMessage').textContent='You will be redirected to SSLCOMMERZ secure checkout. DRIVE will show Paid only after server-side gateway validation.';
    if(method==='cash')$('paymentMessage').textContent='Cash is recorded as pending until the driver or administrator confirms receipt.';
  }
  $('paymentMethod').addEventListener('change',syncPaymentOptions);
  $('paymentForm').addEventListener('submit',async event=>{
    event.preventDefault();
    const button=$('paymentSubmit');button.disabled=true;
    try{
      if(!pendingPaymentId){
        if(!paymentRide?.rideId)throw new Error('The ride is not available for payment.');
        const method=$('paymentMethod').value;
        const currency=method==='card'?$('paymentCurrency').value:'BDT';
        const result=await driveRequest('/payments/intent',{method:'POST',body:JSON.stringify({rideId:paymentRide.rideId,method,currency})});
        pendingPaymentId=result.payment?.id;
        pendingPaymentMethod=method;
        if(!pendingPaymentId)throw new Error('Payment intent was not created.');
        if(method==='card'){
          if(!result.checkoutUrl)throw new Error('SSLCOMMERZ did not return a secure checkout URL.');
          const checkout=new URL(result.checkoutUrl);
          if(checkout.protocol!=='https:'||!['sandbox.sslcommerz.com','securepay.sslcommerz.com'].includes(checkout.hostname)){
            throw new Error('The gateway returned an untrusted checkout destination. Please contact DRIVE support.');
          }
          $('paymentMessage').textContent='Opening secure SSLCOMMERZ checkout…';
          location.assign(checkout.toString());
          return;
        }
        if(['bkash','nagad'].includes(method)){
          $('paymentMethod').disabled=true;
          $('paymentReferenceWrap').hidden=false;$('paymentReference').required=true;
          $('paymentMessage').textContent=result.message+' Enter the transaction ID below. No money has been collected by DRIVE.';
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
      if(user.role==='admin'){location.href=driveRoleHome(user.role);return;}
      $('welcomeText').textContent='Welcome, '+(user.full_name||user.name||'there')+'. Your journeys, all in one place.';
    }catch(error){$('welcomeText').textContent=error.message;}

    let rides=[],notifications={items:[],unreadCount:0};
    try{rides=await driveRequest('/rides/my-bookings');}catch(error){$('activeRides').innerHTML='<div class="empty-state">'+driveEscape(error.message)+'</div>';}
    try{notifications=await driveRequest('/notifications');}catch{}
    try{payments=await driveRequest('/payments/me');if(!Array.isArray(payments))payments=[];}catch{payments=[];}
    let sharedRides=[],myReviews=[],supportCases=[];
    try{sharedRides=await driveRequest('/rides/shared');if(!Array.isArray(sharedRides))sharedRides=[];}catch{}
    try{myReviews=await driveRequest('/reviews/me');if(!Array.isArray(myReviews))myReviews=[];}catch{}
    try{supportCases=await driveRequest('/support/cases');if(!Array.isArray(supportCases))supportCases=[];}catch{}

    for(const ride of rides){
      const id=ride.rideId||ride.id,previous=knownRideStatuses.get(id);
      if(!firstRideLoad&&previous&&previous!=='completed'&&ride.status==='completed')window.driveArrivalNotice?.(id);
      knownRideStatuses.set(id,ride.status);
    }
    for(const note of (notifications.items||[])){
      if(note.type==='ride_completed'&&note.entity_id)window.driveArrivalNotice?.(note.entity_id);
    }
    firstRideLoad=false;
    const active=rides.filter(r=>activeStates.includes(r.status));
    const history=rides.filter(r=>!activeStates.includes(r.status));
    $('tripCount').textContent=rides.length;$('activeCount').textContent=active.length;
    $('unreadCount').textContent=notifications.unreadCount??0;$('paymentCount').textContent=payments.length;

    $('activeRides').innerHTML=active.length?active.map(ride=>{
      const canCancel=ride.requestId&&ride.requestStatus==='requested';
      const cancel=canCancel?miniButton('Cancel','data-cancel',ride.requestId):'';
      const rideId=ride.rideId||ride.id;
      const canChat=rideId&&trackableStates.includes(ride.status);
      const chat=canChat?miniButton('Chat','data-chat-ride',rideId):'';
      const requestCancel=canChat?miniButton('Request cancellation','data-cancel-journey',rideId):'';
      const emergency=canChat?miniButton('Emergency cancel','data-emergency-cancel',rideId):'';
      return item((ride.pickupAddress||'Pickup')+' → '+(ride.destinationAddress||'Destination'),driveDate(ride.createdAt)+' · '+driveMoney(ride.passengerFare??ride.estimatedFare),ride.status,cancel+chat+requestCancel+emergency+ridePaymentAction(ride));
    }).join(''):'<div class="empty-state">No active trips. Your next journey starts here.</div>';
    $('activeRides').querySelectorAll('[data-cancel-journey]').forEach(button=>button.addEventListener('click',async()=>{
      const reason=prompt('Why do you need to cancel this journey? Please provide at least 8 characters.');
      if(!reason)return;
      button.disabled=true;
      try{
        const result=await driveRequest('/rides/'+encodeURIComponent(button.dataset.cancelJourney)+'/cancellation-request',{method:'POST',body:JSON.stringify({reason})});
        driveToast(result.message||'Cancellation request sent to your driver.');await load();
      }catch(error){driveToast(error.message);button.disabled=false;}
    }));
    $('activeRides').querySelectorAll('[data-emergency-cancel]').forEach(button=>button.addEventListener('click',async()=>{
      if(!confirm('Emergency cancellation will immediately end the ride and notify the driver and DRIVE administrators. Continue?'))return;
      const reason=prompt('Tell us why you feel unsafe. This reason will be recorded for the safety team.','I feel unsafe and need to end this trip immediately.');
      if(!reason)return;
      button.disabled=true;
      const send=async location=>{
        try{
          const result=await driveRequest('/rides/'+encodeURIComponent(button.dataset.emergencyCancel)+'/cancellation-request',{method:'POST',body:JSON.stringify({reason,emergency:true,location})});
          driveToast(result.message||'Emergency cancellation recorded.');await load();
        }catch(error){driveToast(error.message);button.disabled=false;}
      };
      if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>send({lat:p.coords.latitude,lng:p.coords.longitude}),()=>send(undefined),{timeout:7000});
      else send(undefined);
    }));
    $('rideHistory').innerHTML=history.length?history.slice(0,8).map(ride=>{
      const finalFare=ride.actualFare??ride.ride?.actual_fare;
      const amount=finalFare!==null&&finalFare!==undefined?driveMoney(finalFare)+' final':driveMoney(ride.estimatedFare)+' estimated';
      return item((ride.pickupAddress||'Pickup')+' → '+(ride.destinationAddress||'Destination'),driveDate(ride.createdAt)+' · '+amount,ride.status,ridePaymentAction(ride));
    }).join(''):'<div class="empty-state">Completed and cancelled trips will appear here.</div>';

    const reviewedRideIds=new Set(myReviews.map(review=>review.ride_id));
    const reviewable=history.filter(ride=>ride.status==='completed'&&ride.rideId&&!reviewedRideIds.has(ride.rideId));
    $('reviewQueue').innerHTML=reviewable.length?reviewable.map(ride=>'<div class="list-item"><div class="list-item-main"><strong>'+driveEscape((ride.pickupAddress||'Pickup')+' → '+(ride.destinationAddress||'Destination'))+'</strong><small>'+driveDate(ride.createdAt)+'</small></div><button class="button-mini dark" data-review="'+driveEscape(ride.rideId)+'">Rate driver</button></div>').join(''):'<div class="empty-state">No completed rides waiting for feedback.</div>';
    $('reviewQueue').querySelectorAll('[data-review]').forEach(button=>button.addEventListener('click',()=>{
      $('reviewRideId').value=button.dataset.review;$('reviewComment').value='';$('reviewMessage').textContent='';setReviewRating(0);$('reviewDialog').showModal();
    }));

    $('sharedRides').innerHTML=sharedRides.length?sharedRides.map(ride=>'<div class="list-item"><div class="list-item-main"><strong>'+driveEscape(ride.pickup_label)+' → '+driveEscape(ride.destination_label)+'</strong><small>'+driveEscape(ride.vehicle_type)+' · '+driveMoney(ride.estimated_fare)+' total · '+Number(ride.seats_available)+' seats left · '+Number(ride.distance_km||0).toFixed(1)+' km</small></div><button class="button-mini dark" data-join-shared="'+driveEscape(ride.ride_id)+'">Join</button></div>').join(''):'<div class="empty-state">No shared rides are accepting passengers right now.</div>';
    $('sharedRides').querySelectorAll('[data-join-shared]').forEach(button=>button.addEventListener('click',async()=>{
      if(!confirm('Join this shared ride? Your individual fare share will be recalculated when you join.'))return;
      button.disabled=true;
      try{const result=await driveRequest('/rides/'+encodeURIComponent(button.dataset.joinShared)+'/share',{method:'POST'});driveToast(result.message||'You joined the shared ride.');await load();}
      catch(error){driveToast(error.message);button.disabled=false;}
    }));

    $('supportRide').innerHTML='<option value="">No linked ride</option>'+rides.filter(ride=>ride.rideId).map(ride=>'<option value="'+driveEscape(ride.rideId)+'">'+driveEscape((ride.pickupAddress||'Pickup')+' → '+(ride.destinationAddress||'Destination')+' · '+statusLabel(ride.status))+'</option>').join('');
    $('supportCases').innerHTML=supportCases.length?supportCases.slice(0,8).map(c=>item(c.subject,driveDate(c.created_at)+' · '+c.category,c.status)).join(''):'<div class="empty-state">No support cases submitted yet.</div>';

    $('activeRides').querySelectorAll('[data-cancel]').forEach(button=>button.addEventListener('click',async()=>{
      button.disabled=true;
      if(!confirm('Cancel this unaccepted request? No cancellation fee applies while a driver has not accepted it.')){button.disabled=false;return;}
      try{await driveRequest('/rides/requests/'+encodeURIComponent(button.dataset.cancel)+'/cancel',{method:'POST'});driveToast('Ride request cancelled. No cancellation fee was charged.');await load();}
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
      const meta=driveDate(payment.created_at)+(payment.provider_reference?' · ID: '+payment.provider_reference:'')+(payment.gateway_status==='risk_hold'?' · Gateway risk review':'');
      const status=payment.gateway_status==='risk_hold'?'risk_hold':payment.status;
      const receiptAction=payment.status==='paid'?miniButton('View receipt','data-payment-result',payment.id):miniButton('View status','data-payment-result',payment.id);
      const amountText=payment.currency==='BDT'?driveMoney(payment.amount):Number(payment.amount).toFixed(2)+' '+payment.currency;
      return item(amountText+' · '+payment.method,meta,status,refAction+receiptAction);
    }).join(''):'<div class="empty-state">No payments yet. Eligible trips can be paid from the trip list.</div>';
    $('paymentHistory').querySelectorAll('[data-reference]').forEach(button=>button.addEventListener('click',()=>{
      const payment=payments.find(p=>p.id===button.dataset.reference);const ride=rides.find(r=>r.rideId===payment?.ride_id);openPayment(ride,payment);
    }));
    $('paymentHistory').querySelectorAll('[data-payment-result]').forEach(button=>button.addEventListener('click',()=>{
      location.href='payment-result.html?payment='+encodeURIComponent(button.dataset.paymentResult);
    }));

    try{
      const settings=await driveRequest('/safety/settings');
      let trustedContacts=Array.isArray(settings.trustedContacts)?settings.trustedContacts.slice():[];
      let emergencyContacts=Array.isArray(settings.emergencyContacts)?settings.emergencyContacts.slice():[];
      const renderContactList=()=>{
        const all=[...trustedContacts.map((x,i)=>({...x,kind:'trusted',index:i})),...emergencyContacts.map((x,i)=>({...x,kind:'emergency',index:i}))];
        $('safetyContactList').innerHTML=all.length?all.map(contact=>
          '<div class="list-item"><div class="list-item-main"><strong>'+driveEscape(contact.name)+'</strong><small>'+driveEscape(contact.phone)+' · '+driveEscape(contact.relation||'Contact')+' · '+(contact.kind==='trusted'?'Trip sharing':'Emergency')+'</small></div><button class="button-mini danger" data-remove-contact="'+contact.kind+':'+contact.index+'">Remove</button></div>'
        ).join(''):'<div class="empty-state">No trusted or emergency contacts saved yet.</div>';
        $('safetyContactList').querySelectorAll('[data-remove-contact]').forEach(button=>button.addEventListener('click',()=>{
          const [kind,index]=button.dataset.removeContact.split(':');
          if(kind==='trusted')trustedContacts.splice(Number(index),1);else emergencyContacts.splice(Number(index),1);
          renderContactList();
        }));
      };
      $('safetyPreferences').innerHTML=
        '<label class="check-row"><input type="checkbox" id="womenSafetyToggle" '+(settings.womenSafetyEnabled?'checked':'')+'> Women Safety Mode</label>'+
        '<label class="check-row"><input type="checkbox" id="verifiedDriverToggle" '+(settings.preferVerifiedDrivers!==false?'checked':'')+'> Prefer verified drivers</label>'+
        '<hr class="muted-line"><div id="safetyMonitor" class="stack"><p class="muted small">Checking active Women Safety monitoring…</p></div><strong>Trusted & emergency contacts</strong>'+
        '<p class="muted small">Trusted contacts can receive your private trip link. Emergency contacts are shown after an SOS alert; you must choose to call or text them.</p>'+
        '<div id="safetyContactList" class="list"></div>'+
        '<div class="form-grid">'+
          '<div class="form-field"><label for="contactName">Contact name</label><input id="contactName" maxlength="80" placeholder="Full name"></div>'+
          '<div class="form-field"><label for="contactPhone">Phone number</label><input id="contactPhone" type="tel" maxlength="20" pattern="\\+?[0-9][0-9\\s-]{6,18}" placeholder="+8801XXXXXXXXX"></div>'+
          '<div class="form-field"><label for="contactRelation">Relationship</label><input id="contactRelation" maxlength="40" placeholder="Family, friend…"></div>'+
          '<div class="form-field"><label for="contactKind">Contact type</label><select id="contactKind"><option value="trusted">Trusted trip contact</option><option value="emergency">Emergency contact</option></select></div>'+
        '</div>'+
        '<div class="row-actions"><button class="button button-outline button-small" id="addSafetyContact" type="button">Add contact</button><button class="button button-dark button-small" id="saveSafety" type="button">Save preferences & contacts</button></div>';
      renderContactList();
      $('addSafetyContact').addEventListener('click',()=>{
        const name=$('contactName').value.trim(),phone=$('contactPhone').value.trim(),relation=$('contactRelation').value.trim();
        if(!name||!phone||!/^\+?[0-9][0-9\s-]{6,18}$/.test(phone)){
          $('safetyMessage').textContent='Enter a contact name and a valid phone number.';$('safetyMessage').className='message error';return;
        }
        const contact={name,phone,relation};
        const targetContacts=$('contactKind').value==='trusted'?trustedContacts:emergencyContacts;
        if(targetContacts.length>=10){$('safetyMessage').textContent='You can save up to 10 contacts of each type.';$('safetyMessage').className='message error';return;}
        targetContacts.push(contact);
        $('contactName').value='';$('contactPhone').value='';$('contactRelation').value='';
        $('safetyMessage').textContent='Contact added to the form. Save preferences & contacts to keep it.';$('safetyMessage').className='message';
        renderContactList();
      });
      $('saveSafety').addEventListener('click',async()=>{
        $('saveSafety').disabled=true;
        try{
          const saved=await driveRequest('/safety/settings',{method:'PUT',body:JSON.stringify({
            womenSafetyEnabled:$('womenSafetyToggle').checked,
            preferVerifiedDrivers:$('verifiedDriverToggle').checked,
            trustedContacts,emergencyContacts
          })});
          trustedContacts=saved.trustedContacts||[];emergencyContacts=saved.emergencyContacts||[];
          renderContactList();
          $('safetyMessage').textContent='Safety preferences and contacts saved.';$('safetyMessage').className='message success';
        }catch(error){$('safetyMessage').textContent=error.message;$('safetyMessage').className='message error';}
        finally{$('saveSafety').disabled=false;}
      });
    }catch{$('safetyPreferences').innerHTML='<div class="empty-state">Safety preferences are unavailable.</div>';}

    setupTracking(active);
    setupSafetyTracking(rides).catch(error=>{const node=$('safetyMonitor');if(node)node.textContent='Safety monitoring is unavailable: '+error.message;});
    try{const warning=sessionStorage.getItem('drive_safety_warning');if(warning){$('safetyMessage').textContent='Women Safety setup needs attention: '+warning;$('safetyMessage').className='message error';sessionStorage.removeItem('drive_safety_warning');}}catch{}
    setupShareLink();
  }


  async function setupSafetyTracking(rides){
    try{
      safetySessions=await driveRequest('/safety/trips/active');
      const remaining=[];
      for(const session of safetySessions){
        const related=rides.find(ride=>(session.rideId&&ride.rideId===session.rideId)||(session.rideRequestId&&ride.requestId===session.rideRequestId));
        if(related&&['completed','cancelled','rejected'].includes(related.status)){
          await driveRequest('/safety/trips/'+encodeURIComponent(session.id)+'/complete',{method:'POST'}).catch(()=>{});
        }else remaining.push(session);
      }
      safetySessions=remaining;
      const node=$('safetyMonitor');
      if(!node)return;
      node.innerHTML=safetySessions.length?safetySessions.map(session=>
        '<div class="list-item"><div class="list-item-main"><strong>Women Safety monitoring · '+driveEscape(session.destination)+'</strong><small>Started '+driveEscape(driveDate(session.startedAt))+' · Expected '+driveEscape(driveDate(session.expectedArrivalAt))+'</small></div><span class="pill '+(session.status==='ACTIVE'?'success':'warning')+'">'+driveEscape(session.status)+'</span></div>'+
        (session.warnings?.length?'<div class="message warning">'+session.warnings.map(w=>driveEscape(w.message||w.type)).join(' · ')+'</div>':'')
      ).join(''):'<div class="empty-state">No active Women Safety trip monitor.</div>';
      if(safetySessions.length)startSafetyLocationWatch();
      else stopSafetyLocationWatch();
    }catch(error){throw error;}
  }

  async function pushSafetyLocation(){
    if(safetyLocationSending||!safetySessions.length||!lastSafetyPosition)return;
    safetyLocationSending=true;
    try{
      const results=await Promise.all(safetySessions.map(session=>
        driveRequest('/safety/trips/'+encodeURIComponent(session.id)+'/location',{method:'POST',body:JSON.stringify(lastSafetyPosition)}).catch(error=>({error:error.message,id:session.id}))
      ));
      const warning=results.find(result=>result?.latestWarnings?.length);
      if(warning)$('safetyMessage').textContent=warning.latestWarnings.map(x=>x.message).join(' · ');
    }finally{safetyLocationSending=false;}
  }

  function startSafetyLocationWatch(){
    if(safetyWatchId!==null)return;
    if(!navigator.geolocation){$('safetyMonitor').innerHTML+='<p class="message warning">This browser cannot share GPS location. Safety route monitoring is paused.</p>';return;}
    safetyWatchId=navigator.geolocation.watchPosition(position=>{
      lastSafetyPosition={lat:position.coords.latitude,lng:position.coords.longitude};
      pushSafetyLocation();
    },error=>{
      if(safetyWatchId!==null)navigator.geolocation.clearWatch(safetyWatchId);
      safetyWatchId=null;
      if(safetyHeartbeatTimer){clearInterval(safetyHeartbeatTimer);safetyHeartbeatTimer=null;}
      $('safetyMonitor').innerHTML+='<p class="message warning">GPS monitoring paused: '+driveEscape(error.message||'Location permission is unavailable.')+'</p>';
    },{enableHighAccuracy:true,maximumAge:10000,timeout:15000});
    safetyHeartbeatTimer=setInterval(()=>{if(!document.hidden)pushSafetyLocation();},15000);
  }

  function stopSafetyLocationWatch(){
    if(safetyWatchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(safetyWatchId);
    if(safetyHeartbeatTimer){clearInterval(safetyHeartbeatTimer);safetyHeartbeatTimer=null;}
    safetyWatchId=null;lastSafetyPosition=null;
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

  $('reviewForm')?.addEventListener('submit',async event=>{
    event.preventDefault();if(!$('reviewForm').reportValidity())return;if(Number($('reviewRating').value)<1){$('reviewMessage').textContent='Please choose a star rating before submitting.';$('reviewMessage').className='message error';return;}
    const button=$('reviewSubmit');button.disabled=true;
    try{
      await driveRequest('/reviews',{method:'POST',body:JSON.stringify({
        rideId:$('reviewRideId').value,rating:Number($('reviewRating').value),comment:$('reviewComment').value.trim()||undefined
      })});
      $('reviewMessage').textContent='Thank you. Your feedback has been saved.';$('reviewMessage').className='message success';
      $('reviewDialog').close();await load();
    }catch(error){$('reviewMessage').textContent=error.message;$('reviewMessage').className='message error';}
    finally{button.disabled=false;}
  });
  $('closeReview')?.addEventListener('click',()=>$('reviewDialog').close());
  $('supportForm')?.addEventListener('submit',async event=>{
    event.preventDefault();if(!$('supportForm').reportValidity())return;
    const button=$('supportSubmit');button.disabled=true;
    try{
      const rideId=$('supportRide').value;
      const result=await driveRequest('/support/cases',{method:'POST',body:JSON.stringify({
        category:$('supportCategory').value,subject:$('supportSubject').value.trim(),
        description:$('supportDescription').value.trim(),rideId:rideId||undefined
      })});
      $('supportMessage').textContent=result.message||'Support case submitted.';$('supportMessage').className='message success';
      $('supportForm').reset();await load();
    }catch(error){$('supportMessage').textContent=error.message;$('supportMessage').className='message error';}
    finally{button.disabled=false;}
  });

  $('sosButton')?.addEventListener('click',async()=>{
    if(!confirm('Send an SOS alert to the DRIVE administrator with your current location?'))return;
    const button=$('sosButton');button.disabled=true;$('sosMessage').textContent='Sending alert…';
    const send=async location=>{
      try{
        const result=await driveRequest('/safety/sos',{method:'POST',body:JSON.stringify({message:'Emergency assistance requested from passenger dashboard.',location})});
        const contacts=Array.isArray(result.emergencyContacts)?result.emergencyContacts:[];
        const links=contacts.map(contact=>{
          const phone=String(contact.phone||'').replace(/[^+0-9]/g,'');
          const sms='sms:'+phone+'?body='+encodeURIComponent('I need help. My DRIVE SOS alert has been triggered.');
          return '<div class="row-actions"><a href="tel:'+phone+'">Call '+driveEscape(contact.name)+'</a><a href="'+sms+'">Text '+driveEscape(contact.name)+'</a></div>';
        }).join('');
        $('sosMessage').innerHTML=driveEscape(result.message||'SOS alert recorded in the DRIVE admin console.')+links;
        $('sosMessage').className='message success';
      }catch(error){$('sosMessage').textContent=error.message;$('sosMessage').className='message error';}
      finally{button.disabled=false;}
    };
    if(navigator.geolocation)navigator.geolocation.getCurrentPosition(p=>send({lat:p.coords.latitude,lng:p.coords.longitude}),()=>send(undefined),{timeout:7000});
    else send(undefined);
  });
  $('logoutButton')?.addEventListener('click',()=>{stopSafetyLocationWatch();driveClearSession();location.href='index.html';});
  window.addEventListener('pagehide',stopSafetyLocationWatch);
  load();
  let ridePollBusy=false;
  setInterval(async()=>{if(document.hidden||ridePollBusy)return;ridePollBusy=true;try{await load();}finally{ridePollBusy=false;}},12000);
})();