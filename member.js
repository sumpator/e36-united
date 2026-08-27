import { firebaseConfig, portalConfig } from './firebase-config.js?v=20260823-auth2';
import qrcode from './vendor/qrcode-generator.mjs';
import { initPortalNavigation } from './portal-navigation.js?v=20260825-mobile1';
import { initUnitedAuth } from './united-auth.js?v=20260825-phase-a1';
import { deriveMemberHeroState, deriveOverviewState } from './member-portal-state.js?v=20260827-payment-reconciliation';
import { MAX_RESERVATION_CREW, newerPlannerDraft, validatePlannerDraft } from './planner-state.js?v=20260827-reservation-limits';
import { performMemberLogout } from './member-logout.js?v=20260826-predeploy-fix';
import { createImagePreviewController, selectImageFiles } from './image-upload.js?v=20260827-garage-photos';

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const apiBaseUrl=(portalConfig.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'');
const localPrefix=portalConfig.memberLocalPrefix||'e36UnitedMemberLocalV20';
const plannerDraftKey=portalConfig.plannerDraftKey||'e36UnitedPlannerDraftV19';
const plannerHandoffPrefix='e36UnitedPlannerHandoff:v1:';
const memberUrlParams=new URLSearchParams(window.location.search);
let pendingPlannerHandoffId=memberUrlParams.get('draft')||'';
const czkFormatter=new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:0});

let firebase=null;
let unitedAuth=null;
let currentUser=null;
let authFlowActive=false;
let memberGallery=[];
let memberGalleryHasMore=false;
let memberGalleryLoading=false;
let reservationState={registrationOpen:false,event:null,message:'',accommodationOptions:[]};
const carPhotoObjectUrls=new Map();
const carPhotoObjectUrlRequests=new Map();
const memberGalleryObjectUrls=new Map();
const memberGalleryObjectUrlRequests=new Map();
let carPhotoRequestGeneration=0;
let memberGalleryRequestGeneration=0;
let memberHeroPhotoId='';

const defaultData=()=>({
  profile:{id:'',memberCode:'',name:'United Member',nickname:'Driver',email:'',phone:'',role:'member',status:'active',emailVerified:false,createdAt:''},
  history:portalConfig.unitedYears.map(year=>({year,attended:false,verified:false,winner:false,category:''})),
  cars:[],
  reservation:null,
  bonuses:[]
});
let data=defaultData();
let plannerHandoffMemory=null;
let activePlannerHandoff=null;
let plannerHandoffChoice='none';
let plannerHandoffApplied=false;
let plannerDraftSyncState='idle';
let legacyPlannerDraftApplied=false;
let returnToReservationAfterCar=false;

function decodePlannerHandoff(value){
  try{
    const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),padding='='.repeat((4-normalized.length%4)%4);
    const binary=atob(normalized+padding),bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }catch(error){console.debug('Weekend Planner handoff could not be decoded.',error);return null}
}
function validatePlannerHandoff(candidate){return validatePlannerDraft(candidate)}
function cleanupPlannerHandoffs(){
  try{for(let index=localStorage.length-1;index>=0;index--){const key=localStorage.key(index);if(!key?.startsWith(plannerHandoffPrefix))continue;let valid=null;try{valid=validatePlannerHandoff(JSON.parse(localStorage.getItem(key)||'null'))}catch{}if(!valid)localStorage.removeItem(key)}}
  catch(error){console.debug('Weekend Planner cleanup is unavailable.',error)}
}
function stripHandoffFragment(){
  const url=new URL(window.location.href),fragment=new URLSearchParams(url.hash.replace(/^#/,''));
  if(!fragment.has('handoff'))return;
  fragment.delete('handoff');url.hash=fragment.toString()?`#${fragment}`:'';
  try{history.replaceState(null,'',`${url.pathname}${url.search}${url.hash}`)}catch(error){console.debug('Weekend Planner address cleanup is unavailable.',error)}
}
function hydratePlannerHandoffFromUrl(){
  cleanupPlannerHandoffs();
  const fragment=new URLSearchParams(window.location.hash.replace(/^#/,'')),encoded=fragment.get('handoff');if(!encoded)return;
  const handoff=validatePlannerHandoff(decodePlannerHandoff(encoded));
  if(handoff&&(!pendingPlannerHandoffId||handoff.draftId===pendingPlannerHandoffId)){
    pendingPlannerHandoffId=handoff.draftId;plannerHandoffMemory=handoff;
    try{localStorage.setItem(`${plannerHandoffPrefix}${handoff.draftId}`,JSON.stringify(handoff))}catch(error){console.debug('Weekend Planner handoff remains in this session.',error)}
  }
  stripHandoffFragment();
}
function loadPlannerHandoff(){
  if(!pendingPlannerHandoffId)return null;
  let candidate=plannerHandoffMemory?.draftId===pendingPlannerHandoffId?plannerHandoffMemory:null;
  if(!candidate){try{candidate=JSON.parse(localStorage.getItem(`${plannerHandoffPrefix}${pendingPlannerHandoffId}`)||'null')}catch(error){console.debug('Weekend Planner handoff storage is unavailable.',error)}}
  const valid=validatePlannerHandoff(candidate);
  if(!valid){try{localStorage.removeItem(`${plannerHandoffPrefix}${pendingPlannerHandoffId}`)}catch{}return null}
  const currentEventId=reservationState.event?.id||null;if(valid.eventId&&currentEventId&&String(valid.eventId)!==String(currentEventId))return null;
  plannerHandoffMemory=valid;return valid;
}

function localKey(uid){return `${localPrefix}:${uid}`}
function loadUserLocal(uid){
  if(!uid)return defaultData();
  try{
    const raw=localStorage.getItem(localKey(uid));
    const parsed=raw?JSON.parse(raw):{};
    return {
      ...defaultData(),
      history:Array.isArray(parsed.history)?parsed.history:defaultData().history,
      cars:[],
      reservation:null,
      bonuses:Array.isArray(parsed.bonuses)?parsed.bonuses:[]
    };
  }catch(error){
    console.warn('Local member data could not be loaded',error);
    return defaultData();
  }
}
function saveUserLocal(){
  if(!currentUser?.uid)return;
  const payload={history:data.history,bonuses:data.bonuses};
  try{localStorage.setItem(localKey(currentUser.uid),JSON.stringify(payload))}
  catch(error){console.error('Local member data could not be saved',error);toast('Lokální data se nepodařilo uložit. Zkus odebrat velké fotografie.')}
}
function clearCarPhotoObjectUrls(){carPhotoRequestGeneration+=1;for(const url of carPhotoObjectUrls.values())URL.revokeObjectURL(url);carPhotoObjectUrls.clear();carPhotoObjectUrlRequests.clear()}
function clearMemberGalleryObjectUrls(){memberGalleryRequestGeneration+=1;for(const url of memberGalleryObjectUrls.values())URL.revokeObjectURL(url);memberGalleryObjectUrls.clear();memberGalleryObjectUrlRequests.clear()}
function pruneCarPhotoObjectUrls(){
  const activeIds=new Set(data.cars.flatMap(car=>(car.photos||[]).map(photo=>String(photo.id))));
  for(const [id,url] of carPhotoObjectUrls){if(!activeIds.has(String(id))){URL.revokeObjectURL(url);carPhotoObjectUrls.delete(id)}}
  for(const id of carPhotoObjectUrlRequests.keys()){if(!activeIds.has(String(id)))carPhotoObjectUrlRequests.delete(id)}
}
function resetMemberState(){clearCarPhotoObjectUrls();clearMemberGalleryObjectUrls();memberGallery=[];memberGalleryHasMore=false;reservationState={registrationOpen:false,event:null,message:'',accommodationOptions:[]};plannerDraftSyncState='idle';activePlannerHandoff=null;legacyPlannerDraftApplied=false;data=defaultData();renderAll()}
function toast(msg){const el=$('[data-toast]');if(!el)return;el.textContent=msg;el.classList.add('is-visible');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('is-visible'),3200)}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function uid(){return crypto?.randomUUID?.()||Math.random().toString(36).slice(2,10)}

function setMode(text){
  $$('[data-mode-badge]').forEach(x=>x.textContent=text);
  const sync=$('[data-sync-state]');if(sync)sync.textContent=text;
  $$('[data-demo-hint]').forEach(x=>x.hidden=text.includes('LIVE'));
}
function setMainMobileMemberNavigation(authenticated){const nav=$('[data-member-main-mobile-nav]');if(nav)nav.hidden=!authenticated;if(!authenticated)closeMainMenu()}
function showAuth(){
  document.body.classList.remove('member-authenticated');
  setMainMobileMemberNavigation(false);
  const authView=$('[data-auth-view]'),appView=$('[data-app-view]'),statusView=$('[data-auth-status-view]');
  if(statusView)statusView.hidden=true;
  if(authView)authView.hidden=false;
  if(appView)appView.hidden=true;
}
function showAuthStatus({title='Ověřuji přihlášení.',copy='Počkám na potvrzený stav Firebase session.',retry=false}={}){
  document.body.classList.remove('member-authenticated');
  setMainMobileMemberNavigation(false);
  const authView=$('[data-auth-view]'),appView=$('[data-app-view]'),statusView=$('[data-auth-status-view]');
  if(authView)authView.hidden=true;
  if(appView)appView.hidden=true;
  if(statusView){statusView.hidden=false;$('[data-auth-status-title]',statusView).textContent=title;$('[data-auth-status-copy]',statusView).textContent=copy;const button=$('[data-auth-retry]',statusView);if(button)button.hidden=!retry}
}
function showApp(){
  document.body.classList.add('member-authenticated');
  setMainMobileMemberNavigation(true);
  const authView=$('[data-auth-view]'),appView=$('[data-app-view]'),statusView=$('[data-auth-status-view]');
  if(statusView)statusView.hidden=true;
  if(authView)authView.hidden=true;
  if(appView)appView.hidden=false;
  renderAll();
}
function activateAuthTab(name){
  $$('[data-auth-tab]').forEach(x=>x.classList.toggle('is-active',x.dataset.authTab===name));
  $$('[data-auth-form]').forEach(f=>f.classList.toggle('is-active',f.dataset.authForm===name));
}
function resetAuthForms(){
  $$('[data-auth-form]').forEach(form=>form.reset());
  activateAuthTab('login');
}
function setButtonBusy(button,busy,label){
  if(!button)return;
  if(busy){button.dataset.originalHtml=button.innerHTML;button.disabled=true;if(label)button.textContent=label}
  else{button.disabled=false;if(button.dataset.originalHtml){button.innerHTML=button.dataset.originalHtml;delete button.dataset.originalHtml}}
}

function normalizeMember(payload,user=currentUser){
  const source=payload?.member||payload?.profile||payload?.data?.member||payload?.data?.profile||payload?.data||payload||{};
  return {
    id:source.id||source.uid||user?.uid||'',
    memberCode:source.memberCode||source.member_code||'',
    name:source.name||user?.displayName||user?.email?.split('@')[0]||'United Member',
    nickname:source.nickname||source.name?.split(' ')[0]||user?.displayName?.split(' ')[0]||'Driver',
    email:source.email||user?.email||'',
    phone:source.phone||'',
    role:source.role||'member',
    status:source.status||'active',
    emailVerified:typeof source.emailVerified==='boolean'?source.emailVerified:Boolean(source.email_verified??user?.emailVerified),
    createdAt:source.createdAt||source.created_at||'',
    updatedAt:source.updatedAt||source.updated_at||''
  };
}

async function apiRequest(path,{method='GET',body,token,retry=true}={}){
  if(!currentUser)throw new Error('api_auth_required');
  const idToken=token||await currentUser.getIdToken();
  let response;
  try{
    response=await fetch(`${apiBaseUrl}${path}`,{
      method,
      headers:{Authorization:`Bearer ${idToken}`,...(body?{'Content-Type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined,
      cache:'no-store'
    });
  }catch(error){
    const wrapped=new Error('api_network_error');wrapped.cause=error;throw wrapped;
  }
  if(response.status===401&&retry){
    const freshToken=await currentUser.getIdToken(true);
    return apiRequest(path,{method,body,token:freshToken,retry:false});
  }
  const text=await response.text();
  let payload=null;
  if(text){try{payload=JSON.parse(text)}catch{payload={message:text}}}
  if(!response.ok){
    const error=new Error(payload?.message||payload?.error||`API ${response.status}`);
    error.status=response.status;error.payload=payload;throw error;
  }
  return payload;
}

async function apiRequestForm(path,formData,{method='POST',token,retry=true}={}){
  if(!currentUser)throw new Error('api_auth_required');
  const idToken=token||await currentUser.getIdToken();
  let response;
  try{
    response=await fetch(`${apiBaseUrl}${path}`,{method,headers:{Authorization:`Bearer ${idToken}`},body:formData,cache:'no-store'});
  }catch(error){const wrapped=new Error('api_network_error');wrapped.cause=error;throw wrapped}
  if(response.status===401&&retry){const freshToken=await currentUser.getIdToken(true);return apiRequestForm(path,formData,{method,token:freshToken,retry:false})}
  const text=await response.text();let payload=null;if(text){try{payload=JSON.parse(text)}catch{payload={message:text}}}
  if(!response.ok){const error=new Error(payload?.message||payload?.error||`API ${response.status}`);error.status=response.status;error.payload=payload;throw error}
  return payload;
}

async function apiRequestBlob(path,{token,retry=true}={}){
  if(!currentUser)throw new Error('api_auth_required');
  const idToken=token||await currentUser.getIdToken();
  let response;
  try{response=await fetch(`${apiBaseUrl}${path}`,{headers:{Authorization:`Bearer ${idToken}`},cache:'no-store'})}
  catch(error){const wrapped=new Error('api_network_error');wrapped.cause=error;throw wrapped}
  if(response.status===401&&retry){const freshToken=await currentUser.getIdToken(true);return apiRequestBlob(path,{token:freshToken,retry:false})}
  if(!response.ok){const error=new Error(`API ${response.status}`);error.status=response.status;throw error}
  return await response.blob();
}
async function getPrivateCarPhotoUrl(photoId){
  if(carPhotoObjectUrls.has(photoId))return carPhotoObjectUrls.get(photoId);
  if(carPhotoObjectUrlRequests.has(photoId))return await carPhotoObjectUrlRequests.get(photoId);
  const generation=carPhotoRequestGeneration,userId=currentUser?.uid;
  let request;request=apiRequestBlob(`/api/cars/media/${encodeURIComponent(photoId)}`).then(blob=>{
    if(generation!==carPhotoRequestGeneration||userId!==currentUser?.uid||!data.cars.some(car=>(car.photos||[]).some(photo=>String(photo.id)===String(photoId))))throw new Error('stale_car_photo_request');
    const existing=carPhotoObjectUrls.get(photoId);if(existing)return existing;const url=URL.createObjectURL(blob);carPhotoObjectUrls.set(photoId,url);return url;
  }).finally(()=>{if(carPhotoObjectUrlRequests.get(photoId)===request)carPhotoObjectUrlRequests.delete(photoId)});
  carPhotoObjectUrlRequests.set(photoId,request);
  return await request;
}
async function getPrivateMemberGalleryPhotoUrl(photoId){
  if(memberGalleryObjectUrls.has(photoId))return memberGalleryObjectUrls.get(photoId);
  if(memberGalleryObjectUrlRequests.has(photoId))return await memberGalleryObjectUrlRequests.get(photoId);
  const generation=memberGalleryRequestGeneration,userId=currentUser?.uid;
  let request;request=apiRequestBlob(`/api/gallery/mine/media/${encodeURIComponent(photoId)}`).then(blob=>{
    if(generation!==memberGalleryRequestGeneration||userId!==currentUser?.uid||!memberGallery.some(photo=>String(photo.id)===String(photoId)))throw new Error('stale_member_gallery_request');
    const existing=memberGalleryObjectUrls.get(photoId);if(existing)return existing;const url=URL.createObjectURL(blob);memberGalleryObjectUrls.set(photoId,url);return url;
  }).finally(()=>{if(memberGalleryObjectUrlRequests.get(photoId)===request)memberGalleryObjectUrlRequests.delete(photoId)});
  memberGalleryObjectUrlRequests.set(photoId,request);
  return await request;
}

async function loadCarsFromApi(){
  const payload=await apiRequest('/api/cars');
  return Array.isArray(payload?.cars)?payload.cars:[];
}
async function loadMemberGallery({append=false}={}){
  if(memberGalleryLoading)return memberGallery;
  memberGalleryLoading=true;
  try{
    const offset=append?memberGallery.length:0,payload=await apiRequest(`/api/gallery/mine?limit=24&offset=${offset}`),items=Array.isArray(payload?.submissions)?payload.submissions:[];
    if(!append){clearMemberGalleryObjectUrls();memberGallery=[]}
    const known=new Set(memberGallery.map(item=>String(item.id)));
    memberGallery.push(...items.filter(item=>!known.has(String(item.id))));
    memberGalleryHasMore=payload?.pagination?.hasMore===true;
    renderMemberGallery();
    return memberGallery;
  }finally{memberGalleryLoading=false}
}
function normalizeAccommodationOption(source){
  return {
    id:String(source?.id||''),eventId:String(source?.eventId||''),name:String(source?.name||''),kind:source?.kind==='tent'?'tent':'cabin',
    inventoryMode:source?.inventoryMode==='unlimited'?'unlimited':'limited',unitsTotal:Number(source?.unitsTotal||0),blockedUnits:Number(source?.blockedUnits||0),
    freeUnits:source?.freeUnits==null?null:Number(source.freeUnits),capacityPerUnit:Math.max(1,Number(source?.capacityPerUnit||1)),unitPriceCzk:Number(source?.unitPriceCzk||0),
    personPriceCzk:Number(source?.personPriceCzk||0),beddingFeePerPersonCzk:Number(source?.beddingFeePerPersonCzk||0),cityTaxPerPersonPerNightCzk:Number(source?.cityTaxPerPersonPerNightCzk||0),
    active:source?.active!==false,soldOut:source?.soldOut===true,
  };
}
function normalizeAccommodationSnapshot(source){
  if(!source?.optionId)return null;
  return {
    optionId:String(source.optionId),optionName:String(source.optionName||''),kind:String(source.kind||''),peopleCount:Number(source.peopleCount||0),unitCount:Number(source.unitCount||0),
    unitPriceCzk:Number(source.unitPriceCzk||0),personPriceCzk:Number(source.personPriceCzk||0),beddingFeePerPersonCzk:Number(source.beddingFeePerPersonCzk||0),cityTaxPerPersonPerNightCzk:Number(source.cityTaxPerPersonPerNightCzk||0),nights:Number(source.nights||0),
    baseTotalCzk:Number(source.baseTotalCzk||0),personTotalCzk:Number(source.personTotalCzk||0),beddingTotalCzk:Number(source.beddingTotalCzk||0),cityTaxTotalCzk:Number(source.cityTaxTotalCzk||0),totalCzk:Number(source.totalCzk||0),
  };
}
function normalizePayment(source){
  if(!source||typeof source!=='object')return null;
  return {
    amountDueCzk:Number(source.amountDueCzk||0),amountPaidCzk:Number(source.amountPaidCzk||0),balanceCzk:Number(source.balanceCzk||0),remainingCzk:Number(source.remainingCzk||0),overpaymentCzk:Number(source.overpaymentCzk||0),
    status:String(source.status||'unpaid'),overdue:source.overdue===true,variableSymbol:source.variableSymbol?String(source.variableSymbol):'',
    recipientName:String(source.recipientName||''),accountDisplay:String(source.accountDisplay||''),iban:String(source.iban||''),currency:String(source.currency||'CZK'),
    message:String(source.message||''),deadline:String(source.deadline||''),testMode:source.testMode!==false,configurationReady:source.configurationReady===true,
    actionable:source.actionable===true,awaitingApproval:source.awaitingApproval===true,spayd:source.spayd?String(source.spayd):'',paidAt:String(source.paidAt||''),
  };
}
function normalizeReservation(source){
  if(!source)return null;
  const snapshot=source.carSnapshot||{};
  return {
    id:source.id||'',
    eventId:source.eventId||'',
    year:source.eventYear||source.year||'NEXT',
    title:source.title||'Příští E36 United',
    carId:source.carId||snapshot.id||'',
    carSnapshot:{
      id:snapshot.id||source.carId||'',
      nickname:snapshot.nickname||'',
      model:snapshot.model||'',
      body:snapshot.body||'',
      year:snapshot.year||'',
      color:snapshot.color||'',
    },
    arrival:source.arrival||'Pátek',
    crew:Number(source.crew||1),
    sleep:source.accommodation||source.sleep||'Bez ubytování',
    attendanceType:source.attendanceType||'',
    accommodationUnits:Number(source.accommodationUnits||0),
    accommodationSnapshot:normalizeAccommodationSnapshot(source.accommodationSnapshot),
    showshine:source.showShine||source.showshine||'Ne',
    note:source.note||'',
    status:source.status||'pending',
    changePending:source.changePending===true,
    paymentStatus:source.paymentStatus||'unpaid',
    amountDueCzk:Number(source.amountDueCzk||0),
    amountPaidCzk:Number(source.amountPaidCzk||0),
    payment:normalizePayment(source.payment),
    submittedAt:source.submittedAt||'',
    updatedAt:source.updatedAt||'',
  };
}
async function loadCurrentReservation(){
  const payload=await apiRequest('/api/reservations/current');
  reservationState={
    registrationOpen:payload?.registrationOpen===true,
    event:payload?.event||null,
    message:payload?.message||'',
    accommodationOptions:Array.isArray(payload?.accommodationOptions)?payload.accommodationOptions.map(normalizeAccommodationOption).filter(option=>option.id):[],
  };
  return normalizeReservation(payload?.reservation);
}

async function loadServerPlannerDraft(){
  try{
    const payload=await apiRequest('/api/planner-draft');
    return {available:true,draft:validatePlannerHandoff(payload?.draft)};
  }catch(error){console.warn('Planner draft API unavailable',error);return {available:false,draft:null,error}}
}

async function ensureMemberProfile(user){
  currentUser=user;
  let payload=await apiRequest('/api/me');
  if(payload?.profileExists===false){
    const fallbackName=(user.displayName||user.email?.split('@')[0]||'United Member').trim();
    payload=await apiRequest('/api/bootstrap',{
      method:'POST',
      body:{name:fallbackName,nickname:fallbackName.split(/\s+/)[0]||'Driver'}
    });
  }
  const member=normalizeMember(payload,user);
  if(!member.id)throw new Error('member_profile_invalid');
  if(member.id!==user.uid)throw new Error('member_identity_mismatch');
  if(['inactive','blocked','suspended'].includes(String(member.status||'').toLowerCase()))throw new Error('member_inactive');
  return member;
}

async function openAuthenticatedSession(user,{quiet=false}={}){
  currentUser=user;
  const member=await ensureMemberProfile(user);
  const local=loadUserLocal(user.uid);
  const [cars,reservation,plannerDraftResult]=await Promise.all([
    loadCarsFromApi().catch(error=>{console.warn('Cars API unavailable',error);return []}),
    loadCurrentReservation(),
    loadServerPlannerDraft(),
    loadMemberGallery().catch(error=>{console.warn('Gallery status unavailable',error);memberGallery=[];return []}),
  ]);
  data={...local,profile:member,cars,reservation};
  saveUserLocal();
  setMode('AUTH + PROFIL LIVE');
  showApp();
  openSection('overview');
  await applyPlannerDraft(plannerDraftResult);
  if(!quiet)toast(`Přihlášen jako ${member.nickname||member.name}.`);
}

async function restoreAuthenticatedSession(user,{quiet=true}={}){
  currentUser=user;
  showAuthStatus({title:'Načítám tvůj United.',copy:'Session je potvrzená. Připravuji profil, garáž a aktuální stav srazu.'});
  try{await openAuthenticatedSession(user,{quiet});return true}
  catch(error){
    console.error('Unable to restore member session',error);
    resetMemberState();
    setMode('AUTH OK · PROFIL NEDOSTUPNÝ');
    showAuthStatus({title:'Session zůstává aktivní.',copy:`${apiError(error)} Tvoje Firebase přihlášení jsme nezměnili.`,retry:true});
    return false;
  }
}

async function handleUnitedAuthState(state){
  if(state.context)firebase=state.context;
  if(state.status==='loading'){
    showAuthStatus();setMode('AUTH LOADING');return;
  }
  if(state.status==='error'){
    console.error('Firebase Auth initialization failed',state.error);
    setMode('AUTH NEDOSTUPNÝ');
    showAuthStatus({title:'Přihlášení se nepodařilo ověřit.',copy:'Tvoje uložená session nebyla změněna. Zkontroluj připojení a zkus to znovu.',retry:true});
    return;
  }
  if(authFlowActive)return;
  if(state.status==='anonymous'){
    currentUser=null;resetMemberState();showAuth();setMode('AUTH READY');return;
  }
  await restoreAuthenticatedSession(state.user);
}

async function initFirebase(){
  // Production auth must fail closed. Remove legacy preview/session state so it can never authenticate a user.
  try{['e36UnitedMemberPreviewV19','e36UnitedMemberPreviewV18','e36UnitedMemberSessionV19'].forEach(key=>localStorage.removeItem(key))}catch(error){console.debug('Legacy preview storage cleanup is unavailable.',error)}
  showAuthStatus();
  unitedAuth=initUnitedAuth({config:firebaseConfig,onStateChange:handleUnitedAuthState});
  await unitedAuth.ready;
}

$$('[data-auth-tab]').forEach(btn=>btn.addEventListener('click',()=>activateAuthTab(btn.dataset.authTab)));
$$('[data-toggle-password]').forEach(button=>button.addEventListener('click',()=>{const input=button.parentElement.querySelector('input');if(input)input.type=input.type==='password'?'text':'password'}));

$('[data-auth-form="login"]')?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!firebase)return toast('Přihlášení teď není dostupné.');
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),fd=new FormData(form);
  const email=String(fd.get('email')||'').trim().toLowerCase(),password=String(fd.get('password')||'');
  resetMemberState();showAuth();
  authFlowActive=true;setButtonBusy(button,true,'Přihlašuji…');
  let credential=null;
  try{
    credential=await firebase.signInWithEmailAndPassword(firebase.auth,email,password);
  }catch(error){
    console.error('Login failed',error);
    currentUser=null;resetMemberState();showAuth();setMode('AUTH READY');toast(authOrApiError(error));
  }
  if(credential){
    currentUser=credential.user;
    const restored=await restoreAuthenticatedSession(credential.user,{quiet:false});
    if(!restored)toast('Přihlášení je aktivní, ale profil se teď nepodařilo načíst.');
  }
  authFlowActive=false;setButtonBusy(button,false);
});

$('[data-auth-form="register"]')?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!firebase)return toast('Registrace teď není dostupná.');
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),fd=new FormData(form);
  const email=String(fd.get('email')||'').trim().toLowerCase(),password=String(fd.get('password')||''),passwordConfirm=String(fd.get('passwordConfirm')||''),name=String(fd.get('name')||'').trim(),nickname=String(fd.get('nickname')||'').trim()||name.split(/\s+/)[0];
  if(password!==passwordConfirm)return toast('Hesla se neshodují.');
  authFlowActive=true;setButtonBusy(button,true,'Zakládám United ID…');
  let createdUser=null,emailSent=false,bootstrapOk=false;
  try{
    const cred=await firebase.createUserWithEmailAndPassword(firebase.auth,email,password);
    createdUser=cred.user;currentUser=createdUser;
    await firebase.updateProfile(createdUser,{displayName:name});
    try{await apiRequest('/api/bootstrap',{method:'POST',body:{name,nickname}});bootstrapOk=true}catch(error){console.error('Member bootstrap failed after registration',error)}
    try{await firebase.sendEmailVerification(createdUser);emailSent=true}catch(error){console.error('Verification email failed',error)}
  }catch(error){
    console.error('Registration failed',error);toast(authError(error));return;
  }finally{
    if(createdUser){try{await firebase.signOut(firebase.auth)}catch(error){console.warn('Sign out after registration failed',error)}}
    currentUser=null;resetMemberState();showAuth();activateAuthTab('login');
    const loginEmail=$('[data-auth-form="login"] input[name="email"]');if(loginEmail)loginEmail.value=email;
    authFlowActive=false;setButtonBusy(button,false);
  }
  if(bootstrapOk&&emailSent)toast('United ID bylo vytvořeno. Ověření e-mailu jsme odeslali; teď se můžeš přihlásit.');
  else if(bootstrapOk)toast('United ID bylo vytvořeno. Teď se můžeš přihlásit; ověřovací e-mail se nepodařilo odeslat.');
  else toast('United ID bylo vytvořeno. Profil se doplní při prvním přihlášení.');
});

$('[data-password-reset]')?.addEventListener('click',async()=>{
  const email=$('[data-auth-form="login"] input[name="email"]')?.value?.trim().toLowerCase();
  if(!email)return toast('Nejdřív vyplň e-mail.');
  if(!firebase)return toast('Reset hesla teď není dostupný.');
  try{await firebase.sendPasswordResetEmail(firebase.auth,email);toast('Odkaz pro nové heslo byl odeslán.')}catch(error){toast(authError(error))}
});

$('[data-auth-retry]')?.addEventListener('click',async()=>{
  const user=firebase?.auth?.currentUser||currentUser;
  if(user)await restoreAuthenticatedSession(user);
  else await unitedAuth?.retry();
});

async function logoutMember(){
  if(authFlowActive)return false;
  authFlowActive=true;
  const signedOut=await performMemberLogout({
    signOut:()=>{if(!firebase)throw new Error('firebase_unavailable');return firebase.signOut(firebase.auth)},
    onSuccess:()=>{memberPortalNavigation?.close({restoreFocus:false});closeMainMenu();currentUser=null;resetMemberState();resetAuthForms();showAuth();setMode('AUTH READY');toast('Odhlášeno.')},
    onFailure:error=>{console.warn('Firebase logout failed',error);toast('Odhlášení se nepodařilo. Tvoje přihlášení zůstalo aktivní. Zkus to znovu.')},
  });
  authFlowActive=false;
  return signedOut;
}
$$('[data-logout]').forEach(button=>button.addEventListener('click',logoutMember));

$('[data-account-form]')?.addEventListener('submit',async event=>{
  event.preventDefault();if(!currentUser)return toast('Nejdřív se přihlas.');
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),fd=new FormData(form);setButtonBusy(button,true,'Ukládám profil…');
  try{const payload=await apiRequest('/api/bootstrap',{method:'POST',body:{name:String(fd.get('name')||'').trim(),nickname:String(fd.get('nickname')||'').trim(),phone:String(fd.get('phone')||'').trim()}});data.profile=normalizeMember(payload,currentUser);renderProfile();renderAccount();toast('Profil byl uložen.')}
  catch(error){console.error('Member profile update failed',error);toast(apiError(error))}
  finally{setButtonBusy(button,false)}
});

function authError(error){
  const code=String(error?.code||'');
  if(code.includes('invalid-credential')||code.includes('wrong-password')||code.includes('user-not-found'))return 'E-mail nebo heslo nesedí.';
  if(code.includes('email-already-in-use')||code.includes('email-already'))return 'Tento e-mail už United ID má.';
  if(code.includes('weak-password'))return 'Heslo musí mít alespoň 6 znaků.';
  if(code.includes('invalid-email'))return 'E-mail nemá platný formát.';
  if(code.includes('too-many-requests'))return 'Příliš mnoho pokusů. Zkus to za chvíli znovu.';
  if(code.includes('network-request-failed'))return 'Nepodařilo se spojit s Firebase. Zkontroluj připojení.';
  if(code.includes('unauthorized-domain'))return 'Tato doména není ve Firebase povolená.';
  if(code.includes('operation-not-allowed'))return 'Přihlášení e-mailem není ve Firebase povolené.';
  if(code.includes('user-disabled'))return 'Tento účet je deaktivovaný.';
  return 'Akci se nepodařilo dokončit.';
}
function apiError(error){
  if(error?.message==='api_network_error')return 'Můj United teď není dostupný. Zkus stránku obnovit.';
  if(error?.message==='member_identity_mismatch')return 'Bezpečnostní kontrola profilu selhala.';
  if(error?.message==='member_inactive')return 'Tento členský účet není aktivní.';
  if(error?.status===401)return 'Přihlášení vypršelo. Přihlas se znovu.';
  if(error?.status===403)return 'Z této domény se do Můj United nelze připojit.';
  if(error?.status>=500)return 'Členský profil je dočasně nedostupný.';
  if(error?.message==='reservation_response_invalid')return 'Rezervaci se nepodařilo správně načíst. Zkus stránku obnovit.';
  if(error?.payload?.message)return String(error.payload.message);
  return 'Členský profil se nepodařilo načíst.';
}
function authOrApiError(error){return error?.status||error?.message==='api_network_error'?apiError(error):authError(error)}

$$('.member-nav-item[data-member-section]').forEach(button=>button.addEventListener('click',()=>openSection(button.dataset.memberSection)));
$$('[data-jump]').forEach(button=>button.addEventListener('click',()=>openSection(button.dataset.jump)));
const memberPortalNavigation=initPortalNavigation({root:$('[data-portal-nav="member"]'),onSelect:openSection});
let activeClubTab='history';
const mobileClubQuery=window.matchMedia('(max-width: 700px)');
function openClubTab(id,{scroll=false}={}){
  const tab=['history','points','badges','perks'].includes(id)?id:'history';activeClubTab=tab;
  $$('[data-club-tab]').forEach(button=>button.classList.toggle('is-active',button.dataset.clubTab===tab));
  if(mobileClubQuery.matches){$$('[data-club-panel]').forEach(panel=>{panel.hidden=false;panel.classList.add('is-active')});return}
  const panelId=['points','badges','perks'].includes(tab)?'progress':tab;
  $$('[data-club-panel]').forEach(panel=>{const active=panel.dataset.clubPanel===panelId;panel.hidden=!active;panel.classList.toggle('is-active',active)});
  if(scroll&&['badges','perks'].includes(tab))requestAnimationFrame(()=>$(`[data-club-anchor="${tab}"]`)?.scrollIntoView({behavior:'smooth',block:'start'}));
}
function openSection(id){
  const legacyClubTab={history:'history',rewards:'points'}[id];if(legacyClubTab){id='club';openClubTab(legacyClubTab)}
  $$('.member-nav-item[data-member-section]').forEach(button=>button.classList.toggle('is-active',button.dataset.memberSection===id));
  $$('[data-main-member-section]').forEach(button=>button.classList.toggle('is-active',button.dataset.mainMemberSection===id));
  $$('[data-member-panel]').forEach(panel=>panel.classList.toggle('is-active',panel.dataset.memberPanel===id));
  if(id==='club')openClubTab(activeClubTab);
  memberPortalNavigation?.sync(id);if(innerWidth<700)window.scrollTo({top:82,behavior:'smooth'});
}
$$('[data-club-tab]').forEach(button=>button.addEventListener('click',()=>openClubTab(button.dataset.clubTab,{scroll:true})));
mobileClubQuery.addEventListener('change',()=>openClubTab(activeClubTab));
$('[data-member-hero-cta]')?.addEventListener('click',()=>{openSection('garage');if(!data.cars.length){openCarModal();return}requestAnimationFrame(()=>$('[data-primary-car-card]')?.scrollIntoView({behavior:'smooth',block:'center'}))});

const pictogram=body=>`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const badgeDefs=[
  {id:'first',icon:pictogram('<path d="M6 20V5m0 1h10l-2.5 3L16 12H6"/><path d="M4 20h5"/>'),name:'První United',desc:'První potvrzená účast',test:d=>attended(d)>=1},
  {id:'regular',icon:pictogram('<path d="M7 7a7 7 0 1 1-1.2 8"/><path d="M7 3v4H3"/><path d="M9.5 10.2h2.8a2 2 0 0 1 0 4H9.5"/>'),name:'United Regular',desc:'3 ověřené účasti',test:d=>verified(d)>=3},
  {id:'veteran',icon:pictogram('<path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-5"/>'),name:'Veterán United',desc:'5 ověřených účastí',test:d=>verified(d)>=5},
  {id:'og',icon:pictogram('<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>'),name:'Old School',desc:'Člen od roku 2022 nebo dřív',test:d=>(memberSince(d)||9999)<=2022},
  {id:'winner',icon:pictogram('<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 6H5v1a4 4 0 0 0 4 4m7-5h3v1a4 4 0 0 1-4 4m-3 1v5m-3 3h6"/>'),name:'S&S vítěz',desc:'Ověřená výhra v Show & Shine',test:d=>d.history.some(h=>h.verified&&h.winner)},
  {id:'garage',icon:pictogram('<path d="M4 20V9l8-5 8 5v11"/><path d="M7 20v-7h10v7M9 16h6"/>'),name:'Plná garáž',desc:'3 auta v United garáži',test:d=>d.cars.length>=3},
  {id:'twelve',icon:pictogram('<circle cx="12" cy="12" r="9"/><path d="M8 9h2v6m-2 0h4m1-5.2c.4-.6 1-1 1.8-1 1.2 0 2.2.8 2.2 2 0 1.8-3.7 2.4-3.7 4.2H17"/>'),name:'Plný počet',desc:'12 / 12 United Points',test:d=>points(d)>=12}
];
function attended(d=data){return d.history.filter(h=>h.attended).length}
function verified(d=data){return d.history.filter(h=>h.attended&&h.verified).length}
function memberSince(d=data){const years=d.history.filter(h=>h.attended).map(h=>h.year);return years.length?Math.min(...years):null}
function points(d=data){const p=portalConfig.points;return Math.min(p.rewardThreshold,d.history.reduce((n,h)=>n+(h.attended&&h.verified?p.attendance:0)+(h.winner&&h.verified?p.showShineWin:0),0)+(d.bonuses||[]).reduce((n,b)=>n+(b.points||0),0))}
function lifetimePoints(d=data){const p=portalConfig.points;return d.history.reduce((n,h)=>n+(h.attended&&h.verified?p.attendance:0)+(h.winner&&h.verified?p.showShineWin:0),0)+(d.bonuses||[]).reduce((n,b)=>n+(b.points||0),0)}
function status(d=data){const count=verified(d);if(count>=5)return 'VETERAN';if(count>=3)return 'REGULAR';if(count>=1)return 'MEMBER';return 'ROOKIE'}

function renderMemberHero(){
  const hero=$('[data-member-hero]'),media=$('[data-member-hero-media]'),carCopy=$('[data-member-hero-car]'),cta=$('[data-member-hero-cta]'),sinceCopy=$('[data-member-hero-since]');if(!hero||!media||!carCopy||!cta)return;
  const view=deriveMemberHeroState({cars:data.cars,memberSince:memberSince()}),car=view.car,attendedCopy=$('[data-member-hero-attended]');if(sinceCopy)sinceCopy.textContent=`UNITED OD ${view.since||'—'}`;if(attendedCopy)attendedCopy.textContent=`${attended()}× UNITED`;
  media.replaceChildren();memberHeroPhotoId='';
  hero.dataset.heroState=view.state;carCopy.textContent=view.carText;cta.textContent=view.cta;cta.hidden=!view.cta;if(!car||!view.photoId)return;
  const photoId=view.photoId;memberHeroPhotoId=photoId;
  const img=document.createElement('img');img.alt='';img.decoding='async';media.append(img);
  void (async()=>{
    try{const url=await getPrivateCarPhotoUrl(photoId);if(memberHeroPhotoId!==photoId||!img.isConnected)return;img.src=url;await img.decode().catch(()=>{});if(memberHeroPhotoId===photoId)hero.dataset.heroState='photo'}
    catch(error){if(memberHeroPhotoId===photoId){hero.dataset.heroState='no-photo';media.replaceChildren();cta.textContent='Přidat fotku auta →';cta.hidden=false}console.warn('Member hero photo unavailable',photoId,error)}
  })();
}

function renderAll(){renderProfile();renderPoints();renderBadges();renderGarage();renderHistory();renderReservation();renderRewards();renderMemberGallery();renderAccount()}
function renderProfile(){
  const p=data.profile||{},nick=p.nickname||p.name?.split(' ')[0]||'Driver';
  const nickEl=$('[data-member-nickname]');if(nickEl)nickEl.textContent=nick;
  const nameEl=$('[data-card-name]');if(nameEl)nameEl.textContent=(p.name||'United Member').toUpperCase();const summaryNick=$('[data-summary-nickname]'),summaryName=$('[data-summary-name]');if(summaryNick)summaryNick.textContent=nick.toUpperCase();if(summaryName)summaryName.textContent=p.name||'United Member';
  const code=p.memberCode?String(p.memberCode).replace(/^EU-?/i,'').slice(-6):String((p.email||nick).split('').reduce((a,c)=>a+c.charCodeAt(0),0)%900+100);
  const idEl=$('[data-card-id]');if(idEl)idEl.textContent=code;
  const summaryCode=$('[data-summary-member-code]');if(summaryCode)summaryCode.textContent=p.memberCode||`EU${code}`;
  const car=data.cars.find(c=>c.primary)||data.cars[0];const carEl=$('[data-card-car]');if(carEl)carEl.textContent=car?`${car.body} · ${car.model}${car.nickname?' · '+car.nickname:''}`:'BMW E36 · Garáž čeká na první auto';
  const sinceEl=$('[data-member-since]'),historySinceEl=$('[data-history-since]'),attendanceEl=$('[data-attendance-count]'),statusEl=$('[data-member-status]');if(sinceEl)sinceEl.textContent=memberSince()||'—';if(historySinceEl)historySinceEl.textContent=memberSince()||'—';if(attendanceEl)attendanceEl.textContent=attended();if(statusEl)statusEl.textContent=status();renderMemberHero();
}
function renderAccount(){
  const profile=data.profile||{},form=$('[data-account-form]');
  if(form){if(form.elements.name)form.elements.name.value=profile.name||'';if(form.elements.nickname)form.elements.nickname.value=profile.nickname||'';if(form.elements.phone)form.elements.phone.value=profile.phone||'';const email=$('[data-account-email]',form);if(email)email.value=profile.email||''}
  const code=$('[data-account-member-code]'),since=$('[data-account-since]'),verification=$('[data-account-verification]');if(code)code.textContent=profile.memberCode||'—';if(since)since.textContent=memberSince()||'—';if(verification){verification.textContent=profile.emailVerified?'OVĚŘENÝ':'NEOVĚŘENÝ';verification.classList.toggle('is-verified',profile.emailVerified)}
}
function renderPoints(){const p=points(),overview=$('[data-overview-points]'),value=$('[data-points]'),track=$('[data-points-track]'),copy=$('[data-points-copy]');if(overview)overview.textContent=p;if(value)value.textContent=p;if(track)track.innerHTML=Array.from({length:12},(_,i)=>`<i class="${i<p?'is-on':''}"></i>`).join('');if(copy)copy.textContent=p>=12?'12 / 12. United Merch reward je odemčený.':`Ještě ${12-p} bodů a odemykáš United Merch reward.`}
function renderBadges(){const unlocked=badgeDefs.filter(b=>b.test(data));const html=arr=>arr.map(b=>{const active=b.test(data);return `<div class="badge ${active?'':'is-locked'}"><span class="badge-icon">${b.icon}</span><div class="badge-copy"><b>${b.name}</b><small>${b.desc}</small></div><span class="badge-status">${active?'ACTIVE':'LOCKED'}</span></div>`}).join(''),preview=$('[data-badges-preview]'),cabinet=$('[data-badge-cabinet]');if(preview)preview.innerHTML=html((unlocked.length?unlocked:badgeDefs).slice(0,5));if(cabinet)cabinet.innerHTML=html(badgeDefs)}
function renderGarage(){
  const grid=$('[data-garage-grid]');
  if(!grid)return;
  pruneCarPhotoObjectUrls();
  if(!data.cars.length){grid.innerHTML='<div class="garage-empty"><div><b>Garáž je zatím prázdná.</b><br><small>Přidej svoje první E36. Fotku můžeš doplnit kdykoliv později.</small></div></div>';renderCarSelect();renderReservationCarPhoto(data.reservation);return}
  grid.innerHTML=data.cars.map(c=>{const first=c.photos?.[0],name=c.nickname||c.model;return `<article class="car-card" data-car-card="${esc(c.id)}" ${c.primary?'data-primary-car-card':''}><div class="car-photo">${first?`<img data-car-photo-id="${esc(first.id)}" alt="${esc(name)}">`:'<div class="car-photo-placeholder">E36</div>'}${c.primary?'<span class="car-primary">HLAVNÍ AUTO</span>':''}<button aria-label="Upravit ${esc(name)}" class="car-edit" data-edit-car="${esc(c.id)}" title="Upravit auto" type="button">${pictogram('<path d="m4 20 4.2-1 10.4-10.4a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z"/><path d="m13.8 7.4 3 3"/>')}</button></div><div class="car-body"><small>${esc(c.body)} · ${esc(c.year||'')}</small><h3>${esc(name)}</h3><p>${esc(c.model)}${c.color?' · '+esc(c.color):''}</p><div class="car-actions"><button data-primary-car="${esc(c.id)}">${c.primary?'Hlavní':'Nastavit hlavní'}</button><button data-delete-car="${esc(c.id)}">Odebrat</button></div></div></article>`}).join('');
  $$('[data-edit-car]').forEach(button=>button.onclick=()=>{const car=data.cars.find(item=>String(item.id)===String(button.dataset.editCar));if(car)openCarModal(car)});
  $$('[data-primary-car]').forEach(button=>button.onclick=async()=>{try{await apiRequest(`/api/cars/${encodeURIComponent(button.dataset.primaryCar)}/primary`,{method:'POST'});data.cars=await loadCarsFromApi();renderGarage();renderProfile();toast('Hlavní auto změněno')}catch(error){console.error(error);toast(apiError(error))}});
  $$('[data-delete-car]').forEach(button=>button.onclick=async()=>{if(!confirm('Odebrat auto z garáže včetně jeho fotek?'))return;try{await apiRequest(`/api/cars/${encodeURIComponent(button.dataset.deleteCar)}`,{method:'DELETE'});data.cars=await loadCarsFromApi();renderGarage();renderProfile();toast('Auto odebráno')}catch(error){console.error(error);toast(apiError(error))}});
  renderCarSelect();
  hydrateCarPhotos();
  renderReservationCarPhoto(data.reservation);
}
async function hydrateCarPhotos(){
  for(const img of $$('img[data-car-photo-id]')){
    const id=img.dataset.carPhotoId;if(!id)continue;
    try{img.src=await getPrivateCarPhotoUrl(id)}
    catch(error){console.warn('Car photo unavailable',id,error);img.replaceWith(Object.assign(document.createElement('div'),{className:'car-photo-placeholder',textContent:'E36'}))}
  }
}
function preferredReservationCar(){return data.cars.find(car=>car.primary)||data.cars[0]||null}
function ensureSelectedReservationCar(){
  const select=$('[data-car-select]');if(!select)return null;
  let car=data.cars.find(item=>String(item.id)===String(select.value));
  if(!car){car=preferredReservationCar();if(car)select.value=String(car.id)}
  return car||null;
}
function renderCarSelect(){
  const select=$('[data-car-select]');if(!select)return;
  const selectedId=select.value;select.innerHTML=data.cars.length?data.cars.map(c=>`<option value="${c.id}">${esc(c.nickname||c.model)} · ${esc(c.body)}</option>`).join(''):'<option value="">Nejdřív přidej auto do garáže</option>';
  const selected=data.cars.find(car=>String(car.id)===String(selectedId))||preferredReservationCar();if(selected)select.value=String(selected.id);
  if(data.cars.length)setReservationCarError(false);
}
function renderHistory(){const grid=$('[data-history-grid]');grid.innerHTML=data.history.map(h=>`<button class="history-year ${h.attended?'is-attended':''}" data-history-year="${h.year}"><div class="history-year-number">${h.year}</div><div class="history-year-status"><div><b>${h.attended?'ÚČAST PŘIDÁNA':'NEBYL/A JSEM'}</b><small>${h.attended?(h.verified?'Ověřeno United týmem':'Čeká na ověření'):'Klikni pro přidání'}</small></div><span class="history-check">${h.attended?'✓':'+'}</span></div></button>`).join('');$$('[data-history-year]').forEach(button=>button.onclick=async()=>{const h=data.history.find(x=>x.year===+button.dataset.historyYear);h.attended=!h.attended;if(!h.attended){h.verified=false;h.winner=false}await commit(h.attended?`United ${h.year} přidáno do historie`:`United ${h.year} odebráno`)})}

const reservationForm=$('[data-reservation-form]');
const arrivalSelect=reservationForm?.elements?.arrival;
const sleepField=$('[data-member-sleep-field]');
const crewInput=reservationForm?.elements?.crew,accommodationUnitsInput=reservationForm?.elements?.accommodationUnits,sleepSelect=reservationForm?.elements?.sleep;
const accommodationOptionField=$('[data-accommodation-option-field]'),accommodationOptionLabel=$('[data-accommodation-option-label]'),accommodationOptionSelect=reservationForm?.elements?.accommodationOptionId,accommodationAvailability=$('[data-accommodation-availability]');
const accommodationPartialField=$('[data-accommodation-partial-field]'),accommodationPartialInput=reservationForm?.elements?.partialAccommodation,accommodationPeopleField=$('[data-accommodation-people-field]'),accommodationPreview=$('[data-accommodation-preview]');
function clampReservationNumber(value,min,max,fallback){const number=Math.trunc(Number(value));return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback}
function memberAccommodationKind(){return sleepSelect?.value==='Chatka'?'cabin':sleepSelect?.value==='Stan'?'tent':null}
function matchingAccommodationOptions(){const kind=memberAccommodationKind();return reservationState.accommodationOptions.filter(option=>option.active&&option.kind===kind)}
function selectedAccommodationOption(){return matchingAccommodationOptions().find(option=>option.id===accommodationOptionSelect?.value)||null}
function accommodationUnitCount(people,option){return option?Math.ceil(people/Math.max(1,numericValue(option.capacityPerUnit))):0}
function numericValue(value){return Number(value||0)}
function reservationNights(arrival=arrivalSelect?.value){return arrival==='Pátek'?numericValue(reservationState.event?.fullWeekendNights??2):arrival==='Sobota'?numericValue(reservationState.event?.saturdayOnlyNights??1):0}
function priceAccommodation(option,people){
  const unitCount=accommodationUnitCount(people,option),nights=reservationNights();
  const baseTotalCzk=unitCount*numericValue(option?.unitPriceCzk)*nights,personTotalCzk=people*numericValue(option?.personPriceCzk),beddingTotalCzk=people*numericValue(option?.beddingFeePerPersonCzk),cityTaxTotalCzk=people*nights*numericValue(option?.cityTaxPerPersonPerNightCzk);
  return {unitCount,nights,baseTotalCzk,personTotalCzk,beddingTotalCzk,cityTaxTotalCzk,totalCzk:baseTotalCzk+personTotalCzk+beddingTotalCzk+cityTaxTotalCzk};
}
function formatCzk(value){return czkFormatter.format(numericValue(value))}
function renderAccommodationOptionChoices(preferredId=''){
  if(!accommodationOptionSelect)return;
  const previous=preferredId||accommodationOptionSelect.value,options=matchingAccommodationOptions();
  const prompt=options.length>1?'<option value="">Vyber konkrétní možnost</option>':'';
  accommodationOptionSelect.innerHTML=prompt+options.map(option=>{
    const availability=option.inventoryMode==='unlimited'?'bez omezení':option.soldOut?'VYPRODÁNO':`k dispozici: ${numericValue(option.freeUnits)}`,capacity=numericValue(option.capacityPerUnit),peopleWord=capacity===1?'osoba':capacity<=4?'osoby':'osob';
    const place=option.kind==='tent'?'jeden stan':'jednu chatku';
    return `<option value="${esc(option.id)}" ${option.soldOut?'disabled':''}>${esc(option.name)} · max. ${capacity} ${peopleWord} na ${place} · ${availability}</option>`;
  }).join('');
  const preferred=options.find(option=>option.id===previous&&!option.soldOut);
  if(preferred)accommodationOptionSelect.value=preferred.id;
  else if(options.length===1&&!options[0].soldOut)accommodationOptionSelect.value=options[0].id;
  else accommodationOptionSelect.value='';
}
function renderAccommodationPreview(){
  if(!accommodationPreview||!accommodationAvailability)return;
  const option=selectedAccommodationOption(),visibleCrewLimit=Math.max(MAX_RESERVATION_CREW,Number(crewInput?.value)||MAX_RESERVATION_CREW),people=clampReservationNumber(accommodationUnitsInput?.value,1,visibleCrewLimit,1);
  if(!option){const available=matchingAccommodationOptions();accommodationPreview.hidden=true;accommodationPreview.innerHTML='';accommodationAvailability.textContent=available.length&&available.every(item=>item.soldOut)?'Všechny možnosti tohoto typu jsou vyprodané.':available.length?'Vyber konkrétní možnost ubytování.':'Pro tento event zatím není tento typ ubytování dostupný.';accommodationAvailability.classList.toggle('is-warning',true);return}
  const pricing=priceAccommodation(option,people),free=option.freeUnits,hasCapacity=option.inventoryMode==='unlimited'||free>=pricing.unitCount;
  accommodationAvailability.classList.toggle('is-warning',!hasCapacity);
  const place=option.kind==='tent'?'jeden stan':'jednu chatku',capacity=numericValue(option.capacityPerUnit),peopleWord=capacity===1?'osoba':capacity<=4?'osoby':'osob';
  const availabilityCopy=option.inventoryMode==='unlimited'
    ? `Dostupné bez omezení · max. ${capacity} ${peopleWord} na ${place}.`
    : !hasCapacity?'Pro tvoji posádku už není dostatek volné kapacity.':free===1?'Zbývá poslední volná možnost.':free===2?'Zbývají poslední 2 možnosti.':`Aktuálně k dispozici: ${free}.`;
  accommodationAvailability.textContent=availabilityCopy;
  const rows=[
    [`${pricing.unitCount}× ${option.name} · ${pricing.nights} ${pricing.nights===1?'noc':'noci'}`,pricing.baseTotalCzk],
    ['Poplatek za osoby',pricing.personTotalCzk],
    ['Povlečení',pricing.beddingTotalCzk],
    [`Pobytová taxa · ${pricing.nights} ${pricing.nights===1?'noc':'noci'}`,pricing.cityTaxTotalCzk],
  ].filter(([,value])=>value>0);
  const detailOpen=$('[data-reservation-price-details]',accommodationPreview)?.open===true;
  accommodationPreview.hidden=false;
  accommodationPreview.innerHTML=`<div class="reservation-price-head"><span>${people} ${people===1?'osoba':people<=4?'osoby':'osob'} · ${pricing.unitCount}× ${esc(option.name)}</span></div><div class="reservation-price-estimate"><span>Orientačně celkem</span><b>${esc(formatCzk(pricing.totalCzk))}</b></div><details class="reservation-price-details" data-reservation-price-details><summary><span class="price-detail-show">+ Detail ceny</span><span class="price-detail-hide">− Skrýt detail</span></summary><div class="reservation-price-breakdown">${rows.map(([label,value])=>`<div><span>${esc(label)}</span><b>${esc(formatCzk(value))}</b></div>`).join('')}<div class="reservation-price-total"><strong>Celkem</strong><b>${esc(formatCzk(pricing.totalCzk))}</b></div><small>Konečnou cenu ověříme při odeslání rezervace.</small></div></details>`;
  const priceDetails=$('[data-reservation-price-details]',accommodationPreview);if(priceDetails)priceDetails.open=detailOpen;
}
function syncMemberSleep(source='form'){
  if(!reservationForm||!arrivalSelect||!sleepField||!crewInput||!accommodationUnitsInput||!sleepSelect||!accommodationOptionSelect||!accommodationPartialInput)return;
  const dayPass=arrivalSelect.value==='Jen na otočku',rawCrew=Number(crewInput.value),aboveLimit=Number.isInteger(rawCrew)&&rawCrew>MAX_RESERVATION_CREW;
  let crew=aboveLimit?rawCrew:clampReservationNumber(crewInput.value,1,MAX_RESERVATION_CREW,1);
  if(!aboveLimit)crewInput.value=String(crew);
  crewInput.setCustomValidity(aboveLimit?`Posádka může mít nejvýše ${MAX_RESERVATION_CREW} osob.`:'');
  const legacyCrewWarning=$('[data-legacy-crew-warning]',reservationForm);
  if(legacyCrewWarning){
    legacyCrewWarning.hidden=!aboveLimit;
    legacyCrewWarning.textContent=data.reservation?.crew>MAX_RESERVATION_CREW
      ? `Tato starší rezervace má ${rawCrew} osob. Před uložením sniž posádku nejvýše na ${MAX_RESERVATION_CREW}.`
      : `Posádka může mít nejvýše ${MAX_RESERVATION_CREW} osob.`;
  }
  sleepField.hidden=dayPass;if(dayPass)sleepSelect.value='Bez ubytování';
  const withoutAccommodation=dayPass||sleepSelect.value==='Bez ubytování';
  if(source==='accommodation')renderAccommodationOptionChoices();
  if(withoutAccommodation){accommodationUnitsInput.value='0';accommodationPartialInput.checked=false}
  else if(!accommodationPartialInput.checked)accommodationUnitsInput.value=String(crew);
  else accommodationUnitsInput.value=String(clampReservationNumber(accommodationUnitsInput.value,1,crew,crew));
  const partial=!withoutAccommodation&&accommodationPartialInput.checked;
  accommodationUnitsInput.min=withoutAccommodation?'0':'1';accommodationUnitsInput.max=String(crew);accommodationUnitsInput.disabled=!partial||!reservationState.registrationOpen;
  const options=matchingAccommodationOptions(),singleUsableOption=options.length===1&&!options[0].soldOut;
  if(accommodationOptionField)accommodationOptionField.hidden=withoutAccommodation||singleUsableOption;
  if(accommodationOptionLabel)accommodationOptionLabel.textContent=sleepSelect.value==='Chatka'?'Typ chatky':'Typ stanu';
  if(accommodationPartialField)accommodationPartialField.hidden=withoutAccommodation;
  if(accommodationPeopleField)accommodationPeopleField.hidden=!partial;
  accommodationOptionSelect.disabled=withoutAccommodation||!reservationState.registrationOpen||!options.length;
  if(withoutAccommodation){accommodationOptionSelect.value='';if(accommodationPreview)accommodationPreview.hidden=true;if(accommodationAvailability)accommodationAvailability.textContent='';return}
  renderAccommodationPreview();
}
arrivalSelect?.addEventListener('change',()=>syncMemberSleep('arrival'));
crewInput?.addEventListener('input',()=>syncMemberSleep('crew'));crewInput?.addEventListener('change',()=>syncMemberSleep('crew'));
accommodationUnitsInput?.addEventListener('input',()=>syncMemberSleep('accommodationUnits'));accommodationUnitsInput?.addEventListener('change',()=>syncMemberSleep('accommodationUnits'));
sleepSelect?.addEventListener('change',()=>syncMemberSleep('accommodation'));
accommodationOptionSelect?.addEventListener('change',()=>syncMemberSleep('option'));
accommodationPartialInput?.addEventListener('change',()=>syncMemberSleep('partial'));
syncMemberSleep();
function setReservationCarError(visible){const panel=$('[data-reservation-car-error]');if(panel)panel.hidden=!visible}
reservationForm?.elements?.carId?.addEventListener('change',()=>{if(ensureSelectedReservationCar())setReservationCarError(false)});

function plannerReservationWindowState(){
  if(reservationState.registrationOpen)return 'open';
  const event=reservationState.event||{},openAt=Date.parse(event.registrationOpenAt||event.registration_open_at||''),closeAt=Date.parse(event.registrationCloseAt||event.registration_close_at||''),now=Date.now();
  if(Number.isFinite(openAt)&&now<openAt)return 'upcoming';
  if(Number.isFinite(closeAt)&&now>closeAt)return 'ended';
  return 'unavailable';
}
function isPlannerWaitingState(){return Boolean(activePlannerHandoff&&!reservationState.registrationOpen&&!data.reservation)}
function isPlannerCarRequiredState(){return Boolean(activePlannerHandoff&&reservationState.registrationOpen&&!data.reservation&&!data.cars.length)}
function renderPlannerHandoffRecap(container,handoff){
  if(!container)return;
  const handoffOption=reservationState.accommodationOptions.find(option=>option.id===handoff.accommodationOptionId),optionName=handoffOption?.name||handoff.accommodation;
  const units=handoff.accommodationUnits,accommodation=units?`${optionName} / ${units} ${units===1?'osoba':units<=4?'osoby':'osob'}`:handoff.accommodation;
  const crew=`${handoff.crew} ${handoff.crew===1?'osoba':handoff.crew<=4?'osoby':'osob'}`;
  const stay=handoff.arrival==='Jen na otočku'?handoff.arrival:`${handoff.arrival} → ${handoff.departure} · ${handoff.nights} ${handoff.nights===1?'noc':'noci'}`;
  container.replaceChildren(...[stay,accommodation,crew,`Show & Shine: ${handoff.showShine}`].map(value=>{const chip=document.createElement('span');chip.textContent=value;return chip}));
}
function renderPlannerHandoff(){
  const banner=$('[data-planner-handoff]'),section=$('[data-reservation-section]'),workbench=$('[data-reservation-workbench]');if(!banner)return;
  const waiting=isPlannerWaitingState(),carRequired=isPlannerCarRequiredState();section?.classList.toggle('is-planner-waiting',waiting);section?.classList.toggle('is-planner-car-required',carRequired);if(workbench)workbench.hidden=waiting||carRequired;
  if(!activePlannerHandoff){banner.hidden=true;banner.classList.remove('is-waiting');return}
  const closed=!reservationState.registrationOpen,title=$('[data-planner-handoff-title]'),copy=$('[data-planner-handoff-copy]'),recap=$('[data-planner-handoff-recap]'),next=$('[data-planner-handoff-next]'),continueButton=$('[data-planner-handoff-continue]'),nextCopy=$('[data-planner-handoff-next-copy]'),decision=$('[data-planner-handoff-decision]'),carPrompt=$('[data-planner-handoff-car]'),approved=$('[data-planner-handoff-approved]');
  banner.hidden=false;
  banner.classList.toggle('is-waiting',waiting);banner.dataset.reservationWindow=plannerReservationWindowState();
  if(waiting){title.textContent='TVŮJ PLÁN JE PŘIPRAVENÝ';copy.textContent='Výběr z Weekend Planneru jsme uložili. Jakmile spustíme rezervace na další United, dokončíš ho tady.'}
  else if(carRequired){title.textContent='Výběr z Weekend Planneru máme.';copy.textContent='Údaje jsme přenesli. Ještě přidej svoje E36 a rezervaci dokončíš.'}
  else if(closed){title.textContent='Tvůj nový plán jsme zachovali.';copy.textContent='Skutečná rezervace zůstává beze změny a její stav má vždy přednost.'}
  else if(plannerHandoffChoice==='kept'){title.textContent='Současná rezervace zůstává.';copy.textContent='Tvůj nový výběr jsme zachovali, ale do formuláře jsme ho nepřenesli.'}
  else if(!data.reservation){title.textContent='Výběr z Weekend Planneru máme.';copy.textContent='Údaje jsme předvyplnili. Zkontroluj je níže a odešli rezervaci.'}
  else{title.textContent='Výběr z Weekend Planneru máme.';copy.textContent='Příjezd, ubytování a posádku jsme přenesli. Zkontroluj detaily a rezervaci odešli.'}
  renderPlannerHandoffRecap(recap,activePlannerHandoff);
  next.hidden=!waiting;continueButton.disabled=true;continueButton.setAttribute('aria-disabled','true');nextCopy.textContent='Rezervace na další United ještě nejsou spuštěné.';
  decision.hidden=closed||!(data.reservation&&plannerHandoffChoice==='pending');
  carPrompt.hidden=!carRequired;
  approved.hidden=closed||!(plannerHandoffApplied&&data.reservation?.status==='approved');
  const submit=$('[data-reservation-submit]');if(submit&&reservationState.registrationOpen)submit.disabled=plannerHandoffApplied&&!data.cars.length;
}
function applyPlannerHandoffToForm({navigate=true}={}){
  const handoff=activePlannerHandoff;if(!handoff||!reservationForm)return;
  if(reservationForm.elements.arrival)reservationForm.elements.arrival.value=handoff.arrival;
  if(reservationForm.elements.crew)reservationForm.elements.crew.value=handoff.crew;
  if(reservationForm.elements.sleep)reservationForm.elements.sleep.value=handoff.arrival==='Jen na otočku'?'Bez ubytování':handoff.accommodation;
  if(reservationForm.elements.accommodationUnits)reservationForm.elements.accommodationUnits.value=handoff.accommodationUnits;
  if(accommodationPartialInput)accommodationPartialInput.checked=handoff.accommodationUnits>0&&handoff.accommodationUnits<handoff.crew;
  renderAccommodationOptionChoices(handoff.accommodationOptionId||'');
  if(reservationForm.elements.showshine)reservationForm.elements.showshine.value=handoff.showShine;
  if(reservationForm.elements.note&&handoff.arrival!=='Jen na otočku'){
    const marker='[Weekend Planner] Odjezd:';
    const current=String(reservationForm.elements.note.value||'').split('\n').filter(line=>!line.startsWith(marker)).join('\n').trim();
    const stayNote=`${marker} ${handoff.departure} · ${handoff.nights} ${handoff.nights===1?'noc':'noci'}`;
    reservationForm.elements.note.value=current?`${stayNote}\n${current}`:stayNote;
  }
  syncMemberSleep();
  const selectedCar=data.cars.length===1?data.cars[0]:(data.cars.find(car=>car.primary)||data.cars[0]||null);
  if(selectedCar&&reservationForm.elements.carId)reservationForm.elements.carId.value=selectedCar.id;
  plannerHandoffApplied=true;plannerHandoffChoice='applied';if(navigate)openSection('reservation');if(data.reservation)renderPlannerHandoff();else renderReservation();
}
function clearPlannerHandoff(){
  if(activePlannerHandoff?.draftId){try{localStorage.removeItem(`${plannerHandoffPrefix}${activePlannerHandoff.draftId}`)}catch(error){console.debug('Weekend Planner handoff could not be removed.',error)}}
  const url=new URL(window.location.href),fragment=new URLSearchParams(url.hash.replace(/^#/,''));url.searchParams.delete('draft');fragment.delete('handoff');url.hash=fragment.toString()?`#${fragment}`:'';
  try{history.replaceState(null,'',`${url.pathname}${url.search}${url.hash}`)}catch(error){console.debug('Weekend Planner address cleanup is unavailable.',error)}
  pendingPlannerHandoffId='';plannerHandoffMemory=null;activePlannerHandoff=null;plannerHandoffChoice='none';plannerHandoffApplied=false;renderPlannerHandoff();
}
function clearLegacyPlannerDraft(){
  try{localStorage.removeItem(plannerDraftKey);localStorage.removeItem('e36UnitedReservationDraftV20')}catch(error){console.debug('Starší Weekend Planner draft se nepodařilo odstranit.',error)}
  legacyPlannerDraftApplied=false;
}
$('[data-planner-handoff-use]')?.addEventListener('click',()=>{applyPlannerHandoffToForm();toast('Nový plán je připravený ve formuláři. Zkontroluj ho a rezervaci odešli.')});
$('[data-planner-handoff-keep]')?.addEventListener('click',()=>{plannerHandoffChoice='kept';plannerHandoffApplied=false;renderReservation();renderPlannerHandoff();toast('Současná rezervace zůstala beze změny.')});
$('[data-planner-handoff-overview]')?.addEventListener('click',()=>openSection('overview'));

const reservationStatusNames={pending:'Čeká na schválení',approved:'Schválena',rejected:'Zamítnuta',cancelled:'Zrušena'};
const reservationStatusLoudNames={pending:'ČEKÁ NA SCHVÁLENÍ',approved:'SCHVÁLENA',rejected:'ZAMÍTNUTA',cancelled:'ZRUŠENA'};
const reservationStatusSymbols={pending:'!',approved:'✓',rejected:'×',cancelled:'—'};
function setReservationCardStatus(status){
  const key=reservationStatusNames[status]?status:'none';
  const elements=[$('[data-reservation-card]'),$('[data-reservation-overview-card]'),$('.reservation-mini'),$('[data-reservation-nav-status]')].filter(Boolean);
  for(const element of elements){for(const value of [...Object.keys(reservationStatusNames),'none'])element.classList.remove(`is-status-${value}`);element.classList.add(`is-status-${key}`)}
  const navStatus=$('[data-reservation-nav-status]');if(navStatus)navStatus.title=reservationStatusNames[status]||'Bez rezervace';
}
function reservationDescription(reservation){
  if(!reservation)return reservationState.message||(reservationState.registrationOpen?'Registrace je otevřená. Připrav a odešli svoji rezervaci.':'Aktuálně není otevřená registrace na žádný event.');
  if(reservation.status==='rejected')return reservationState.registrationOpen?'Rezervace nebyla schválena. Údaje můžeš upravit a znovu odeslat.':'Rezervace nebyla schválena. Registrace je už uzavřená.';
  if(reservation.status==='cancelled')return reservationState.registrationOpen?'Rezervace je zrušená. Pokud chceš, můžeš ji upravit a znovu odeslat.':'Rezervace je zrušená. Registrace je už uzavřená.';
  return {pending:reservation.changePending?'Změna rezervace čeká na schválení. Do té doby nic nedoplácej.':'Rezervace čeká na kontrolu United týmem.',approved:'Rezervace byla schválena United týmem.'}[reservation.status]||'Rezervace je uložená.';
}
function renderReservationOverview(reservation){
  const open=reservationState.registrationOpen,waiting=isPlannerWaitingState();
  const eventYear=reservation?.year&&reservation.year!=='NEXT'?reservation.year:(reservationState.event?.year||waiting&&activePlannerHandoff.eventYear||new Date().getFullYear());
  const card=$('[data-reservation-overview-card]'),empty=$('[data-action-center-empty]'),emptyCopy=$('[data-action-center-empty-copy]'),event=$('[data-reservation-overview-event]'),label=$('[data-reservation-overview-label]'),copy=$('[data-reservation-overview-copy]'),action=$('[data-reservation-overview-action]');
  const view=deriveOverviewState({reservation,registrationOpen:open,plannerWaiting:waiting,plannerUnavailable:plannerDraftSyncState==='error',eventYear:reservationState.event?eventYear:null,formatAmount:formatCzk});if(card){card.hidden=!view.active;card.dataset.jump=view.target||'reservation'}if(empty)empty.hidden=view.active;if(emptyCopy)emptyCopy.textContent=view.emptyCopy;
  if(event)event.textContent=`UNITED ${eventYear}`;
  if(label)label.textContent=view.label;if(copy)copy.textContent=view.copy;if(action)action.innerHTML=view.action?`${view.action} <b>→</b>`:'';
}
function renderReservationCarPhoto(reservation){
  const card=$('[data-reservation-card]'),hero=$('[data-reservation-car-hero]');if(!card||!hero)return;
  const car=(reservation?data.cars.find(item=>String(item.id)===String(reservation.carId)):null)||data.cars.find(item=>item.primary)||data.cars[0]||null;
  const photo=car?.photos?.[0];
  if(!photo?.id){hero.hidden=true;hero.replaceChildren();delete hero.dataset.photoId;delete hero.dataset.loading;card.classList.remove('has-car-photo');return}
  const photoId=String(photo.id);
  if(hero.dataset.photoId===photoId&&card.classList.contains('has-car-photo')&&carPhotoObjectUrls.has(photoId))return;
  if(hero.dataset.photoId===photoId&&hero.dataset.loading==='true')return;
  hero.hidden=true;hero.replaceChildren();hero.dataset.photoId=photoId;hero.dataset.loading='true';card.classList.remove('has-car-photo');
  const img=document.createElement('img');img.alt=car.nickname||car.model||'Hlavní BMW E36';img.decoding='async';hero.append(img);
  void (async()=>{
    try{
      img.src=await getPrivateCarPhotoUrl(photoId);await img.decode().catch(()=>{});
      if(hero.dataset.photoId!==photoId)return;
      hero.hidden=false;card.classList.add('has-car-photo');
    }catch(error){if(hero.dataset.photoId===photoId){hero.hidden=true;hero.replaceChildren();card.classList.remove('has-car-photo')}console.warn('Reservation car photo unavailable',photoId,error)}
    finally{if(hero.dataset.photoId===photoId)delete hero.dataset.loading}
  })();
}

function renderReservationFormCopy(reservation){
  const kicker=$('[data-reservation-form-kicker]'),title=$('[data-reservation-form-title]');if(!kicker||!title)return;
  if(reservation){kicker.textContent='TVOJE REZERVACE';title.textContent='Zkontrolovat nebo upravit';return}
  if(reservationState.registrationOpen){kicker.textContent='DETAILY REZERVACE';title.textContent='Dokonči rezervaci';return}
  kicker.textContent='PŘIPRAV SI UNITED';title.textContent='Tvoje rezervace';
}

function renderSavedReservationPrice(reservation){
  const container=$('[data-reservation-saved-price]');if(!container)return;
  const snapshot=reservation?.accommodationSnapshot;
  if(!snapshot){container.hidden=true;container.innerHTML='';return}
  const rows=[
    [`${snapshot.unitCount}× ${snapshot.optionName} · ${snapshot.nights} ${snapshot.nights===1?'noc':'noci'}`,snapshot.baseTotalCzk],
    ['Poplatek za osoby',snapshot.personTotalCzk],
    ['Povlečení',snapshot.beddingTotalCzk],
    [`Pobytová taxa · ${snapshot.nights} ${snapshot.nights===1?'noc':'noci'}`,snapshot.cityTaxTotalCzk],
  ].filter(([,value])=>value>0);
  container.hidden=false;
  container.innerHTML=`<div><span>CENA UBYTOVÁNÍ</span><b>${esc(snapshot.peopleCount)} ${snapshot.peopleCount===1?'osoba':'osob'} · ${esc(snapshot.unitCount)}× ${esc(snapshot.optionName)}</b></div>${rows.map(([label,value])=>`<small><span>${esc(label)}</span><b>${esc(formatCzk(value))}</b></small>`).join('')}<strong><span>CELKEM</span><b>${esc(formatCzk(snapshot.totalCzk))}</b></strong>`;
}

function paymentLabel(status){return({unpaid:'K platbě',underpaid:'Doplatek',paid:'Zaplaceno',overpaid:'Přeplatek',not_required:'Bez platby'})[status]||'Platba'}
function paymentQrSvg(spayd){
  if(!spayd)return '';
  try{const qr=qrcode(0,'M');qr.addData(spayd,'Byte');qr.make();return qr.createSvgTag({cellSize:4,margin:8,scalable:true})}
  catch(error){console.error('QR payment render failed',error);return ''}
}
function renderReservationPayment(reservation){
  const container=$('[data-member-payment]'),paymentsList=$('[data-payments-list]');if(!container||!paymentsList)return;
  const payment=reservation?.payment;
  if(!reservation||!payment){container.hidden=true;container.innerHTML='';paymentsList.innerHTML='<article class="portal-empty-state"><span aria-hidden="true">✓</span><div><strong>Aktuálně nemáš žádnou platbu k řešení.</strong><p>Platební údaje se zobrazí pouze u skutečné rezervace.</p></div></article>';return}
  if(reservation.status!=='approved'){
    const pendingTitle=reservation.changePending?'ZMĚNA ČEKÁ NA SCHVÁLENÍ':'ČEKÁ NA SCHVÁLENÍ';
    const pendingPriceLabel=reservation.changePending?'Cena po změně':'Cena rezervace';
    container.hidden=false;container.innerHTML=`<div><span class="member-kicker">${pendingTitle}</span><strong>${pendingPriceLabel}: ${esc(formatCzk(payment.amountDueCzk))}</strong><small>Již zaplaceno: ${esc(formatCzk(payment.amountPaidCzk))} · platební výzva se zpřístupní až po schválení.</small></div>`;
    paymentsList.innerHTML=`<article class="member-payment-card payment-status-pending"><div class="member-payment-layout"><div class="member-payment-copy"><span class="member-kicker">${pendingTitle}</span><h4>Do schválení nic nedoplácej.</h4><dl><div><dt>${pendingPriceLabel}</dt><dd>${esc(formatCzk(payment.amountDueCzk))}</dd></div><div><dt>Již zaplaceno</dt><dd>${esc(formatCzk(payment.amountPaidCzk))}</dd></div></dl><p>United tým rezervaci zkontroluje. QR ani nové platební instrukce teď nejsou dostupné.</p></div></div></article>`;return;
  }
  container.hidden=false;
  const statusCopy=`${paymentLabel(payment.status)}${payment.overdue?' · po splatnosti':''}`;
  const balanceCopy=payment.status==='overpaid'?`Přeplatek ${formatCzk(payment.overpaymentCzk)}`:payment.status==='underpaid'?`Doplatek ${formatCzk(payment.remainingCzk)}`:payment.status==='unpaid'?`K platbě ${formatCzk(payment.remainingCzk)}`:payment.status==='paid'?'Platba je vyrovnaná.':'Bez platby';
  container.innerHTML=`<div><span class="member-kicker">PLATBA REZERVACE</span><strong>${esc(statusCopy)}</strong><small>${esc(balanceCopy)}</small></div><button class="member-secondary" data-payment-open type="button">Přejít na platbu →</button>`;
  $('[data-payment-open]',container)?.addEventListener('click',()=>openSection('payments'));
  if(payment.remainingCzk>0&&!payment.configurationReady){paymentsList.innerHTML='<article class="member-payment-card"><div class="member-payment-copy"><span class="member-kicker">PLATBA REZERVACE</span><h3>Platební údaje připravujeme.</h3><p>Jakmile budou kompletní, uvidíš je bezpečně tady u své schválené rezervace.</p></div></article>';return}
  const settled=payment.remainingCzk<=0,qr=!settled&&payment.status!=='overpaid'?paymentQrSvg(payment.spayd):'';
  const deadline=payment.deadline?new Intl.DateTimeFormat('cs-CZ',{dateStyle:'long'}).format(new Date(`${payment.deadline}T12:00:00`)):'—';
  const eventLabel=reservation.year&&reservation.year!=='NEXT'?`E36 United ${reservation.year}`:reservation.title||'E36 United';
  const paymentTitle=payment.status==='overpaid'?`Přeplatek ${formatCzk(payment.overpaymentCzk)}`:payment.status==='underpaid'?`Doplatek ${formatCzk(payment.remainingCzk)}`:payment.status==='unpaid'?`K platbě ${formatCzk(payment.remainingCzk)}`:'Zaplaceno';
  const balanceLabel=payment.status==='overpaid'?'Přeplatek':payment.status==='underpaid'?'Doplatek':payment.status==='unpaid'?'K platbě':'Stav';
  const balanceValue=payment.status==='overpaid'?formatCzk(payment.overpaymentCzk):payment.status==='paid'?'Zaplaceno':formatCzk(payment.remainingCzk);
  const instructionRows=payment.configurationReady?`<div><dt>Příjemce</dt><dd>${esc(payment.recipientName)}</dd></div><div><dt>Účet</dt><dd>${esc(payment.accountDisplay)}</dd></div><div><dt>Variabilní symbol</dt><dd>${esc(payment.variableSymbol)}</dd></div><div><dt>Zpráva</dt><dd>${esc(payment.message)}</dd></div><div><dt>Splatnost</dt><dd>${esc(deadline)}</dd></div>`:'';
  paymentsList.innerHTML=`<article class="member-payment-card payment-status-${esc(payment.status)}">${payment.testMode?'<div class="payment-test-warning">TESTOVACÍ PLATBA – NEPLAŤTE</div>':''}<div class="payment-item-head"><div><span class="member-kicker">REZERVACE / EVENT</span><h3>${esc(eventLabel)}</h3></div><span class="payment-status-pill">${esc(statusCopy)}</span></div><div class="member-payment-layout"><div class="member-payment-copy"><h4>${esc(paymentTitle)}</h4><dl><div><dt>Cena rezervace</dt><dd>${esc(formatCzk(payment.amountDueCzk))}</dd></div><div><dt>Již zaplaceno</dt><dd>${esc(formatCzk(payment.amountPaidCzk))}</dd></div><div class="member-payment-remaining"><dt>${esc(balanceLabel)}</dt><dd>${esc(balanceValue)}</dd></div>${instructionRows}</dl></div>${qr?`<div class="member-payment-qr"><div>${qr}</div><strong>Naskenuj v bankovní aplikaci</strong><small>QR obsahuje pouze aktuální částku k úhradě, stejný VS, zprávu a splatnost.</small></div>`:''}</div></article>`;
}

function renderReservation(){
  const r=data.reservation,miniStatus=$('[data-reservation-status]'),year=$('[data-res-year]'),title=$('[data-res-title]'),car=$('[data-res-car]'),mailState=$('[data-reservation-mail-state]');
  const submit=$('[data-reservation-submit]');
  if(reservationForm){for(const field of reservationForm.elements)field.disabled=!reservationState.registrationOpen;renderAccommodationOptionChoices(r?.accommodationSnapshot?.optionId||accommodationOptionSelect?.value||'');syncMemberSleep()}
  const buttonLabels={pending:'Uložit změny',approved:'Upravit rezervaci',rejected:'Upravit a znovu odeslat',cancelled:'Obnovit rezervaci'};
  const buttonLabel=!reservationState.registrationOpen?'REGISTRACE JE UZAVŘENÁ':r?(buttonLabels[r.status]||'Uložit změny'):'Odeslat rezervaci';
  if(submit){submit.disabled=!reservationState.registrationOpen;if(!submit.dataset.originalHtml)submit.innerHTML=`${buttonLabel} <span>→</span>`}
  setReservationCardStatus(r?.status);renderReservationOverview(r);renderReservationCarPhoto(r);renderSavedReservationPrice(r);renderReservationPayment(r);renderReservationFormCopy(r);renderPlannerHandoff();
  if(!r){
    const open=reservationState.registrationOpen,waiting=isPlannerWaitingState(),eventYear=reservationState.event?.year||waiting&&activePlannerHandoff.eventYear||'NEXT';
    if(miniStatus)miniStatus.textContent=waiting?'Plán připravený':open?'Bez rezervace':'Registrace zavřená';if(year)year.textContent=eventYear;if(title)title.textContent=waiting?'Tvůj plán je připravený':`United ${eventYear}`;if(car)car.textContent=waiting?'Dokončíš ho tady, jakmile spustíme rezervace.':open?'Vyber auto z garáže a odešli rezervaci.':'Aktuálně není otevřená registrace.';
    const stateKicker=$('.reservation-state>small');if(stateKicker)stateKicker.textContent='REGISTRACE';
    $('[data-reservation-state-symbol]').textContent=open?'+':'—';$('[data-reservation-state-label]').textContent=open?'JEŠTĚ NEMÁŠ REZERVACI':'UZAVŘENÁ';$('[data-reservation-year]').textContent=eventYear;$('[data-reservation-title]').textContent=`E36 United ${eventYear}`;$('[data-reservation-description]').textContent=waiting?'Tvůj plán je připravený. Dokončíš ho po otevření rezervací.':open?'Vyber auto, zkontroluj údaje a odešli rezervaci.':'Výběr si můžeš projít už teď. Odeslat ho půjde po otevření registrace.';$('[data-reservation-summary]').innerHTML='';
    if(mailState){mailState.classList.remove('is-confirmed');mailState.querySelector('span').textContent=open?'Po odeslání bude rezervace čekat na schválení.':'Odeslání zpřístupníme po otevření registrace.'}
    return;
  }
  const stateKicker=$('.reservation-state>small');if(stateKicker)stateKicker.textContent='STAV REZERVACE';
  const statusText=reservationStatusNames[r.status]||r.status||'Čeká na schválení';
  if(reservationForm){if(reservationForm.elements.carId&&r.carId)reservationForm.elements.carId.value=r.carId;if(reservationForm.elements.arrival)reservationForm.elements.arrival.value=r.arrival||'Pátek';if(reservationForm.elements.crew)reservationForm.elements.crew.value=r.crew||2;if(reservationForm.elements.sleep)reservationForm.elements.sleep.value=r.sleep||'Chatka';if(reservationForm.elements.accommodationUnits)reservationForm.elements.accommodationUnits.value=r.accommodationUnits??0;if(accommodationPartialInput)accommodationPartialInput.checked=r.accommodationUnits>0&&r.accommodationUnits<r.crew;renderAccommodationOptionChoices(r.accommodationSnapshot?.optionId||'');if(reservationForm.elements.showshine)reservationForm.elements.showshine.value=r.showshine||'Ne';if(reservationForm.elements.note)reservationForm.elements.note.value=r.note||'';syncMemberSleep()}
  if(miniStatus)miniStatus.textContent=statusText;if(year)year.textContent=r.year||'NEXT';if(title)title.textContent=r.title||'United rezervace';if(car)car.textContent=r.carSnapshot?`${r.carSnapshot.nickname||r.carSnapshot.model} · ${r.carSnapshot.body}`:'Auto zatím není vybrané';
  $('[data-reservation-state-symbol]').textContent=reservationStatusSymbols[r.status]||'·';$('[data-reservation-state-label]').textContent=r.changePending?'ZMĚNA ČEKÁ NA SCHVÁLENÍ':reservationStatusLoudNames[r.status]||String(r.status||'AKTUÁLNÍ').toUpperCase();$('[data-reservation-year]').textContent=r.year||'NEXT';$('[data-reservation-title]').textContent=r.title||'E36 United';
  const description=reservationDescription(r);$('[data-reservation-description]').textContent=description;
  const sleep=r.arrival==='Jen na otočku'?'Bez ubytování':r.sleep;
  const snapshot=r.accommodationSnapshot,accommodationSummary=snapshot?`${snapshot.peopleCount} ${snapshot.peopleCount===1?'osoba':'osob'} · ${snapshot.unitCount}× ${snapshot.optionName}`:sleep==='Bez ubytování'?'Bez ubytování':`${sleep||'—'} · ${r.accommodationUnits} osob · cena —`;
  const crewWord=Number(r.crew)===1?'osoba':Number(r.crew)>=5?'osob':'osoby';
  $('[data-reservation-summary]').innerHTML=`<div><small>AUTO</small><b>${esc(r.carSnapshot?.nickname||r.carSnapshot?.model||'—')}</b></div><div><small>POBYT</small><b>${esc(r.arrival||'—')} · ${esc(r.crew)} ${crewWord}</b></div><div><small>UBYTOVÁNÍ</small><b>${esc(accommodationSummary)}</b></div>${snapshot?`<div><small>CELKEM</small><b>${esc(formatCzk(snapshot.totalCzk))}</b></div>`:''}`;
  if(mailState){mailState.classList.toggle('is-confirmed',r.status==='approved');mailState.querySelector('span').textContent=description}
}
function renderRewards(){
  const p=points(),life=lifetimePoints(),attendanceCount=verified(),winCount=data.history.filter(item=>item.attended&&item.verified&&item.winner).length,threshold=portalConfig.points.rewardThreshold,rules=portalConfig.points;
  document.querySelectorAll('[data-reward-score]').forEach(element=>element.textContent=p);
  const lock=$('[data-reward-lock]');lock.classList.toggle('is-unlocked',p>=threshold);lock.querySelector('span').textContent=p>=threshold?'UNLOCKED':'LOCKED';$('[data-reward-remaining]').textContent=p>=threshold?'United Merch reward je aktivní':`${threshold-p} bodů zbývá`;
  const journey=$('[data-points-journey]'),journeyScore=$('[data-points-journey-score]'),journeyCopy=$('[data-points-journey-copy]'),journeyMarker=$('[data-points-journey-marker]'),progress=Math.min(100,p/threshold*100);
  if(journey){journey.setAttribute('aria-valuemax',String(threshold));journey.setAttribute('aria-valuenow',String(p));journey.style.setProperty('--points-progress',`${progress}%`)}if(journeyScore)journeyScore.textContent=p;if(journeyCopy)journeyCopy.textContent=p>=threshold?'United Merch reward je odemčený.':`${threshold-p} bodů do United Merch reward.`;if(journeyMarker)journeyMarker.textContent=String(p);
  const pointsRules=$('[data-points-rules]');if(pointsRules)pointsRules.innerHTML=[['OVĚŘENÁ ÚČAST',rules.attendance],['SHOW & SHINE VÝHRA',rules.showShineWin],['COMMUNITY BONUS',rules.communityBonus],['UNITED MERCH REWARD',threshold]].map(([label,value],index)=>`<div><b>${index===3?'':'+'}${esc(value)}</b><span>${label}</span></div>`).join('');
  $('[data-points-ledger]').innerHTML=`<div class="ledger-item"><span>OVĚŘENÁ ÚČAST</span><b>${attendanceCount}×</b><small>${rules.attendance} body za potvrzený ročník.</small></div><div class="ledger-item"><span>SHOW & SHINE WIN</span><b>${winCount}×</b><small>${rules.showShineWin} body za ověřenou výhru.</small></div><div class="ledger-item"><span>LIFETIME SCORE</span><b>${life}</b><small>bodů celkem</small></div>`;
  const perks=[[pictogram('<path d="m13 2-7 11h5l-1 9 8-12h-5V2Z"/>'),'Dřívější rezervace','Členové získají dřívější přístup k rezervacím.',attendanceCount>=1],[pictogram('<path d="M6 4h12l2 5-8 11L4 9l2-5Z"/><path d="m4 9 8 3 8-3"/>'),'Členský United Merch','Přístup k vybraným členským dropům.',attendanceCount>=1],[pictogram('<circle cx="12" cy="12" r="9"/><path d="M8 9h2v6m-2 0h4m1-5.2c.4-.6 1-1 1.8-1 1.2 0 2.2.8 2.2 2 0 1.8-3.7 2.4-3.7 4.2H17"/>'),'United Merch odměna','Odměna po dosažení 12 / 12 bodů.',p>=threshold],[pictogram('<path d="M5 19V9m7 10V5m7 14v-7"/><path d="M3 19h18"/>'),'Komunitní hlasování','Hlasování o vybraných United aktivitách.',attendanceCount>=3],[pictogram('<path d="M4 20V8l8-4 8 4v12"/><path d="M8 20v-7h8v7"/><path d="M7 10h10"/>'),'Přednostní ubytování','Dřívější přístup k vybranému ubytování.',attendanceCount>=5]];
  $('[data-perks-list]').innerHTML=perks.map(x=>`<div class="perk ${x[3]?'':'is-locked'}"><i>${x[0]}</i><div><b>${x[1]}</b><small>${x[2]}</small></div><span>${x[3]?'ACTIVE':'LOCKED'}</span></div>`).join('');
}

async function commit(message='Uloženo'){saveUserLocal();renderAll();toast(message)}

reservationForm?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!currentUser)return toast('Nejdřív se přihlas.');
  if(!reservationState.registrationOpen)return toast('Registrace na žádný event aktuálně není otevřená.');
  syncMemberSleep();const car=ensureSelectedReservationCar();
  if(!data.cars.length||!car){setReservationCarError(true);toast('Nejdřív přidej auto do garáže.');return}
  setReservationCarError(false);const fd=new FormData(event.currentTarget);
  const crew=Number(fd.get('crew'));
  if(!Number.isInteger(crew)||crew<1||crew>MAX_RESERVATION_CREW){toast(`Posádka musí mít 1 až ${MAX_RESERVATION_CREW} osob.`);crewInput?.focus();return}
  const arrival=fd.get('arrival')||'Pátek',sleep=arrival==='Jen na otočku'?'Bez ubytování':fd.get('sleep');
  const attendanceType=arrival==='Pátek'?'full_weekend':arrival==='Sobota'?'saturday_only':'day_visit';
  const wantsAccommodation=attendanceType!=='day_visit'&&sleep!=='Bez ubytování',accommodationOption=wantsAccommodation?selectedAccommodationOption():null;
  const accommodationUnits=wantsAccommodation?clampReservationNumber(accommodationUnitsInput.value,1,crew,crew):0;
  if(wantsAccommodation&&!accommodationOption){toast('Vyber konkrétní typ ubytování.');accommodationOptionSelect?.focus();return}
  if(accommodationOption?.inventoryMode==='limited'&&numericValue(accommodationOption.freeUnits)<accommodationUnitCount(accommodationUnits,accommodationOption)){toast(`${accommodationOption.name} už nemá dost volné kapacity pro tvoji posádku. Vyber jinou možnost.`);accommodationOptionSelect?.focus();return}
  const button=$('[data-reservation-submit]');setButtonBusy(button,true,'Odesílám rezervaci…');
  try{
    const payload=await apiRequest('/api/reservations/current',{method:'PUT',body:{reservationId:data.reservation?.id||null,carId:car.id,arrival,crew,attendanceType,accommodation:sleep,accommodationOptionId:accommodationOption?.id||null,accommodationUnits,showShine:fd.get('showshine'),note:fd.get('note')}});
    const reservation=normalizeReservation(payload?.reservation);if(!reservation)throw new Error('reservation_response_invalid');
    reservationState={registrationOpen:payload?.registrationOpen===true,event:payload?.event||reservationState.event,message:payload?.message||'',accommodationOptions:Array.isArray(payload?.accommodationOptions)?payload.accommodationOptions.map(normalizeAccommodationOption).filter(option=>option.id):reservationState.accommodationOptions};
    data.reservation=reservation;if(activePlannerHandoff&&plannerHandoffApplied)clearPlannerHandoff();if(legacyPlannerDraftApplied)clearLegacyPlannerDraft();renderReservation();renderProfile();toast(payload?.message||'Rezervace byla uložena.');
  }catch(error){console.error('Reservation save failed',error);toast(apiError(error))}
  finally{setButtonBusy(button,false);renderReservation();if(activePlannerHandoff&&plannerHandoffApplied)applyPlannerHandoffToForm()}
});

const carModal=$('[data-car-modal]');
const carForm=$('[data-car-form]'),carPhotoInput=$('[data-car-photo-input]');
const carPhotoPreview=createImagePreviewController($('[data-car-photo-preview]'));
let editingCarId='';
let selectedCarPhoto=null;
function syncCarPhotoSelection(){
  const action=$('[data-car-photo-action]'),name=$('[data-car-photo-name]'),clear=$('[data-car-photo-clear]'),current=$('[data-car-current-photo]');
  if(action)action.textContent=selectedCarPhoto?'Změnit fotku':editingCarId&&current&&!current.hidden?'Změnit fotku':'Vybrat fotku';
  if(name)name.textContent=selectedCarPhoto?selectedCarPhoto.name:'JPG, PNG nebo WEBP · max. 12 MB';
  if(clear)clear.hidden=!selectedCarPhoto;
  if(current)current.hidden=Boolean(selectedCarPhoto)||!current.dataset.available;
}
function clearSelectedCarPhoto(){selectedCarPhoto=null;if(carPhotoInput)carPhotoInput.value='';carPhotoPreview.clear();syncCarPhotoSelection()}
function closeCarModal(){
  if(!carModal)return;carModal.hidden=true;delete carModal.dataset.carId;document.body.classList.remove('modal-open');returnToReservationAfterCar=false;editingCarId='';carForm?.reset();clearSelectedCarPhoto();
  const current=$('[data-car-current-photo]');if(current){current.hidden=true;delete current.dataset.available}
}
function openCarModal(car=null){
  if(!carModal||!carForm)return;
  editingCarId=car?.id?String(car.id):'';carModal.dataset.carId=editingCarId;carForm.reset();clearSelectedCarPhoto();
  const title=$('[data-car-modal-title]'),kicker=$('[data-car-modal-kicker]'),copy=$('[data-car-modal-copy]'),submit=$('[data-car-submit]'),current=$('[data-car-current-photo]'),currentImage=$('[data-car-current-photo-image]');
  if(title)title.textContent=editingCarId?'Upravit auto.':'Přidat auto.';
  if(kicker)kicker.textContent=editingCarId?'MY GARAGE · ÚPRAVA':'MY GARAGE · NOVÉ AUTO';
  if(copy)copy.textContent=editingCarId?'Změň jen to, co potřebuješ. Auto zůstane pod stejným ID a současná fotka se nahradí až po úspěšném uploadu.':'Fotka není povinná. Pro profil auta používáme jednu privátní fotografii načítanou přes autorizovaný endpoint.';
  if(submit)submit.innerHTML=editingCarId?'Uložit změny <span>→</span>':'Přidat do garáže <span>→</span>';
  if(car){for(const field of ['nickname','body','model','year','color'])if(carForm.elements[field])carForm.elements[field].value=car[field]??'';if(carForm.elements.primary)carForm.elements.primary.checked=car.primary===true}
  if(current){current.hidden=true;delete current.dataset.available}
  const photoId=car?.photos?.[0]?.id;
  if(photoId&&current&&currentImage){void getPrivateCarPhotoUrl(String(photoId)).then(url=>{if(editingCarId!==String(car.id)||selectedCarPhoto)return;currentImage.src=url;current.dataset.available='true';current.hidden=false;syncCarPhotoSelection()}).catch(error=>console.warn('Current car photo preview unavailable',error))}
  carModal.hidden=false;document.body.classList.add('modal-open');requestAnimationFrame(()=>carForm.elements.nickname?.focus());syncCarPhotoSelection();
}
function openCarForReservation(){returnToReservationAfterCar=true;openCarModal()}
$('[data-open-car]')?.addEventListener('click',openCarModal);
$('[data-planner-handoff-add-car]')?.addEventListener('click',openCarForReservation);
$('[data-reservation-add-car]')?.addEventListener('click',openCarForReservation);
$$('[data-close-car]').forEach(button=>button.addEventListener('click',closeCarModal));
carPhotoInput?.addEventListener('change',()=>{
  const selection=selectImageFiles(carPhotoInput.files,{maxFiles:1});
  if(selection.invalidType||selection.tooLarge){carPhotoInput.value='';selectedCarPhoto=null;carPhotoPreview.clear();syncCarPhotoSelection();return toast(selection.tooLarge?'Fotka může mít nejvýše 12 MB.':'Vyber JPG, PNG nebo WebP.')}
  selectedCarPhoto=selection.files[0]||null;carPhotoPreview.render(selection.files);syncCarPhotoSelection();
});
$('[data-car-photo-clear]')?.addEventListener('click',clearSelectedCarPhoto);
carForm?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!currentUser)return toast('Nejdřív se přihlas.');
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),fd=new FormData(form),file=selectedCarPhoto,carId=editingCarId;
  setButtonBusy(button,true,'Ukládám auto…');
  try{
    const blob=file?await compressImageBlob(file,1800,.82):null,payload={nickname:fd.get('nickname'),body:fd.get('body'),model:fd.get('model'),year:fd.get('year'),color:fd.get('color'),primary:fd.get('primary')==='on'};
    let savedCarId=carId;
    if(carId)await apiRequest(`/api/cars/${encodeURIComponent(carId)}`,{method:'PUT',body:payload});
    else{const created=await apiRequest('/api/cars',{method:'POST',body:payload});savedCarId=created?.car?.id;if(!savedCarId)throw new Error('car_create_failed')}
    let photoError=null;
    if(blob){
      const upload=new FormData();upload.append('file',blob,`${file.name.replace(/\.[^.]+$/,'')||'car'}.jpg`);
      try{await apiRequestForm(`/api/cars/${encodeURIComponent(savedCarId)}/photos`,upload,{method:carId?'PUT':'POST'})}catch(error){photoError=error}
    }
    data.cars=await loadCarsFromApi();
    const resumeReservation=returnToReservationAfterCar;closeCarModal();setReservationCarError(false);renderGarage();renderProfile();
    if(activePlannerHandoff&&plannerHandoffApplied){renderReservation();applyPlannerHandoffToForm()}
    else if(resumeReservation)openSection('reservation');
    returnToReservationAfterCar=false;
    if(photoError){console.error('Car photo replacement failed',photoError);toast(carId?'Změny auta jsou uložené. Původní fotka zůstala beze změny.':'Auto je uložené, ale fotku se nepodařilo přidat.');return}
    toast(carId?(file?'Auto i nová fotka byly aktualizovány.':'Změny auta byly uloženy.'):(file?'Auto i fotka jsou uložené v Můj United.':'Auto je uložené v Můj United.'));
  }catch(error){console.error('Car upload failed',error);toast(error?.status===409?'Profilovou fotku se nepodařilo uložit.':apiError(error))}
  finally{setButtonBusy(button,false)}
});
async function compressImageBlob(file,max=1800,quality=.82){return new Promise((resolve,reject)=>{const img=new Image(),reader=new FileReader();reader.onload=()=>img.src=reader.result;reader.onerror=reject;img.onload=()=>{const scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('image_compression_failed')),'image/jpeg',quality)};reader.readAsDataURL(file)})}

let memberGalleryObserver=null,activeMemberGalleryIndex=-1;
function loadMemberGalleryThumbnail(img){
  const id=img.dataset.memberGalleryImage;if(!id||img.dataset.loading)return;img.dataset.loading='true';
  void getPrivateMemberGalleryPhotoUrl(id).then(url=>{if(img.isConnected)img.src=url}).catch(error=>{console.warn('Member gallery thumbnail unavailable',id,error);img.closest('.member-gallery-item')?.classList.add('is-image-unavailable')}).finally(()=>delete img.dataset.loading);
}
function hydrateMemberGalleryThumbnails(){
  memberGalleryObserver?.disconnect();const images=$$('img[data-member-gallery-image]');
  if(!('IntersectionObserver'in window)){images.forEach(loadMemberGalleryThumbnail);return}
  memberGalleryObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){memberGalleryObserver.unobserve(entry.target);loadMemberGalleryThumbnail(entry.target)}},{rootMargin:'240px'});
  images.forEach(image=>memberGalleryObserver.observe(image));
}
function renderMemberGallery(){
  const list=$('[data-member-gallery-list]'),more=$('[data-member-gallery-more]');if(!list)return;
  if(!memberGallery.length){list.innerHTML='<div class="member-gallery-empty"><b>Zatím jsi neposlal žádné fotografie.</b><small>Nahraj je tady. Po schválení se objeví ve veřejné galerii.</small></div>';if(more)more.hidden=true;return}
  const label={pending:'ČEKÁ NA SCHVÁLENÍ',approved:'SCHVÁLENA',rejected:'ZAMÍTNUTA'};
  list.innerHTML=memberGallery.map((item,index)=>`<button aria-label="Otevřít fotografii ${index+1}" class="member-gallery-item" data-member-gallery-open="${index}" type="button"><span class="member-gallery-thumb"><img alt="${esc(item.caption||'Fotka do United galerie')}" data-member-gallery-image="${esc(item.id)}" decoding="async" loading="lazy"><i aria-hidden="true">E36</i></span><span class="member-gallery-copy"><small>${esc(new Date(item.createdAt||Date.now()).toLocaleDateString('cs-CZ'))}</small><b>${esc(item.caption||'Fotka do United galerie')}</b><em class="status-${esc(item.status)}">${label[item.status]||esc(item.status)}</em></span></button>`).join('');
  $$('[data-member-gallery-open]').forEach(button=>button.addEventListener('click',()=>openMemberGalleryLightbox(Number(button.dataset.memberGalleryOpen))));
  if(more){more.hidden=!memberGalleryHasMore;more.disabled=memberGalleryLoading}
  hydrateMemberGalleryThumbnails();
}
async function showMemberGalleryLightboxPhoto(){
  const item=memberGallery[activeMemberGalleryIndex],image=$('[data-member-gallery-lightbox-image]'),caption=$('[data-member-gallery-lightbox-caption]'),prev=$('[data-member-gallery-prev]'),next=$('[data-member-gallery-next]');if(!item||!image)return;
  image.removeAttribute('src');image.alt=item.caption||'Fotka do United galerie';if(caption)caption.textContent=`${activeMemberGalleryIndex+1} / ${memberGallery.length}${item.caption?` · ${item.caption}`:''}`;
  if(prev)prev.disabled=memberGallery.length<2;if(next)next.disabled=memberGallery.length<2;
  try{const url=await getPrivateMemberGalleryPhotoUrl(String(item.id));if(memberGallery[activeMemberGalleryIndex]?.id===item.id)image.src=url}catch(error){console.warn('Member gallery lightbox unavailable',error)}
}
function openMemberGalleryLightbox(index){const modal=$('[data-member-gallery-lightbox]');if(!modal||!memberGallery[index])return;activeMemberGalleryIndex=index;modal.hidden=false;document.body.classList.add('modal-open');void showMemberGalleryLightboxPhoto();$('[data-member-gallery-close]',modal)?.focus()}
function closeMemberGalleryLightbox(){const modal=$('[data-member-gallery-lightbox]');if(!modal)return;modal.hidden=true;activeMemberGalleryIndex=-1;document.body.classList.remove('modal-open')}
function stepMemberGalleryLightbox(direction){if(activeMemberGalleryIndex<0||!memberGallery.length)return;activeMemberGalleryIndex=(activeMemberGalleryIndex+direction+memberGallery.length)%memberGallery.length;void showMemberGalleryLightboxPhoto()}
$$('[data-member-gallery-close]').forEach(button=>button.addEventListener('click',closeMemberGalleryLightbox));
$('[data-member-gallery-prev]')?.addEventListener('click',()=>stepMemberGalleryLightbox(-1));
$('[data-member-gallery-next]')?.addEventListener('click',()=>stepMemberGalleryLightbox(1));
document.addEventListener('keydown',event=>{if(activeMemberGalleryIndex<0)return;if(event.key==='Escape')closeMemberGalleryLightbox();if(event.key==='ArrowLeft')stepMemberGalleryLightbox(-1);if(event.key==='ArrowRight')stepMemberGalleryLightbox(1)});
$('[data-member-gallery-more]')?.addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;button.textContent='Načítám…';try{await loadMemberGallery({append:true})}catch(error){console.error('More member photos unavailable',error);toast(apiError(error))}finally{button.disabled=false;button.textContent='Načíst další'}});

const memberGalleryForm=$('[data-member-gallery-form]'),memberPhotoInput=$('[data-member-photo-input]'),memberPhotoDropzone=$('[data-member-photo-dropzone]');
const memberPhotoPreview=createImagePreviewController($('[data-member-photo-previews]'));
let memberPhotoSelection=[];
function renderMemberPhotoSelection(){
  const panel=$('[data-member-photo-selection]'),count=$('[data-member-photo-count]'),names=$('[data-member-photo-names]');if(!panel||!count||!names)return;
  const total=memberPhotoSelection.length;panel.hidden=!total;memberPhotoPreview.render(memberPhotoSelection);if(!total){count.textContent='';names.textContent='';return}
  const noun=total===1?'fotka připravená':total<=4?'fotky připravené':'fotek připravených';count.textContent=`${total} ${noun} k nahrání`;
  const visible=memberPhotoSelection.slice(0,2).map(file=>file.name),remaining=total-visible.length;names.textContent=`${visible.join(' · ')}${remaining?` · +${remaining} další`:''}`;
}
function selectMemberPhotos(fileList,{notify=true,updateInput=false}={}){
  const selection=selectImageFiles(fileList,{maxFiles:8});memberPhotoSelection=selection.files;
  if(notify&&(selection.invalidType||selection.tooLarge))toast(selection.tooLarge?'Každá fotka může mít nejvýše 12 MB.':'Vyber fotky ve formátu JPG, PNG nebo WebP.');
  else if(notify&&selection.truncated)toast('Najednou můžeš nahrát maximálně 8 fotek.');
  if(updateInput&&memberPhotoInput){try{const transfer=new DataTransfer();for(const file of memberPhotoSelection)transfer.items.add(file);memberPhotoInput.files=transfer.files}catch(error){console.debug('Dropped photos stay in the upload selection.',error)}}
  renderMemberPhotoSelection();
}
function clearMemberPhotoSelection(){memberPhotoSelection=[];if(memberPhotoInput)memberPhotoInput.value='';renderMemberPhotoSelection()}
memberPhotoInput?.addEventListener('change',()=>selectMemberPhotos(memberPhotoInput.files));
$('[data-member-photo-clear]')?.addEventListener('click',clearMemberPhotoSelection);
if(memberPhotoDropzone){
  for(const type of ['dragenter','dragover'])memberPhotoDropzone.addEventListener(type,event=>{event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='copy';memberPhotoDropzone.classList.add('is-drag-over')});
  memberPhotoDropzone.addEventListener('dragleave',event=>{if(!memberPhotoDropzone.contains(event.relatedTarget))memberPhotoDropzone.classList.remove('is-drag-over')});
  memberPhotoDropzone.addEventListener('drop',event=>{event.preventDefault();memberPhotoDropzone.classList.remove('is-drag-over');selectMemberPhotos(event.dataTransfer?.files||[],{updateInput:true})});
}

memberGalleryForm?.addEventListener('submit',async event=>{
  event.preventDefault();if(!currentUser)return toast('Nejdřív se přihlas.');
  const form=event.currentTarget,input=form.elements.photos;if(!memberPhotoSelection.length&&input.files.length)selectMemberPhotos(input.files,{notify:false});
  const files=[...memberPhotoSelection],caption=String(form.elements.caption?.value||'').trim(),button=form.querySelector('button[type="submit"]');
  if(!files.length)return toast('Vyber alespoň jednu fotku.');
  setButtonBusy(button,true,`Nahrávám 0 / ${files.length}…`);
  try{
    for(let i=0;i<files.length;i++){
      button.textContent=`Nahrávám ${i+1} / ${files.length}…`;
      const blob=await compressImageBlob(files[i],1800,.82),upload=new FormData();upload.append('file',blob,`${files[i].name.replace(/\.[^.]+$/,'')||'united'}.jpg`);upload.append('caption',caption);
      await apiRequestForm('/api/gallery/submissions',upload);
    }
    form.reset();clearMemberPhotoSelection();await loadMemberGallery();toast('Fotky jsou nahrané a čekají na schválení United týmem.');
  }catch(error){console.error('Gallery upload failed',error);toast(error?.status===429?'Dnešní limit nahrávání byl dosažen.':apiError(error))}
  finally{setButtonBusy(button,false)}
});

async function applyPlannerDraft(serverResult={available:false,draft:null}){
  if(!reservationForm||!currentUser)return;
  const localHandoff=loadPlannerHandoff(),serverHandoff=serverResult.draft;
  let handoff=newerPlannerDraft(localHandoff,serverHandoff);
  plannerDraftSyncState=serverResult.available?'ready':'error';
  if(localHandoff&&handoff===localHandoff){
    try{
      const payload=await apiRequest('/api/planner-draft',{method:'PUT',body:{draft:localHandoff}});
      handoff=validatePlannerHandoff(payload?.draft)||localHandoff;plannerDraftSyncState='ready';
    }catch(error){console.warn('Planner handoff promotion failed; local fallback retained.',error);plannerDraftSyncState='error';handoff=localHandoff}
  }
  if(handoff){
    activePlannerHandoff=handoff;plannerHandoffApplied=false;plannerHandoffChoice=data.reservation?'pending':'applied';
    if(!data.reservation)applyPlannerHandoffToForm({navigate:false});else renderPlannerHandoff();
    return;
  }
  if(plannerDraftSyncState==='error'){renderReservationOverview(data.reservation);toast('Uložený plán teď nelze ověřit. Přihlášení i případný lokální plán zůstaly beze změny.');return}
  let raw=null;try{raw=localStorage.getItem(plannerDraftKey)||localStorage.getItem('e36UnitedReservationDraftV20')}catch(error){console.debug('Starší výběr z Weekend Planneru není dostupný.',error)}
  if(!raw)return;
  try{
    const draft=JSON.parse(raw);if(!draft)return;
    if(data.reservation){
      toast('Už máš rezervaci. Starší výběr z Weekend Planneru ji nepřepsal.');
      return;
    }
    if(reservationForm.elements.arrival)reservationForm.elements.arrival.value=draft.arrival||'Pátek';
    if(reservationForm.elements.crew)reservationForm.elements.crew.value=draft.people||2;
    if(reservationForm.elements.sleep)reservationForm.elements.sleep.value=draft.arrival==='Jen na otočku'?'Bez ubytování':(draft.sleep||'Chatka');
    if(accommodationPartialInput)accommodationPartialInput.checked=false;
    renderAccommodationOptionChoices(draft.accommodationOptionId||'');
    const showMap={'Chci soutěžit':'Ano','Jedu se podívat':'Ne','Možná':'Možná'};
    if(reservationForm.elements.showshine)reservationForm.elements.showshine.value=showMap[draft.showshine]||draft.showshine||'Ne';
    syncMemberSleep();
    const selectedCar=data.cars.find(c=>c.primary)||data.cars[0]||null;
    if(selectedCar&&reservationForm.elements.carId)reservationForm.elements.carId.value=selectedCar.id;
    legacyPlannerDraftApplied=true;
    toast(selectedCar?'Výběr z Weekend Planneru je připravený. Zkontroluj ho a rezervaci odešli.':'Výběr z Weekend Planneru je připravený. Přidej auto a rezervaci odešli.');
  }catch(error){console.warn(error)}
}

const menuBtn=$('.menu-btn'),nav=$('.nav-links');
function closeMainMenu(){document.body.classList.remove('menu-open');menuBtn?.setAttribute('aria-expanded','false');nav?.classList.remove('open')}
if(menuBtn&&nav)menuBtn.addEventListener('click',()=>{const open=document.body.classList.toggle('menu-open');menuBtn.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open)});
$('[data-member-entry]')?.addEventListener('click',event=>{if(!currentUser)return;event.preventDefault();openSection('overview');closeMainMenu()});
$$('[data-main-member-section]').forEach(button=>button.addEventListener('click',()=>{openSection(button.dataset.mainMemberSection);closeMainMenu()}));

hydratePlannerHandoffFromUrl();
const requestedAuthMode=memberUrlParams.get('mode');if(requestedAuthMode==='register'||requestedAuthMode==='login')activateAuthTab(requestedAuthMode);
initFirebase();
