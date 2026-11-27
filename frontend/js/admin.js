(() => {
  if(!driveRequireAuth('admin.html'))return;
  const $=id=>document.getElementById(id);
  const configs={
    drivers:{url:'/admin/driver-applications',title:'Driver applications',cols:['Applicant','Licence reference','Vehicle','Experience','Submitted'],map:r=>[r.profiles?.full_name||r.user_id,r.license_number,r.requested_vehicle_type,r.experience_years+' years',driveDate(r.created_at)],action:'/admin/driver-applications/',actions:['approved','rejected']},
    owners:{url:'/admin/owner-applications',title:'Vehicle owner applications',cols:['Applicant','Business','Phone','Address','Submitted'],map:r=>[r.profiles?.full_name||r.user_id,r.business_name,r.contact_phone,r.business_address,driveDate(r.created_at)],action:'/admin/owner-applications/',actions:['approved','rejected']},
    vehicles:{url:'/admin/vehicles',title:'Vehicle verification',cols:['Vehicle','Registration','Owner','City','Submitted'],map:r=>[(r.make||'')+' '+(r.model||''),r.plate_number,r.owner?.full_name||r.owner_id,r.city,driveDate(r.created_at)],action:'/admin/vehicles/',actions:['approved','rejected']},
    safety:{url:'/admin/safety-alerts',title:'Safety alerts',cols:['Type','User','Message','Created','Status'],map:r=>[r.alert_type,r.profiles?.full_name||r.user_id,r.message||'—',driveDate(r.created_at),r.status],action:'/admin/safety-alerts/',actions:['acknowledged','resolved','false_alarm']},
    payments:{url:'/admin/payments',title:'Pending payments',cols:['Payer','Amount','Method','Transaction reference','Created'],map:r=>[r.payer?.full_name||r.user_id,driveMoney(r.amount),r.method,r.provider_reference||'Not submitted',driveDate(r.created_at)],action:'/admin/payments/',actions:['paid','failed']},
    users:{url:'/admin/users',title:'User accounts',cols:['Name','Phone','Role','Joined','Account'],map:r=>[r.full_name,r.phone||'—',r.role,driveDate(r.created_at),r.is_active?'Active':'Disabled'],action:'/admin/users/',actions:['toggle']},
    rides:{url:'/admin/rides',title:'Ride requests',cols:['Passenger','Pickup','Destination','Vehicle','Fare','Status'],map:r=>[r.profiles?.full_name||r.passenger_id,r.pickup_label,r.destination_label,r.requested_vehicle,driveMoney(r.estimated_fare),r.ride?.status||r.status]},
    rentals:{url:'/admin/rental-bookings',title:'Rental bookings',cols:['Renter','Vehicle','Period','Total','Status'],map:r=>[r.renter?.full_name||r.renter_id,(r.vehicles?.make||'')+' '+(r.vehicles?.model||''),driveDate(r.start_at)+' – '+driveDate(r.end_at),driveMoney(r.total_amount),r.status],action:'/admin/rental-bookings/',actions:['approved','rejected','cancelled']},
    audit:{url:'/admin/audit-logs',title:'Administrator audit log',cols:['Administrator','Action','Entity','Entity ID','Created'],map:r=>[r.admin?.full_name||r.admin_id,r.action,r.entity_type,r.entity_id,driveDate(r.created_at)]}
  };
  let activeTab='drivers';
  const button=(id,action)=>'<button class="button-mini '+(action==='rejected'||action==='false_alarm'||action==='failed'||action==='cancelled'?'danger':'dark')+'" data-id="'+driveEscape(id)+'" data-action="'+driveEscape(action)+'">'+driveEscape(action==='approved'?'Approve':action==='rejected'?'Reject':action==='acknowledged'?'Acknowledge':action==='resolved'?'Resolve':action==='false_alarm'?'False alarm':action==='paid'?'Mark paid':action==='failed'?'Mark failed':action==='cancelled'?'Cancel':action)+'</button>';
  async function overview(){
    const data=await driveRequest('/admin/overview');
    const names={users:'Users',pendingDrivers:'Driver applications',pendingOwners:'Owner applications',pendingVehicles:'Vehicles to verify',activeRides:'Active rides',pendingRentals:'Rental requests',activeSafetyAlerts:'Open safety alerts',pendingPayments:'Pending payments'};
    $('adminStats').innerHTML=Object.entries(names).map(([key,label])=>'<div class="stat"><span>'+label+'</span><strong>'+Number(data.counts?.[key]||0).toLocaleString()+'</strong></div>').join('');
    $('adminUpdated').textContent='Updated '+driveDate(data.generatedAt);
  }
  async function showTab(tab){
    activeTab=tab;
    document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    const config=configs[tab];$('adminContent').innerHTML='<div class="empty-state">Loading '+config.title.toLowerCase()+'…</div>';
    try{
      const rows=await driveRequest(config.url);
      if(!rows.length){$('adminContent').innerHTML='<div class="empty-state">No records in this queue.</div>';return;}
      const head=config.cols.map(c=>'<th>'+driveEscape(c)+'</th>').join('');
      const body=rows.map(row=>{
        const cells=config.map(row).map(v=>'<td>'+driveEscape(v??'—')+'</td>').join('');
        let actions='';
        if(config.actions){
          actions='<td><div class="row-actions">'+config.actions.map(a=>button(row.id,a)).join('')+'</div></td>';
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
    if(action==='toggle'){
      const confirmed=confirm('Toggle this user account active status?');if(!confirmed)return;
    }
    let body={};
    if(activeTab==='users'){
      const rows=await driveRequest('/admin/users');const user=rows.find(r=>r.id===id);body={is_active:!user?.is_active};
    }else if(activeTab==='safety')body={status:action};
    else if(activeTab==='payments')body={status:action};
    else body={status:action};
    if(action==='rejected'&&!confirm('Reject this application?'))return;
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