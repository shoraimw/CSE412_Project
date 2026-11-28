(() => {
  const $=id=>document.getElementById(id);
  let places=[],language='en';
  const translations={
    en:{
      eyebrow:'TOURIST MODE',title:'Make a day of it.',subtitle:'Discover places and save a simple travel plan.',
      city:'City',interest:'Interest',allInterests:'All interests',travelDate:'Travel date',transport:'Transport',
      publicTransport:'Public Transport',car:'Car',bike:'Bike',walking:'Walking',history:'History',nature:'Nature',beach:'Beach',culture:'Culture',explore:'Explore',touristCurrency:'Tourist currency',language:'Language',
      findPlaces:'Find places',placesTitle:'Places to explore',loadingPlaces:'Loading places…',
      savedPlans:'Your saved plans',saveSelected:'Save selected places',loginToSeePlans:'Log in to view saved plans.',
      currencyNote:'Tourist display currency: ',ratesUpdated:'. Exchange rates updated ',settled:'. Ride fares remain settled in BDT.',
      currencyFallback:'Live exchange rates are unavailable. BDT remains available.',
      currencySet:'Tourist display currency set to ',currencyRemain:'. Ride fares and settlement remain in BDT.',
      findingPlaces:'Finding places…',noPlaces:'No destinations found for this city.',
      placeCount:' places',selectPlace:'Select ',hours:' hour(s)',noPlans:'No saved travel plans yet.',
      selectFirst:'Select at least one place first.',saved:'Your travel plan was saved.',
      languageSaved:'Language preference saved.',languageLocal:'Language saved for this visit. Account preference could not be updated: ',
      currencyLocal:'Saved for this visit. Account preference could not be updated: ',dateNotSet:'Date not set',savedTag:'Saved',
      sourceNote:'Place descriptions are shown in their source language.'
    },
    bn:{
      eyebrow:'ট্যুরিস্ট মোড',title:'একদিনের ভ্রমণ সাজান।',subtitle:'পছন্দের জায়গা খুঁজুন এবং সহজ ভ্রমণ পরিকল্পনা সংরক্ষণ করুন।',
      city:'শহর',interest:'পছন্দের বিষয়',allInterests:'সব ধরনের জায়গা',travelDate:'ভ্রমণের তারিখ',transport:'যাতায়াত',
      publicTransport:'গণপরিবহন',car:'গাড়ি',bike:'বাইক',walking:'হেঁটে',history:'ইতিহাস',nature:'প্রকৃতি',beach:'সমুদ্রসৈকত',culture:'সংস্কৃতি',explore:'ঘুরে দেখুন',touristCurrency:'মুদ্রা',language:'ভাষা',
      findPlaces:'জায়গা খুঁজুন',placesTitle:'ঘুরে দেখার জায়গা',loadingPlaces:'জায়গা লোড হচ্ছে…',
      savedPlans:'আপনার সংরক্ষিত পরিকল্পনা',saveSelected:'নির্বাচিত জায়গা সংরক্ষণ করুন',loginToSeePlans:'সংরক্ষিত পরিকল্পনা দেখতে লগইন করুন।',
      currencyNote:'প্রদর্শনের মুদ্রা: ',ratesUpdated:'। বিনিময় হার হালনাগাদ: ',settled:'। রাইডের মূল্য BDT-তেই পরিশোধ হবে।',
      currencyFallback:'লাইভ বিনিময় হার পাওয়া যাচ্ছে না। BDT ব্যবহার করা যাবে।',
      currencySet:'প্রদর্শনের মুদ্রা নির্ধারণ করা হয়েছে: ',currencyRemain:'। রাইডের মূল্য ও পেমেন্ট BDT-তেই থাকবে।',
      findingPlaces:'জায়গা খোঁজা হচ্ছে…',noPlaces:'এই শহরে কোনো জায়গা পাওয়া যায়নি।',
      placeCount:'টি জায়গা',selectPlace:'নির্বাচন করুন: ',hours:' ঘণ্টা',noPlans:'এখনো কোনো ভ্রমণ পরিকল্পনা সংরক্ষণ করা হয়নি।',
      selectFirst:'আগে অন্তত একটি জায়গা নির্বাচন করুন।',saved:'আপনার ভ্রমণ পরিকল্পনা সংরক্ষণ করা হয়েছে।',
      languageSaved:'ভাষার পছন্দ সংরক্ষণ করা হয়েছে।',languageLocal:'এই ভিজিটের জন্য ভাষা সংরক্ষণ করা হয়েছে। অ্যাকাউন্টে আপডেট করা যায়নি: ',
      currencyLocal:'এই ভিজিটের জন্য মুদ্রা সংরক্ষণ করা হয়েছে। অ্যাকাউন্টে আপডেট করা যায়নি: ',dateNotSet:'তারিখ নির্ধারিত নয়',savedTag:'সংরক্ষিত',
      sourceNote:'জায়গার বিবরণ মূল ভাষাতেই দেখানো হয়।'
    }
  };
  const t=key=>(translations[language]||translations.en)[key]||translations.en[key]||key;
  function applyLanguage(value){
    language=value==='bn'?'bn':'en';
    localStorage.setItem('drive_language',language);
    document.documentElement.lang=language;
    document.title=language==='bn'?'বাংলাদেশ ঘুরে দেখুন · DRIVE':'Explore Bangladesh · DRIVE';
    document.querySelectorAll('[data-i18n]').forEach(node=>{
      const translated=t(node.dataset.i18n);
      if(translated)node.textContent=translated;
    });
    if($('exploreLanguage'))$('exploreLanguage').value=language;
  }
  async function savePreference(field,value){
    if(!localStorage.getItem(DRIVE_TOKEN_KEY)&&!localStorage.getItem('drive_refresh_token'))return;
    try{await driveRequest('/users/me',{method:'PATCH',body:JSON.stringify({[field]:value})});}
    catch(error){return error;}
  }
  async function loadCurrencyPreference(){
    const select=$('exploreCurrency');
    const codes=['BDT','USD','EUR','GBP','INR','SGD','MYR','AED','SAR','AUD','CAD','CNY','JPY','THB','NPR','PKR'];
    let profile=null;
    if(localStorage.getItem(DRIVE_TOKEN_KEY)||localStorage.getItem('drive_refresh_token')){
      try{profile=await driveRequest('/users/me');}catch{}
    }
    applyLanguage(profile?.preferred_language||localStorage.getItem('drive_language')||'en');
    try{
      const [catalog,rates]=await Promise.all([driveRequest('/payments/currencies'),driveRequest('/payments/rates')]);
      const available=(catalog.currencies||codes).filter(code=>code==='BDT'||Number(rates.rates?.[code])>0);
      select.innerHTML=available.map(code=>'<option value="'+driveEscape(code)+'">'+driveEscape(code)+'</option>').join('');
      let preferred=profile?.preferred_currency||localStorage.getItem('drive_currency')||'BDT';
      if(!available.includes(preferred))preferred='BDT';
      select.value=preferred;localStorage.setItem('drive_currency',preferred);
      $('touristCurrencyNote').textContent=t('currencyNote')+preferred+t('ratesUpdated')+new Date(rates.fetchedAt).toLocaleString()+t('settled');
    }catch{
      select.innerHTML='<option value="BDT">BDT</option>';select.value='BDT';
      $('touristCurrencyNote').textContent=t('currencyFallback');
    }
  }
  $('exploreCurrency')?.addEventListener('change',async()=>{
    const currency=$('exploreCurrency').value;localStorage.setItem('drive_currency',currency);
    $('touristCurrencyNote').textContent=t('currencySet')+currency+t('currencyRemain');
    const error=await savePreference('preferred_currency',currency);
    if(error)$('touristCurrencyNote').textContent=t('currencyLocal')+error.message;
  });
  $('exploreLanguage')?.addEventListener('change',async()=>{
    applyLanguage($('exploreLanguage').value);
    await Promise.all([loadPlaces(),loadPlans()]);
    const error=await savePreference('preferred_language',language);
    if(error)$('touristCurrencyNote').textContent=t('languageLocal')+error.message;
    else $('touristCurrencyNote').textContent=t('languageSaved')+' '+t('sourceNote');
  });

  async function loadPlaces(){
    const city=$('exploreCity').value,interest=$('exploreInterest').value;
    const params=new URLSearchParams({city});if(interest)params.set('category',interest);
    $('placesGrid').innerHTML='<div class="empty-state">'+t('findingPlaces')+'</div>';
    try{
      places=await driveRequest('/tourist/places?'+params.toString());
      $('placeCount').textContent=places.length+t('placeCount');
      $('placesGrid').innerHTML=places.length?places.map(place=>'<label class="vehicle-card"><div class="vehicle-image">⌖</div><div class="vehicle-body"><div class="toolbar"><span class="pill">'+driveEscape(translations[language][String(place.category||'explore').toLowerCase()]||place.category||t('explore'))+'</span><input type="checkbox" class="place-select" value="'+driveEscape(place.id)+'" aria-label="'+driveEscape(t('selectPlace')+place.name)+'"></div><h3>'+driveEscape(place.name)+'</h3><p>'+driveEscape(place.description||'Explore this destination.')+'</p><p>'+driveEscape(place.city)+' · '+driveEscape(place.estimatedVisitHours||1)+driveEscape(t('hours'))+'</p></div></label>').join(''):'<div class="empty-state">'+t('noPlaces')+'</div>';
    }catch(error){$('placesGrid').innerHTML='<div class="empty-state">'+driveEscape(error.message)+'</div>';}
  }
  async function loadPlans(){
    if(!localStorage.getItem(DRIVE_TOKEN_KEY)&&!localStorage.getItem('drive_refresh_token')){
      $('savedPlans').innerHTML='<div class="empty-state">Log in to view and save your travel plans.</div>';
      return;
    }
    try{
      const plans=await driveRequest('/tourist/plans');
      $('savedPlans').innerHTML=plans.length?plans.map(p=>'<div class="list-item"><div class="list-item-main"><strong>'+driveEscape(p.city)+' · '+driveEscape(t(String(p.transport_preference||'').toLowerCase().replaceAll(' ','').replace('publictransport','publicTransport')))+'</strong><small>'+driveEscape((p.place_ids||[]).length)+' '+t('placeCount')+' · '+driveEscape(p.travel_date||t('dateNotSet'))+'</small></div><span class="pill">'+t('savedTag')+'</span></div>').join(''):'<div class="empty-state">'+t('noPlans')+'</div>';
    }catch(error){
      const message=/session|log in|invalid/i.test(error.message)?'Your session needs refreshing. Please log in again to view saved plans.':error.message;
      $('savedPlans').innerHTML='<div class="empty-state">'+driveEscape(message)+'</div>';
    }
  }
  async function syncExploreAccount(){
    const login=$('exploreLogin'),account=$('exploreAccount'),apply=$('driverPartnerApply'),prompt=$('driverPartnerPromptText');
    const hasSession=Boolean(localStorage.getItem(DRIVE_TOKEN_KEY)||localStorage.getItem('drive_refresh_token'));
    if(!hasSession){
      if(login)login.hidden=false;if(account)account.hidden=true;
      if(apply)apply.textContent='Sign in to apply →';
      if(prompt)prompt.textContent='Already use DRIVE as a customer? Sign in with the same account, then apply to become a driver. You can keep booking rides after approval.';
      return;
    }
    try{
      const user=await driveRequest('/users/me');
      if(login)login.hidden=true;if(account)account.hidden=false;
      if(apply&&prompt){
        if(user.role==='passenger'){
          apply.textContent='Apply to drive →';
          prompt.textContent='You are signed in as a customer. Apply with this same account; after approval you can both book rides and accept rides as a driver.';
        }else if(user.role==='driver'){
          apply.textContent='Open driver workspace →';
          prompt.textContent='Your driver access is active. You can continue using this account to book rides as a customer or open your driver workspace.';
        }else if(user.role==='vehicle_owner'){
          apply.textContent='Open driver application →';
          prompt.textContent='You are signed in with your owner account. Ride booking remains available; driver applications are currently submitted from Passenger accounts.';
        }else{
          apply.hidden=true;prompt.textContent='Manage the DRIVE platform from your administrator workspace.';
        }
      }
    }catch(error){
      if(login)login.hidden=false;if(account)account.hidden=true;
      if(apply)apply.textContent='Sign in to apply →';
      if(prompt)prompt.textContent='Your session could not be restored. Sign in again to apply for driver access and save travel plans.';
    }
  }
  $('exploreFilters').addEventListener('submit',event=>{event.preventDefault();loadPlaces();});
  $('savePlan').addEventListener('click',async()=>{
    if(!driveRequireAuth('explore.html'))return;
    const placeIds=[...document.querySelectorAll('.place-select:checked')].map(el=>el.value);
    if(!placeIds.length){$('planMessage').textContent=t('selectFirst');return;}
    const button=$('savePlan');button.disabled=true;
    try{
      const result=await driveRequest('/tourist/plans',{method:'POST',body:JSON.stringify({
        city:$('exploreCity').value,placeIds,travelDate:$('travelDate').value||undefined,
        transportPreference:$('transport').value
      })});
      $('planMessage').textContent=result.message||t('saved');$('planMessage').className='message success';loadPlans();
    }catch(error){$('planMessage').textContent=error.message;$('planMessage').className='message error';}
    finally{button.disabled=false;}
  });
  syncExploreAccount();loadCurrencyPreference();loadPlaces();loadPlans();
})();