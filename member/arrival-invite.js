// The token remains in the URL fragment (never sent as a referrer).
export async function showArrivalInvitation({request,user,firebase,openAccount}) {
  const token=new URLSearchParams(location.hash.slice(1)).get('arrival-invite');
  if(!token||document.querySelector('[data-arrival-invite]'))return false;
  const dialog=document.createElement('dialog');dialog.dataset.arrivalInvite='';dialog.className='member-account-card';
  dialog.innerHTML='<h2>Připojit účast z brány</h2><p data-invite-copy></p><p role="status"></p><button type="button" data-invite-action>Pokračovat</button> <button type="button" data-invite-close>Později</button>';
  document.body.append(dialog);dialog.showModal();
  const copy=dialog.querySelector('[data-invite-copy]'),status=dialog.querySelector('[role=status]'),button=dialog.querySelector('[data-invite-action]');let preview=null;
  const close=()=>{dialog.close();dialog.remove()};dialog.querySelector('[data-invite-close]').onclick=close;dialog.oncancel=close;
  async function load(){
    if(!user.emailVerified){copy.textContent='Přihlášení nestačí. Nejprve ověř vlastnictví e-mailu '+user.email+'.';button.textContent='Poslat ověřovací e-mail';return}
    const result=await request('/api/arrivals/claim',{method:'POST',body:{token,preview:true}});preview=result.preview;
    copy.textContent=(result.alreadyLinked?'Účast už je propojená. ':'')+preview.model+' · '+preview.eventId+'. Účet ani newsletter se tím nemění.';button.textContent=result.alreadyLinked?'Doplnit profil z účasti':'Propojit moji účast';preview.alreadyLinked=result.alreadyLinked;
  }
  button.onclick=async()=>{button.disabled=true;try{
    if(!user.emailVerified){await firebase.sendEmailVerification(user);status.textContent='Otevři ověřovací e-mail a potom znovu tento odkaz. Další e-mail neposíláme automaticky.';return}
    if(!preview)await load();if(!preview.alreadyLinked)await request('/api/arrivals/claim',{method:'POST',body:{token}});
    openAccount();const form=document.querySelector('[data-account-form]');for(const key of ['name','nickname','phone'])if(preview[key]&&form?.elements[key])form.elements[key].value=preview[key];
    history.replaceState(history.state,'',location.pathname+location.search);close();form?.querySelector('input')?.focus();
  }catch(error){status.textContent=error.payload?.message||error.message+' Zkus znovu; už propojenou účast nezdvojíme.';preview=null}finally{button.disabled=false}};
  try{await load()}catch(error){status.textContent=error.payload?.message||'Pozvánka není dostupná pro tento účet.';button.disabled=true}
  return true;
}
