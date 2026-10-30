import { firebaseConfig, portalConfig } from './firebase-config.js?v=20260924-merch2';
import { renderAccountLinks } from './public-member-state.js?v=20261028-entry1';
import { showArrivalInvitation } from './member/arrival-invite.js?v=20261028-entry1';
import { performMemberLogout } from './member-logout.js?v=20260826-predeploy-fix';
import { createMemberApiClient } from './member/api.js?v=20261028-flow2';
import { loadMemberSessionSnapshot } from './member/refresh.js?v=20260907-feedback';
import { apiError, authError, authOrApiError, createAccountAttempt, createMemberSession } from './member/session.js?v=20261028-flow2';
import { createMemberData as defaultData, normalizeMember as normalizeMemberState } from './member/state.js?v=20260926-portal3';
import { $, $$, setButtonBusy, toast } from './member/ui.js?v=20260924-merch2';
import { createMemberShell } from './member/shell.js?v=20261030-portal1';
import { createMemberOverview } from './member/modules/overview.js?v=20261030-portal1';
import { createMemberGarage } from './member/modules/garage.js?v=20261028-flow2';
import { createMemberPhotos } from './member/modules/photos.js?v=20261028-entry1';
import { createMemberPlanner } from './member/modules/planner/index.js?v=20261028-entry1';
import {verifyNewPasswordAccount} from './member/registration-verification.js?v=20261023-mail1';
import { formatCzk } from './member/modules/planner/payments.js?v=20260924-merch2';
import { createMemberClub } from './member/modules/club/index.js?v=20261028-flow2';
import { achievementIcon, pictogram } from './member/modules/club/points.js?v=20261026-merch-mail1';
import { createMemberAccount } from './member/modules/account.js?v=20261011-ui1';
import { createMemberLive } from './member/modules/live.js?v=20261028-entry1';
import { createMemberMerch } from './member/modules/merch.js?v=20261026-merch-mail1';
import './member/club-tabs.js?v=20260924-workspace1';
import { ACCOUNT_USED_KEY, accountAuthMode, rememberAccountUse, resolveAccountIntent } from './member/deep-links.js?v=20261028-entry1';
import { renderMemberAvailability } from './member/availability.js?v=20260907-feedback';
import { isAuthorizationFailure } from './member/refresh.js?v=20260907-feedback';

const apiBaseUrl=(portalConfig.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'');
const memberSession=createMemberSession({config:firebaseConfig,onStateChange:handleUnitedAuthState});
const {request:memberApiRequest,requestForm:apiRequestForm,requestBlob:apiRequestBlob}=createMemberApiClient({baseUrl:apiBaseUrl,getCurrentUser:()=>memberSession.currentUser});
// Capture the current entry budget at request creation, including module-owned reads.
function apiRequest(path,options={}){
  const deadlineAt=accountAttempt?.active&&(!options.method||options.method==='GET')?accountAttempt.deadlineAt:undefined;
  return memberApiRequest(path,deadlineAt===undefined?options:{...options,deadlineAt:options.deadlineAt??deadlineAt});
}
const memberMerch=createMemberMerch({request:apiRequest,getUser:()=>memberSession.currentUser});
const memberUrlParams=new URLSearchParams(window.location.search);
let accountLinkState={status:'loading'};
function renderMemberAccountLinks(state){accountLinkState=state;renderAccountLinks(state)}
window.addEventListener('storage',event=>{if(event.key===ACCOUNT_USED_KEY||event.key===null)renderAccountLinks(accountLinkState)});
let accountEntryIntent=resolveAccountIntent(location.href),entryRevision=0,entryConsumed=false,arrivalInvitationController=null;
function invalidateEntryNavigation(){entryRevision++;entryConsumed=true;arrivalInvitationController?.abort();arrivalInvitationController=null;memberLive?.cancelEntry()}
function consumeEntryNavigation(revision){
  if(entryConsumed||revision!==entryRevision)return null;
  entryConsumed=true;
  const url=new URL(location.href);for(const key of ['intent','returnTo','mode'])url.searchParams.delete(key);
  if(accountEntryIntent.returnTo)url.searchParams.set('returnTo',accountEntryIntent.returnTo);
  for(const [key,value] of Object.entries(accountEntryIntent.context||{}))url.searchParams.set(key,value);
  history.replaceState(history.state,'',url);
  return accountEntryIntent;
}

let data=defaultData();
let memberPlanner=null,memberShell=null,memberLive=null;
let startupErrors={},lastPlannerDraftResult=null;
let optionalReadState={club:'pending',photos:'pending'};
let sessionAttempt=0,accountAttempt=null,accountNeedsRetry=false,accountWritePending=false;
function beginAccountAttempt(startedAt=Date.now()){
  accountAttempt?.finish();accountNeedsRetry=false;
  const attempt=createAccountAttempt({startedAt,onSlow:()=>showAuthStatus({title:'Připojení trvá déle.',copy:'Stále ověřuji účet. Do chvíle nabídnu výsledek nebo nové načtení.'}),onTimeout:()=>{
    accountNeedsRetry=true;sessionAttempt++;
    $$('[data-auth-form] button[type=submit]').forEach(button=>setButtonBusy(button,false));
    showAuthStatus({title:'Účet se nepodařilo načíst včas.',copy:accountWritePending?'Požadavek na účet mohl proběhnout. Obnov načtení; nový účet znovu nezakládej.':'Zkontroluj připojení a obnov načtení. Uložené přihlášení jsme nezměnili.',retry:true});
  }});accountAttempt=attempt;return attempt;
}
const trackOnboarding=stage=>apiRequest('/api/onboarding',{method:'POST',body:{stage}}).catch(error=>console.warn('Onboarding tracking unavailable',error));
function resetMemberState(){optionalReadState={club:'pending',photos:'pending'};startupErrors={};lastPlannerDraftResult=null;resetGarage();resetMemberPhotos();memberClub.reset();memberPlanner.reset();memberLive?.reset();memberMerch.reset();memberAccount.reset();memberOverview?.resetOnboarding();data=defaultData();renderAll()}
function normalizeMember(payload,user=memberSession.currentUser){return normalizeMemberState(payload,user)}
function renderOptionalReadState(){
  const club=$('[data-member-panel="club"]'),clubPending=optionalReadState.club==='pending',clubReady=optionalReadState.club==='ready';
  if(club){
    club.setAttribute('aria-busy',String(clubPending));
    [...club.children].filter(node=>!node.hasAttribute('data-domain-retry-state')&&!node.hasAttribute('data-club-loading-state')).forEach(node=>{
      if(!clubReady){if(!node.hasAttribute('data-club-read-hidden'))node.dataset.clubReadHidden=String(node.hidden);node.hidden=true}
      else if(node.hasAttribute('data-club-read-hidden')){node.hidden=node.dataset.clubReadHidden==='true';delete node.dataset.clubReadHidden}
    });
    let status=club.querySelector('[data-club-loading-state]');
    if(clubPending&&!status){status=document.createElement('p');status.dataset.clubLoadingState='';status.setAttribute('role','status');status.textContent='Načítám United Club…';club.prepend(status)}
    if(!clubPending)status?.remove();
  }
  if(!clubReady){
    $$('[data-overview-points],[data-attendance-count]').forEach(node=>node.textContent='—');
    const fill=$('[data-overview-points-fill]');if(fill)fill.style.width='0%';
    const featured=$('[data-featured-achievements]');if(featured)featured.textContent=clubPending?'Načítám klubové údaje…':'Klubové údaje nejsou dostupné.';
  }
  const photos=$('[data-member-gallery-list]'),photosPending=optionalReadState.photos==='pending';
  if(photos){
    photos.hidden=optionalReadState.photos!=='ready';photos.setAttribute('aria-busy',String(photosPending));
    if(optionalReadState.photos!=='ready'){const more=$('[data-member-gallery-more]');if(more)more.hidden=true}
    let status=photos.parentElement.querySelector('[data-photos-loading-state]');
    if(photosPending&&!status){status=document.createElement('p');status.dataset.photosLoadingState='';status.setAttribute('role','status');status.textContent='Načítám tvoje fotografie…';photos.before(status)}
    if(!photosPending)status?.remove();
  }
}
function renderMemorySessionNotice(){
  const root=$('[data-app-view] .member-content');if(!root)return;
  let notice=root.querySelector('[data-memory-session-notice]');
  const memory=memberSession.firebase?.persistence==='memory'&&data.profile?.id===memberSession.currentUser?.uid&&Boolean(memberSession.currentUser);
  if(!memory){notice?.remove();return}
  if(!notice){notice=document.createElement('aside');notice.className='member-domain-error';notice.dataset.memorySessionNotice='';notice.setAttribute('role','status');notice.textContent='Úložiště prohlížeče není dostupné. Přihlášení platí jen v tomto panelu; po obnovení se přihlas znovu.';root.prepend(notice)}
}
function renderMemberDomains(){renderMemberAvailability(startupErrors,retryMemberDomain,{hasHandoff:memberPlanner.hasActiveHandoff()});renderOptionalReadState()}


async function ensureMemberProfile(user,attempt){
  memberSession.currentUser=user;
  let payload=await apiRequest('/api/me',{deadlineAt:attempt.deadlineAt});
  if(payload?.profileExists===false){
    const fallbackName=(user.displayName||user.email?.split('@')[0]||'United Member').trim();
    payload=await apiRequest('/api/bootstrap',{
      method:'POST',
      deadlineAt:attempt.deadlineAt,body:{name:fallbackName,nickname:fallbackName.split(/\s+/)[0]||'Driver'}
    });
  }
  const member=normalizeMember(payload,user);
  if(!member.id)throw new Error('member_profile_invalid');
  if(member.id!==user.uid)throw new Error('member_identity_mismatch');
  if(['inactive','blocked','suspended'].includes(String(member.status||'').toLowerCase()))throw new Error('member_inactive');
  return member;
}

async function openAuthenticatedSession(user,{quiet=false,isCurrent=()=>memberSession.currentUser===user,attempt=accountAttempt}={}){
  const navigationRevision=entryRevision;
  if(data.profile?.id&&data.profile.id!==user.uid)resetMemberState();
  memberSession.currentUser=user;
  void trackOnboarding('seen');
  const member=await attempt.wait(ensureMemberProfile(user,attempt));
  if(!isCurrent())return;
  void trackOnboarding('profile');
  const {cars,reservation,plannerDraftResult,club,errors}=await attempt.wait(loadMemberSessionSnapshot({
    loadCars:loadCarsFromApi,
    loadReservation:()=>memberPlanner.loadCurrentReservation(),
    loadPlannerDraft:()=>memberPlanner.loadServerPlannerDraft(),
    loadClub:async()=>null,
    loadGallery:async()=>[],
    onCarsError:error=>console.warn('Cars API unavailable',error),
    onGalleryError:error=>{console.warn('Gallery status unavailable',error);handleMemberGalleryLoadError()},
  }));
  if(!isCurrent())return;
  startupErrors=errors;lastPlannerDraftResult=plannerDraftResult;
  optionalReadState={club:'pending',photos:'pending'};
  data={...defaultData(),profile:member,cars,reservation,club:club||defaultData().club};
  rememberAccountUse();renderMemberAccountLinks({status:'authenticated'});
  setMode('AUTH + PROFIL LIVE');
  showApp();
  memberSession.authFlowActive=false;
  $$('[data-auth-form] button[type=submit]').forEach(button=>setButtonBusy(button,false));
  attempt.finish();
  renderMemorySessionNotice();
  void memberClub.load().then(club=>{if(isCurrent()){optionalReadState.club='ready';data.club=club;memberOverview.renderMemberCard();memberClub.renderPoints();memberClub.renderAchievements();memberClub.renderMembers();memberClub.renderHistory();memberClub.renderRewards();renderMemberHero();renderMemberDomains()}}).catch(error=>{if(isCurrent()){optionalReadState.club='error';startupErrors.club=error;renderMemberDomains()}});
  void loadMemberGallery().then(()=>{if(isCurrent()){optionalReadState.photos='ready';renderMemberGallery();renderMemberDomains()}}).catch(error=>{if(isCurrent()){optionalReadState.photos='error';startupErrors.photos=error;handleMemberGalleryLoadError();renderMemberDomains()}});
  memberMerch.startup();
  if(!errors.reservation)await memberPlanner.applyPlannerDraft(plannerDraftResult,{isCurrent});
  if(!isCurrent())return;
  const intent=consumeEntryNavigation(navigationRevision);
  if(intent?.kind==='public'){location.replace(intent.destination);return}
  const initialSection=intent?.section;
  if(initialSection==='live'){
    openSection('overview');
    await memberLive.startup({requested:true});
    if(!isCurrent())return;
  }else if(initialSection){
    openSection(initialSection);
    void memberLive.probe();
  }else void memberLive.probe();
  renderMemberDomains();
  void trackOnboarding('portal');
  if(!quiet)toast(`Přihlášen jako ${member.nickname||member.name}.`);
  if(intent&&initialSection!=='live'){
    arrivalInvitationController=new AbortController();
    const signal=arrivalInvitationController.signal;
    void showArrivalInvitation({request:apiRequest,user,firebase:memberSession.firebase,signal,isCurrent:()=>isCurrent()&&!signal.aborted,openAccount:()=>openSection('account')});
  }
}

async function retryMemberDomain(key){
  try{
    if(key==='garage')data.cars=await loadCarsFromApi();
    if(key==='reservation')data.reservation=await memberPlanner.loadCurrentReservation();
    if(key==='club'){data.club=await memberClub.load();optionalReadState.club='ready'}
    if(key==='photos'){await loadMemberGallery();optionalReadState.photos='ready'}
    if(key==='planner'){
      lastPlannerDraftResult=await memberPlanner.loadServerPlannerDraft();
      if(!lastPlannerDraftResult.available)throw lastPlannerDraftResult.error;
    }
    delete startupErrors[key];
    renderAll();
    if(['reservation','planner'].includes(key)&&!startupErrors.reservation)await memberPlanner.applyPlannerDraft(lastPlannerDraftResult);
  }catch(error){
    if(isAuthorizationFailure(error)){await restoreAuthenticatedSession(memberSession.currentUser);return}
    startupErrors[key]=error;toast('Stále nedostupné. Zkus to prosím za chvíli.');
  }
  renderMemberDomains();
}

async function restoreAuthenticatedSession(user,{quiet=true,attempt=beginAccountAttempt()}={}){
  arrivalInvitationController?.abort();arrivalInvitationController=null;
  const attemptNumber=++sessionAttempt;
  memberSession.currentUser=user;
  renderMemberAccountLinks({status:'authenticated'});
  const isCurrent=()=>attemptNumber===sessionAttempt&&memberSession.currentUser===user;
  showAuthStatus({title:'Načítám tvůj United.',copy:'Session je potvrzená. Připravuji profil, garáž a aktuální stav srazu.'});
  try{await openAuthenticatedSession(user,{quiet,isCurrent,attempt});return isCurrent()}
  catch(error){
    if(!isCurrent())return false;
    attempt.finish();
    console.error('Unable to restore member session',error);
    resetMemberState();
    setMode('AUTH OK · PROFIL NEDOSTUPNÝ');
    showAuthStatus({title:'Session zůstává aktivní.',copy:`${apiError(error)} Tvoje Firebase přihlášení jsme nezměnili.`,retry:true});
    return false;
  }
}

async function handleUnitedAuthState(state){
  renderMemberAccountLinks(state);
  if(state.status==='loading'){
    if(!accountAttempt?.active)beginAccountAttempt(state.startedAt);
    showAuthStatus(state.slow?{title:'Připojení trvá déle.',copy:'Stále ověřuji účet. Do chvíle nabídnu výsledek nebo nové načtení.'}:undefined);setMode('AUTH LOADING');return;
  }
  if(state.status==='error'){
    accountAttempt?.finish();
    console.error('Firebase Auth initialization failed',state.error);
    setMode('AUTH NEDOSTUPNÝ');
    showAuthStatus({title:'Přihlášení se nepodařilo ověřit.',copy:'Tvoje uložená session nebyla změněna. Zkontroluj připojení a zkus to znovu.',retry:true});
    return;
  }
  if(memberSession.authFlowActive||accountNeedsRetry)return;
  if(state.status==='anonymous'){
    arrivalInvitationController?.abort();arrivalInvitationController=null;
    accountAttempt?.finish();sessionAttempt++;
    memberSession.currentUser=null;resetMemberState();showAuth();setMode('AUTH READY');return;
  }
  await restoreAuthenticatedSession(state.user,{attempt:accountAttempt?.active?accountAttempt:beginAccountAttempt()});
}

async function initFirebase(){
  // Production auth must fail closed. Remove legacy preview/session state so it can never authenticate a user.
  try{['e36UnitedMemberPreviewV19','e36UnitedMemberPreviewV18','e36UnitedMemberSessionV19'].forEach(key=>localStorage.removeItem(key))}catch(error){console.debug('Legacy preview storage cleanup is unavailable.',error)}
  showAuthStatus();
  await memberSession.initialize();
}

$$('[data-auth-switch]').forEach(btn=>btn.addEventListener('click',()=>activateAuthTab(btn.dataset.authSwitch)));
$$('[data-auth-tab]').forEach(btn=>btn.addEventListener('click',()=>activateAuthTab(btn.dataset.authTab)));
$$('[data-toggle-password]').forEach(button=>button.addEventListener('click',()=>{const input=button.parentElement.querySelector('input');if(input)input.type=input.type==='password'?'text':'password'}));

$('[data-auth-form="login"]')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const firebase=memberSession.firebase;
  if(!firebase)return toast('Přihlášení teď není dostupné.');
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),fd=new FormData(form);
  const email=String(fd.get('email')||'').trim().toLowerCase(),password=String(fd.get('password')||'');
  resetMemberState();showAuth();
  memberSession.authFlowActive=true;setButtonBusy(button,true,'Přihlašuji…');
  const attempt=beginAccountAttempt();showAuthStatus({title:'Přihlašuji tě.',copy:'Ověřuji účet a načítám profil.'});
  let credential=null;
  try{
    credential=await attempt.wait(firebase.signInWithEmailAndPassword(firebase.auth,email,password));
  }catch(error){
    console.error('Login failed',error);
    if(attempt.active){attempt.finish();memberSession.currentUser=null;resetMemberState();showAuth();setMode('AUTH READY');toast(authOrApiError(error))}
  }
  if(credential){
    memberSession.currentUser=credential.user;
    const restored=await restoreAuthenticatedSession(credential.user,{quiet:false,attempt});
    if(!restored&&accountAttempt===attempt&&memberSession.currentUser===credential.user)toast('Přihlášení je aktivní, ale profil se teď nepodařilo načíst.');
  }
  if(accountAttempt===attempt){memberSession.authFlowActive=false;setButtonBusy(button,false)}
});

$('[data-auth-form="register"]')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const firebase=memberSession.firebase;
  if(!firebase)return toast('Registrace teď není dostupná.');
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),fd=new FormData(form);
  const email=String(fd.get('email')||'').trim().toLowerCase(),password=String(fd.get('password')||''),passwordConfirm=String(fd.get('passwordConfirm')||''),name=String(fd.get('name')||'').trim(),nickname=String(fd.get('nickname')||'').trim()||name.split(/\s+/)[0];
  if(password!==passwordConfirm)return toast('Hesla se neshodují.');
  memberSession.authFlowActive=true;setButtonBusy(button,true,'Zakládám United ID…');
  const attempt=beginAccountAttempt();accountWritePending=true;showAuthStatus({title:'Zakládám tvůj účet.',copy:'Po vytvoření tě automaticky přihlásím.'});
  let createdUser=null;
  try{
    const cred=await attempt.wait(firebase.createUserWithEmailAndPassword(firebase.auth,email,password));
    createdUser=cred.user;memberSession.currentUser=createdUser;
    void trackOnboarding('seen');
    try{await attempt.wait(firebase.updateProfile(createdUser,{displayName:name}))}catch(error){console.warn('Firebase display name update unavailable; D1 profile keeps the submitted name.',error)}
    if(!attempt.active)return;
    try{await attempt.wait(apiRequest('/api/bootstrap',{method:'POST',body:{name,nickname},deadlineAt:attempt.deadlineAt}))}catch(error){console.warn('Member bootstrap will be retried during restore',error)}
    if(!attempt.active)return;
    await restoreAuthenticatedSession(createdUser,{quiet:false,attempt});
    void verifyNewPasswordAccount(firebase,createdUser).then(verification=>{if(verification.needed)toast(verification.requested?'Účet je založený. Otevři ověřovací e-mail od Firebase.':'Účet je založený, ale ověřovací e-mail se nepodařilo vyžádat. Kontaktuj info@e36united.cz.')});
  }catch(error){
    console.error('Registration failed',error);if(attempt.active){attempt.finish();toast(authError(error))}return;
  }finally{
    accountWritePending=false;
    if(!createdUser&&!accountNeedsRetry){showAuth();activateAuthTab('register')}
    if(accountAttempt===attempt){memberSession.authFlowActive=false;setButtonBusy(button,false)}
  }
});

$('[data-password-reset]')?.addEventListener('click',async()=>{
  const email=$('[data-auth-form="login"] input[name="email"]')?.value?.trim().toLowerCase();
  if(!email)return toast('Nejdřív vyplň e-mail.');
  const firebase=memberSession.firebase;
  if(!firebase)return toast('Reset hesla teď není dostupný.');
  try{await firebase.sendPasswordResetEmail(firebase.auth,email);toast('Odkaz pro nové heslo byl odeslán.')}catch(error){toast(authError(error))}
});

$('[data-auth-retry]')?.addEventListener('click',async()=>{
  const user=memberSession.firebase?.auth?.currentUser||memberSession.currentUser;
  if(user)await restoreAuthenticatedSession(user);
  else if(accountNeedsRetry&&memberSession.firebase){accountNeedsRetry=false;accountAttempt?.finish();showAuth();activateAuthTab('login');toast('Výsledek předchozího požadavku ověř přihlášením. Účet znovu nezakládej.')}
  else await memberSession.retry();
});

async function logoutMember(){
  if(memberSession.authFlowActive)return false;
  if(memberPlanner?.requestClose({restoreFocus:false,restoreScroll:false})===false)return false;
  accountAttempt?.finish();accountAttempt=null;sessionAttempt++;
  invalidateEntryNavigation();
  memberSession.authFlowActive=true;
  const signedOut=await performMemberLogout({
    signOut:()=>{const firebase=memberSession.firebase;if(!firebase)throw new Error('firebase_unavailable');return firebase.signOut(firebase.auth)},
    onSuccess:()=>{sessionAttempt++;accountEntryIntent={kind:'member',section:'overview'};entryConsumed=false;memberPortalNavigation?.close({restoreFocus:false});closeMainMenu();memberSession.currentUser=null;resetMemberState();resetAuthForms();showAuth();setMode('AUTH READY');toast('Odhlášeno.')},
    onFailure:error=>{console.warn('Firebase logout failed',error);toast('Odhlášení se nepodařilo. Tvoje přihlášení zůstalo aktivní. Zkus to znovu.')},
  });
  memberSession.authFlowActive=false;
  return signedOut;
}
$$('[data-logout]').forEach(button=>button.addEventListener('click',logoutMember));

const memberGarage=createMemberGarage({
  apiRequest,
  apiRequestForm,
  apiRequestBlob,
  getCurrentUser:()=>memberSession.currentUser,
  getCars:()=>data.cars,
  setCars:cars=>{data.cars=cars},
  refreshClub:()=>memberClub.refresh(),
  renderReservationCarSelect:()=>memberPlanner?.renderCarSelect(),
  renderReservationCarPhoto:()=>memberPlanner?.renderReservationCarPhoto(data.reservation),
  clearReservationCarError:()=>memberPlanner?.setReservationCarError(false),
  onCarDisplayChanged:()=>renderProfile(),
  onCarSaved:({carId,resumeReservation,resumePlanner})=>{
    renderProfile();memberClub.renderPoints();memberClub.renderAchievements();
    memberPlanner?.handleGarageCarSaved({carId,resumeReservation,resumePlanner});
  },
  renderEditIcon:()=>pictogram('<path d="m4 20 4.2-1 10.4-10.4a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z"/><path d="m13.8 7.4 3 3"/>'),
  formatApiError:apiError,
});
const {bind:bindGarage,getPrivateCarPhotoUrl,hasPrivateCarPhotoUrl,loadCarsFromApi,openCarModal,renderGarage,reset:resetGarage}=memberGarage;
const memberPhotos=createMemberPhotos({apiRequest,apiRequestForm,apiRequestBlob,getCurrentUser:()=>memberSession.currentUser,formatApiError:apiError});
const {bind:bindMemberPhotos,handleLoadError:handleMemberGalleryLoadError,loadMemberGallery,renderMemberGallery,reset:resetMemberPhotos}=memberPhotos;

let memberOverview=null;
const memberClub=createMemberClub({
  apiBaseUrl,
  apiRequest,
  apiRequestForm,
  apiRequestBlob,
  getCurrentUser:()=>memberSession.currentUser,
  getData:()=>data,
  setClub:club=>{data.club=club},
  createDefaultClub:()=>defaultData().club,
  renderOverviewPoints:()=>memberOverview.renderPoints(),
  renderFeaturedAchievements:()=>memberOverview.renderFeaturedAchievements(),
  renderAll:()=>renderAll(),
  formatApiError:apiError,
  openSection:id=>memberShell?.openSection(id),
});

memberOverview=createMemberOverview({
  getData:()=>data,
  getMemberSince:()=>memberClub.getMemberSince(),
  getVerified:()=>memberClub.getVerified(),
  getPoints:()=>memberClub.getPoints(),
  formatAmount:formatCzk,
  renderAchievementIcon:achievement=>achievementIcon(achievement.type),
  getMemberIdentity:()=>data.profile?.id||data.profile?.memberCode||'',
  openSection:id=>memberShell?.openSection(id),
});
memberShell=createMemberShell({
  renderApp:()=>renderAll(),
  getData:()=>data,
  getMemberSince:()=>memberClub.getMemberSince(),
  getAttended:()=>memberClub.getAttended(),
  getPrivateCarPhotoUrl,
  isAuthenticated:()=>Boolean(memberSession.currentUser),
  onGarageHeroAction:()=>{if(!data.cars.length){openCarModal();return}requestAnimationFrame(()=>$('[data-primary-car-card]')?.scrollIntoView({behavior:'smooth',block:'center'}))},
  beforePortalAction:()=>memberPlanner?.requestClose({restoreFocus:false,restoreScroll:false})??true,
  onLiveEntry:()=>memberLive?.requestEntry(),
  onSectionChange:invalidateEntryNavigation,
});
const {activateAuthTab,bindMainNavigation,closeMainMenu,memberPortalNavigation,openSection,renderMemberHero,resetAuthForms,setLiveMode,setMode,showApp,showAuth,showAuthStatus}=memberShell;

memberLive=createMemberLive({
  apiBaseUrl,apiRequest,apiRequestForm,apiRequestBlob,openSection,setLiveMode,getPrivateCarPhotoUrl,
  getAccountId:()=>memberSession.currentUser?.uid||'',
  getRegistrationCar:()=>{const id=data.reservation?.carId;return data.cars.find(car=>String(car.id)===String(id))||null},
});

memberPlanner=createMemberPlanner({
  apiBaseUrl,
  apiRequest,
  getCurrentUser:()=>memberSession.currentUser,
  getData:()=>data,
  setReservation:reservation=>{data.reservation=reservation},
  renderActionCenter:state=>memberOverview.renderActionCenter(state),
  openSection,
  getPrivateCarPhotoUrl,
  hasPrivateCarPhotoUrl,
  onReservationSaved:()=>renderProfile(),
  formatApiError:apiError,
  plannerDraftKey:portalConfig.plannerDraftKey||'e36UnitedPlannerDraftV19',
  initialHandoffId:memberUrlParams.get('draft')||'',
});

const memberAccount=createMemberAccount({
  apiRequest,
  getCurrentUser:()=>memberSession.currentUser,
  getData:()=>data,
  setProfile:profile=>{data.profile=profile},
  normalizeMember,
  refreshClub:()=>memberClub.refresh(),
  getMemberSince:()=>memberClub.getMemberSince(),
  renderProfile:()=>renderProfile(),
  renderPoints:()=>memberClub.renderPoints(),
  renderAchievements:()=>memberClub.renderAchievements(),
  formatApiError:apiError,
});

function renderAll(){renderProfile();memberClub.renderPoints();memberClub.renderAchievements();memberClub.renderMembers();renderGarage();memberClub.renderHistory();memberPlanner.renderReservation();memberClub.renderRewards();renderMemberGallery();memberAccount.render();memberLive?.render();renderMemberDomains();renderMemorySessionNotice()}
function renderProfile(){memberOverview.renderMemberCard();renderMemberHero();memberOverview.refreshOnboarding()}

memberAccount.bind();
memberClub.bind();
bindGarage();
bindMemberPhotos();
memberPlanner.bind();
memberLive.bind();

bindMainNavigation();
memberPlanner.hydratePlannerHandoffFromUrl();
activateAuthTab(accountAuthMode(window.location.search));
initFirebase();
