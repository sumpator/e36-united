import { ADMIN_VIEW_IDS } from '../admin-view-model.js?v=20260908-admin-member2';

const id=value=>/^[a-z0-9_-]{1,128}$/i.test(value||'')?value:null;
export function adminRoute(search,fallback='dashboard'){
  const params=new URLSearchParams(search),requested=params.get('section');
  return {section:requested?(ADMIN_VIEW_IDS.includes(requested)?requested:'dashboard'):fallback,
    eventId:id(params.get('event')),reservationId:id(params.get('reservation')),memberId:id(params.get('member')),memberTab:['event','reservations','garage','photos','club','history','points','mailing','qr'].includes(params.get('tab'))?params.get('tab'):'event'};
}
export function adminRouteUrl(route){
  const params=new URLSearchParams({section:ADMIN_VIEW_IDS.includes(route.section)?route.section:'dashboard'});
  if(id(route.eventId))params.set('event',route.eventId);
  if(id(route.reservationId))params.set('reservation',route.reservationId);
  if(id(route.memberId)){params.set('member',route.memberId);if(route.memberTab&&route.memberTab!=='event')params.set('tab',route.memberTab)}
  return `${location.pathname}?${params}`;
}

// Routes contain only allowlisted destinations/IDs. Search text and records stay out of history.
export function initializeAdminNavigation({state,setView,openReservation,openMember,closeMember,closeOverlays,refresh,allowLeave}){
  let restoring=false,lastUrl=location.href,prepared=false;
  const initial=adminRoute(location.search,state.activeAdminView);
  state.activeAdminView=initial.section;if(initial.eventId)state.selectedEventId=initial.eventId;
  state.requestedReservationId=initial.reservationId;state.pendingMemberRoute=initial.memberId?initial:null;
  const route=()=>({section:state.activeAdminView,eventId:state.selectedEventId,reservationId:state.selectedReservationId||state.requestedReservationId,memberId:state.memberId,memberTab:state.memberTab});
  function rememberScroll(){prepared=true;history.replaceState({...history.state,admin:true,filters:{reservationFilter:state.reservationFilter,details:[...state.reservationDetailFilters],paymentFilter:state.paymentFilter,reservationPage:state.reservationPage,galleryFilter:state.galleryFilter,galleryPage:state.galleryPage,galleryMode:state.galleryMode},scrollY:window.scrollY},'',location.href)}
  function write({replace=false,detail=false}={}){
    if(restoring||state.restoringRoute)return;if(!prepared)rememberScroll();prepared=false;const url=adminRouteUrl(route());
    if(location.pathname+location.search===url)return;
    history[replace?'replaceState':'pushState']({admin:true,detail,scrollY:0},'',url);lastUrl=location.href;
  }
  async function restore(){
    const memberTarget=adminRoute(location.search);
    if(state.memberId&&memberTarget.section===state.activeAdminView&&memberTarget.eventId===state.selectedEventId&&memberTarget.reservationId===(state.selectedReservationId||state.requestedReservationId||null)){
      restoring=true;state.restoringRoute=true;try{closeMember({route:false});if(memberTarget.memberId)openMember(memberTarget.memberId,null,{tab:memberTarget.memberTab,route:false});lastUrl=location.href;}finally{restoring=false;state.restoringRoute=false}await refresh();return;
    }
    if(!allowLeave()){history.pushState({admin:true},'',lastUrl);return}
    restoring=true;state.restoringRoute=true;
    try{
      const target=adminRoute(location.search);closeOverlays();
      if(target.eventId)state.selectedEventId=target.eventId;
      const filters=history.state?.filters;
      if(filters){state.reservationFilter=['all','action','active','complete'].includes(filters.reservationFilter)?filters.reservationFilter:'all';state.reservationDetailFilters=new Set((filters.details||[]).filter(f=>['pending','approved','payment','underpaid','paid','overpaid','rejected','cancelled'].includes(f)));state.paymentFilter=['attention','all','unpaid','underpaid','paid','overpaid'].includes(filters.paymentFilter)?filters.paymentFilter:'attention';state.reservationPage=Math.max(1,Number(filters.reservationPage)||1);state.galleryFilter=['all','pending','approved','rejected'].includes(filters.galleryFilter)?filters.galleryFilter:'pending';state.galleryPage=Math.max(1,Number(filters.galleryPage)||1);state.galleryMode=filters.galleryMode==='history'?'history':'community'}
      setView(target.section,{focus:false});state.requestedReservationId=target.reservationId;
      await refresh();
      if(target.reservationId)openReservation(target.reservationId);
      if(target.memberId)openMember(target.memberId,null,{tab:target.memberTab,route:false});
      window.scrollTo({top:Number(history.state?.scrollY)||0,behavior:'auto'});lastUrl=location.href;
    }finally{restoring=false;state.restoringRoute=false}
  }
  history.replaceState({...history.state,admin:true},'',adminRouteUrl(initial));lastUrl=location.href;
  window.addEventListener('admin:beforenavigation',rememberScroll);
  window.addEventListener('popstate',()=>void restore());
  window.addEventListener('admin:viewchange',()=>write());
  window.addEventListener('admin:detailopened',()=>write({detail:true}));
  window.addEventListener('admin:detailclosed',()=>{
    if(restoring||state.restoringRoute||!state.currentUser||state.denied)return;
    if(history.state?.detail)history.back();else write({replace:true});
  });
  window.addEventListener('admin:memberopened',()=>write({detail:true}));
  window.addEventListener('admin:membertab',()=>write({replace:true,detail:true}));
  window.addEventListener('admin:memberclosed',()=>{if(restoring||state.restoringRoute||!state.currentUser||state.denied)return;if(history.state?.detail)history.back();else write({replace:true})});
  window.addEventListener('admin:eventchanged',()=>write());
  return{write,restore};
}
