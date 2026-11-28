(() => {
  const $=id=>document.getElementById(id);
  let places=[];
  async function loadCurrencyPreference(){
    const select=$('exploreCurrency');
    const codes=['BDT','USD','EUR','GBP','INR','SGD','MYR','AED','SAR','AUD','CAD','CNY','JPY','THB','NPR','PKR'];
    try{
      const [catalog,rates]=await Promise.all([driveRequest('/payments/currencies'),driveRequest('/payments/rates')]);
      const available=(catalog.currencies||codes).filter(code=>code==='BDT'||Number(rates.rates?.[code])>0);
      select.innerHTML=available.map(code=>'<option value="'+driveEscape(code)+'">'+driveEscape(code)+'</option>').join('');
      let preferred=localStorage.getItem('drive_currency')||'BDT';
      if(localStorage.getItem(DRIVE_TOKEN_KEY)){
        try{
          const profile=await driveRequest('/users/me');
          if(available.includes(profile.preferred_currency))preferred=profile.preferred_currency;
        }catch{}
      }
      if(!available.includes(preferred))preferred='BDT';
      select.value=preferred;
      localStorage.setItem('drive_currency',preferred);
      $('touristCurrencyNote').textContent='Tourist display currency: '+preferred+'. Exchange rates updated '+new Date(rates.fetchedAt).toLocaleString()+'. Ride fares remain settled in BDT.';
    }catch{
      select.innerHTML='<option value="BDT">BDT</option>';
      select.value='BDT';
      $('touristCurrencyNote').textContent='Live exchange rates are unavailable. BDT remains available.';
    }
  }
  $('exploreCurrency')?.addEventListener('change',async()=>{
    const currency=$('exploreCurrency').value;
    localStorage.setItem('drive_currency',currency);
    $('touristCurrencyNote').textContent='Tourist display currency set to '+currency+'. Ride fares and settlement remain in BDT.';
    if(localStorage.getItem(DRIVE_TOKEN_KEY)){
      try{await driveRequest('/users/me',{method:'PATCH',body:JSON.stringify({preferred_currency:currency})});}
      catch(error){$('touristCurrencyNote').textContent='Saved for this visit. Account preference could not be updated: '+error.message;}
    }
  });

  async function loadPlaces(){
    const city=$('exploreCity').value,interest=$('exploreInterest').value;
    const params=new URLSearchParams({city});if(interest)params.set('category',interest);
    $('placesGrid').innerHTML='<div class="empty-state">Finding places…</div>';
    try{
      places=await driveRequest('/tourist/places?'+params.toString());
      $('placeCount').textContent=places.length+' places';
      $('placesGrid').innerHTML=places.length?places.map(place=>'<label class="vehicle-card"><div class="vehicle-image">⌖</div><div class="vehicle-body"><div class="toolbar"><span class="pill">'+driveEscape(place.category||'Explore')+'</span><input type="checkbox" class="place-select" value="'+driveEscape(place.id)+'" aria-label="Select '+driveEscape(place.name)+'"></div><h3>'+driveEscape(place.name)+'</h3><p>'+driveEscape(place.description||'Explore this destination.')+'</p><p>'+driveEscape(place.city)+' · '+driveEscape(place.estimatedVisitHours||1)+' hour(s)</p></div></label>').join(''):'<div class="empty-state">No destinations found for this city.</div>';
    }catch(error){$('placesGrid').innerHTML='<div class="empty-state">'+driveEscape(error.message)+'</div>';}
  }
  async function loadPlans(){
    if(!localStorage.getItem(DRIVE_TOKEN_KEY))return;
    try{
      const plans=await driveRequest('/tourist/plans');
      $('savedPlans').innerHTML=plans.length?plans.map(p=>'<div class="list-item"><div class="list-item-main"><strong>'+driveEscape(p.city)+' · '+driveEscape(p.transport_preference)+'</strong><small>'+driveEscape((p.place_ids||[]).length)+' places · '+driveEscape(p.travel_date||'Date not set')+'</small></div><span class="pill">Saved</span></div>').join(''):'<div class="empty-state">No saved travel plans yet.</div>';
    }catch(error){$('savedPlans').innerHTML='<div class="empty-state">'+driveEscape(error.message)+'</div>';}
  }
  $('exploreFilters').addEventListener('submit',event=>{event.preventDefault();loadPlaces();});
  $('savePlan').addEventListener('click',async()=>{
    if(!driveRequireAuth('explore.html'))return;
    const placeIds=[...document.querySelectorAll('.place-select:checked')].map(el=>el.value);
    if(!placeIds.length){$('planMessage').textContent='Select at least one place first.';return;}
    const button=$('savePlan');button.disabled=true;
    try{
      const result=await driveRequest('/tourist/plans',{method:'POST',body:JSON.stringify({
        city:$('exploreCity').value,placeIds,travelDate:$('travelDate').value||undefined,
        transportPreference:$('transport').value
      })});
      $('planMessage').textContent=result.message||'Your travel plan was saved.';$('planMessage').className='message success';loadPlans();
    }catch(error){$('planMessage').textContent=error.message;$('planMessage').className='message error';}
    finally{button.disabled=false;}
  });
  loadCurrencyPreference();loadPlaces();loadPlans();
})();