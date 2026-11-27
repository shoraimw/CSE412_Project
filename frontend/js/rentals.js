(() => {
  const $=id=>document.getElementById(id);
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka'}).format(new Date());
  $('startDate').min=today();$('endDate').min=today();
  let vehicles=[],bookings=[],payments=[],paymentBooking=null,pendingPaymentId=null,pendingPaymentMethod=null;

  async function load(){
    const params=new URLSearchParams();
    const type=$('filterType').value,city=$('filterCity').value.trim(),max=$('filterPrice').value;
    if(type!=='All')params.set('type',type);
    if(city)params.set('location',city);
    if(max)params.set('max_price',max);
    $('vehicleGrid').innerHTML='<div class="empty-state">Searching vehicles…</div>';
    try{
      vehicles=await driveRequest('/rental/vehicles'+(params.size?'?'+params.toString():''));
      $('vehicleCount').textContent=vehicles.length+' vehicles';
      $('vehicleGrid').innerHTML=vehicles.length?vehicles.map(vehicle=>{
        const image=vehicle.image?'<img src="'+driveEscape(vehicle.image)+'" alt="'+driveEscape(vehicle.name)+'" loading="lazy">':'▰';
        return '<article class="vehicle-card"><div class="vehicle-image">'+image+'</div><div class="vehicle-body"><h3>'+driveEscape(vehicle.name)+'</h3><p>'+driveEscape(vehicle.type)+' · '+driveEscape(vehicle.location)+' · '+driveEscape(vehicle.seats)+' seats</p><p>'+driveEscape(vehicle.description||'Verified partner vehicle.')+'</p><div class="vehicle-price">'+driveMoney(vehicle.price)+' <span class="muted small">/ day</span></div><button class="button button-dark button-block" data-book="'+driveEscape(vehicle.id)+'">Request booking</button></div></article>';
      }).join(''):'<div class="empty-state">No verified vehicles match your search yet.</div>';
      $('vehicleGrid').querySelectorAll('[data-book]').forEach(button=>button.addEventListener('click',()=>{
        if(!driveRequireAuth('vehicles.html'))return;
        const vehicle=vehicles.find(v=>v.id===button.dataset.book);
        $('bookingVehicleId').value=vehicle.id;$('bookingVehicle').textContent=vehicle.name+' · '+driveMoney(vehicle.price)+' per day';
        $('bookingMessage').textContent='The owner must approve your request before the booking is confirmed.';
        $('bookingDialog').showModal();
      }));
    }catch(error){$('vehicleGrid').innerHTML='<div class="empty-state">'+driveEscape(error.message)+'</div>';}
  }

  $('rentalFilters').addEventListener('submit',event=>{event.preventDefault();load();});
  $('closeBooking').addEventListener('click',()=>$('bookingDialog').close());
  $('startDate').addEventListener('change',()=>{$('endDate').min=$('startDate').value||today();});
  $('bookingForm').addEventListener('submit',async event=>{
    event.preventDefault();if(!driveRequireAuth('vehicles.html'))return;
    const button=$('bookingForm').querySelector('button[type="submit"]');button.disabled=true;
    try{
      const result=await driveRequest('/rental/bookings',{method:'POST',body:JSON.stringify({
        vehicle_id:$('bookingVehicleId').value,customer_name:$('customerName').value.trim(),
        start_date:$('startDate').value,end_date:$('endDate').value
      })});
      $('bookingMessage').textContent=result.message||'Rental request submitted.';$('bookingMessage').className='message success';
      driveToast('Rental request submitted.');setTimeout(()=>$('bookingDialog').close(),900);await loadBookings();
    }catch(error){$('bookingMessage').textContent=error.message;$('bookingMessage').className='message error';}
    finally{button.disabled=false;}
  });

  function paymentFor(booking){return payments.find(p=>p.rental_booking_id===booking.id)||null;}
  function rentalPaymentAction(booking){
    const payment=paymentFor(booking);
    if(payment?.status==='paid')return '<span class="pill success">Paid</span><button class="button-mini" data-rental-result="'+driveEscape(payment.id)+'">Receipt</button>';
    if(payment?.status==='pending'){
      if(['bkash','nagad'].includes(String(payment.method).toLowerCase())&&!payment.provider_reference)
        return '<button class="button-mini dark" data-rental-reference="'+driveEscape(payment.id)+'">Add transaction ID</button>';
      return '<span class="pill warning">'+(payment.gateway_status==='risk_hold'?'Gateway review':'Payment pending')+'</span><button class="button-mini" data-rental-result="'+driveEscape(payment.id)+'">Status</button>';
    }
    if(booking.status!=='approved')return '';
    return '<button class="button-mini dark" data-rental-pay="'+driveEscape(booking.id)+'">Pay rental</button>';
  }

  function renderBookings(){
    $('myBookings').innerHTML=bookings.length?bookings.map(booking=>{
      const vehicle=booking.vehicles||{};
      const meta=driveDate(booking.start_at)+' – '+driveDate(booking.end_at)+' · '+driveMoney(booking.total_amount);
      return '<div class="list-item"><div class="list-item-main"><strong>'+driveEscape((vehicle.make||'Vehicle')+' '+(vehicle.model||''))+'</strong><small>'+meta+'</small></div><div class="row-actions"><span class="pill">'+driveEscape(booking.status)+'</span>'+rentalPaymentAction(booking)+'</div></div>';
    }).join(''):'<div class="empty-state">You have no rental requests yet.</div>';
    $('myBookings').querySelectorAll('[data-rental-pay]').forEach(button=>button.addEventListener('click',()=>{
      const booking=bookings.find(x=>x.id===button.dataset.rentalPay);if(booking)openRentalPayment(booking);
    }));
    $('myBookings').querySelectorAll('[data-rental-reference]').forEach(button=>button.addEventListener('click',()=>{
      const payment=payments.find(x=>x.id===button.dataset.rentalReference);
      const booking=bookings.find(x=>x.id===payment?.rental_booking_id);
      openRentalPayment(booking,payment);
    }));
    $('myBookings').querySelectorAll('[data-rental-result]').forEach(button=>button.addEventListener('click',()=>{
      location.href='payment-result.html?payment='+encodeURIComponent(button.dataset.rentalResult);
    }));
  }

  async function loadBookings(){
    if(!localStorage.getItem(DRIVE_TOKEN_KEY))return;
    try{
      const results=await Promise.all([driveRequest('/rental/bookings'),driveRequest('/payments/me')]);
      bookings=Array.isArray(results[0])?results[0]:[];
      payments=Array.isArray(results[1])?results[1]:[];
      renderBookings();
    }catch(error){$('myBookings').innerHTML='<div class="empty-state">'+driveEscape(error.message)+'</div>';}
  }

  function openRentalPayment(booking,existing=null){
    paymentBooking=booking||null;pendingPaymentId=existing?.id||null;pendingPaymentMethod=existing?.method||null;
    $('rentalPaymentSummary').textContent=booking?'Rental total · '+driveMoney(booking.total_amount):'Submit the wallet transaction ID';
    $('rentalPaymentMethod').value=existing?.method||'cash';
    $('rentalPaymentMethod').disabled=Boolean(existing);
    $('rentalPaymentCurrency').value='BDT';$('rentalPaymentCurrency').disabled=Boolean(existing);
    $('rentalPaymentReferenceWrap').hidden=!existing;
    $('rentalPaymentReference').required=Boolean(existing);
    $('rentalPaymentReference').value='';
    $('rentalPaymentMessage').textContent=existing?'Enter the transaction ID for this pending wallet payment.':'Cash and wallet transfers require confirmation. Online card payments open the SSLCOMMERZ secure checkout.';
    $('rentalPaymentSubmit').textContent=existing?'Submit transaction ID':'Continue';
    syncRentalPaymentOptions();
    $('rentalPaymentDialog').showModal();
  }

  function syncRentalPaymentOptions(){
    const method=$('rentalPaymentMethod').value;
    const wallet=['bkash','nagad'].includes(method),card=method==='card';
    $('rentalPaymentReferenceWrap').hidden=!wallet;
    $('rentalPaymentReference').required=wallet;
    $('rentalPaymentCurrencyWrap').hidden=!card;
    $('rentalPaymentCurrency').required=card;
    if(wallet)$('rentalPaymentMessage').textContent='Enter the bKash/Nagad transaction reference after transferring. An administrator must verify it.';
    if(card)$('rentalPaymentMessage').textContent='You will be redirected to SSLCOMMERZ secure checkout. Payment is confirmed only after server-side validation.';
    if(method==='cash')$('rentalPaymentMessage').textContent='Cash is recorded as pending until the owner or administrator confirms receipt.';
  }

  $('rentalPaymentMethod').addEventListener('change',syncRentalPaymentOptions);
  $('rentalPaymentForm').addEventListener('submit',async event=>{
    event.preventDefault();const button=$('rentalPaymentSubmit');button.disabled=true;
    try{
      if(!pendingPaymentId){
        if(!paymentBooking?.id)throw new Error('Rental booking is not available for payment.');
        const method=$('rentalPaymentMethod').value;
        const currency=method==='card'?$('rentalPaymentCurrency').value:'BDT';
        const result=await driveRequest('/payments/intent',{method:'POST',body:JSON.stringify({
          rentalBookingId:paymentBooking.id,method,currency
        })});
        pendingPaymentId=result.payment?.id;pendingPaymentMethod=method;
        if(!pendingPaymentId)throw new Error('Rental payment intent was not created.');
        if(method==='card'){
          if(!result.checkoutUrl)throw new Error('SSLCOMMERZ did not return a secure checkout URL.');
          const checkout=new URL(result.checkoutUrl);
          if(checkout.protocol!=='https:'||!['sandbox.sslcommerz.com','securepay.sslcommerz.com'].includes(checkout.hostname))
            throw new Error('The gateway returned an untrusted checkout destination. Please contact DRIVE support.');
          location.assign(checkout.toString());return;
        }
        if(['bkash','nagad'].includes(method)){
          $('rentalPaymentMethod').disabled=true;
          $('rentalPaymentReferenceWrap').hidden=false;$('rentalPaymentReference').required=true;
          $('rentalPaymentMessage').textContent=result.message+' Enter the transaction ID. No money has been collected by DRIVE.';
          $('rentalPaymentSubmit').textContent='Submit transaction ID';return;
        }
        $('rentalPaymentMessage').textContent=result.message||'Cash payment recorded as pending.';
      }
      if(['bkash','nagad'].includes(String(pendingPaymentMethod).toLowerCase())){
        const reference=$('rentalPaymentReference').value.trim();
        if(!reference)throw new Error('Enter the transaction ID before continuing.');
        const result=await driveRequest('/payments/'+encodeURIComponent(pendingPaymentId)+'/reference',{method:'POST',body:JSON.stringify({reference})});
        $('rentalPaymentMessage').textContent=result.message||'Transaction ID submitted for review.';
      }
      driveToast('Rental payment information saved.');$('rentalPaymentDialog').close();await loadBookings();
    }catch(error){$('rentalPaymentMessage').textContent=error.message;$('rentalPaymentMessage').className='message error';}
    finally{button.disabled=false;}
  });
  $('closeRentalPayment').addEventListener('click',()=>$('rentalPaymentDialog').close());
  if(driveSession())$('rentalLogin').hidden=true;
  load();loadBookings();
})();