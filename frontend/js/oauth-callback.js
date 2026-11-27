(() => {
  const $=id=>document.getElementById(id);
  async function finish(){
    const query=new URLSearchParams(location.search);
    if(query.get('error_description')||query.get('error')){
      throw new Error(query.get('error_description')||query.get('error'));
    }
    if(!window.supabase?.createClient)throw new Error('Google sign-in library could not be loaded.');
    const config=await driveRequest('/auth/config');
    const client=window.supabase.createClient(config.url,config.anonKey,{
      auth:{persistSession:true,autoRefreshToken:false,detectSessionInUrl:true,flowType:'pkce'}
    });
    const {data,error}=await client.auth.getSession();
    if(error||!data.session)throw new Error(error?.message||'No valid Google session was returned. Please try again.');
    const payload=await driveRequest('/auth/oauth-session',{
      method:'POST',
      body:JSON.stringify({accessToken:data.session.access_token,refreshToken:data.session.refresh_token})
    });
    driveStoreSession(payload);
    await client.auth.signOut({scope:'local'}).catch(()=>{});
    $('oauthStatus').textContent='Your account is verified. Opening your DRIVE workspace…';
    $('oauthMessage').textContent='Sign-in successful.';
    $('oauthMessage').className='message success';
    location.replace(driveRoleHome(payload.user?.role));
  }
  finish().catch(error=>{
    $('oauthStatus').textContent='Google sign-in could not be completed.';
    $('oauthMessage').textContent=error.message;
    $('oauthMessage').className='message error';
    $('oauthBack').hidden=false;
  });
})();