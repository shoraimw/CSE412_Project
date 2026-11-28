(() => {
  const dialog=document.getElementById('rideChatDialog');
  if(!dialog)return;
  const $=id=>document.getElementById(id);
  let rideId=null,pollTimer=null,loading=false,lastMessageCount=0;
  function render(messages){
    const box=$('rideChatMessages');
    const shouldScroll=box.scrollHeight-box.scrollTop-box.clientHeight<90;
    box.innerHTML=messages.length?messages.map(message=>{
      const sender=message.profiles?.full_name||'DRIVE user';
      return '<div class="chat-message"><strong>'+driveEscape(sender)+'</strong><p>'+driveEscape(message.body)+'</p><small>'+driveDate(message.created_at)+'</small></div>';
    }).join(''):'<div class="empty-state">No messages yet. Say hello to your ride partner.</div>';
    if(shouldScroll||messages.length!==lastMessageCount)box.scrollTop=box.scrollHeight;
    lastMessageCount=messages.length;
  }
  async function refresh(){
    if(!rideId||loading)return;
    loading=true;
    try{
      const result=await driveRequest('/rides/'+encodeURIComponent(rideId)+'/messages');
      render(result.messages||[]);
      const closed=['completed','cancelled'].includes(result.status);
      $('rideChatText').disabled=closed;
      $('rideChatSend').disabled=closed;
      $('rideChatText').placeholder=closed?'This ride has ended. Chat is read-only.':'Write a message…';
      $('rideChatStatus').textContent=closed?'Chat closed':'Live ride chat';
      if(closed&&pollTimer){clearInterval(pollTimer);pollTimer=null;}
    }catch(error){
      $('rideChatMessages').innerHTML='<div class="empty-state">'+driveEscape(error.message)+'</div>';
    }finally{loading=false;}
  }
  function open(id){
    rideId=id;lastMessageCount=0;$('rideChatMessages').innerHTML='<div class="empty-state">Loading conversation…</div>';
    $('rideChatText').value='';$('rideChatText').disabled=false;$('rideChatSend').disabled=false;
    if(!dialog.open)dialog.showModal();
    refresh();
    if(pollTimer)clearInterval(pollTimer);
    pollTimer=setInterval(refresh,2500);
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-chat-ride]');
    if(button){event.preventDefault();open(button.dataset.chatRide);}
  });
  $('rideChatForm')?.addEventListener('submit',async event=>{
    event.preventDefault();
    const body=$('rideChatText').value.trim();
    if(!body||!rideId)return;
    const button=$('rideChatSend');button.disabled=true;
    try{
      await driveRequest('/rides/'+encodeURIComponent(rideId)+'/messages',{method:'POST',body:JSON.stringify({body})});
      $('rideChatText').value='';await refresh();
    }catch(error){driveToast(error.message);}
    finally{button.disabled=false;}
  });
  $('closeRideChat')?.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>{if(pollTimer){clearInterval(pollTimer);pollTimer=null;}rideId=null;});
  window.DriveRideChat={open};
})();
