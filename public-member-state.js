import { initUnitedAuth } from './united-auth.js?v=20261028-flow1';
import { shouldShowJoinCta } from './planner-state.js?v=20261025-flow1';

export function renderAccountLinks(state, root=document){
  const authenticated=state.authenticated===true||state.status==='authenticated';
  const anonymous=state.status==='anonymous';
  const label=authenticated?'Můj United účet':anonymous?'Registrovat se':'Účet';
  const target=anonymous?`member.html?mode=register&returnTo=${encodeURIComponent(location.pathname+location.search+location.hash)}`:'member.html';
  root.querySelectorAll('.nav-member').forEach(link=>{
    (link.querySelector('.nav-member-label')||link).textContent=label;link.href=target;
    link.toggleAttribute('aria-busy',state.status==='loading');
  });
}

export function initPublicMemberState({config,apiBaseUrl,onStateChange,authFactory=initUnitedAuth,fetchImpl=fetch,timeoutMs=20_000}){
  let revision=0;
  let activeController=null;
  const emit=state=>onStateChange?.({...state,showJoinCta:shouldShowJoinCta(state)});
  const refresh=async authState=>{
    const activeRevision=++revision;
    activeController?.abort();
    if(authState.status==='anonymous'){emit({status:'anonymous',authenticated:false,hasWaitingPlan:false,hasReservation:false});return}
    if(authState.status!=='authenticated'||!authState.user){emit({status:authState.status,authenticated:false,hasWaitingPlan:false,hasReservation:false,error:authState.error||null});return}
    emit({status:'loading',authenticated:true,hasWaitingPlan:false,hasReservation:false});
    const controller=new AbortController();activeController=controller;let timer;
    try{
      const payload=await Promise.race([(async()=>{
      const token=await authState.user.getIdToken();
      if(controller.signal.aborted)throw new Error('navigation_state_cancelled');
      const response=await fetchImpl(`${String(apiBaseUrl).replace(/\/$/,'')}/api/navigation-state`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:controller.signal});
      if(!response.ok)throw new Error(`navigation_state_${response.status}`);
      return response.json();
      })(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('navigation_state_timeout'))},timeoutMs)})]);
      if(activeRevision!==revision)return;
      emit({status:'authenticated',authenticated:true,hasWaitingPlan:payload?.hasWaitingPlan===true,hasReservation:payload?.hasReservation===true});
    }catch(error){if(activeRevision===revision)emit({status:'error',authenticated:true,hasWaitingPlan:false,hasReservation:false,error})}
    finally{clearTimeout(timer)}
  };
  const auth=authFactory({config,onStateChange:state=>{void refresh(state)}});
  const stop=auth.stop?.bind(auth);
  auth.stop=()=>{revision++;activeController?.abort();stop?.()};
  return auth;
}
