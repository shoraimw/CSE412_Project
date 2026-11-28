(() => {
  function playArrivalSound(){
    try{
      const AudioContextClass=window.AudioContext||window.webkitAudioContext;
      if(!AudioContextClass)return;
      const context=new AudioContextClass();
      const start=()=>[784,988,1175].forEach((frequency,index)=>{
        const oscillator=context.createOscillator(),gain=context.createGain(),at=context.currentTime+index*0.16;
        oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency,at);
        gain.gain.setValueAtTime(0.0001,at);gain.gain.exponentialRampToValueAtTime(0.16,at+0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001,at+0.14);
        oscillator.connect(gain);gain.connect(context.destination);
        oscillator.start(at);oscillator.stop(at+0.15);
      });
      if(context.state==='suspended')context.resume().then(start).catch(()=>{});
      else start();
      setTimeout(()=>context.close().catch(()=>{}),900);
    }catch{}
  }
  window.driveArrivalNotice=function(rideId,audience='passenger'){
    if(!rideId)return;
    const role=audience==='driver'?'driver':'passenger';
    const key='drive_arrival_notice_'+role+'_'+rideId;
    try{if(localStorage.getItem(key))return;localStorage.setItem(key,'1');}catch{}
    let dialog=document.getElementById('driveArrivalDialog');
    if(!dialog){
      dialog=document.createElement('dialog');dialog.id='driveArrivalDialog';dialog.className='drive-arrival-dialog';
      document.body.appendChild(dialog);
    }
    const message=role==='driver'?'Your trip has been completed successfully. Thank you for driving with DRIVE.':'Your journey has been completed successfully. Thank you for riding with DRIVE.';
    dialog.innerHTML='<div class="arrival-check">✓</div><p class="eyebrow">DRIVE · TRIP COMPLETE</p><h2>Destination reached!</h2><p>'+message+'</p><button type="button" class="button button-dark" id="arrivalClose">Got it</button>';
    if(typeof dialog.showModal==='function')dialog.showModal();
    else dialog.setAttribute('open','');
    dialog.querySelector('#arrivalClose').addEventListener('click',()=>{dialog.close?.();window.dispatchEvent(new CustomEvent('drive:arrival-dismissed',{detail:{rideId}}));});
    playArrivalSound();
  };
})();
