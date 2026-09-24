import { $, setButtonBusy, toast } from '../ui.js?v=20260902-phase3';
import {memberQrMarkup} from '../../member-qr-renderer.js?v=20260923-live6';

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
    const qr=$('[data-account-qr]'),markup=memberQrMarkup(profile.qrPayload);if(qr)qr.innerHTML=markup||'<p>Členský QR zatím není dostupný.</p>';
    const zoom=$('[data-account-qr-open]');if(zoom)zoom.hidden=!markup;
    if(form){if(form.elements.name)form.elements.name.value=profile.name||'';if(form.elements.nickname)form.elements.nickname.value=profile.nickname||'';if(form.elements.phone)form.elements.phone.value=profile.phone||'';if(form.elements.hideOnClub)form.elements.hideOnClub.checked=profile.hideOnClub===true;const email=$('[data-account-email]',form);if(email)email.value=profile.email||''}
    const code=$('[data-account-member-code]'),since=$('[data-account-since]'),verification=$('[data-account-verification]');if(code)code.textContent=profile.memberCode||'—';if(since)since.textContent=getMemberSince()||'—';if(verification){verification.textContent=profile.emailVerified?'OVĚŘENÝ':'NEOVĚŘENÝ';verification.classList.toggle('is-verified',profile.emailVerified)}
  }
  function bind(){
    if(bound)return;bound=true;
    const dialog=$('[data-account-qr-dialog]');let qrOpener=null;
    function finishQr(){dialog?.close();document.body.classList.remove('account-qr-open');const target=qrOpener;qrOpener=null;requestAnimationFrame(()=>target?.focus({preventScroll:true}))}
    function closeQr(){if(!dialog?.open)return;if(history.state?.accountQr)history.back();else finishQr()}
    $('[data-account-qr-open]')?.addEventListener('click',event=>{const markup=memberQrMarkup(getData().profile?.qrPayload);if(!markup)return;qrOpener=event.currentTarget;dialog.querySelector('[data-account-qr-full]').innerHTML=markup;history.pushState({...history.state,accountQr:true},'');dialog.showModal();document.body.classList.add('account-qr-open')});
    dialog?.addEventListener('click',event=>{if(event.target===dialog||event.target.closest('[data-account-qr-close]'))closeQr()});
    dialog?.addEventListener('cancel',event=>{event.preventDefault();closeQr()});
    window.addEventListener('popstate',()=>{if(dialog?.open&&!history.state?.accountQr)finishQr()});
    $('[data-account-form]')?.addEventListener('submit',async event=>{
      event.preventDefault();const currentUser=getCurrentUser();if(!currentUser)return toast('Nejdřív se přihlas.');
      const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),fd=new FormData(form);setButtonBusy(button,true,'Ukládám profil…');
      try{const payload=await apiRequest('/api/bootstrap',{method:'POST',body:{name:String(fd.get('name')||'').trim(),nickname:String(fd.get('nickname')||'').trim(),phone:String(fd.get('phone')||'').trim(),hideOnClub:fd.get('hideOnClub')==='on'}});setProfile(normalizeMember(payload,getCurrentUser()));await refreshClub();renderProfile();renderAccount();renderPoints();renderAchievements();toast('Profil byl uložen.')}
      catch(error){console.error('Member profile update failed',error);toast(formatApiError(error))}
      finally{setButtonBusy(button,false)}
    });
  }

  function reset(){const dialog=$('[data-account-qr-dialog]');dialog?.close();if(history.state?.accountQr){const state={...history.state};delete state.accountQr;history.replaceState(state,'')}document.body.classList.remove('account-qr-open');$('[data-account-qr-full]')?.replaceChildren();$('[data-account-qr]')?.replaceChildren()}
  return {bind,render:renderAccount,reset};
}
