import { $, setButtonBusy, toast } from '../ui.js?v=20260902-phase3';

export function createMemberAccount({
  apiRequest,
  getCurrentUser,
  getData,
  setProfile,
  normalizeMember,
  refreshClub,
  getMemberSince,
  renderProfile,
  renderPoints,
  renderAchievements,
  formatApiError,
}){
  let bound=false;

  function renderAccount(){
    const profile=getData().profile||{},form=$('[data-account-form]');
    if(form){if(form.elements.name)form.elements.name.value=profile.name||'';if(form.elements.nickname)form.elements.nickname.value=profile.nickname||'';if(form.elements.phone)form.elements.phone.value=profile.phone||'';const email=$('[data-account-email]',form);if(email)email.value=profile.email||''}
    const code=$('[data-account-member-code]'),since=$('[data-account-since]'),verification=$('[data-account-verification]');if(code)code.textContent=profile.memberCode||'—';if(since)since.textContent=getMemberSince()||'—';if(verification){verification.textContent=profile.emailVerified?'OVĚŘENÝ':'NEOVĚŘENÝ';verification.classList.toggle('is-verified',profile.emailVerified)}
  }
  function bind(){
    if(bound)return;bound=true;
    $('[data-account-form]')?.addEventListener('submit',async event=>{
      event.preventDefault();const currentUser=getCurrentUser();if(!currentUser)return toast('Nejdřív se přihlas.');
      const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),fd=new FormData(form);setButtonBusy(button,true,'Ukládám profil…');
      try{const payload=await apiRequest('/api/bootstrap',{method:'POST',body:{name:String(fd.get('name')||'').trim(),nickname:String(fd.get('nickname')||'').trim(),phone:String(fd.get('phone')||'').trim()}});setProfile(normalizeMember(payload,getCurrentUser()));await refreshClub();renderProfile();renderAccount();renderPoints();renderAchievements();toast('Profil byl uložen.')}
      catch(error){console.error('Member profile update failed',error);toast(formatApiError(error))}
      finally{setButtonBusy(button,false)}
    });
  }

  return {bind,render:renderAccount};
}
