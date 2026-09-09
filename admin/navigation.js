import { ADMIN_VIEW_IDS } from '../admin-view-model.js?v=20260909-admin-member-modal-r4';
import {ADMIN_AREAS,areaFor,cleanDrill} from './destinations.js?v=20260909-admin-member-modal-r4';

const id=value=>/^[a-z0-9_-]{1,128}$/i.test(value||'')?value:null;
export function adminRoute(search,fallback='dashboard'){
  const params=new URLSearchParams(search),requested=params.get('section');
  let section=requested?(ADMIN_VIEW_IDS.includes(requested)?requested:'dashboard'):fallback;
  // Reviewed five-area links and the historic Club alias keep their original meaning.
  if(requested==='finance')section=['reservations','accommodation','payments'].includes(params.get('view'))?params.get('view'):'reservations';
  if(requested==='club')section='club';
  if(Object.hasOwn(ADMIN_AREAS,requested))section=ADMIN_AREAS[requested].views.includes(params.get('view'))?params.get('view'):ADMIN_AREAS[requested].views[0];
  const galleryMode=section==='club'?'history':params.get('mode')==='history'?'history':'community';if(section==='club')section='gallery';
  return {section,galleryMode,drill:cleanDrill(Object.fromEntries(params)),composition:params.get('composition')==='onsite'?'onsite':'preparation',range:['7','30','all'].includes(params.get('range'))?params.get('range'):'all',
    eventId:id(params.get('event')),reservationId:id(params.get('reservation')),memberId:id(params.get('member')),memberTab:['overview','event','reservations','garage','photos','club','history','points','mailing','qr'].includes(params.get('tab'))?params.get('tab'):'overview'};
}
export function adminRouteUrl(route){
  const section=ADMIN_VIEW_IDS.includes(route.section)?route.section:'dashboard',area=areaFor(section);
  const params=new URLSearchParams({section:area});
  if(!['dashboard','mailing'].includes(area))params.set('view',section==='gallery'&&route.galleryMode==='history'?'club':section);
  if(route.composition==='onsite')params.set('composition','onsite');
  if(['7','30'].includes(route.range))params.set('range',route.range);
  if(['reservations','payments'].includes(section))for(const[key,value]of Object.entries(cleanDrill(route.drill)))params.set(key,value);
  if(id(route.eventId))params.set('event',route.eventId);
  if(id(route.reservationId))params.set('reservation',route.reservationId);
  if(id(route.memberId)){params.set('member',route.memberId);if(['event','reservations','garage','photos','club','history','points','mailing','qr'].includes(route.memberTab))params.set('tab',route.memberTab)}
  return `${location.pathname}?${params}`;
}

// Routes contain only allowlisted destinations/IDs. Search text and records stay out of history.
export function initializeAdminNavigation({state,setView,openReservation,openMember,closeMember,closeOverlays,refresh,allowLeave}){
  let restoring=false,lastUrl=location.href,prepared=false;
  // This router restores after asynchronous panels load; native restoration would race it.
  history.scrollRestoration='manual';
  const initial=adminRoute(location.search,state.activeAdminView);
  state.activeAdminView=initial.section;if(initial.eventId)state.selectedEventId=initial.eventId;
  if(Object.keys(initial.drill).length){state.reservationFilter='all';state.reservationDetailFilters=new Set();state.paymentFilter='all';state.reservationPage=1;}
  state.galleryMode=initial.galleryMode;state.dashboardDrill=initial.drill;state.dashboardComposition=initial.composition;state.dashboardRange=initial.range;
  state.requestedReservationId=initial.reservationId;state.pendingMemberRoute=initial.memberId?initial:null;
  const route=()=>({section:state.activeAdminView,eventId:state.selectedEventId,reservationId:state.selectedReservationId||state.requestedReservationId,memberId:state.memberId,memberTab:state.memberTab,galleryMode:state.galleryMode,drill:state.dashboardDrill,composition:state.dashboardComposition,range:state.dashboardRange});
  // Back already points at the target history entry: never overwrite it with the outgoing view.
  function rememberScroll(){if(restoring||state.restoringRoute)return;prepared=true;history.replaceState({...history.state,admin:true,filters:{reservationFilter:state.reservationFilter,details:[...state.reservationDetailFilters],paymentFilter:state.paymentFilter,reservationPage:state.reservationPage,galleryFilter:state.galleryFilter,galleryPage:state.galleryPage,galleryMode:state.galleryMode,historyYear:state.historyYear,historyFilter:state.historyFilter,historyClaimType:state.historyClaimType,historyPage:state.historyPagination.page},scrollY:window.scrollY},'',location.href)}
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
      state.dashboardDrill=target.drill;state.dashboardComposition=target.composition;state.dashboardRange=target.range;state.galleryMode=target.galleryMode;
      const filters=history.state?.filters;
      if(Object.keys(target.drill).length){state.reservationFilter='all';state.reservationDetailFilters=new Set();state.paymentFilter='all';state.reservationPage=1;}
      if(filters){state.historyYear=filters.historyYear||'all';state.historyFilter=filters.historyFilter||'pending';state.historyClaimType=filters.historyClaimType||'all';state.historyPagination.page=filters.historyPage||1;}
      if(filters){state.reservationFilter=['all','action','active','complete'].includes(filters.reservationFilter)?filters.reservationFilter:'all';state.reservationDetailFilters=new Set((filters.details||[]).filter(f=>['pending','approved','payment','underpaid','paid','overpaid','rejected','cancelled'].includes(f)));state.paymentFilter=['attention','all','unpaid','underpaid','paid','overpaid'].includes(filters.paymentFilter)?filters.paymentFilter:'attention';state.reservationPage=Math.max(1,Number(filters.reservationPage)||1);state.galleryFilter=['all','pending','approved','rejected'].includes(filters.galleryFilter)?filters.galleryFilter:'pending';state.galleryPage=Math.max(1,Number(filters.galleryPage)||1);state.galleryMode=filters.galleryMode==='history'?'history':'community'}
      setView(target.section,{focus:false});state.requestedReservationId=target.reservationId;
      await refresh();
      if(target.reservationId)openReservation(target.reservationId);
      if(target.memberId)openMember(target.memberId,null,{tab:target.memberTab,route:false});
      window.scrollTo({top:Number(history.state?.scrollY)||0,behavior:'auto'});lastUrl=location.href;
    }finally{restoring=false;state.restoringRoute=false}
    // Forward may open Member only after the source restore. Its context event was
    // intentionally suppressed while restoring; now hydrate it through the same
    // coordinator (fresh path cache is reused, no independent fetch or timer).
    if(state.memberId)await refresh();
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
  window.addEventListener('admin:dashboardchoice',()=>write({replace:true}));
  return{write,restore};
}
