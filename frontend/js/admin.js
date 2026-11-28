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
    rideActivity:{url:'/admin/ride-activity',title:'Ride activity timeline',cols:['Actor','Role','Action','Ride / Request','Status change','Reason','Details','Time'],map:r=>[r.actor?.full_name||r.actor_id||'System',r.actor_role||'system',r.action,r.ride_id||r.request_id||'—',(r.from_status||'—')+' → '+(r.to_status||'—'),r.reason||'—',JSON.stringify(r.metadata||{}),driveDate(r.created_at)]}
  };
  let activeTab='drivers';
  let placeRows=[];
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

  async function showPlaces(){
    activeTab='places';
    document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab==='places'));
    $('adminContent').innerHTML='<div class="empty-state">Loading Explore destinations…</div>';
    try{
      placeRows=await driveRequest('/admin/tourist-places');
      const categories=[...new Set(placeRows.map(row=>String(row.category||'').trim()).filter(Boolean))].sort();
      $('adminContent').innerHTML=`
        <div class="toolbar">
          <div><h3 class="card-title">Explore destination catalogue</h3><p class="muted small">Add, edit, publish, hide or remove destinations shown to every DRIVE customer and driver.</p></div>
          <button class="button button-dark button-small" id="newExplorePlace">+ Add destination</button>
        </div>
        <section class="card" id="explorePlaceEditor" hidden style="margin-bottom:18px">
          <div class="toolbar"><h3 class="card-title" id="explorePlaceFormTitle">Add a destination</h3><button class="button button-outline button-small" type="button" id="cancelExplorePlace">Close</button></div>
          <form id="explorePlaceForm" class="form-grid">
            <input type="hidden" id="placeId">
            <div class="form-field"><label for="placeName">Place name *</label><input id="placeName" required maxlength="120" placeholder="e.g. Lalbagh Fort"></div>
            <div class="form-field"><label for="placeCity">City / district *</label><input id="placeCity" required maxlength="80" placeholder="e.g. Dhaka"></div>
            <div class="form-field"><label for="placeCategory">Category *</label><input id="placeCategory" required maxlength="60" list="explorePlaceCategories" placeholder="History, Nature, Beach…"><datalist id="explorePlaceCategories">${categories.map(value=>'<option value="'+driveEscape(value)+'"></option>').join('')}</datalist></div>
            <div class="form-field"><label for="placeAddress">Address / area</label><input id="placeAddress" maxlength="240" placeholder="Area, district"></div>
            <div class="form-field full"><label for="placeDescription">Description *</label><textarea id="placeDescription" maxlength="2400" required placeholder="A short, helpful description for visitors"></textarea></div>
            <div class="form-field"><label for="placeLatitude">Latitude</label><input id="placeLatitude" type="number" min="-90" max="90" step="any" placeholder="23.7189"></div>
            <div class="form-field"><label for="placeLongitude">Longitude</label><input id="placeLongitude" type="number" min="-180" max="180" step="any" placeholder="90.3881"></div>
            <div class="form-field"><label for="placeHours">Estimated visit hours</label><input id="placeHours" type="number" min="0.5" max="24" step="0.5" value="1.5"></div>
            <div class="form-field"><label for="placeTags">Tags (comma separated)</label><input id="placeTags" placeholder="history, architecture, family"></div>
            <div class="form-field full"><label for="placeFacilities">Nearby facilities (comma separated)</label><input id="placeFacilities" placeholder="Food, parking, local transport"></div>
            <div class="form-field full"><label for="placeImageFile">Upload destination image (JPG, PNG or WebP · max 5 MB)</label><input id="placeImageFile" type="file" accept="image/jpeg,image/png,image/webp"></div>
            <div class="form-field full"><label for="placeImageUrl">Or use an existing image URL</label><input id="placeImageUrl" type="url" maxlength="1200" placeholder="https://…"></div>
            <div class="form-field"><label for="placeImageAlt">Image alt text</label><input id="placeImageAlt" maxlength="240" placeholder="Describe the image"></div>
            <div class="form-field"><label for="placeImageCredit">Image credit</label><input id="placeImageCredit" maxlength="240" placeholder="Photographer / licence"></div>
            <div class="form-field full"><label for="placeImageSource">Image source / licence URL</label><input id="placeImageSource" type="url" maxlength="1200" placeholder="https://commons.wikimedia.org/…"></div>
            <div class="form-field full"><label class="check-row"><input id="placeIsActive" type="checkbox" checked> Publish this destination to customers and drivers</label></div>
            <div class="form-field full"><div class="message" id="explorePlaceFormMessage"></div></div>
            <div class="form-field full"><div class="toolbar"><button class="button button-dark" id="saveExplorePlace" type="submit">Save destination</button><button class="button button-outline" id="resetExplorePlace" type="button">Clear form</button></div></div>
          </form>
        </section>
        <div class="toolbar explore-admin-filters">
          <input class="control" id="placeSearch" placeholder="Search destinations…" style="max-width:320px">
          <select class="control" id="placeCategoryFilter" style="max-width:220px"><option value="">All categories</option>${categories.map(value=>'<option value="'+driveEscape(value)+'">'+driveEscape(value)+'</option>').join('')}</select>
          <span class="muted small" id="placeAdminCount"></span>
        </div>
        <div class="explore-admin-grid" id="placeAdminGrid"></div>`;
      const editor=$('explorePlaceEditor'),form=$('explorePlaceForm');
      function resetPlaceForm(){
        form.reset();$('placeId').value='';$('placeHours').value='1.5';$('placeIsActive').checked=true;
        $('explorePlaceFormTitle').textContent='Add a destination';$('saveExplorePlace').textContent='Save destination';
        $('explorePlaceFormMessage').textContent='';
      }
      function renderPlaceRows(){
        const needle=$('placeSearch').value.trim().toLowerCase(),category=$('placeCategoryFilter').value;
        const filtered=placeRows.filter(row=>(!category||row.category===category)&&(!needle||[row.name,row.city,row.category,row.description,row.address].join(' ').toLowerCase().includes(needle)));
        $('placeAdminCount').textContent=filtered.length+' of '+placeRows.length+' destinations';
        $('placeAdminGrid').innerHTML=filtered.length?filtered.map(row=>`
          <article class="explore-admin-card">
            <div class="explore-admin-thumb">${row.image_url?'<img src="'+driveEscape(row.image_url)+'" alt="'+driveEscape(row.image_alt||row.name)+'" loading="lazy" onerror="this.parentNode.classList.add(\'image-missing\');this.remove()">':'<span>No image uploaded</span>'}</div>
            <div class="explore-admin-card-body">
              <div class="toolbar"><span class="pill">${driveEscape(row.category||'Explore')}</span><span class="pill ${row.is_active?'success':'warning'}">${row.is_active?'Published':'Hidden'}</span></div>
              <h4>${driveEscape(row.name)}</h4><p class="muted small">${driveEscape(row.city)} · ${driveEscape(row.address||'Address not set')}</p>
              <p class="explore-admin-description">${driveEscape(row.description||'')}</p>
              ${row.image_credit?'<p class="muted small">Image: '+driveEscape(row.image_credit)+'</p>':''}
              <div class="row-actions">
                <button class="button-mini dark" data-place-edit="${driveEscape(row.id)}">Edit</button>
                <button class="button-mini" data-place-toggle="${driveEscape(row.id)}">${row.is_active?'Hide':'Publish'}</button>
                <button class="button-mini danger" data-place-remove="${driveEscape(row.id)}">Remove</button>
              </div>
            </div>
          </article>`).join(''):'<div class="empty-state">No destinations match this filter.</div>';
        $('placeAdminGrid').querySelectorAll('[data-place-edit]').forEach(button=>button.addEventListener('click',()=>{
          const row=placeRows.find(item=>String(item.id)===button.dataset.placeEdit);if(!row)return;
          $('placeId').value=row.id;$('placeName').value=row.name||'';$('placeCity').value=row.city||'';
          $('placeCategory').value=row.category||'';$('placeAddress').value=row.address||'';
          $('placeDescription').value=row.description||'';$('placeLatitude').value=row.latitude??'';
          $('placeLongitude').value=row.longitude??'';$('placeHours').value=Number(row.estimated_visit_hours||1.5);
          $('placeTags').value=(row.tags||[]).join(', ');$('placeFacilities').value=(row.nearby_facilities||[]).join(', ');
          $('placeImageUrl').value=row.image_url||'';$('placeImageAlt').value=row.image_alt||'';
          $('placeImageCredit').value=row.image_credit||'';$('placeImageSource').value=row.image_source_url||'';
          $('placeIsActive').checked=Boolean(row.is_active);$('placeImageFile').value='';
          $('explorePlaceFormTitle').textContent='Edit destination';$('saveExplorePlace').textContent='Save changes';
          $('explorePlaceFormMessage').textContent='Leave the image file empty to keep the current image.';
          editor.hidden=false;editor.scrollIntoView({behavior:'smooth',block:'start'});
        }));
        $('placeAdminGrid').querySelectorAll('[data-place-toggle]').forEach(button=>button.addEventListener('click',async()=>{
          const row=placeRows.find(item=>String(item.id)===button.dataset.placeToggle);if(!row)return;
          button.disabled=true;
          try{await driveRequest('/admin/tourist-places/'+encodeURIComponent(row.id),{method:'PATCH',body:JSON.stringify({isActive:!row.is_active})});driveToast(row.is_active?'Destination hidden from Explore.':'Destination published to Explore.');await showPlaces();}
          catch(error){driveToast(error.message);button.disabled=false;}
        }));
        $('placeAdminGrid').querySelectorAll('[data-place-remove]').forEach(button=>button.addEventListener('click',async()=>{
          const row=placeRows.find(item=>String(item.id)===button.dataset.placeRemove);if(!row)return;
          if(!confirm('Remove '+row.name+' from the public Explore catalogue? Saved plans will be preserved.'))return;
          button.disabled=true;
          try{await driveRequest('/admin/tourist-places/'+encodeURIComponent(row.id),{method:'DELETE'});driveToast('Destination removed from public Explore.');await showPlaces();}
          catch(error){driveToast(error.message);button.disabled=false;}
        }));
      }
      renderPlaceRows();
      $('placeSearch').addEventListener('input',renderPlaceRows);
      $('placeCategoryFilter').addEventListener('change',renderPlaceRows);
      $('newExplorePlace').addEventListener('click',()=>{resetPlaceForm();editor.hidden=false;editor.scrollIntoView({behavior:'smooth',block:'start'});});
      $('cancelExplorePlace').addEventListener('click',()=>{editor.hidden=true;resetPlaceForm();});
      $('resetExplorePlace').addEventListener('click',resetPlaceForm);
      form.addEventListener('submit',async event=>{
        event.preventDefault();
        if(!form.reportValidity())return;
        const id=$('placeId').value,button=$('saveExplorePlace'),file=$('placeImageFile').files[0];
        const latitude=$('placeLatitude').value.trim(),longitude=$('placeLongitude').value.trim();
        if(Boolean(latitude)!==Boolean(longitude)){ $('explorePlaceFormMessage').textContent='Enter both latitude and longitude, or leave both empty.';return; }
        const payload={
          name:$('placeName').value.trim(),city:$('placeCity').value.trim(),category:$('placeCategory').value.trim(),
          address:$('placeAddress').value.trim(),description:$('placeDescription').value.trim(),
          estimatedVisitHours:Number($('placeHours').value||1.5),
          tags:$('placeTags').value.split(',').map(value=>value.trim()).filter(Boolean),
          nearbyFacilities:$('placeFacilities').value.split(',').map(value=>value.trim()).filter(Boolean),
          imageUrl:$('placeImageUrl').value.trim(),imageAlt:$('placeImageAlt').value.trim(),
          imageCredit:$('placeImageCredit').value.trim(),imageSourceUrl:$('placeImageSource').value.trim(),
          isActive:$('placeIsActive').checked
        };
        if(latitude){payload.latitude=Number(latitude);payload.longitude=Number(longitude);}
        button.disabled=true;button.textContent='Saving…';$('explorePlaceFormMessage').textContent='Saving destination details…';
        try{
          const saved=await driveRequest(id?'/admin/tourist-places/'+encodeURIComponent(id):'/admin/tourist-places',{
            method:id?'PATCH':'POST',body:JSON.stringify(payload)
          });
          if(file){
            const upload=new FormData();upload.append('image',file);
            $('explorePlaceFormMessage').textContent='Uploading destination image…';
            await driveRequest('/admin/tourist-places/'+encodeURIComponent(saved.id)+'/image',{method:'POST',body:upload});
          }
          driveToast(id?'Destination updated.':'Destination added.');
          await showPlaces();
        }catch(error){
          $('explorePlaceFormMessage').textContent=error.message||'Destination could not be saved.';
          button.disabled=false;button.textContent=id?'Save changes':'Save destination';
        }
      });
    }catch(error){$('adminContent').innerHTML='<div class="empty-state">'+driveEscape(error.message)+'</div>';}
  }

  async function showTab(tab){
    if(tab==='pricing'){await showPricing();return;}
    if(tab==='places'){await showPlaces();return;}
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