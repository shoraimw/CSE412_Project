(() => {
  if(!driveRequireAuth('admin.html'))return;
  const $=id=>document.getElementById(id);
  const configs={
    drivers:{url:'/admin/driver-applications',title:'Driver applications',cols:['Applicant','Licence reference','Vehicle','Experience','Submitted'],map:r=>[r.profiles?.full_name||r.user_id,r.license_number,r.requested_vehicle_type,r.experience_years+' years',driveDate(r.created_at)],action:'/admin/driver-applications/',actions:['approved','rejected']},
    owners:{url:'/admin/owner-applications',title:'Vehicle owner applications',cols:['Applicant','Business','Phone','Address','Submitted'],map:r=>[r.profiles?.full_name||r.user_id,r.business_name,r.contact_phone,r.business_address,driveDate(r.created_at)],action:'/admin/owner-applications/',actions:['approved','rejected']},
    driverDocs:{url:'/admin/driver-documents',title:'Driver verification documents',cols:['Applicant','Document','Status','Submitted'],map:r=>[r.profile?.full_name||r.driver_id,r.document_type,r.verification_status,driveDate(r.created_at)],action:'/admin/driver-documents/',actions:['approved','rejected'],preview:true},
    ownerDocs:{url:'/admin/owner-documents',title:'Owner verification documents',cols:['Applicant','Document','Vehicle ID','Status','Submitted'],map:r=>[r.profile?.full_name||r.owner_id,r.document_type,r.vehicle_id||'Owner identity',r.verification_status,driveDate(r.created_at)],action:'/admin/owner-documents/',actions:['approved','rejected'],preview:true},
    vehicles:{url:'/admin/vehicles',title:'Vehicle verification',cols:['Vehicle','Registration','Owner','City','Submitted'],map:r=>[(r.make||'')+' '+(r.model||''),r.plate_number,r.owner?.full_name||r.owner_id,r.city,driveDate(r.created_at)],action:'/admin/vehicles/',actions:['approved','rejected']},
    safety:{url:'/admin/safety-alerts',title:'Safety alerts',cols:['Type','User','Message','Created','Status'],map:r=>[r.alert_type,r.profiles?.full_name||r.user_id,r.message||'—',driveDate(r.created_at),r.status],action:'/admin/safety-alerts/',actions:['acknowledged','resolved','false_alarm']},
    payments:{url:'/admin/payments',title:'Pending and risk-held payments',cols:['Payer','Amount','Method','Transaction reference','Gateway status','Settlement BDT','Risk','Created'],map:r=>[r.payer?.full_name||r.user_id,r.currency==='BDT'?driveMoney(r.amount):Number(r.amount).toFixed(2)+' '+r.currency,r.method,r.provider_reference||r.gateway_transaction_id||'Not submitted',r.gateway_status||'Manual',r.gateway_amount_bdt==null?'—':driveMoney(r.gateway_amount_bdt),Number(r.gateway_payload?.riskLevel||0)===1?'Review required':'—',driveDate(r.created_at)],action:'/admin/payments/',actions:['paid','failed']},
    users:{url:'/admin/users',title:'User accounts',cols:['Name','Phone','Role','Joined','Account'],map:r=>[r.full_name,r.phone||'—',r.role,driveDate(r.created_at),r.is_active?'Active':'Disabled'],action:'/admin/users/',actions:['toggle']},
    rides:{url:'/admin/rides',title:'Ride requests',cols:['Passenger','Pickup','Destination','Vehicle','Fare','Status'],map:r=>[r.profiles?.full_name||r.passenger_id,r.pickup_label,r.destination_label,r.requested_vehicle,driveMoney(r.estimated_fare),r.ride?.status||r.status],action:'/admin/rides/',actions:['cancelled']},
    rentals:{url:'/admin/rental-bookings',title:'Rental bookings',cols:['Renter','Vehicle','Period','Total','Status'],map:r=>[r.renter?.full_name||r.renter_id,(r.vehicles?.make||'')+' '+(r.vehicles?.model||''),driveDate(r.start_at)+' – '+driveDate(r.end_at),driveMoney(r.total_amount),r.status],action:'/admin/rental-bookings/',actions:['approved','rejected','cancelled']},
    supportCases:{url:'/admin/support-cases',title:'Customer support cases',cols:['Customer','Category','Subject','Created','Priority','Status'],map:r=>[r.profile?.full_name||r.user_id,r.category,r.subject,driveDate(r.created_at),r.priority,r.status],action:'/admin/support-cases/',actions:['in_review','resolved','rejected']},
    feedback:{url:'/admin/reviews',title:'Passenger feedback',cols:['Passenger','Driver','Rating','Comment','Ride','Submitted'],map:r=>[r.reviewer?.full_name||r.reviewer_id,r.reviewee?.full_name||r.reviewee_id,String(r.rating)+'/5',r.comment||'—',r.ride_id,driveDate(r.created_at)]},
    audit:{url:'/admin/audit-logs',title:'Administrator audit log',cols:['Administrator','Action','Entity','Entity ID','Created'],map:r=>[r.admin?.full_name||r.admin_id,r.action,r.entity_type,r.entity_id,driveDate(r.created_at)]},
    rideActivity:{url:'/admin/ride-activity',title:'Ride activity timeline',cols:['Actor','Role','Action','Status change','Reason','Time'],map:r=>[r.actor?.full_name||r.actor_id||'System',r.actor_role||'system',r.action,(r.from_status||'—')+' → '+(r.to_status||'—'),r.reason||'—',driveDate(r.created_at)]}
  };
  let activeTab='drivers';
  const button=(id,action)=>'<button class="button-mini '+(action==='rejected'||action==='false_alarm'||action==='failed'||action==='cancelled'?'danger':'dark')+'" data-id="'+driveEscape(id)+'" data-action="'+driveEscape(action)+'">'+driveEscape(action==='approved'?'Approve':action==='rejected'?'Reject':action==='acknowledged'?'Acknowledge':action==='resolved'?'Resolve':action==='false_alarm'?'False alarm':action==='paid'?'Mark paid':action==='failed'?'Mark failed':action==='cancelled'?'Cancel':action)+'</button>';
  async function overview(){
    const data=await driveRequest('/admin/overview');
    const names={users:'Users',pendingDrivers:'Driver applications',pendingOwners:'Owner applications',pendingVehicles:'Vehicles to verify',activeRides:'Active rides',pendingRentals:'Rental requests',activeSafetyAlerts:'Open safety alerts',pendingPayments:'Pending payments'};
    $('adminStats').innerHTML=Object.entries(names).map(([key,label])=>'<div class="stat"><span>'+label+'</span><strong>'+Number(data.counts?.[key]||0).toLocaleString()+'</strong></div>').join('');
    $('adminUpdated').textContent='Updated '+driveDate(data.generatedAt);
  }
  async function showPricing(){
    activeTab='pricing';
    document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab==='pricing'));
    $('adminContent').innerHTML='<div class="empty-state">Loading fare rules…</div>';
    try{
      const rows=await driveRequest('/admin/fare-rules');
      const body=rows.map(rule=>'<tr data-fare-row="'+driveEscape(rule.vehicle_type)+'">'+
        '<td><strong>'+driveEscape(rule.vehicle_type.toUpperCase())+'</strong></td>'+
        '<td><input class="control" data-fare="base_fare" type="number" min="0" step="0.01" value="'+Number(rule.base_fare)+'"></td>'+
        '<td><input class="control" data-fare="per_km" type="number" min="0" step="0.01" value="'+Number(rule.per_km)+'"></td>'+
        '<td><input class="control" data-fare="per_minute" type="number" min="0" step="0.01" value="'+Number(rule.per_minute)+'"></td>'+
        '<td><input class="control" data-fare="peak_hour_multiplier" type="number" min="1" max="3" step="0.01" value="'+Number(rule.peak_hour_multiplier)+'"></td>'+
        '<td><input class="control" data-fare="demand_multiplier_cap" type="number" min="1" max="3" step="0.01" value="'+Number(rule.demand_multiplier_cap)+'"></td>'+
        '<td><button class="button-mini dark" data-save-fare="'+driveEscape(rule.vehicle_type)+'">Save</button></td></tr>').join('');
      $('adminContent').innerHTML='<div class="toolbar"><h3 class="card-title">Configurable fare rules</h3><span class="muted small">Amounts in BDT · Multipliers are configurable</span></div>'+
        '<div class="table-wrap"><table><thead><tr><th>Vehicle</th><th>Base fare</th><th>Per km</th><th>Per minute</th><th>Peak multiplier</th><th>Demand cap</th><th>Action</th></tr></thead><tbody>'+body+'</tbody></table></div>'+
        '<p class="muted small" style="margin-top:12px">Changes apply to new fare estimates. Existing ride quotes are not rewritten.</p>';
      $('adminContent').querySelectorAll('[data-save-fare]').forEach(button=>button.addEventListener('click',async()=>{
        const row=button.closest('[data-fare-row]');const payload={};
        row.querySelectorAll('[data-fare]').forEach(input=>payload[input.dataset.fare]=Number(input.value));
        button.disabled=true;
        try{await driveRequest('/admin/fare-rules/'+encodeURIComponent(button.dataset.saveFare),{method:'PATCH',body:JSON.stringify(payload)});driveToast('Fare rule updated.');}
        catch(error){driveToast(error.message);}
        finally{button.disabled=false;}
      }));
    }catch(error){$('adminContent').innerHTML='<div class="empty-state">'+driveEscape(error.message)+'</div>';}
  }
  async function showTab(tab){
    if(tab==='pricing'){await showPricing();return;}
    activeTab=tab;
    document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    const config=configs[tab];$('adminContent').innerHTML='<div class="empty-state">Loading '+config.title.toLowerCase()+'…</div>';
    try{
      const rows=await driveRequest(config.url);
      if(!rows.length){$('adminContent').innerHTML='<div class="empty-state">No records in this queue.</div>';return;}
      const head=config.cols.map(c=>'<th>'+driveEscape(c)+'</th>').join('')+(config.preview?'<th>Document</th>':'');
      const body=rows.map(row=>{
        const cells=config.map(row).map(v=>'<td>'+driveEscape(v??'—')+'</td>').join('')+(config.preview?'<td>'+(row.previewUrl?'<a href="'+driveEscape(row.previewUrl)+'" target="_blank" rel="noopener">Open private file</a>':'Unavailable')+'</td>':'');
        let actions='';
        if(config.actions){
          const availableActions=tab==='rides'&&['completed','cancelled'].includes(row.ride?.status||row.status)?[]:config.actions;
          actions='<td><div class="row-actions">'+availableActions.map(a=>button(row.id,a)).join('')+'</div></td>';
        } else if(tab==='users') {
          actions='<td>'+button(row.id,'toggle')+'</td>';
        }
        return '<tr>'+cells+actions+'</tr>';
      }).join('');
      $('adminContent').innerHTML='<div class="toolbar"><h3 class="card-title">'+config.title+'</h3><span class="muted small">'+rows.length+' records</span></div><div class="table-wrap"><table><thead><tr>'+head+(config.actions||tab==='users'?'<th>Actions</th>':'')+'</tr></thead><tbody>'+body+'</tbody></table></div>';
      $('adminContent').querySelectorAll('[data-id]').forEach(btn=>btn.addEventListener('click',()=>performAction(btn)));
    }catch(error){$('adminContent').innerHTML='<div class="empty-state">'+driveEscape(error.message)+'</div>';}
  }
  async function performAction(btn){
    const id=btn.dataset.id, action=btn.dataset.action, config=configs[activeTab];
    let body={};
    if(activeTab==='users'){
      const rows=await driveRequest('/admin/users');const user=rows.find(r=>r.id===id);body={is_active:!user?.is_active};
      if(!confirm((body.is_active?'Reactivate':'Suspend')+' this user account?'))return;
    }else if(activeTab==='safety'){
      body={status:action};
      if(action==='false_alarm'&&!confirm('Mark this alert as a false alarm?'))return;
    }else if(activeTab==='payments'){
      body={status:action};
      if(action==='paid'){
        const note=prompt('Verification note (required for a risk-held card payment):');
        if(note?.trim())body.adminNote=note.trim();
        if(!confirm('Confirm that the payment has been checked in the merchant account and should be marked '+action+'?'))return;
      }else if(!confirm('Mark this payment as failed?'))return;
    }else if(activeTab==='driverDocs'||activeTab==='ownerDocs'){
      body={status:action};
      if(action==='rejected'){
        const reason=prompt('Reason for rejecting this document:');
        if(!reason?.trim())return;
        body.rejectionReason=reason.trim();
      }else if(!confirm('Approve this verification document?'))return;
    }else if(activeTab==='supportCases'){
      body={status:action,adminNote:prompt('Internal admin note (optional):')||undefined};
      if(action==='rejected'&&!confirm('Reject this support case?'))return;
    }else if(['drivers','owners','vehicles'].includes(activeTab)){
      body={status:action};
      if(action==='rejected')body.rejection_reason=prompt('Reason for rejection (optional):')||undefined;
      if(!confirm((action==='approved'?'Approve':'Reject')+' this record?'))return;
    }else if(activeTab==='rentals'){
      body={status:action};
      if(action==='rejected'&&!confirm('Reject this rental booking?'))return;
    }else{
      body={status:action};
    }
    btn.disabled=true;
    try{
      await driveRequest(config.action+id+(activeTab==='users'?'/status':''),{method:'PATCH',body:JSON.stringify(body)});
      driveToast('Record updated.');await Promise.all([overview(),showTab(activeTab)]);
    }catch(error){driveToast(error.message);btn.disabled=false;}
  }
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>showTab(button.dataset.tab)));
  $('refreshAdmin').addEventListener('click',()=>Promise.all([overview(),showTab(activeTab)]).catch(error=>driveToast(error.message)));
  $('logoutButton').addEventListener('click',()=>{driveClearSession();location.href='index.html';});
  driveRequest('/users/me').then(user=>{
    if(user.role!=='admin'){driveClearSession();location.href='login.html?next=admin.html';return;}
    $('adminIdentity').textContent=user.full_name||'Administrator';
    return Promise.all([overview(),showTab('drivers')]);
  }).catch(error=>{$('adminContent').innerHTML='<div class="empty-state">'+driveEscape(error.message)+'</div>';});
})();