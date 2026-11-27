(() => {
  const $=id=>document.getElementById(id);
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka'}).format(new Date());
  $('startDate').min=today();$('endDate').min=today();
  let vehicles=[];
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
      driveToast('Rental request submitted.');setTimeout(()=>$('bookingDialog').close(),900);loadBookings();
    }catch(error){$('bookingMessage').textContent=error.message;$('bookingMessage').className='message error';}
    finally{button.disabled=false;}
  });
  async function loadBookings(){
    if(!localStorage.getItem(DRIVE_TOKEN_KEY))return;
    try{
      const rows=await driveRequest('/rental/bookings');
      $('myBookings').innerHTML=rows.length?rows.map(b=>'<div class="list-item"><div class="list-item-main"><strong>'+driveEscape((b.vehicles?.make||'Vehicle')+' '+(b.vehicles?.model||''))+'</strong><small>'+driveDate(b.start_at)+' – '+driveDate(b.end_at)+' · '+driveMoney(b.total_amount)+'</small></div><span class="pill">'+driveEscape(b.status)+'</span></div>').join(''):'<div class="empty-state">You have no rental requests yet.</div>';
    }catch(error){$('myBookings').innerHTML='<div class="empty-state">'+driveEscape(error.message)+'</div>';}
  }
  if(driveSession())$('rentalLogin').hidden=true;
  load();loadBookings();
})();