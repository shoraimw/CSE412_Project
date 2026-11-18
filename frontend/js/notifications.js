const $=id=>document.getElementById(id);
if(!localStorage.getItem(DRIVE_TOKEN_KEY))location.replace('login.html');
let loading=false;
async function load(){
  if(loading)return;
  loading=true;
  try{
    const result=await driveRequest('/notifications');
    $('noticeStatus').textContent=result.unreadCount+' unread notification(s).';
    const list=$('noticeList');
    list.replaceChildren();
    if(!result.items.length){
      list.textContent='You have no notifications yet.';
      return;
    }
    result.items.forEach(n=>{
      const card=document.createElement('article');
      card.className='notice-card'+(n.read_at?'':' unread');
      const title=document.createElement('strong');
      title.textContent=n.title;
      const body=document.createElement('p');
      body.textContent=n.body;
      const meta=document.createElement('small');
      meta.textContent=n.type+' · '+new Date(n.created_at).toLocaleString();
      card.append(title,body,meta);
      if(!n.read_at){
        const button=document.createElement('button');
        button.textContent='Mark as read';
        button.addEventListener('click',async()=>{
          button.disabled=true;
          try{
            await driveRequest('/notifications/'+encodeURIComponent(n.id)+'/read',{method:'PATCH'});
            await load();
          }catch(error){
            button.disabled=false;
            $('noticeStatus').textContent=error.message;
          }
        });
        card.append(button);
      }
      list.append(card);
    });
  }catch(error){
    $('noticeStatus').textContent=error.message;
  }finally{
    loading=false;
  }
}
$('markAll').addEventListener('click',async()=>{
  const button=$('markAll');
  button.disabled=true;
  try{
    await driveRequest('/notifications/read-all',{method:'PATCH'});
    await load();
  }catch(error){
    $('noticeStatus').textContent=error.message;
  }finally{
    button.disabled=false;
  }
});
load();
setInterval(load,10000);
window.addEventListener('focus',load);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
