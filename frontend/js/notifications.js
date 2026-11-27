(() => {
  if(!driveRequireAuth('notifications.html'))return;
  const $=id=>document.getElementById(id);
  async function load(){
    try{
      const result=await driveRequest('/notifications');
      const rows=result.items||[];
      $('notificationList').innerHTML=rows.length?rows.map(n=>'<article class="list-item"><div class="list-item-main"><strong>'+driveEscape(n.title)+'</strong><small>'+driveEscape(n.body)+' · '+driveDate(n.created_at)+'</small></div><div class="row-actions">'+(!n.read_at?'<span class="pill warning">New</span><button class="button-mini" data-read="'+driveEscape(n.id)+'">Mark read</button>':'<span class="pill">Read</span>')+'</div></article>').join(''):'<div class="empty-state">You are all caught up. New activity will appear here.</div>';
      $('notificationList').querySelectorAll('[data-read]').forEach(button=>button.addEventListener('click',async()=>{
        button.disabled=true;
        try{await driveRequest('/notifications/'+button.dataset.read+'/read',{method:'PATCH'});load();}
        catch(error){driveToast(error.message);button.disabled=false;}
      }));
    }catch(error){$('notificationList').innerHTML='<div class="empty-state">'+driveEscape(error.message)+'</div>';}
  }
  $('markAllRead').addEventListener('click',async()=>{
    try{await driveRequest('/notifications/read-all',{method:'PATCH'});driveToast('All notifications marked as read.');load();}
    catch(error){driveToast(error.message);}
  });
  $('logoutButton').addEventListener('click',()=>{driveClearSession();location.href='index.html';});
  load();
})();