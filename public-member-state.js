import { initUnitedAuth } from './united-auth.js?v=20260825-phase-a1';
import { shouldShowJoinCta } from './planner-state.js?v=20260826-planner-sync';

export function initPublicMemberState({config,apiBaseUrl,onStateChange,authFactory=initUnitedAuth,fetchImpl=fetch}){
  let revision=0;
  const emit=state=>onStateChange?.({...state,showJoinCta:shouldShowJoinCta(state)});
  const refresh=async authState=>{
    const activeRevision=++revision;
    if(authState.status==='anonymous'){emit({status:'anonymous',authenticated:false,hasWaitingPlan:false,hasReservation:false});return}
    if(authState.status!=='authenticated'||!authState.user){emit({status:authState.status,authenticated:false,hasWaitingPlan:false,hasReservation:false,error:authState.error||null});return}
    emit({status:'loading',authenticated:true,hasWaitingPlan:false,hasReservation:false});
    try{
      const token=await authState.user.getIdToken();
      const response=await fetchImpl(`${String(apiBaseUrl).replace(/\/$/,'')}/api/navigation-state`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
      if(!response.ok)throw new Error(`navigation_state_${response.status}`);
      const payload=await response.json();
      if(activeRevision!==revision)return;
      emit({status:'authenticated',authenticated:true,hasWaitingPlan:payload?.hasWaitingPlan===true,hasReservation:payload?.hasReservation===true});
    }catch(error){if(activeRevision===revision)emit({status:'error',authenticated:true,hasWaitingPlan:false,hasReservation:false,error})}
  };
  return authFactory({config,onStateChange:state=>{void refresh(state)}});
}
