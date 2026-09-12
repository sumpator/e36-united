import {initializeDashboard,renderDashboard,receiveDashboardPreferences,dashboardWantsPlanner,dashboardWantsMailing,clearDashboard} from './admin/dashboard.js?v=20260912-reservation-detail-ux-r1';
import {initializeCommandShell} from './admin/command-shell.js?v=20260912-reservation-detail-ux-r1';
import {initializeMembers,openMember,closeMember,clearMemberPrivateState,memberContextKey,memberRefreshTasks,renderMemberReadState} from './admin/member-detail.js?v=20260912-reservation-detail-ux-r1';
import {ADMIN_REFRESH,resourceDue} from './admin/refresh-policy.js?v=20260912-reservation-detail-ux-r1';
import {reservationRequestPath,galleryRequestPath} from './admin/lists.js?v=20260912-reservation-detail-ux-r1';
import { initializeAdminNavigation } from './admin/navigation.js?v=20260912-reservation-detail-ux-r1';
import { createAdminRefresh } from './admin/refresh.js?v=20260912-reservation-detail-ux-r1';
import { initializeAdminEditors, bindCurrentEditors, forgetAdminEditor, allowAdminNavigation, clearAdminPrivateEdits, adminRenderPending } from './admin/editors.js?v=20260912-reservation-detail-ux-r1';
import { firebaseConfig } from './firebase-config.js?v=20260912-reservation-detail-ux-r1';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

import { apiRequest } from './admin/api.js?v=20260912-reservation-detail-ux-r1';
import { adminState, resetAdminDomainState, resetAdminFiltersForEvent, resetAdminFiltersForLogin } from './admin/state.js?v=20260912-reservation-detail-ux-r1';
import { initializeAdminShell, setAdminSectionCollapsed, setAdminView, setDenied, setLoading, setView } from './admin/shell.js?v=20260912-reservation-detail-ux-r1';
import { $, toast } from './admin/ui.js?v=20260912-reservation-detail-ux-r1';
import { renderEventSelector, renderEventSettings, renderOverview, saveEventSettings } from './admin/modules/dashboard-events.js?v=20260912-reservation-detail-ux-r1';
import { moveAccommodationGalleryPhoto, previewAccommodationGalleryPhoto, previewAccommodationPhoto, removeAccommodationGalleryPhoto, resetAccommodationMedia, removeAccommodationPhoto, renderAccommodation, saveAccommodation, uploadAccommodationGalleryPhoto, uploadAccommodationPhoto } from './admin/modules/accommodation.js?v=20260912-reservation-detail-ux-r1';
import { clearReservationDetailFilters, closeReservationDrawer, openReservationDrawer, renderReservations, renderReservationDetail, reviewReservationRequest, saveReservationNotes, setPaymentFilter, setPaymentSearch, setReservationFilter, setReservationSearch, setReservationViewMode, toggleReservationDetailFilter, toggleReservationFilters, updateReservation, updateReservationPayment } from './admin/modules/reservations-payments.js?v=20260912-reservation-detail-ux-r1';
import { changeHistoryPage, clearHistoryFilters, closeGalleryLightbox, closeHistoryEvidence, historyRequestPath, hydrateOpenHistoryCard, openGalleryLightbox, openHistoryEvidence, releaseGalleryMedia, releaseHistoryEvidence, renderGallery, renderHistoryClaims, reviewHistoryClaim, setGalleryFilter, setGalleryMode, setHistoryClaimType, setHistoryFilter, setHistorySearch, setHistoryYear, updateGallery } from './admin/modules/moderation.js?v=20260912-reservation-detail-ux-r1';
import { initializeMailingCenter, resetMailingCenter, refreshMailingCenter } from './admin/modules/mailing/index.js?v=20260912-reservation-detail-ux-r1';
import { renderAdminFunnel } from './admin/modules/funnel.js?v=20260912-reservation-detail-ux-r1';
import {releaseHistoryCardMedia} from './admin/modules/moderation.js?v=20260912-reservation-detail-ux-r1';
import { refreshHistoryAttention } from './admin/modules/dashboard-events.js?v=20260912-reservation-detail-ux-r1';

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
await setPersistence(auth,browserLocalPersistence);

function closeAdminOverlays(){closeMember({route:false});closeReservationDrawer();closeGalleryLightbox();closeHistoryEvidence()}
function closeDeniedOverlays(){closeGalleryLightbox();closeReservationDrawer()}
function scopedPath(path){return `${path}?eventId=${encodeURIComponent(adminState.selectedEventId)}`}

const resourceCache=new Map(),resourceData=new Map(),resourceFreshness=new Map();
let startupGeneration=0,displayEvent=null,eventsReady=false;
function beginEventContext(eventId){
  if(displayEvent===eventId)return;displayEvent=eventId;resourceCache.clear();
  adminState.summary=null;adminState.dashboardAnalytics=null;adminState.reservationItems=[];adminState.reservationDetail=null;adminState.reservationCounts=null;adminState.reservationPagination=null;adminState.accommodationItems=[];
  for(const name of ['summary','dashboard-analytics','reservations','reservation-detail','accommodation','events'])delete adminState.resourceStates[name];
  for(const selector of ['[data-reservation-list]','[data-payment-list]','[data-accommodation-list]']){const node=$(selector);if(node)node.textContent='Data tohoto eventu zatím nejsou načtena.';}
  document.querySelectorAll('[data-list-pagination]').forEach(node=>node.remove());
  for(const selector of ['[data-event-settings-form]','[data-accommodation-create-form]']){const form=$(selector);if(form){forgetAdminEditor(form);form.reset();form.inert=true;delete form.dataset.hydratedEvent;delete form.dataset.hydratedRevision;}}
  document.querySelectorAll('strong,b,dd,span').forEach(node=>{if(!node.childElementCount&&[...node.attributes].some(attribute=>/^data-(kpi-|attendance-(full|saturday|day)$|show-(total|yes|no|maybe)$|accommodation-(occupancy|cabin|tent|none)$|booking-|payment-(total-|count-)|attention-(reservations|payments|gallery|history)$)/.test(attribute.name)))node.textContent='—';});
  for(const selector of ['[data-reservation-count]','[data-payment-count]','[data-accommodation-option-count]'])if($(selector))$(selector).textContent='—';
  $('[data-event-year]').textContent=adminState.events.find(event=>event.id===eventId)?.year||'—';$('[data-event-state]').textContent='Načítám data vybraného eventu…';
}

function refreshContext(){
  return {key:[adminState.sessionGeneration,adminState.selectedEventId,adminState.activeAdminView,adminState.selectedReservationId||adminState.requestedReservationId||'',adminState.galleryMode,historyRequestPath(adminState.historyPagination.page),reservationRequestPath(),galleryRequestPath(),memberContextKey()].join('|'),
    authenticated:!!adminState.currentUser&&eventsReady,denied:adminState.denied,visible:!document.hidden,online:navigator.onLine,
    eventId:adminState.selectedEventId,view:adminState.activeAdminView};
}
let lastRefreshState={state:'not_requested'};
function renderFreshnessText(){
  const node=$('[data-admin-freshness]');if(!node)return;const state=lastRefreshState,stamp=state.lastSuccess?new Date(state.lastSuccess).toLocaleTimeString('cs-CZ'):'—';
  node.textContent=state.state==='fresh'?`${adminRenderPending()?'Data načtena · chráněný editor čeká na úplné zobrazení':'Data aktuální'} · obnoveno ${stamp}`:state.state==='loading'?'Aktualizuji…':state.state==='denied'?'Přístup byl odebrán.':`Data mohou být zastaralá · poslední obnova ${stamp}`;
}
function freshness(state){
  lastRefreshState=state;
  let node=$('[data-admin-freshness]');if(!node){node=document.createElement('p');node.dataset.adminFreshness='';node.setAttribute('role','status');$('[data-admin-view]').prepend(node)}
  const stamp=state.lastSuccess?new Date(state.lastSuccess).toLocaleTimeString('cs-CZ'):'—';
  node.dataset.state=state.state;
  renderDashboard();
  renderFreshnessText();
}
async function refreshResources({context,signal,isCurrent,reason}){
  beginEventContext(context.eventId);
  const tasks=[['summary',`/api/admin/summary${context.eventId?'?eventId='+encodeURIComponent(context.eventId):''}`,payload=>{
    if(payload.event){adminState.events=adminState.events.map(event=>event.id===payload.event.id?{...event,...payload.event}:event)}
    renderOverview(payload);
  }]];
  if(!adminState.memberId&&['reservations','payments'].includes(context.view))tasks.push(['reservations',reservationRequestPath(),renderReservations,ADMIN_REFRESH.heavyListMs]);
  if(!adminState.memberId&&context.view==='accommodation')tasks.push(['accommodation',scopedPath('/api/admin/accommodation'),renderAccommodation]);
  if(!adminState.memberId&&context.view==='event')tasks.push(['events','/api/admin/events',payload=>{adminState.events=payload.events||[];renderEventSelector();renderEventSettings(adminState.events.find(event=>event.id===context.eventId))}]);
  if(!adminState.memberId&&context.view==='gallery')tasks.push(adminState.galleryMode==='history'
    ?['history',historyRequestPath(adminState.historyPagination.page),renderHistoryClaims,ADMIN_REFRESH.analyticsMs]
    :['gallery',galleryRequestPath(),renderGallery,ADMIN_REFRESH.heavyListMs]);
  if(!adminState.memberId&&context.view==='dashboard'&&!adminState.selectedReservationId&&!adminState.requestedReservationId){
    tasks.push(['dashboard-analytics',scopedPath('/api/admin/dashboard')+'&presentation=command',payload=>{adminState.dashboardAnalytics=payload},ADMIN_REFRESH.analyticsMs]);
    if(dashboardWantsPlanner())tasks.push(['dashboard-planner',scopedPath('/api/admin/funnel'),renderAdminFunnel,ADMIN_REFRESH.analyticsMs]);
    if(dashboardWantsMailing())tasks.push(['dashboard-mailing','/api/admin/mailing/overview',payload=>{adminState.dashboardMailing=payload},ADMIN_REFRESH.analyticsMs]);
    // Preferences are an explicit/startup read, not a fourth periodic widget request.
    if(reason!=='poll'&&(!adminState.dashboardPreferences||['startup','manual','mutation'].includes(reason)))tasks.push(['dashboard-preferences','/api/admin/preferences',receiveDashboardPreferences,ADMIN_REFRESH.analyticsMs]);
  }
  const detailId=adminState.selectedReservationId||adminState.requestedReservationId;
  if(detailId&&!adminState.memberId)tasks.push(['reservation-detail',reservationRequestPath(detailId),renderReservationDetail]);
  // Navigation badges share this one analytical summary even over Member / Mailing.
  if(context.view==='mailing'||adminState.memberId)tasks.splice(1);
  tasks.push(...memberRefreshTasks());
  if(reason==='poll'){
    // Due analytical widgets share three slots. A fourth is staggered to the next
    // coordinator tick, without its own timer or fetching any hidden workspace.
    for(let i=tasks.length-1;i>=0;i--){const [name,path,,ttl=name==='summary'?ADMIN_REFRESH.analyticsMs:ADMIN_REFRESH.operationalMs]=tasks[i];if(!resourceDue(resourceFreshness.get(adminState.sessionGeneration+':'+path),adminState.sessionGeneration+':'+path,ttl,reason))tasks.splice(i,1);}
    tasks.sort((a,b)=>(resourceFreshness.get(adminState.sessionGeneration+':'+a[1])?.lastSuccess||0)-(resourceFreshness.get(adminState.sessionGeneration+':'+b[1])?.lastSuccess||0));
    tasks.splice(ADMIN_REFRESH.maxPeriodicRequests);
  }
  if(reason==='poll'&&tasks.length>ADMIN_REFRESH.maxPeriodicRequests)throw new Error('Periodic fanout exceeded');
  const settled=await Promise.allSettled(tasks.map(async([name,path,render,ttl=name==='summary'?ADMIN_REFRESH.analyticsMs:ADMIN_REFRESH.operationalMs])=>{
    const cacheKey=adminState.sessionGeneration+':'+path;
    const previous=resourceFreshness.get(cacheKey);
    if(!resourceDue(previous,cacheKey,ttl,reason)){
      if(name.startsWith('member')){render(resourceData.get(cacheKey));adminState.resourceStates[name]=previous;}
      return;
    }
    try{
      const payload=await apiRequest(path,{signal});
      if(!isCurrent())return;
      const serialized=JSON.stringify({...payload,freshness:undefined});
      // Summary includes a generation timestamp; its small text nodes can update without remounting.
      if(name==='summary'||name.startsWith('member')||resourceCache.get(cacheKey)!==serialized){if(render(payload)!==false)resourceCache.set(cacheKey,serialized)}
      // The accepted history response resolves the initial "latest relevant" year.
      // This synchronous renderer normalization is not user navigation: keep the
      // captured context and normalized cache key aligned, without another read.
      if(name==='history')context.key=refreshContext().key;
      const fresh={state:'fresh',lastSuccess:Date.now(),context:cacheKey};resourceFreshness.set(cacheKey,fresh);resourceData.set(cacheKey,payload);adminState.resourceStates[name]=fresh;
      if(name==='history'){
        const normalized=adminState.sessionGeneration+':'+historyRequestPath(adminState.historyPagination.page);
        if(normalized!==cacheKey){const resolved={...fresh,context:normalized};resourceFreshness.set(normalized,resolved);resourceData.set(normalized,payload);resourceCache.set(normalized,serialized);adminState.resourceStates[name]=resolved;}
      }
      document.querySelector('[data-domain-status="'+name+'"]')?.remove();
    }catch(error){
      if(!isCurrent()||error.stale)return;
      resourceFreshness.delete(cacheKey);
      const previous=adminState.resourceStates[name];adminState.resourceStates[name]={...previous,state:previous?.lastSuccess?'stale':'unavailable'};
      const panel=name.startsWith('member')?null:document.querySelector(name==='reservation-detail'?'[data-reservation-drawer-content]':'[data-admin-panel="'+context.view+'"]');let label=panel?.querySelector('[data-domain-status="'+name+'"]');if(panel&&!label){label=document.createElement('p');label.dataset.domainStatus=name;label.setAttribute('role','status');panel.prepend(label)}if(label){const title={summary:'přehledu',reservations:'rezervací','reservation-detail':'detailu rezervace',accommodation:'ubytování',events:'nastavení',gallery:'fotek',history:'historie','dashboard-analytics':'vývoje rezervací','dashboard-preferences':'rozložení','dashboard-mailing':'Mailingu'}[name]||'sekce';label.textContent=previous?.lastSuccess||name==='reservation-detail'&&adminState.reservationDetail?'Data '+title+' mohou být zastaralá. Poslední hodnoty zůstaly zachovány.':'Data '+title+' teď nejsou dostupná. Použij Obnovit data / Zkusit spojení.';}
      throw error;
    }
  }));
  if(!isCurrent())return;
  if(adminState.requestedReservationId&&(adminState.reservationDetail?.id===adminState.requestedReservationId||adminState.reservationItems.some(item=>item.id===adminState.requestedReservationId))){openReservationDrawer(adminState.requestedReservationId);adminState.requestedReservationId=null}
  bindCurrentEditors();renderEventSelector();renderDashboard();
  if(adminState.memberId){const keys=['member-header',...(adminState.memberTab==='event'?[]:['member-tab'])];$('[data-member-freshness]').textContent=keys.map(key=>{const value=adminState.resourceStates[key];return (key==='member-header'?'Profil / event':'Sekce')+': '+(value?.state==='fresh'?'načteno '+new Date(value.lastSuccess).toLocaleTimeString('cs-CZ'):'zastaralé / nedostupné')}).join(' · ');}
  const failed=settled.flatMap((result,index)=>result.status==='rejected'?[tasks[index][0]]:[]);
  const memberDialog=$('[data-member-dialog]');let memberError=$('[data-member-load-error]');
  if(!memberError){memberError=document.createElement('p');memberError.dataset.memberLoadError='';memberError.role='status';memberDialog.querySelector('header').after(memberError);}
  memberError.hidden=!adminState.memberId||!['member-header',...(adminState.memberTab==='event'?[]:['member-tab'])].some(name=>['unavailable','stale'].includes(adminState.resourceStates[name]?.state));
  memberError.textContent='Data této členské sekce teď nejsou dostupná. Dříve načtené hodnoty zůstávají zachované. Zkus obnovit spojení.';
  renderMemberReadState();
  if(!adminState.memberId&&context.view==='mailing'&&resourceDue(resourceFreshness.get('mailing'),'mailing',ADMIN_REFRESH.analyticsMs,reason)){try{await refreshMailingCenter({signal,isCurrent});if(isCurrent())resourceFreshness.set('mailing',{state:'fresh',context:'mailing',lastSuccess:Date.now()})}catch{failed.push('mailing')}}
  return {failed:failed.length?failed:null};
}
const refreshCoordinator=createAdminRefresh({readContext:refreshContext,refresh:refreshResources,onState:freshness});
async function loadEventData(){refreshCoordinator.invalidate();return refreshCoordinator.trigger('context')}
async function loadAdminData(){
  const generation=++startupGeneration;refreshCoordinator.invalidate();setLoading(true);
  try{
    const payload=await apiRequest('/api/admin/events');
    if(generation!==startupGeneration)return;
    adminState.events=payload.events||[];
    if(!adminState.events.some(event=>event.id===adminState.selectedEventId))adminState.selectedEventId=(adminState.events.find(event=>event.isCurrent)||adminState.events[0]||{}).id||'';
    eventsReady=true;renderEventSelector();setView('admin');await refreshCoordinator.trigger('startup');
    if(adminState.pendingMemberRoute){const target=adminState.pendingMemberRoute;adminState.pendingMemberRoute=null;openMember(target.memberId,null,{tab:target.memberTab,route:false})}
  }catch(error){if(!error.stale&&!adminState.denied)toast(error.message||'Admin data se nepodařilo načíst.')}
  finally{if(generation===startupGeneration)setLoading(false)}
}
function clearPrivateState(){
  adminState.queueMember=null;
  releaseHistoryCardMedia();
  startupGeneration++;displayEvent=null;eventsReady=false;refreshCoordinator.suspend();resourceCache.clear();resourceData.clear();resourceFreshness.clear();clearMemberPrivateState();clearAdminPrivateEdits();
  adminState.restoringRoute=true;closeAdminOverlays();adminState.restoringRoute=false;releaseGalleryMedia();releaseHistoryEvidence();resetAccommodationMedia();resetAdminDomainState();resetMailingCenter();clearDashboard();
  $('[data-admin-account]').textContent='';$('[data-event-settings-form]')?.reset();
  adminState.historySearch='';adminState.reservationSearch='';adminState.paymentSearch='';try{sessionStorage.removeItem('e36UnitedAdmin.historySearch')}catch{}
  document.querySelectorAll('[data-history-search],[data-reservation-search],[data-payment-search],[data-mailing-contact-form] input[name="q"]').forEach(input=>input.value='');
  document.querySelectorAll('[data-operation-status]').forEach(node=>node.remove());
  for(const selector of ['[data-reservation-list]','[data-payment-list]','[data-accommodation-list]','[data-gallery-list]','[data-history-list]','[data-reservation-drawer-content]','[data-gallery-lightbox-content]','[data-admin-funnel]']){
    const node=$(selector);if(node)node.replaceChildren();
  }
}
window.addEventListener('admin:accesslost',()=>{
  adminState.denied=true;adminState.sessionGeneration++;clearPrivateState();setDenied();
});
window.addEventListener('admin:invalidate',()=>{resourceCache.clear();resourceFreshness.clear();refreshCoordinator.invalidate();void refreshCoordinator.trigger('mutation')});
for(const event of ['admin:detailopened','admin:detailclosed'])window.addEventListener(event,()=>{if(adminState.currentUser&&!adminState.requestedReservationId&&!adminState.restoringRoute){refreshCoordinator.invalidate();void refreshCoordinator.trigger('detail')}});
window.addEventListener('admin:viewchange',()=>{if(adminState.currentUser){refreshCoordinator.invalidate();void refreshCoordinator.trigger('navigation')}});
for(const name of ['focus','online','pageshow'])window.addEventListener(name,()=>void refreshCoordinator.trigger(name));
window.addEventListener('offline',()=>refreshCoordinator.suspend());
document.addEventListener('visibilitychange',()=>{if(document.hidden)refreshCoordinator.suspend();else void refreshCoordinator.trigger('visible')});

// Closing a read-only Member overlay does not invalidate unchanged source data.
// The normal context refresh still reloads missing/stale resources at their own cadence.
window.addEventListener('admin:membercontext',()=>{if(adminState.currentUser&&!adminState.restoringRoute){refreshCoordinator.invalidate();void refreshCoordinator.trigger('context')}});
initializeMembers({
  openReservation:async(id,eventId)=>{if(!allowAdminNavigation())return;adminState.restoringRoute=true;try{closeMember({route:false});closeReservationDrawer();if(adminState.selectedEventId!==eventId){adminState.selectedEventId=eventId;resetAdminFiltersForEvent()}adminState.requestedReservationId=id;}finally{adminState.restoringRoute=false}navigation.write({replace:true,detail:true});await loadEventData()},
  openHistory:()=>{if(!allowAdminNavigation())return;adminState.restoringRoute=true;try{closeMember({route:false});closeReservationDrawer();setGalleryMode('history');setAdminView('gallery')}finally{adminState.restoringRoute=false}navigation.write({replace:true});void loadEventData()},
  openPhotoModeration:(status,memberId)=>{if(!allowAdminNavigation())return;adminState.restoringRoute=true;try{closeMember({route:false});closeReservationDrawer();adminState.queueMember=memberId||null;setGalleryMode('community');setGalleryFilter(['pending','approved','rejected'].includes(status)?status:'all');setAdminView('gallery')}finally{adminState.restoringRoute=false}navigation.write({replace:true});void loadEventData()}
});
initializeCommandShell();
initializeAdminShell({onCloseOverlays:closeAdminOverlays,onDenied:closeDeniedOverlays,onCommunityMode:setGalleryMode});
initializeMailingCenter();
initializeAdminEditors({onRenderState:renderFreshnessText});
const navigation=initializeAdminNavigation({state:adminState,setView:setAdminView,openMember,closeMember,openReservation:openReservationDrawer,closeOverlays:closeAdminOverlays,refresh:loadEventData,allowLeave:allowAdminNavigation});

window.addEventListener('admin:dashboardready',()=>void refreshCoordinator.trigger('navigation'));
initializeDashboard({onRefresh:reason=>refreshCoordinator.trigger(reason||'navigation'),onNavigate:(target,{clear=false}={})=>{
  if(!allowAdminNavigation())return;
  adminState.queueMember=null;
  window.dispatchEvent(new CustomEvent('admin:beforenavigation'));adminState.restoringRoute=true;
  try{closeAdminOverlays();adminState.dashboardDrill=clear?{}:target.drill;adminState.reservationFilter='all';adminState.reservationDetailFilters=new Set();adminState.reservationPage=1;adminState.paymentFilter=target.filter||'all';adminState.reservationSearch='';adminState.paymentSearch='';
    for(const selector of ['[data-reservation-search]','[data-payment-search]'])if($(selector))$(selector).value='';
    if(target.galleryMode){adminState.galleryFilter='pending';adminState.galleryPage=1;adminState.historyYear='all';adminState.historyClaimType='all';adminState.historyFilter='pending';adminState.historySearch='';adminState.historyPagination.page=1;setGalleryMode(target.galleryMode);}
    setAdminView(target.view);
  }finally{adminState.restoringRoute=false}
  navigation.write();renderDashboard();void loadEventData();
}});
document.addEventListener('click',async event=>{
  if(event.target.closest('[data-member-queue-clear]')){if(!allowAdminNavigation())return;window.dispatchEvent(new CustomEvent('admin:beforenavigation'));adminState.queueMember=null;setAdminView(adminState.activeAdminView);navigation.write();await loadEventData();return}
  const pending=event.target.closest('[data-member-pending]');
  if(pending){
    event.preventDefault();if(!allowAdminNavigation())return;
    window.dispatchEvent(new CustomEvent('admin:beforenavigation'));
    adminState.restoringRoute=true;
    try{closeAdminOverlays();adminState.queueMember=pending.dataset.pendingMember;adminState.dashboardDrill={};
      adminState.reservationFilter='all';adminState.reservationDetailFilters=new Set(['pending']);adminState.reservationSearch='';adminState.reservationPage=1;
      adminState.galleryFilter='pending';adminState.galleryPage=1;adminState.historyYear='all';adminState.historyFilter='pending';adminState.historyClaimType='all';adminState.historySearch='';adminState.historyPagination.page=1;
      setAdminView(pending.dataset.memberPending==='reservations'?'reservations':pending.dataset.memberPending==='history'?'club':'photos');
    }finally{adminState.restoringRoute=false}
    navigation.write();await loadEventData();return;
  }
  const button=event.target.closest('[data-command-reservation]');if(!button||!allowAdminNavigation())return;
  window.dispatchEvent(new CustomEvent('admin:beforenavigation'));
  adminState.requestedReservationId=button.dataset.commandReservation;
  navigation.write({detail:true});await loadEventData();
});

$('[data-login-form]').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('button[type="submit"]',event.currentTarget);const form=new FormData(event.currentTarget);button.disabled=true;$('[data-auth-status]').textContent='';
  try{await signInWithEmailAndPassword(auth,String(form.get('email')||'').trim(),String(form.get('password')||''))}
  catch(error){$('[data-auth-status]').textContent=error.code==='auth/invalid-credential'?'Neplatný e-mail nebo heslo.':'Přihlášení se nepodařilo.'}finally{button.disabled=false}
});

$('[data-event-select]').addEventListener('change',event=>{
  if(!adminState.events.some(item=>item.id===event.target.value))return;
  if(!allowAdminNavigation()){event.target.value=adminState.selectedEventId;return}
  window.dispatchEvent(new CustomEvent('admin:beforenavigation'));adminState.restoringRoute=true;closeAdminOverlays();adminState.restoringRoute=false;adminState.selectedEventId=event.target.value;resetAdminFiltersForEvent();resourceCache.clear();
  const reservationSearchInput=$('[data-reservation-search]');if(reservationSearchInput)reservationSearchInput.value='';
  const paymentSearchInput=$('[data-payment-search]');if(paymentSearchInput)paymentSearchInput.value='';
  window.dispatchEvent(new CustomEvent('admin:eventchanged'));void loadEventData();
});

document.addEventListener('submit',event=>{
  const settings=event.target.closest('[data-event-settings-form]');
  if(settings){event.preventDefault();saveEventSettings(settings,loadAdminData);return}
  const createForm=event.target.closest('[data-accommodation-create-form]');
  if(createForm){event.preventDefault();saveAccommodation(createForm,'',loadEventData);return}
  const editForm=event.target.closest('[data-accommodation-edit-form]');
  if(editForm){event.preventDefault();const card=editForm.closest('[data-accommodation-id]');if(card)saveAccommodation(editForm,card.dataset.accommodationId,loadEventData)}
});

document.addEventListener('click',event=>{
  const requestAccommodation=event.target.closest('[data-request-accommodation-open]');if(requestAccommodation){if(!allowAdminNavigation())return;const optionId=requestAccommodation.dataset.requestAccommodationOpen;window.dispatchEvent(new CustomEvent('admin:beforenavigation'));adminState.restoringRoute=true;try{closeReservationDrawer();setAdminView('accommodation')}finally{adminState.restoringRoute=false}navigation.write();void loadEventData().then(()=>{const card=document.querySelector(`[data-accommodation-id="${CSS.escape(optionId)}"]`);card?.scrollIntoView({block:'center'});card?.querySelector('summary')?.focus()});return}
  const logout=event.target.closest('[data-logout]');if(logout){if(!allowAdminNavigation())return;signOut(auth);return}
  const refresh=event.target.closest('[data-refresh]');if(refresh){void refreshCoordinator.trigger('manual');return}
  const collapse=event.target.closest('[data-admin-collapse-toggle]');if(collapse){const section=collapse.dataset.adminCollapseToggle;setAdminSectionCollapsed(section,collapse.getAttribute('aria-expanded')==='true',{persist:true});return}
  const jump=event.target.closest('[data-admin-jump]');if(jump){if(!allowAdminNavigation())return;adminState.queueMember=null;setAdminView(jump.dataset.adminJump);return}
  const filter=event.target.closest('[data-reservation-filter]');if(filter){setReservationFilter(filter.dataset.reservationFilter);return}
  if(event.target.closest('[data-reservation-filter-toggle]')){toggleReservationFilters();return}
  const detailFilter=event.target.closest('[data-reservation-detail-filter]');if(detailFilter){toggleReservationDetailFilter(detailFilter.dataset.reservationDetailFilter);return}
  if(event.target.closest('[data-reservation-filter-clear]')){clearReservationDetailFilters();return}
  const reservationMode=event.target.closest('[data-reservation-mode]');if(reservationMode){setReservationViewMode(reservationMode.dataset.reservationMode);return}
  const paymentFilterButton=event.target.closest('[data-payment-filter]');if(paymentFilterButton){setPaymentFilter(paymentFilterButton.dataset.paymentFilter);return}
  const attention=event.target.closest('[data-attention-target]');if(attention){const target=attention.dataset.attentionTarget;if(target==='reservations')setReservationFilter(attention.dataset.attentionFilter);if(target==='payments')setPaymentFilter(attention.dataset.attentionFilter);if(target==='gallery'){setGalleryFilter(attention.dataset.attentionFilter);setGalleryMode(attention.dataset.galleryModeTarget||'community')}setAdminView(target);return}
  const pending=event.target.closest('[data-open-pending]');if(pending){setReservationFilter('pending');setAdminView('reservations');return}
  const galleryPending=event.target.closest('[data-open-gallery-pending]');if(galleryPending){setGalleryMode('community');setGalleryFilter('pending');setAdminView('gallery');return}
  const galleryModeButton=event.target.closest('[data-gallery-mode]');if(galleryModeButton){if(!allowAdminNavigation())return;setGalleryMode(galleryModeButton.dataset.galleryMode);void loadEventData();return}
  const galleryFilterButton=event.target.closest('[data-gallery-filter]');if(galleryFilterButton){setGalleryFilter(galleryFilterButton.dataset.galleryFilter);return}
  const historyFilterButton=event.target.closest('[data-history-filter]');if(historyFilterButton){setHistoryFilter(historyFilterButton.dataset.historyFilter);return}
  if(event.target.closest('[data-history-clear]')){clearHistoryFilters();return}
  const historyPageButton=event.target.closest('[data-history-page]');if(historyPageButton){changeHistoryPage(historyPageButton.dataset.historyPage);return}
  const reservationOpen=event.target.closest('[data-reservation-open]');if(reservationOpen){if(!allowAdminNavigation())return;openReservationDrawer(reservationOpen.dataset.reservationOpen,reservationOpen);return}
  if(event.target.closest('[data-reservation-drawer-close]')){if(!allowAdminNavigation())return;closeReservationDrawer();return}
  const paymentSave=event.target.closest('[data-payment-save]');if(paymentSave){const card=paymentSave.closest('[data-reservation-id]');if(card)updateReservationPayment(card,false,loadEventData);return}
  const notesSave=event.target.closest('[data-reservation-notes-save]');if(notesSave){const card=notesSave.closest('[data-reservation-id]');if(card)saveReservationNotes(card);return}
  const paymentFull=event.target.closest('[data-payment-full]');if(paymentFull){const card=paymentFull.closest('[data-reservation-id]');if(card)updateReservationPayment(card,true,loadEventData);return}
  const requestDecision=event.target.closest('[data-request-decision]');if(requestDecision){const card=requestDecision.closest('[data-reservation-id]');if(card)reviewReservationRequest(card,requestDecision.dataset.requestDecision);return}
  const preview=event.target.closest('[data-gallery-preview]');if(preview){openGalleryLightbox(preview.dataset.galleryPreview,preview);return}
  if(event.target.closest('[data-gallery-lightbox-close]')){if(!allowAdminNavigation())return;closeGalleryLightbox();return}
  const galleryAction=event.target.closest('[data-gallery-action]');if(galleryAction){const card=galleryAction.closest('[data-gallery-id]');if(card)updateGallery(card,galleryAction.dataset.galleryAction);return}
  const historyEvidence=event.target.closest('[data-history-evidence]');if(historyEvidence){openHistoryEvidence(historyEvidence.dataset.historyEvidence,historyEvidence);return}
  if(event.target.closest('[data-history-evidence-close]')){closeHistoryEvidence();return}
  const historyAction=event.target.closest('[data-history-action]');if(historyAction){const card=historyAction.closest('[data-history-id]');if(card)reviewHistoryClaim(card,historyAction.dataset.historyComponent,historyAction.dataset.historyAction);return}
  const photoUpload=event.target.closest('[data-accommodation-photo-upload]');if(photoUpload){uploadAccommodationPhoto(photoUpload.closest('[data-accommodation-id]'),loadEventData);return}
  const photoRemove=event.target.closest('[data-accommodation-photo-remove]');if(photoRemove){removeAccommodationPhoto(photoRemove.closest('[data-accommodation-id]'),loadEventData);return}
  const galleryUpload=event.target.closest('[data-accommodation-gallery-upload]');if(galleryUpload){uploadAccommodationGalleryPhoto(galleryUpload.closest('[data-accommodation-id]'),loadEventData);return}
  const galleryRemove=event.target.closest('[data-accommodation-gallery-remove]');if(galleryRemove){removeAccommodationGalleryPhoto(galleryRemove,loadEventData);return}
  const galleryMove=event.target.closest('[data-accommodation-gallery-move]');if(galleryMove){moveAccommodationGalleryPhoto(galleryMove,loadEventData);return}
  const action=event.target.closest('[data-review-action]');if(action){const card=action.closest('[data-reservation-id]');if(card)updateReservation(card,action.dataset.reviewAction,loadEventData)}
});

document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('[data-reservation-drawer]').hidden){if(!allowAdminNavigation())return;closeReservationDrawer();return}
  if(event.key==='Escape'&&!$('[data-gallery-lightbox]').hidden){if(!allowAdminNavigation())return;closeGalleryLightbox();return}
  if(event.key==='Escape'&&!$('[data-history-evidence-lightbox]').hidden){closeHistoryEvidence();return}
  if((event.key==='Enter'||event.key===' ')&&event.target.matches('tr[data-reservation-open]')){event.preventDefault();if(!allowAdminNavigation())return;openReservationDrawer(event.target.dataset.reservationOpen,event.target);return}
  if((event.key==='Enter'||event.key===' ')&&event.target.closest('[data-open-pending]')){event.preventDefault();setReservationFilter('pending');setAdminView('reservations')}
  if((event.key==='Enter'||event.key===' ')&&event.target.closest('[data-open-gallery-pending]')){event.preventDefault();setGalleryFilter('pending');setAdminView('gallery')}
});

$('[data-reservation-search]')?.addEventListener('input',event=>setReservationSearch(event.target.value));
$('[data-payment-search]')?.addEventListener('input',event=>setPaymentSearch(event.target.value));
$('[data-history-search]')?.addEventListener('input',event=>setHistorySearch(event.target.value));
document.addEventListener('change',event=>{
  if(event.target.matches('[data-accommodation-photo-input]')){previewAccommodationPhoto(event.target);return}
  if(event.target.matches('[data-accommodation-gallery-input]')){previewAccommodationGalleryPhoto(event.target);return}
  if(event.target.matches('[data-history-year]')){setHistoryYear(event.target.value);return}
  if(event.target.matches('[data-history-type]'))setHistoryClaimType(event.target.value);
});
document.addEventListener('toggle',event=>hydrateOpenHistoryCard(event.target),true);

onAuthStateChanged(auth,user=>{
  adminState.sessionGeneration++;
  if(adminState.currentUser&&adminState.currentUser!==user)clearPrivateState();
  adminState.currentUser=user;adminState.denied=false;
  if(!user){clearPrivateState();setView('auth');$('[data-admin-account]').textContent='';return}
  resetAdminFiltersForLogin();
  $('[data-admin-account]').textContent=user.email||user.uid;
  void loadAdminData();
});
