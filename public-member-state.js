import { initUnitedAuth } from './united-auth.js?v=20261028-flow2';
import { shouldShowJoinCta } from './planner-state.js?v=20261025-flow1';
import { ACCOUNT_USED_KEY, hasUsedAccount, accountEntryHref } from './member/deep-links.js?v=20261028-entry1';

export function renderAccountLinks(state, root=document){
  const authenticated=state.authenticated===true||state.status==='authenticated';
  const anonymous=state.status==='anonymous';
  const knownAccount=typeof state.knownAccount==='boolean'?state.knownAccount:hasUsedAccount();
  const label=authenticated?'Můj United účet':anonymous?(knownAccount?'Přihlásit se':'Registrovat se'):'Účet';
  const target=accountEntryHref({authenticated,anonymous,knownAccount});
  root.querySelectorAll('.nav-member').forEach(link=>{
    (link.querySelector('.nav-member-label')||link).textContent=label;link.href=target;
    link.toggleAttribute('aria-busy',state.status==='loading');
  });
}

export function initPublicMemberState({config,apiBaseUrl,onStateChange,authFactory=initUnitedAuth,fetchImpl=fetch,timeoutMs=10_000,storage,eventTarget=globalThis.window}){
  let revision=0;
  let activeController=null;
  let stopped=false,lastPublished={status:'loading',authenticated:false,hasWaitingPlan:false,hasReservation:false};
  const emit=state=>{lastPublished={...state,knownAccount:hasUsedAccount(storage),showJoinCta:shouldShowJoinCta(state)};onStateChange?.(lastPublished)};
  const onStorage=event=>{if(stopped||(event.key!==ACCOUNT_USED_KEY&&event.key!==null))return;if(storage&&event.storageArea&&event.storageArea!==storage)return;emit(lastPublished)};
  eventTarget?.addEventListener?.('storage',onStorage);
  const refresh=async authState=>{
    if(stopped)return;
    const activeRevision=++revision;
    activeController?.abort();
    if(authState.status==='anonymous'){emit({status:'anonymous',authenticated:false,hasWaitingPlan:false,hasReservation:false});return}
    if(authState.status!=='authenticated'||!authState.user){emit({status:authState.status,authenticated:false,hasWaitingPlan:false,hasReservation:false,error:authState.error||null});return}
    emit({status:'loading',authenticated:true,hasWaitingPlan:false,hasReservation:false});
    const controller=new AbortController();activeController=controller;let timer;
    const remaining=Math.max(0,Math.min(timeoutMs,(authState.deadlineAt||Date.now()+timeoutMs)-Date.now()));
    try{
      const payload=await Promise.race([(async()=>{
      const token=await authState.user.getIdToken();
      if(controller.signal.aborted)throw new Error('navigation_state_cancelled');
      const response=await fetchImpl(`${String(apiBaseUrl).replace(/\/$/,'')}/api/navigation-state`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(`navigation_state_${response.status}`);
      return response.json();
      })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('navigation_state_timeout'))},remaining)})]);
      if(activeRevision!==revision)return;
      emit({status:'authenticated',authenticated:true,hasWaitingPlan:payload?.hasWaitingPlan===true,hasReservation:payload?.hasReservation===true});
    }catch(error){if(activeRevision===revision)emit({status:'error',authenticated:true,hasWaitingPlan:false,hasReservation:false,error})}
    finally{clearTimeout(timer)}
  };
  let auth;
  try{auth=authFactory({config,onStateChange:state=>{void refresh(state)}})}catch(error){eventTarget?.removeEventListener?.('storage',onStorage);throw error}
  const stop=auth.stop?.bind(auth);
  auth.stop=()=>{if(stopped)return;stopped=true;revision++;activeController?.abort();eventTarget?.removeEventListener?.('storage',onStorage);stop?.()};
  return auth;
}
