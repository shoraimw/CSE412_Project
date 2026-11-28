(() => {
  const $ = id => document.getElementById(id);
  let allPlaces = [];
  let visiblePlaces = [];
  let language = 'en';
  let selectedRidePlace = null;
  let pickupPoint = null;

  const translations = {
    en: {
      eyebrow:'EXPLORE BANGLADESH',title:'Find somewhere worth going.',
      subtitle:'Discover historic landmarks, natural escapes, beaches and local experiences — then request a DRIVE ride to get there.',
      city:'City / destination',interest:'Category',searchPlaces:'Search places',travelDate:'Travel date',
      transport:'Transport preference',publicTransport:'Public Transport',car:'Car',bike:'Bike',walking:'Walking',
      history:'History',nature:'Nature',beach:'Beach',culture:'Culture',adventure:'Adventure',wildlife:'Wildlife',
      touristCurrency:'Display currency',language:'Language',findPlaces:'Find places',placesTitle:'Places to explore',
      savedPlans:'Your saved plans',saveSelected:'Save selected places',loginToSeePlans:'Log in to view saved plans.',
      findingPlaces:'Finding destinations…',noPlaces:'No destinations match these filters.',
      placeCount:' destinations',selectPlace:'Select ',hours:' hour(s)',noPlans:'No saved travel plans yet.',
      selectFirst:'Select at least one place first.',saved:'Your travel plan was saved.',
      currencyNote:'Display currency: ',ratesUpdated:' · Rates updated ',settled:' · Ride fares and payments are settled in BDT.',
      currencyFallback:'Live exchange rates are unavailable. Ride fares remain in BDT.',
      currencySet:'Display currency set to ',currencyRemain:' · Ride fares and payments remain in BDT.',
      languageSaved:'Language preference saved.',languageLocal:'Language saved for this visit. Account preference could not be updated: ',
      currencyLocal:'Saved for this visit. Account preference could not be updated: ',dateNotSet:'Date not set',savedTag:'Saved',
      allBangladesh:'All Bangladesh',allCategories:'All categories',searchPlaceholder:'Search a place or area…',
      details:'View details',getRide:'Get a ride',noAddress:'Location details not added yet.',
      oneCity:'A saved travel plan can include places in one city. Filter to a city or select places from the same city.',
      rideCreated:'Your ride request has been created. Nearby eligible drivers can now see it in their Driver workspace.',
      loginRequired:'Please sign in to request a ride.',pickupRequired:'Enter a pickup location or use your current location.',
      locationUnavailable:'Location access is unavailable. Enter your pickup address manually.',
      locationDenied:'Location permission was not granted. Enter your pickup address manually.',
      rideFailed:'Your ride request could not be created: '
    },
    bn: {
      eyebrow:'বাংলাদেশ ঘুরে দেখুন',title:'ঘুরে দেখার মতো জায়গা খুঁজুন।',
      subtitle:'ঐতিহাসিক স্থান, প্রকৃতি, সমুদ্রসৈকত ও স্থানীয় দর্শনীয় স্থান খুঁজুন — তারপর DRIVE দিয়ে সেখানে যাওয়ার রাইড চান।',
      city:'শহর / গন্তব্য',interest:'ক্যাটাগরি',searchPlaces:'জায়গা খুঁজুন',travelDate:'ভ্রমণের তারিখ',
      transport:'যাতায়াতের ধরন',publicTransport:'গণপরিবহন',car:'গাড়ি',bike:'বাইক',walking:'হেঁটে',
      history:'ইতিহাস',nature:'প্রকৃতি',beach:'সমুদ্রসৈকত',culture:'সংস্কৃতি',adventure:'অ্যাডভেঞ্চার',wildlife:'বন্যপ্রাণী',
      touristCurrency:'প্রদর্শনের মুদ্রা',language:'ভাষা',findPlaces:'জায়গা খুঁজুন',placesTitle:'ঘুরে দেখার জায়গা',
      savedPlans:'আপনার সংরক্ষিত পরিকল্পনা',saveSelected:'নির্বাচিত জায়গা সংরক্ষণ করুন',loginToSeePlans:'সংরক্ষিত পরিকল্পনা দেখতে লগইন করুন।',
      findingPlaces:'গন্তব্য খোঁজা হচ্ছে…',noPlaces:'এই ফিল্টারে কোনো গন্তব্য পাওয়া যায়নি।',
      placeCount:'টি গন্তব্য',selectPlace:'নির্বাচন করুন: ',hours:' ঘণ্টা',noPlans:'এখনো কোনো ভ্রমণ পরিকল্পনা সংরক্ষণ করা হয়নি।',
      selectFirst:'আগে অন্তত একটি জায়গা নির্বাচন করুন।',saved:'আপনার ভ্রমণ পরিকল্পনা সংরক্ষণ করা হয়েছে।',
      currencyNote:'প্রদর্শনের মুদ্রা: ',ratesUpdated:' · বিনিময় হার হালনাগাদ ',settled:' · রাইডের মূল্য ও পেমেন্ট BDT-তে হবে।',
      currencyFallback:'লাইভ বিনিময় হার পাওয়া যাচ্ছে না। রাইডের মূল্য BDT-তেই থাকবে।',
      currencySet:'প্রদর্শনের মুদ্রা নির্ধারণ করা হয়েছে: ',currencyRemain:' · রাইডের মূল্য ও পেমেন্ট BDT-তেই থাকবে।',
      languageSaved:'ভাষার পছন্দ সংরক্ষণ করা হয়েছে।',languageLocal:'এই ভিজিটের জন্য ভাষা সংরক্ষণ করা হয়েছে। অ্যাকাউন্টে আপডেট করা যায়নি: ',
      currencyLocal:'এই ভিজিটের জন্য মুদ্রা সংরক্ষণ করা হয়েছে। অ্যাকাউন্টে আপডেট করা যায়নি: ',dateNotSet:'তারিখ নির্ধারিত নয়',savedTag:'সংরক্ষিত',
      allBangladesh:'সারা বাংলাদেশ',allCategories:'সব ক্যাটাগরি',searchPlaceholder:'জায়গা বা এলাকা খুঁজুন…',
      details:'বিস্তারিত দেখুন',getRide:'রাইড নিন',noAddress:'এখনো অবস্থানের বিস্তারিত যোগ করা হয়নি।',
      oneCity:'একটি ভ্রমণ পরিকল্পনায় একই শহরের জায়গা রাখা যাবে। একটি শহর বেছে নিন অথবা একই শহরের জায়গা নির্বাচন করুন।',
      rideCreated:'আপনার রাইড রিকোয়েস্ট তৈরি হয়েছে। কাছাকাছি যোগ্য ড্রাইভাররা Driver workspace-এ এটি দেখতে পারবেন।',
      loginRequired:'রাইড রিকোয়েস্ট করতে আগে লগইন করুন।',pickupRequired:'পিকআপ লোকেশন লিখুন অথবা বর্তমান লোকেশন ব্যবহার করুন।',
      locationUnavailable:'লোকেশন সুবিধা পাওয়া যাচ্ছে না। পিকআপ ঠিকানা লিখুন।',
      locationDenied:'লোকেশন ব্যবহারের অনুমতি পাওয়া যায়নি। পিকআপ ঠিকানা লিখুন।',
      rideFailed:'রাইড রিকোয়েস্ট তৈরি করা যায়নি: '
    }
  };
  const t = key => (translations[language] || translations.en)[key] || translations.en[key] || key;
  const categories = {
    history:'History',nature:'Nature',beach:'Beach',culture:'Culture',adventure:'Adventure',wildlife:'Wildlife'
  };
  const CURRENCIES = ['BDT','USD','EUR','GBP','INR','SGD','MYR','AED','SAR','AUD','CAD','CNY','JPY','THB','NPR','PKR'];

  function categoryLabel(value) {
    const key = String(value || '').toLowerCase();
    return t(key) !== key ? t(key) : (value || 'Explore');
  }
  function applyLanguage(value) {
    language = value === 'bn' ? 'bn' : 'en';
    localStorage.setItem('drive_language', language);
    document.documentElement.lang = language;
    document.title = language === 'bn' ? 'বাংলাদেশ ঘুরে দেখুন · DRIVE' : 'Explore Bangladesh · DRIVE';
    document.querySelectorAll('[data-i18n]').forEach(node => {
      const translated = t(node.dataset.i18n);
      if (translated) node.textContent = translated;
    });
    if ($('exploreLanguage')) $('exploreLanguage').value = language;
    if ($('placeSearch')) $('placeSearch').placeholder = t('searchPlaceholder');
    if ($('exploreCity')?.options?.length) $('exploreCity').options[0].textContent = t('allBangladesh');
    if ($('exploreInterest')?.options?.length) $('exploreInterest').options[0].textContent = t('allCategories');
  }
  function hasAppSession() {
    return Boolean(localStorage.getItem(DRIVE_TOKEN_KEY) || localStorage.getItem('drive_refresh_token'));
  }
  async function savePreference(field, value) {
    if (!hasAppSession()) return null;
    try { await driveRequest('/users/me', { method:'PATCH', body:JSON.stringify({ [field]:value }) }); return null; }
    catch (error) { return error; }
  }

  async function loadCurrencyPreference(profile) {
    const select = $('exploreCurrency');
    try {
      const [catalog, rates] = await Promise.all([
        driveRequest('/payments/currencies'),
        driveRequest('/payments/rates')
      ]);
      const available = (catalog.currencies || CURRENCIES).filter(code => code === 'BDT' || Number(rates.rates?.[code]) > 0);
      select.innerHTML = available.map(code => '<option value="'+driveEscape(code)+'">'+driveEscape(code)+'</option>').join('');
      let preferred = profile?.preferred_currency || localStorage.getItem('drive_currency') || 'BDT';
      if (!available.includes(preferred)) preferred = 'BDT';
      select.value = preferred;
      localStorage.setItem('drive_currency', preferred);
      $('touristCurrencyNote').textContent = t('currencyNote') + preferred +
        (rates.fetchedAt ? t('ratesUpdated') + new Date(rates.fetchedAt).toLocaleString() : '') + t('settled');
    } catch {
      select.innerHTML = '<option value="BDT">BDT</option>';
      select.value = 'BDT';
      $('touristCurrencyNote').textContent = t('currencyFallback');
    }
  }

  async function syncExploreAccount() {
    const login = $('exploreLogin'), account = $('exploreAccount');
    const apply = $('driverPartnerApply'), prompt = $('driverPartnerPromptText'), title = $('driverPartnerTitle');
    if (!hasAppSession()) {
      if (login) login.hidden = false;
      if (account) account.hidden = true;
      if (apply) { apply.textContent = 'Sign in to apply →'; apply.href = 'login.html?next=explore.html'; }
      if (title) title.textContent = 'Explore as a customer. Drive when you are ready.';
      if (prompt) prompt.textContent = 'Already use DRIVE as a customer? Sign in with the same account, then apply to become a driver. You can keep booking rides after approval.';
      return null;
    }
    try {
      const user = await driveRequest('/users/me');
      if (login) login.hidden = true;
      if (account) account.hidden = false;
      if (apply && prompt) {
        if (user.role === 'passenger') {
          apply.textContent = 'Apply to drive →'; apply.href = 'driver.html';
          if (title) title.textContent = 'Explore as a customer. Drive when you are ready.';
          prompt.textContent = 'You are signed in as a customer. Apply with this same account; after approval you can both book rides and accept rides as a driver.';
        } else if (user.role === 'driver') {
          apply.textContent = 'Open driver workspace →'; apply.href = 'driver.html';
          if (title) title.textContent = 'Your Driver Partner access is active.';
          prompt.textContent = 'You can keep booking rides as a customer, or switch to your Driver workspace to accept nearby requests.';
        } else if (user.role === 'vehicle_owner') {
          apply.textContent = 'Open account →'; apply.href = 'dashboard.html';
          if (title) title.textContent = 'Explore destinations and request a ride.';
          prompt.textContent = 'Your owner account can also use DRIVE to book rides. Driver applications are currently submitted from Passenger accounts.';
        } else {
          $('driverPartnerPrompt').hidden = true;
        }
      }
      return user;
    } catch {
      if (login) login.hidden = false;
      if (account) account.hidden = true;
      if (apply) { apply.textContent = 'Sign in to apply →'; apply.href = 'login.html?next=explore.html'; }
      if (prompt) prompt.textContent = 'Your session could not be restored. Sign in again to apply for driver access and save travel plans.';
      return null;
    }
  }

  function renderFilters() {
    const city = $('exploreCity'), category = $('exploreInterest');
    const oldCity = city.value || 'All Bangladesh', oldCategory = category.value || '';
    const cities = [...new Set(allPlaces.map(place => place.city).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const groups = [...new Set(allPlaces.map(place => place.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    city.innerHTML = '<option value="All Bangladesh">'+driveEscape(t('allBangladesh'))+'</option>' +
      cities.map(value => '<option value="'+driveEscape(value)+'">'+driveEscape(value)+'</option>').join('');
    category.innerHTML = '<option value="">'+driveEscape(t('allCategories'))+'</option>' +
      groups.map(value => '<option value="'+driveEscape(value)+'">'+driveEscape(categoryLabel(value))+'</option>').join('');
    city.value = cities.includes(oldCity) ? oldCity : 'All Bangladesh';
    category.value = groups.includes(oldCategory) ? oldCategory : '';
  }

  function renderPlaceCards() {
    $('placeCount').textContent = visiblePlaces.length + t('placeCount');
    $('placesGrid').innerHTML = visiblePlaces.length ? visiblePlaces.map(place => {
      const image = place.imageUrl
        ? '<img src="'+driveEscape(place.imageUrl)+'" alt="'+driveEscape(place.imageAlt||place.name)+'" loading="lazy" onerror="this.parentNode.classList.add(\'image-missing\');this.remove()">'
        : '<div class="explore-image-placeholder"><span>DRIVE · BANGLADESH</span></div>';
      return `
        <article class="explore-place-card">
          <button class="explore-place-image" type="button" data-place-details="${driveEscape(place.id)}" aria-label="${driveEscape(t('details')+' '+place.name)}">${image}</button>
          <div class="explore-place-body">
            <div class="toolbar explore-place-meta">
              <span class="pill">${driveEscape(categoryLabel(place.category))}</span>
              <label class="explore-save-check"><input type="checkbox" class="place-select" value="${driveEscape(place.id)}" aria-label="${driveEscape(t('selectPlace')+place.name)}"> Save</label>
            </div>
            <h3>${driveEscape(place.name)}</h3>
            <p class="explore-place-description">${driveEscape(place.description||'Explore this destination in Bangladesh.')}</p>
            <p class="explore-place-location">${driveEscape(place.city)} · ${driveEscape(place.estimatedVisitHours||1)}${driveEscape(t('hours'))}</p>
            <div class="explore-place-actions">
              <button class="button button-outline button-small" type="button" data-place-details="${driveEscape(place.id)}">${driveEscape(t('details'))}</button>
              <button class="button button-dark button-small" type="button" data-place-ride="${driveEscape(place.id)}">${driveEscape(t('getRide'))} →</button>
            </div>
          </div>
        </article>`;
    }).join('') : '<div class="empty-state">'+driveEscape(t('noPlaces'))+'</div>';

    $('placesGrid').querySelectorAll('[data-place-details]').forEach(button => button.addEventListener('click', () => {
      const place = allPlaces.find(item => String(item.id) === button.dataset.placeDetails);
      if (place) showPlaceDetails(place);
    }));
    $('placesGrid').querySelectorAll('[data-place-ride]').forEach(button => button.addEventListener('click', () => {
      const place = allPlaces.find(item => String(item.id) === button.dataset.placeRide);
      if (place) openRideDialog(place);
    }));
  }

  async function loadPlaces() {
    $('placesGrid').innerHTML = '<div class="empty-state">'+driveEscape(t('findingPlaces'))+'</div>';
    try {
      if (!allPlaces.length) allPlaces = await driveRequest('/tourist/places');
      renderFilters();
      const city = $('exploreCity').value, category = $('exploreInterest').value;
      const search = $('placeSearch').value.trim().toLowerCase();
      visiblePlaces = allPlaces.filter(place =>
        (city === 'All Bangladesh' || place.city === city) &&
        (!category || place.category === category) &&
        (!search || [place.name,place.city,place.category,place.description,place.address,(place.tags||[]).join(' ')].join(' ').toLowerCase().includes(search))
      );
      renderPlaceCards();
      $('placeIntro').textContent = city === 'All Bangladesh'
        ? 'Browse destinations available across Bangladesh.'
        : 'Explore destinations in '+city+'.';
    } catch (error) {
      $('placesGrid').innerHTML = '<div class="empty-state">'+driveEscape(error.message)+'</div>';
    }
  }

  function showPlaceDetails(place) {
    const image = place.imageUrl
      ? '<img class="explore-details-image" src="'+driveEscape(place.imageUrl)+'" alt="'+driveEscape(place.imageAlt||place.name)+'">'
      : '<div class="explore-details-image explore-image-placeholder">DRIVE · BANGLADESH</div>';
    const credit = place.imageCredit
      ? '<p class="muted small explore-image-credit">Image: '+driveEscape(place.imageCredit)+(place.imageSourceUrl?' · <a href="'+driveEscape(place.imageSourceUrl)+'" target="_blank" rel="noopener">Source / licence</a>':'')+'</p>'
      : '';
    $('placeDetailsContent').innerHTML = image + `
      <div class="explore-details-copy">
        <span class="pill">${driveEscape(categoryLabel(place.category))}</span>
        <h2>${driveEscape(place.name)}</h2>
        <p class="explore-details-location">${driveEscape(place.address||place.city||t('noAddress'))}</p>
        <p>${driveEscape(place.description||'')}</p>
        <p class="muted small">Estimated visit: ${driveEscape(place.estimatedVisitHours||1)} hour(s)</p>
        ${place.nearbyFacilities?.length?'<p class="muted small">Nearby facilities: '+driveEscape(place.nearbyFacilities.join(', '))+'</p>':''}
        ${place.tags?.length?'<p class="muted small">Tags: '+driveEscape(place.tags.join(', '))+'</p>':''}
        ${credit}
        <button class="button button-dark button-block" type="button" id="detailsGetRide">${driveEscape(t('getRide'))} →</button>
      </div>`;
    $('detailsGetRide').addEventListener('click', () => {
      $('placeDetailsDialog').close();
      openRideDialog(place);
    });
    $('placeDetailsDialog').showModal();
  }

  function openRideDialog(place) {
    selectedRidePlace = place;
    pickupPoint = null;
    $('ridePickupAddress').value = '';
    $('rideDestinationSummary').innerHTML = '<strong>'+driveEscape(place.name)+'</strong><span>'+driveEscape(place.address||place.city)+'</span>';
    $('exploreRideMessage').textContent = '';
    const button = $('submitExploreRide');
    button.type = 'submit';button.disabled = false;button.textContent = 'Request ride';button.onclick = null;
    $('exploreRideDialog').showModal();
  }

  function photonLabel(properties) {
    const values = [properties.name,properties.street,properties.district,properties.city||properties.locality,properties.state,properties.country]
      .map(value=>String(value||'').trim()).filter(Boolean);
    return values.filter((value,index)=>values.indexOf(value)===index).slice(0,4).join(', ') || 'Current location';
  }
  async function reverseGeocode(lat,lng) {
    try {
      const params = new URLSearchParams({lat:String(lat),lon:String(lng),lang:'en'});
      const response = await fetch('https://photon.komoot.io/reverse?'+params.toString(),{signal:AbortSignal.timeout(8000)});
      if (!response.ok) throw new Error('Reverse geocoding unavailable');
      const data = await response.json();
      const properties = data.features?.[0]?.properties;
      return properties ? photonLabel(properties) : lat.toFixed(5)+', '+lng.toFixed(5);
    } catch {
      return lat.toFixed(5)+', '+lng.toFixed(5);
    }
  }

  $('useCurrentLocation').addEventListener('click', () => {
    const button = $('useCurrentLocation');
    if (!navigator.geolocation) {
      $('exploreRideMessage').textContent = t('locationUnavailable');return;
    }
    button.disabled = true;button.textContent = 'Finding your location…';
    navigator.geolocation.getCurrentPosition(async position => {
      const lat = position.coords.latitude, lng = position.coords.longitude;
      pickupPoint = {lat,lng};
      $('ridePickupAddress').value = await reverseGeocode(lat,lng);
      $('exploreRideMessage').textContent = 'Pickup location selected.';
      button.disabled = false;button.textContent = 'Use my current location';
    }, error => {
      pickupPoint = null;
      $('exploreRideMessage').textContent = error.code === 1 ? t('locationDenied') : t('locationUnavailable');
      button.disabled = false;button.textContent = 'Use my current location';
    }, {enableHighAccuracy:true,timeout:12000,maximumAge:60000});
  });
  $('ridePickupAddress').addEventListener('input', () => { pickupPoint = null; });

  $('exploreRideForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!selectedRidePlace) return;
    const place = selectedRidePlace;
    if (!driveRequireAuth('explore.html?ridePlace='+encodeURIComponent(place.id))) {
      $('exploreRideMessage').textContent = t('loginRequired');return;
    }
    const pickupAddress = $('ridePickupAddress').value.trim();
    if (!pickupAddress) { $('exploreRideMessage').textContent = t('pickupRequired');return; }
    const button = $('submitExploreRide');
    button.disabled = true;button.textContent = 'Sending request…';
    $('exploreRideMessage').textContent = 'Creating your ride request…';
    const payload = {
      pickupAddress,
      destinationAddress: [place.name,place.address||place.city].filter(Boolean).join(', '),
      vehicleType: $('rideVehicleType').value,
      notes: 'Requested from Explore destination: '+place.name
    };
    if (pickupPoint) { payload.pickupLat = pickupPoint.lat;payload.pickupLng = pickupPoint.lng; }
    if (Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng))) {
      payload.destinationLat = Number(place.lat);payload.destinationLng = Number(place.lng);
    }
    try {
      await driveRequest('/rides',{method:'POST',body:JSON.stringify(payload)});
      $('exploreRideMessage').textContent = t('rideCreated');
      $('exploreRideMessage').className = 'message success';
      button.type = 'button';button.disabled = false;button.textContent = 'Open My trips →';
      button.onclick = () => { location.href = 'dashboard.html'; };
      driveToast('Ride request created.');
    } catch (error) {
      $('exploreRideMessage').textContent = t('rideFailed')+(error.message||'Please try again.');
      $('exploreRideMessage').className = 'message error';
      button.disabled = false;button.textContent = 'Request ride';
    }
  });

  async function loadPlans() {
    if (!hasAppSession()) {
      $('savedPlans').innerHTML = '<div class="empty-state">'+driveEscape(t('loginToSeePlans'))+'</div>';
      return;
    }
    try {
      const plans = await driveRequest('/tourist/plans');
      $('savedPlans').innerHTML = plans.length ? plans.map(plan => `
        <div class="list-item">
          <div class="list-item-main"><strong>${driveEscape(plan.city)} · ${driveEscape(plan.transport_preference||'Car')}</strong>
          <small>${driveEscape((plan.place_ids||[]).length)}${driveEscape(t('placeCount'))} · ${driveEscape(plan.travel_date||t('dateNotSet'))}</small></div>
          <span class="pill">${driveEscape(t('savedTag'))}</span>
        </div>`).join('') : '<div class="empty-state">'+driveEscape(t('noPlans'))+'</div>';
    } catch (error) {
      $('savedPlans').innerHTML = '<div class="empty-state">'+driveEscape(error.message)+'</div>';
    }
  }

  $('savePlan').addEventListener('click', async () => {
    if (!driveRequireAuth('explore.html')) return;
    const ids = [...document.querySelectorAll('.place-select:checked')].map(input=>input.value);
    if (!ids.length) { $('planMessage').textContent=t('selectFirst');return; }
    const selected = ids.map(id=>allPlaces.find(place=>String(place.id)===String(id))).filter(Boolean);
    const cities = [...new Set(selected.map(place=>place.city))];
    if (cities.length !== 1) { $('planMessage').textContent=t('oneCity');$('planMessage').className='message error';return; }
    const button = $('savePlan');button.disabled = true;
    try {
      await driveRequest('/tourist/plans',{method:'POST',body:JSON.stringify({
        city:cities[0],placeIds:ids,travelDate:$('travelDate').value||undefined,
        transportPreference:$('transport').value
      })});
      $('planMessage').textContent=t('saved');$('planMessage').className='message success';
      document.querySelectorAll('.place-select:checked').forEach(input=>{input.checked=false;});
      await loadPlans();
    } catch (error) {
      $('planMessage').textContent=error.message;$('planMessage').className='message error';
    } finally { button.disabled=false; }
  });

  $('exploreCurrency').addEventListener('change', async () => {
    const currency = $('exploreCurrency').value;
    localStorage.setItem('drive_currency',currency);
    $('touristCurrencyNote').textContent = t('currencySet')+currency+t('currencyRemain');
    const error = await savePreference('preferred_currency',currency);
    if (error) $('touristCurrencyNote').textContent = t('currencyLocal')+error.message;
  });
  $('exploreLanguage').addEventListener('change', async () => {
    applyLanguage($('exploreLanguage').value);
    await Promise.all([loadPlaces(),loadPlans()]);
    const error = await savePreference('preferred_language',language);
    if (error) $('touristCurrencyNote').textContent = t('languageLocal')+error.message;
    else $('touristCurrencyNote').textContent = t('languageSaved');
  });
  $('exploreFilters').addEventListener('submit', event => { event.preventDefault();loadPlaces(); });
  $('exploreCity').addEventListener('change', loadPlaces);
  $('exploreInterest').addEventListener('change', loadPlaces);
  $('placeSearch').addEventListener('input', loadPlaces);
  $('closePlaceDetails').addEventListener('click', () => $('placeDetailsDialog').close());
  $('closeExploreRide').addEventListener('click', () => $('exploreRideDialog').close());
  $('placeDetailsDialog').addEventListener('click', event => { if (event.target === $('placeDetailsDialog')) $('placeDetailsDialog').close(); });
  $('exploreRideDialog').addEventListener('click', event => { if (event.target === $('exploreRideDialog')) $('exploreRideDialog').close(); });

  async function init() {
    const user = await syncExploreAccount();
    applyLanguage(user?.preferred_language || localStorage.getItem('drive_language') || 'en');
    await Promise.all([loadCurrencyPreference(user),loadPlaces(),loadPlans()]);
    const requestedPlace = new URLSearchParams(location.search).get('ridePlace');
    if (requestedPlace) {
      const place = allPlaces.find(item=>String(item.id)===requestedPlace);
      if (place) openRideDialog(place);
    }
  }
  init();
})();
