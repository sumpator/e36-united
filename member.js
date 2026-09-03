import { firebaseConfig, portalConfig } from './firebase-config.js?v=20260823-auth2';
import { performMemberLogout } from './member-logout.js?v=20260826-predeploy-fix';
import { createMemberApiClient } from './member/api.js?v=20260902-phase3';
import { loadMemberSessionSnapshot } from './member/refresh.js?v=20260902-phase3';
import { apiError, authError, authOrApiError, createMemberSession } from './member/session.js?v=20260902-phase3';
import { createMemberData as defaultData, normalizeMember as normalizeMemberState } from './member/state.js?v=20260902-phase3';
import { $, $$, setButtonBusy, toast } from './member/ui.js?v=20260902-phase3';
import { createMemberShell } from './member/shell.js?v=20260903-phase4a';
import { createMemberOverview } from './member/modules/overview.js?v=20260903-phase4a';
import { createMemberGarage } from './member/modules/garage.js?v=20260903-phase4b';
import { createMemberPhotos } from './member/modules/photos.js?v=20260903-phase4b';
import { createMemberPlanner } from './member/modules/planner/index.js?v=20260903-phase4c';
import { formatCzk } from './member/modules/planner/payments.js?v=20260903-phase4c';
import { createMemberClub } from './member/modules/club/index.js?v=20260903-phase4d';
import { achievementIcon, pictogram } from './member/modules/club/points.js?v=20260903-phase4d';
import { createMemberAccount } from './member/modules/account.js?v=20260903-phase4d';

const apiBaseUrl=(portalConfig.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'');
const memberSession=createMemberSession({config:firebaseConfig,onStateChange:handleUnitedAuthState});
const {request:apiRequest,requestForm:apiRequestForm,requestBlob:apiRequestBlob}=createMemberApiClient({baseUrl:apiBaseUrl,getCurrentUser:()=>memberSession.currentUser});
const memberUrlParams=new URLSearchParams(window.location.search);

let data=defaultData();
let memberPlanner=null;
function resetMemberState(){resetGarage();resetMemberPhotos();memberClub.reset();memberPlanner.reset();data=defaultData();renderAll()}
function normalizeMember(payload,user=memberSession.currentUser){return normalizeMemberState(payload,user)}

async function ensureMemberProfile(user){
  memberSession.currentUser=user;
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
  memberSession.currentUser=user;
  const member=await ensureMemberProfile(user);
  const {cars,reservation,plannerDraftResult,club}=await loadMemberSessionSnapshot({
    loadCars:loadCarsFromApi,
    loadReservation:()=>memberPlanner.loadCurrentReservation(),
    loadPlannerDraft:()=>memberPlanner.loadServerPlannerDraft(),
    loadClub:()=>memberClub.load(),
    loadGallery:loadMemberGallery,
    onCarsError:error=>console.warn('Cars API unavailable',error),
    onGalleryError:error=>{console.warn('Gallery status unavailable',error);handleMemberGalleryLoadError()},
  });
  data={...defaultData(),profile:member,cars,reservation,club};
  setMode('AUTH + PROFIL LIVE');
  showApp();
  openSection('overview');
  await memberPlanner.applyPlannerDraft(plannerDraftResult);
  if(!quiet)toast(`Přihlášen jako ${member.nickname||member.name}.`);
}

async function restoreAuthenticatedSession(user,{quiet=true}={}){
  memberSession.currentUser=user;
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
  if(state.status==='loading'){
    showAuthStatus();setMode('AUTH LOADING');return;
  }
  if(state.status==='error'){
    console.error('Firebase Auth initialization failed',state.error);
    setMode('AUTH NEDOSTUPNÝ');
    showAuthStatus({title:'Přihlášení se nepodařilo ověřit.',copy:'Tvoje uložená session nebyla změněna. Zkontroluj připojení a zkus to znovu.',retry:true});
    return;
  }
  if(memberSession.authFlowActive)return;
  if(state.status==='anonymous'){
    memberSession.currentUser=null;resetMemberState();showAuth();setMode('AUTH READY');return;
  }
  await restoreAuthenticatedSession(state.user);
}

async function initFirebase(){
  // Production auth must fail closed. Remove legacy preview/session state so it can never authenticate a user.
  try{['e36UnitedMemberPreviewV19','e36UnitedMemberPreviewV18','e36UnitedMemberSessionV19'].forEach(key=>localStorage.removeItem(key))}catch(error){console.debug('Legacy preview storage cleanup is unavailable.',error)}
  showAuthStatus();
  await memberSession.initialize();
}

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
  let credential=null;
  try{
    credential=await firebase.signInWithEmailAndPassword(firebase.auth,email,password);
  }catch(error){
    console.error('Login failed',error);
    memberSession.currentUser=null;resetMemberState();showAuth();setMode('AUTH READY');toast(authOrApiError(error));
  }
  if(credential){
    memberSession.currentUser=credential.user;
    const restored=await restoreAuthenticatedSession(credential.user,{quiet:false});
    if(!restored)toast('Přihlášení je aktivní, ale profil se teď nepodařilo načíst.');
  }
  memberSession.authFlowActive=false;setButtonBusy(button,false);
});

$('[data-auth-form="register"]')?.addEventListener('submit',async event=>{
  event.preventDefault();
  const firebase=memberSession.firebase;
  if(!firebase)return toast('Registrace teď není dostupná.');
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),fd=new FormData(form);
  const email=String(fd.get('email')||'').trim().toLowerCase(),password=String(fd.get('password')||''),passwordConfirm=String(fd.get('passwordConfirm')||''),name=String(fd.get('name')||'').trim(),nickname=String(fd.get('nickname')||'').trim()||name.split(/\s+/)[0];
  if(password!==passwordConfirm)return toast('Hesla se neshodují.');
  memberSession.authFlowActive=true;setButtonBusy(button,true,'Zakládám United ID…');
  let createdUser=null,emailSent=false,bootstrapOk=false;
  try{
    const cred=await firebase.createUserWithEmailAndPassword(firebase.auth,email,password);
    createdUser=cred.user;memberSession.currentUser=createdUser;
    await firebase.updateProfile(createdUser,{displayName:name});
    try{await apiRequest('/api/bootstrap',{method:'POST',body:{name,nickname}});bootstrapOk=true}catch(error){console.error('Member bootstrap failed after registration',error)}
    try{await firebase.sendEmailVerification(createdUser);emailSent=true}catch(error){console.error('Verification email failed',error)}
  }catch(error){
    console.error('Registration failed',error);toast(authError(error));return;
  }finally{
    if(createdUser){try{await firebase.signOut(firebase.auth)}catch(error){console.warn('Sign out after registration failed',error)}}
    memberSession.currentUser=null;resetMemberState();showAuth();activateAuthTab('login');
    const loginEmail=$('[data-auth-form="login"] input[name="email"]');if(loginEmail)loginEmail.value=email;
    memberSession.authFlowActive=false;setButtonBusy(button,false);
  }
  if(bootstrapOk&&emailSent)toast('United ID bylo vytvořeno. Ověření e-mailu jsme odeslali; teď se můžeš přihlásit.');
  else if(bootstrapOk)toast('United ID bylo vytvořeno. Teď se můžeš přihlásit; ověřovací e-mail se nepodařilo odeslat.');
  else toast('United ID bylo vytvořeno. Profil se doplní při prvním přihlášení.');
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
  else await memberSession.retry();
});

async function logoutMember(){
  if(memberSession.authFlowActive)return false;
  memberSession.authFlowActive=true;
  const signedOut=await performMemberLogout({
    signOut:()=>{const firebase=memberSession.firebase;if(!firebase)throw new Error('firebase_unavailable');return firebase.signOut(firebase.auth)},
    onSuccess:()=>{memberPortalNavigation?.close({restoreFocus:false});closeMainMenu();memberSession.currentUser=null;resetMemberState();resetAuthForms();showAuth();setMode('AUTH READY');toast('Odhlášeno.')},
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
  onCarSaved:({resumeReservation})=>{
    renderProfile();memberClub.renderPoints();memberClub.renderAchievements();
    memberPlanner?.handleGarageCarSaved({resumeReservation});
  },
  renderEditIcon:()=>pictogram('<path d="m4 20 4.2-1 10.4-10.4a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z"/><path d="m13.8 7.4 3 3"/>'),
  formatApiError:apiError,
});
const {bind:bindGarage,getPrivateCarPhotoUrl,hasPrivateCarPhotoUrl,loadCarsFromApi,openCarModal,renderGarage,reset:resetGarage}=memberGarage;
const memberPhotos=createMemberPhotos({apiRequest,apiRequestForm,apiRequestBlob,getCurrentUser:()=>memberSession.currentUser,formatApiError:apiError});
const {bind:bindMemberPhotos,handleLoadError:handleMemberGalleryLoadError,loadMemberGallery,renderMemberGallery,reset:resetMemberPhotos}=memberPhotos;

let memberOverview=null;
const memberClub=createMemberClub({
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
});

memberOverview=createMemberOverview({
  getData:()=>data,
  getMemberSince:()=>memberClub.getMemberSince(),
  getVerified:()=>memberClub.getVerified(),
  getPoints:()=>memberClub.getPoints(),
  formatAmount:formatCzk,
  renderAchievementIcon:achievement=>achievementIcon(achievement.type),
});
const memberShell=createMemberShell({
  renderApp:()=>renderAll(),
  getData:()=>data,
  getMemberSince:()=>memberClub.getMemberSince(),
  getAttended:()=>memberClub.getAttended(),
  getPrivateCarPhotoUrl,
  isAuthenticated:()=>Boolean(memberSession.currentUser),
  onGarageHeroAction:()=>{if(!data.cars.length){openCarModal();return}requestAnimationFrame(()=>$('[data-primary-car-card]')?.scrollIntoView({behavior:'smooth',block:'center'}))},
});
const {activateAuthTab,bindMainNavigation,closeMainMenu,memberPortalNavigation,openSection,renderMemberHero,resetAuthForms,setMode,showApp,showAuth,showAuthStatus}=memberShell;

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

function renderAll(){renderProfile();memberClub.renderPoints();memberClub.renderAchievements();renderGarage();memberClub.renderHistory();memberPlanner.renderReservation();memberClub.renderRewards();renderMemberGallery();memberAccount.render()}
function renderProfile(){memberOverview.renderMemberCard();renderMemberHero()}

memberAccount.bind();
memberClub.bind();
bindGarage();
bindMemberPhotos();
memberPlanner.bind();

bindMainNavigation();
memberPlanner.hydratePlannerHandoffFromUrl();
const requestedAuthMode=memberUrlParams.get('mode');if(requestedAuthMode==='register'||requestedAuthMode==='login')activateAuthTab(requestedAuthMode);
initFirebase();
