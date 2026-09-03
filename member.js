import { firebaseConfig, portalConfig } from './firebase-config.js?v=20260823-auth2';
import { performMemberLogout } from './member-logout.js?v=20260826-predeploy-fix';
import { createImagePreviewController, selectImageFiles } from './image-upload.js?v=20260827-garage-photos';
import { createMemberApiClient } from './member/api.js?v=20260902-phase3';
import { loadMemberSessionSnapshot } from './member/refresh.js?v=20260902-phase3';
import { apiError, authError, authOrApiError, createMemberSession } from './member/session.js?v=20260902-phase3';
import { createMemberData as defaultData, normalizeMember as normalizeMemberState } from './member/state.js?v=20260902-phase3';
import { $, $$, esc, setButtonBusy, toast, uid } from './member/ui.js?v=20260902-phase3';
import { createMemberShell } from './member/shell.js?v=20260903-phase4a';
import { createMemberOverview } from './member/modules/overview.js?v=20260903-phase4a';
import { createMemberGarage } from './member/modules/garage.js?v=20260903-phase4b';
import { createMemberPhotos } from './member/modules/photos.js?v=20260903-phase4b';
import { createMemberPlanner } from './member/modules/planner/index.js?v=20260903-phase4c';
import { formatCzk } from './member/modules/planner/payments.js?v=20260903-phase4c';

const apiBaseUrl=(portalConfig.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'');
const memberSession=createMemberSession({config:firebaseConfig,onStateChange:handleUnitedAuthState});
const {request:apiRequest,requestForm:apiRequestForm,requestBlob:apiRequestBlob}=createMemberApiClient({baseUrl:apiBaseUrl,getCurrentUser:()=>memberSession.currentUser});
const memberUrlParams=new URLSearchParams(window.location.search);

let data=defaultData();
let memberPlanner=null;
function resetMemberState(){resetGarage();resetMemberPhotos();clearHistoryEvidenceUrls();memberPlanner.reset();data=defaultData();renderAll()}
function normalizeMember(payload,user=memberSession.currentUser){return normalizeMemberState(payload,user)}

async function loadUnitedClub(){
  const payload=await apiRequest('/api/united-club');
  if(!payload?.ok)throw new Error('united_club_invalid');
  return {
    ...defaultData().club,
    ...payload,
    points:{...defaultData().club.points,...(payload.points||{})},
    rating:{...defaultData().club.rating,...(payload.rating||{})},
    history:Array.isArray(payload.history)?payload.history:[],
    achievements:Array.isArray(payload.achievements)?payload.achievements:[],
    featuredAchievements:Array.isArray(payload.featuredAchievements)?payload.featuredAchievements.slice(0,4):[],
  };
}

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
    loadClub:loadUnitedClub,
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

$('[data-account-form]')?.addEventListener('submit',async event=>{
  event.preventDefault();if(!memberSession.currentUser)return toast('Nejdřív se přihlas.');
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),fd=new FormData(form);setButtonBusy(button,true,'Ukládám profil…');
  try{const payload=await apiRequest('/api/bootstrap',{method:'POST',body:{name:String(fd.get('name')||'').trim(),nickname:String(fd.get('nickname')||'').trim(),phone:String(fd.get('phone')||'').trim()}});data.profile=normalizeMember(payload,memberSession.currentUser);data.club=await loadUnitedClub();renderProfile();renderAccount();renderPoints();renderAchievements();toast('Profil byl uložen.')}
  catch(error){console.error('Member profile update failed',error);toast(apiError(error))}
  finally{setButtonBusy(button,false)}
});

const memberGarage=createMemberGarage({
  apiRequest,
  apiRequestForm,
  apiRequestBlob,
  getCurrentUser:()=>memberSession.currentUser,
  getCars:()=>data.cars,
  setCars:cars=>{data.cars=cars},
  refreshClub:async()=>{data.club=await loadUnitedClub()},
  renderReservationCarSelect:()=>memberPlanner?.renderCarSelect(),
  renderReservationCarPhoto:()=>memberPlanner?.renderReservationCarPhoto(data.reservation),
  clearReservationCarError:()=>memberPlanner?.setReservationCarError(false),
  onCarDisplayChanged:()=>renderProfile(),
  onCarSaved:({resumeReservation})=>{
    renderProfile();renderPoints();renderAchievements();
    memberPlanner?.handleGarageCarSaved({resumeReservation});
  },
  renderEditIcon:()=>pictogram('<path d="m4 20 4.2-1 10.4-10.4a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z"/><path d="m13.8 7.4 3 3"/>'),
  formatApiError:apiError,
});
const {bind:bindGarage,getPrivateCarPhotoUrl,hasPrivateCarPhotoUrl,loadCarsFromApi,openCarModal,renderGarage,reset:resetGarage}=memberGarage;
const memberPhotos=createMemberPhotos({apiRequest,apiRequestForm,apiRequestBlob,getCurrentUser:()=>memberSession.currentUser,formatApiError:apiError});
const {bind:bindMemberPhotos,handleLoadError:handleMemberGalleryLoadError,loadMemberGallery,renderMemberGallery,reset:resetMemberPhotos}=memberPhotos;

const memberOverview=createMemberOverview({
  getData:()=>data,
  getMemberSince:()=>memberSince(),
  getVerified:()=>verified(),
  getPoints:()=>points(),
  formatAmount:formatCzk,
  renderAchievementIcon:achievement=>achievementIcon(achievement.type),
});
const memberShell=createMemberShell({
  renderApp:()=>renderAll(),
  getData:()=>data,
  getMemberSince:()=>memberSince(),
  getAttended:()=>attended(),
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

const memberHelpContent={
  since:{kicker:'UNITED OD',title:'Začátek tvé United stopy',intro:'Nejstarší ročník, který máš ve své ověřené historii účastí.'},
  verified:{kicker:'OVĚŘENÉ UNITED',title:'Potvrzené účasti',intro:'Počítají se jen ročníky ověřené United týmem.'},
  points:{kicker:'UNITED POINTS',title:'Aktuální zůstatek',intro:'Body získáváš za ověřené United aktivity. Aktivní metr má limit 12 bodů.'},
  rating:{kicker:'MEMBER RATING',title:'Tvoje členská úroveň',intro:'Rating roste podle všech bodů, které jsi kdy získal: od 316i až po M POWER.'},
  verification:{kicker:'MOJE STOPA',title:'Proč ověření?',intro:'Účast můžeš přidat hned. Body a související Achievements se započítají až po potvrzení United týmem.'},
  'points-system':{kicker:'UNITED POINTS',title:'Jak fungují body?',intro:'Body odměňují ověřenou účast a přínos komunitě.',sections:[{label:'ODMĚNA',rows:[['12 bodů','United Merch reward','U']]}]},
  'earn-attendance':{kicker:'ÚČAST NA SRAZU',title:'Ověřené United',sections:[{label:'BODY ZA ÚČAST',rows:[['Každý ověřený sraz','+1 bod','•'],['3 ověřené srazy','+3 body navíc','3'],['5 ověřených srazů','+3 body navíc','5']]}]},
  'earn-showshine':{kicker:'SHOW & SHINE',title:'Ověřené umístění',sections:[{label:'UMÍSTĚNÍ',rows:[['3. místo','+1 bod','3'],['2. místo','+2 body','2'],['1. místo','+3 body','1']]},{label:'BONUSY',rows:[['Best of the Best','+1 bod','◆'],['Nej zvuk výfuku','+1 bod','◈']]}]},
  'earn-photos':{kicker:'NAHRÁVÁNÍ FOTEK',title:'Schválené komunitní fotky',sections:[{label:'MILNÍKY',rows:[['5 schválených fotek','+1 bod','5'],['25 schválených fotek','+1 bod','25'],['50 schválených fotek','+3 body','50']]}],note:'Po 50 schválených fotkách už další United Points nepřibývají.'},
  'earn-profile':{kicker:'DOPLNĚNÍ PROFILU',title:'+1 bod za kompletní profil',sections:[{label:'PODMÍNKY',rows:[['Kompletní registrace','','✓'],['Zkontrolovaná historie','','✓'],['Alespoň 1 auto v Garage','','✓'],['5 schválených komunitních fotek','','✓']]}],note:'Newsletter není podmínkou.'},
};
const memberHelpPopover=$('[data-member-help-popover]');
let memberHelpTrigger=null;
let contextPositionFrame=0;
function contextRowsMarkup(content={}){
  return `${content.intro?`<p class="context-popover-intro">${esc(content.intro)}</p>`:''}${(content.sections||[]).map(section=>`<section class="context-popover-section"><small>${esc(section.label)}</small><div class="context-popover-rows">${section.rows.map(([label,value,icon])=>`<div><span><i aria-hidden="true">${esc(icon||'•')}</i><b>${esc(label)}</b></span>${value?`<strong>${esc(value)}</strong>`:''}</div>`).join('')}</div></section>`).join('')}${content.note?`<p class="context-popover-note">${esc(content.note)}</p>`:''}`;
}
function positionContextPopover(popover,trigger,preferredWidth=370){
  if(!popover||!trigger||popover.hidden)return;const mobile=matchMedia('(max-width:700px)').matches;popover.classList.toggle('is-mobile-sheet',mobile);popover.style.removeProperty('--context-left');popover.style.removeProperty('--context-top');popover.style.removeProperty('--context-arrow-left');popover.style.removeProperty('--context-width');delete popover.dataset.placement;if(mobile)return;
  const margin=12,gap=10,rect=trigger.getBoundingClientRect(),width=Math.min(preferredWidth,innerWidth-margin*2);popover.style.setProperty('--context-width',`${width}px`);popover.style.visibility='hidden';const height=popover.offsetHeight;let placement='below',top=rect.bottom+gap;if(top+height>innerHeight-margin&&rect.top-height-gap>=margin){placement='above';top=rect.top-height-gap}else top=Math.min(top,innerHeight-height-margin);const left=Math.max(margin,Math.min(innerWidth-width-margin,rect.left+rect.width/2-width/2)),arrow=Math.max(18,Math.min(width-18,rect.left+rect.width/2-left));popover.style.setProperty('--context-left',`${left}px`);popover.style.setProperty('--context-top',`${Math.max(margin,top)}px`);popover.style.setProperty('--context-arrow-left',`${arrow}px`);popover.dataset.placement=placement;popover.style.visibility='';
}
function refreshContextPopoverPosition(){cancelAnimationFrame(contextPositionFrame);contextPositionFrame=requestAnimationFrame(()=>{if(!memberHelpPopover?.hidden&&memberHelpTrigger)positionContextPopover(memberHelpPopover,memberHelpTrigger,370);if(!achievementPopover?.hidden&&achievementTrigger)positionContextPopover(achievementPopover,achievementTrigger,330)})}
function closeMemberHelp({restoreFocus=false}={}){
  if(!memberHelpPopover||memberHelpPopover.hidden)return;
  memberHelpPopover.hidden=true;memberHelpPopover.classList.remove('is-mobile-sheet');
  $$('[data-member-help][aria-expanded]').forEach(button=>button.setAttribute('aria-expanded','false'));
  const trigger=memberHelpTrigger;memberHelpTrigger=null;if(restoreFocus)trigger?.focus();
}
function openMemberHelp(button){
  const content=memberHelpContent[button.dataset.memberHelp];if(!content||!memberHelpPopover)return;
  const same=memberHelpTrigger===button&&!memberHelpPopover.hidden;closeMemberHelp();if(same)return;
  closeAchievementDetail();memberHelpTrigger=button;button.setAttribute('aria-expanded','true');$('[data-member-help-kicker]',memberHelpPopover).textContent=content.kicker;$('[data-member-help-title]',memberHelpPopover).textContent=content.title;$('[data-member-help-content]',memberHelpPopover).innerHTML=contextRowsMarkup(content);memberHelpPopover.hidden=false;positionContextPopover(memberHelpPopover,button,370);
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-member-help]');if(button)openMemberHelp(button)});
$('[data-member-help-close]')?.addEventListener('click',()=>closeMemberHelp({restoreFocus:true}));
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMemberHelp({restoreFocus:true})});
document.addEventListener('click',event=>{if(!memberHelpPopover?.hidden&&!memberHelpPopover.contains(event.target)&&!event.target.closest('[data-member-help]'))closeMemberHelp()});

const achievementPopover=$('[data-achievement-popover]');
let achievementTrigger=null;
function closeAchievementDetail({restoreFocus=false}={}){
  if(!achievementPopover||achievementPopover.hidden)return;achievementPopover.hidden=true;achievementPopover.classList.remove('is-mobile-sheet');
  $$('[data-achievement-id][aria-expanded]').forEach(button=>button.setAttribute('aria-expanded','false'));
  const trigger=achievementTrigger;achievementTrigger=null;if(restoreFocus)trigger?.focus();
}
function openAchievementDetail(button){
  if(!achievementPopover)return;const all=[...(data.club?.achievements||[]),...(data.club?.featuredAchievements||[])],achievement=all.find(item=>String(item.id)===String(button.dataset.achievementId));if(!achievement)return;
  const same=achievementTrigger===button&&!achievementPopover.hidden;closeAchievementDetail();if(same)return;
  closeMemberHelp();achievementTrigger=button;button.setAttribute('aria-expanded','true');
  $('[data-achievement-icon]',achievementPopover).innerHTML=achievementIcon(achievement.type);
  const year=achievement.eventYear||String(achievement.id||achievement.name||'').match(/20\d{2}/)?.[0]||'';$('[data-achievement-tier]',achievementPopover).textContent=[year,achievement.tier||'ACHIEVEMENT'].filter(Boolean).join(' · ');
  $('[data-achievement-title]',achievementPopover).textContent=achievement.name;
  $('[data-achievement-condition]',achievementPopover).textContent=achievement.condition;
  const pointsEl=$('[data-achievement-points]',achievementPopover),reward=$('[data-achievement-reward]',achievementPopover);reward.hidden=!achievement.points;pointsEl.textContent=achievement.points?`+${achievement.points} ${pointWord(achievement.points)}`:'';achievementPopover.hidden=false;positionContextPopover(achievementPopover,button,330);
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-achievement-id]');if(button)openAchievementDetail(button);else if(!achievementPopover?.hidden&&!achievementPopover.contains(event.target))closeAchievementDetail()});
$('[data-achievement-close]')?.addEventListener('click',()=>closeAchievementDetail({restoreFocus:true}));
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeAchievementDetail({restoreFocus:true})});
window.addEventListener('resize',refreshContextPopoverPosition,{passive:true});
window.addEventListener('scroll',refreshContextPopoverPosition,{passive:true,capture:true});

const pictogram=body=>`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const achievementIcon=type=>type==='show-shine'?pictogram('<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M12 12v6m-3 2h6"/>'):type==='community'?pictogram('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-4L5 19"/>'):type==='history'?pictogram('<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>'):pictogram('<path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-5"/>');
function attended(d=data){return (d.club?.history||[]).filter(item=>item.attendance?.status==='approved').length}
function verified(d=data){return attended(d)}
function memberSince(d=data){return d.club?.memberSince||null}
function pointWord(value){const absolute=Math.abs(Number(value)||0);return absolute===1?'bod':absolute>=2&&absolute<=4?'body':'bodů'}
function formatPoints(value){return `${value} ${pointWord(value)}`}
function pointsRemainingVerb(value){const absolute=Math.abs(Number(value)||0);return absolute>=2&&absolute<=4?'zbývají':'zbývá'}
function points(d=data){return Number(d.club?.points?.available||0)}
function lifetimePoints(d=data){return Number(d.club?.points?.lifetime||0)}

function renderAll(){renderProfile();renderPoints();renderAchievements();renderGarage();renderHistory();memberPlanner.renderReservation();renderRewards();renderMemberGallery();renderAccount()}
function renderProfile(){memberOverview.renderMemberCard();renderMemberHero()}
function renderAccount(){
  const profile=data.profile||{},form=$('[data-account-form]');
  if(form){if(form.elements.name)form.elements.name.value=profile.name||'';if(form.elements.nickname)form.elements.nickname.value=profile.nickname||'';if(form.elements.phone)form.elements.phone.value=profile.phone||'';const email=$('[data-account-email]',form);if(email)email.value=profile.email||''}
  const code=$('[data-account-member-code]'),since=$('[data-account-since]'),verification=$('[data-account-verification]');if(code)code.textContent=profile.memberCode||'—';if(since)since.textContent=memberSince()||'—';if(verification){verification.textContent=profile.emailVerified?'OVĚŘENÝ':'NEOVĚŘENÝ';verification.classList.toggle('is-verified',profile.emailVerified)}
}
function renderPoints(){memberOverview.renderPoints();const p=points(),threshold=Number(data.club?.rewardThreshold||12),value=$('[data-points]'),track=$('[data-points-track]'),copy=$('[data-points-copy]');if(value)value.textContent=p;if(track)track.innerHTML=Array.from({length:threshold},(_,i)=>`<i class="${i<p?'is-on':''}"></i>`).join('');if(copy)copy.textContent=p>=threshold?`${p} bodů. United Merch reward je odemčený.`:`Ještě ${threshold-p} bodů a odemykáš United Merch reward.`}
function renderAchievements(){
  memberOverview.renderFeaturedAchievements();
  const achievements=data.club?.achievements||[],catalog=$('[data-achievement-catalog]');
  if(catalog)catalog.innerHTML=achievements.length?achievements.map(achievement=>`<button aria-expanded="false" class="achievement-card is-unlocked" data-achievement-id="${esc(achievement.id)}" type="button"><span class="achievement-icon">${achievementIcon(achievement.type)}</span><div class="achievement-copy"><b>${esc(achievement.name)}</b><p>${esc(achievement.condition)}</p></div><span class="achievement-status">${esc(achievement.tier||'ODEMČENO')}</span></button>`).join(''):'<article class="achievement-empty">Ověřená historie postupně odemkne tvoji sbírku.</article>';
}
const fallbackHistoryCategories=[['sedan','Sedan'],['coupe','Coupé'],['touring','Touring'],['cabrio','Cabrio'],['compact','Compact'],['z3','Z3'],['mpower','///M Power']];
function historyCategoryOptions(){
  const configured=Object.entries(window.E36_SHOWSHINE?.categories||{}).map(([value,category])=>[value,String(category?.label||'').trim()]).filter(([,label])=>label);
  return configured.length?configured:fallbackHistoryCategories;
}
function historyCategoryLabel(value){return historyCategoryOptions().find(([key])=>key===String(value||'').toLowerCase())?.[1]||String(value||'Bez kategorie')}
function historyDomId(value){return String(value||'event').replace(/[^a-zA-Z0-9_-]/g,'-')}
function historyAccoladesMarkup(sns={}){
  if(sns.status!=='approved')return '';
  const placement=Number(sns.placement),medal=placement===1?'gold':placement===2?'silver':placement===3?'bronze':'';
  const accolades=[medal?`<i class="history-accolade history-medal history-medal--${medal}"><span aria-hidden="true">●</span>${placement}. MÍSTO</i>`:'',sns.bestOfBest?'<i class="history-accolade history-accolade--bob"><span aria-hidden="true">◆</span>BEST OF THE BEST</i>':'',sns.bestExhaust?'<i class="history-accolade history-accolade--exhaust"><span aria-hidden="true">◈</span>NEJ ZVUK VÝFUKU</i>':''].filter(Boolean);
  return accolades.length?`<span aria-label="Schválená Show &amp; Shine ocenění" class="history-accolades">${accolades.join('')}</span>`:'';
}
function historySubmittedSummary(item,{attendance=true}={}){
  const sns=item.showShine||{},details=[];
  if(attendance)details.push(`<b>Účast na United ${item.eventYear}</b>`);
  if(!sns.competed)details.push('<span>Pouze účast</span>');
  else{
    const result=[historyCategoryLabel(sns.category),sns.placement?`${Number(sns.placement)}. místo`:null].filter(Boolean).join(' · ');
    details.push(`<span>${esc(result)}</span>`);
    if(sns.bestOfBest)details.push('<span>Best of the Best</span>');
    if(sns.bestExhaust)details.push('<span>Nej zvuk výfuku</span>');
  }
  return `<div class="history-claim-summary"><small>ODESLÁNO KE KONTROLE</small>${details.join('')}</div>`;
}
function renderHistory(){
  const grid=$('[data-history-grid]');if(!grid)return;const history=data.club?.history||[];
  grid.innerHTML=history.length?history.map(item=>{
    const status=item.attendance?.status||'not_claimed',approved=status==='approved',pending=status==='pending',rejected=status==='rejected',sns=item.showShine||{},primaryEvidence=approved?item.evidence?.[0]:null,tag=item.concluded?'button':'article';
    const snsState=sns.status==='pending'?'<span class="history-sns-state is-pending">S&amp;S ČEKÁ NA KONTROLU</span>':historyAccoladesMarkup(sns);
    const attrs=item.concluded?`aria-controls="history-editor-modal" aria-label="Otevřít historii United ${item.eventYear}" data-open-history-year="${esc(item.eventId)}" type="button"`:'';
    return `<${tag} ${attrs} class="history-year ${approved?'is-attended':''} ${pending?'is-pending':''} ${rejected?'is-rejected':''} ${primaryEvidence?'has-evidence-photo':''}">${primaryEvidence?`<span aria-hidden="true" class="history-year-media"><img alt="" data-history-card-evidence-id="${esc(primaryEvidence.id)}"/></span>`:''}<div class="history-year-number">${item.eventYear}</div><div class="history-year-status"><div><b>${approved?'OVĚŘENO':pending?'ČEKÁ NA KONTROLU':rejected?'VRÁCENO K ÚPRAVĚ':item.concluded?'NEUVEDENO':'ROČNÍK NENÍ UKONČEN'}</b><small>${approved?'Účast potvrzena United týmem':pending?'Odeslaná účast čeká na ověření.':rejected?esc(item.attendance.reviewNote||'Doplň údaje a odešli znovu.'):item.concluded?'Historii můžeš doplnit.':'Není možné podat historickou žádost.'}</small>${snsState}</div><span aria-hidden="true" class="history-check">${approved?'✓':pending?'…':rejected?'!':'→'}</span></div></${tag}>`;
  }).join(''):'<article class="history-empty">Zatím nejsou dostupné žádné ročníky.</article>';
  $$('[data-open-history-year]',grid).forEach(button=>button.addEventListener('click',event=>openHistoryEditor(event.currentTarget,button.dataset.openHistoryYear)));
  void hydrateHistoryCardEvidence();
}

const historyEditor=$('[data-history-editor]');
const historyEvidenceUrls=new Map();
const historyEvidenceUrlRequests=new Map();
let historyEvidenceRequestGeneration=0;
let historyPreviewControllers=[];
let historyEditorReturnFocus=null;
let historyEditorSelectedEventId='';
let historyEditorMode='view';
function clearHistoryEvidenceUrls(){historyEvidenceRequestGeneration+=1;for(const url of historyEvidenceUrls.values())URL.revokeObjectURL(url);historyEvidenceUrls.clear();historyEvidenceUrlRequests.clear()}
async function getPrivateHistoryEvidenceUrl(photoId){
  if(historyEvidenceUrls.has(photoId))return historyEvidenceUrls.get(photoId);
  if(historyEvidenceUrlRequests.has(photoId))return await historyEvidenceUrlRequests.get(photoId);
  const generation=historyEvidenceRequestGeneration,userId=memberSession.currentUser?.uid;
  let request;request=apiRequestBlob(`/api/history/evidence/${encodeURIComponent(photoId)}`).then(blob=>{
    const evidenceStillOwned=(data.club?.history||[]).some(item=>(item.evidence||[]).some(photo=>String(photo.id)===String(photoId)));
    if(generation!==historyEvidenceRequestGeneration||userId!==memberSession.currentUser?.uid||!evidenceStillOwned)throw new Error('stale_history_evidence_request');
    const existing=historyEvidenceUrls.get(photoId);if(existing)return existing;const url=URL.createObjectURL(blob);historyEvidenceUrls.set(photoId,url);return url;
  }).finally(()=>{if(historyEvidenceUrlRequests.get(photoId)===request)historyEvidenceUrlRequests.delete(photoId)});
  historyEvidenceUrlRequests.set(photoId,request);return await request;
}
function historySnsFields(item,{attendanceApproved=false}={}){
  const sns=item.showShine||{},canAmend=attendanceApproved&&['not_claimed','rejected'].includes(sns.status);
  if(attendanceApproved&&!canAmend)return `<div class="history-editor-state"><b>${sns.status==='pending'?'SHOW & SHINE ČEKÁ NA KONTROLU':sns.status==='approved'?'SHOW & SHINE OVĚŘENO':'DOCHÁZKA JE UZAMČENÁ'}</b>${sns.reviewNote?`<small>${esc(sns.reviewNote)}</small>`:''}</div>`;
  const prefill=!!sns.competed&&sns.status!=='not_claimed',category=String(sns.category||'').toLowerCase(),placement=String(sns.placement||''),menuId=`history-category-${historyDomId(item.eventId)}`,categoryOptions=historyCategoryOptions().map(([value,label])=>`<button aria-selected="${value===category}" data-history-category-value="${esc(value)}" role="option" type="button">${esc(label)}</button>`).join('');
  return `<div class="history-sns-question"><span>${canAmend?'CHCEŠ DOPLNIT NEBO OPRAVIT SHOW &amp; SHINE?':'SOUTĚŽIL/A JSI V SHOW &amp; SHINE?'}</span><input class="history-native-control" data-history-sns-input="" name="snsCompeted" type="checkbox" value="on" ${prefill?'checked':''}/><div aria-label="Show &amp; Shine" class="history-binary-choice" role="group"><button aria-pressed="${!prefill}" class="${!prefill?'is-selected':''}" data-history-sns-choice="no" type="button">NE</button><button aria-pressed="${prefill}" class="${prefill?'is-selected':''}" data-history-sns-choice="yes" type="button">ANO</button></div></div><div class="history-sns-fields" data-history-sns-fields="" ${prefill?'':'hidden'}><div class="history-category-field" data-history-category-field=""><span class="history-form-label">KATEGORIE</span><input data-history-category-input="" name="snsCategory" type="hidden" value="${esc(category)}"/><button aria-controls="${menuId}" aria-expanded="false" aria-haspopup="listbox" class="history-category-trigger" data-history-category-trigger="" type="button"><span data-history-category-label="">${category?esc(historyCategoryLabel(category)):'Vyber kategorii'}</span><i aria-hidden="true">⌄</i></button><div aria-label="Kategorie Show &amp; Shine" class="history-category-menu" data-history-category-menu="" hidden id="${menuId}" role="listbox">${categoryOptions}</div></div><fieldset class="history-placement-field"><legend class="history-form-label">UMÍSTĚNÍ</legend><div class="history-placement-options"><label class="is-neutral"><input ${placement?'':'checked'} class="history-native-control" name="snsPlacement" type="radio" value=""/><span>BEZ TOP 3</span></label><label class="is-bronze"><input ${placement==='3'?'checked':''} class="history-native-control" name="snsPlacement" type="radio" value="3"/><span>3. MÍSTO</span></label><label class="is-silver"><input ${placement==='2'?'checked':''} class="history-native-control" name="snsPlacement" type="radio" value="2"/><span>2. MÍSTO</span></label><label class="is-gold"><input ${placement==='1'?'checked':''} class="history-native-control" name="snsPlacement" type="radio" value="1"/><span>1. MÍSTO</span></label></div></fieldset><fieldset class="history-award-field"><legend class="history-form-label">DALŠÍ OCENĚNÍ</legend><div class="history-award-options"><label class="history-award-chip"><input class="history-native-control" name="snsBestOfBest" type="checkbox" value="on" ${sns.bestOfBest?'checked':''}/><span>◆ BEST OF THE BEST</span></label><label class="history-award-chip"><input class="history-native-control" name="snsBestExhaust" type="checkbox" value="on" ${sns.bestExhaust?'checked':''}/><span>◈ NEJ ZVUK VÝFUKU</span></label></div></fieldset></div>`;
}
function historyEvidenceMarkup(item){return item.evidence?.length?`<div class="history-existing-evidence">${item.evidence.map(photo=>`<span><img alt="Důkaz účasti United ${item.eventYear}" data-history-evidence-id="${esc(photo.id)}"/><i>Soukromý důkaz</i></span>`).join('')}</div>`:''}
function historySnsDetailMarkup(item){
  const sns=item.showShine||{};if(!sns.competed)return '<div class="history-sns-detail"><small>SHOW &amp; SHINE</small><b>NEUVEDENO</b></div>';
  const result=[historyCategoryLabel(sns.category),sns.placement?`${Number(sns.placement)}. místo`:null].filter(Boolean).join(' · '),awards=[sns.bestOfBest?'Best of the Best':'',sns.bestExhaust?'Nej zvuk výfuku':''].filter(Boolean);
  return `<div class="history-sns-detail"><small>SHOW &amp; SHINE</small><b>${esc(result||'Účast')}</b>${awards.length?`<span>${esc(awards.join(' · '))}</span>`:''}</div>`;
}
function historyEditorItemState(item){
  const attendance=item.attendance?.status||'not_claimed',sns=item.showShine?.status||'not_claimed';if(attendance==='pending'||sns==='pending')return {key:'pending',label:'ČEKÁ'};if(attendance==='approved')return {key:'verified',label:'OVĚŘENO'};if(attendance==='rejected'||sns==='rejected')return {key:'rejected',label:'K ÚPRAVĚ'};return {key:'empty',label:'NEUVEDENO'};
}
function historyEditorOverview(item){
  const attendance=item.attendance?.status||'not_claimed',sns=item.showShine||{},attendanceLabel=attendance==='approved'?'OVĚŘENA':attendance==='pending'?'ČEKÁ NA KONTROLU':attendance==='rejected'?'VRÁCENA K ÚPRAVĚ':'NEUVEDENA',snsLabel=sns.status==='approved'?'OVĚŘENO':sns.status==='pending'?'ČEKÁ NA KONTROLU':sns.status==='rejected'?'VRÁCENO K ÚPRAVĚ':'NEUVEDENO',canOpenEdit=attendance==='approved';
  return `<article class="history-editor-card history-editor-overview" data-history-event="${esc(item.eventId)}" tabindex="-1"><header><strong>UNITED ${item.eventYear}</strong><span>DETAIL HISTORIE</span></header><div class="history-editor-status-grid"><div class="is-${attendance}"><small>DOCHÁZKA</small><b>${attendanceLabel}</b></div><div class="is-${sns.status||'not_claimed'}"><small>SHOW &amp; SHINE</small><b>${snsLabel}</b></div></div>${historyEvidenceMarkup(item)}${historySnsDetailMarkup(item)}<p>${attendance==='approved'?'Schválená docházka zůstává vždy autoritativní. Nové S&S údaje se projeví až po další kontrole Adminem.':'Odeslané údaje se projeví až po kontrole United týmem.'}</p>${canOpenEdit?`<button class="member-secondary history-edit-selected" data-history-edit-selected="${esc(item.eventId)}" type="button">Upravit údaje</button>`:''}</article>`;
}
function historyClaimForm(item,{mode='edit'}={}){
  const status=item.attendance?.status||'not_claimed',approved=status==='approved',pending=status==='pending';
  const cardClass='history-editor-card is-focused-target',focusAttrs=`data-history-event="${esc(item.eventId)}" tabindex="-1"`;
  if(approved&&mode==='view')return historyEditorOverview(item);
  if(pending)return `<article class="${cardClass}" ${focusAttrs}><header><strong>UNITED ${item.eventYear}</strong><span>ČEKÁ NA KONTROLU</span></header>${historyEvidenceMarkup(item)}${historySubmittedSummary(item)}<p>Docházka a Show &amp; Shine se ověřují samostatně. Zatím se nepřipisují žádné body.</p></article>`;
  if(!approved&&item.showShine?.status==='approved')return `<article class="${cardClass}" ${focusAttrs}><header><strong>UNITED ${item.eventYear}</strong><span>ÚDAJE JSOU UZAMČENÉ</span></header>${historyEvidenceMarkup(item)}${historySnsDetailMarkup(item)}<div class="history-editor-limitation"><b>Schválené Show &amp; Shine nelze bezpečně přepsat.</b><span>Současné API by při výměně důkazu změnilo i schválené S&amp;S. Proto tento rok zůstává uzamčený, dokud nebude k dispozici samostatný amendment workflow.</span></div></article>`;
  if(approved&&['pending','approved'].includes(item.showShine?.status))return `<article class="${cardClass}" ${focusAttrs}><header><strong>UNITED ${item.eventYear}</strong><span>DOCHÁZKA OVĚŘENA</span></header>${historyEvidenceMarkup(item)}${item.showShine?.status==='pending'?historySubmittedSummary(item,{attendance:false}):historySnsDetailMarkup(item)}<div class="history-editor-limitation"><b>${item.showShine?.status==='pending'?'Show & Shine právě čeká na kontrolu.':'Schválené Show & Shine je autoritativní.'}</b><span>${item.showShine?.status==='pending'?'Další změna bude možná až po rozhodnutí Admina.':'Současné API neumí schválené S&S bezpečně měnit. Docházka i schválený výsledek proto zůstávají beze změny.'}</span></div><button class="member-secondary history-detail-back" data-history-view-selected="${esc(item.eventId)}" type="button">Zpět na detail</button></article>`;
  if(approved)return `<form class="${cardClass}" data-attendance-approved="true" data-history-claim-form="" ${focusAttrs}><input name="eventId" type="hidden" value="${esc(item.eventId)}"/><header><strong>UNITED ${item.eventYear}</strong><span>DOPLŇ SHOW &amp; SHINE</span></header><p>Schválenou účast nelze odebrat. Pokud jsi soutěžil/a, doplň výsledek ke kontrole.</p>${historyEvidenceMarkup(item)}${item.showShine?.reviewNote?`<div class="history-rejection-note"><b>DŮVOD S&S ZAMÍTNUTÍ</b><span>${esc(item.showShine.reviewNote)}</span></div>`:''}${historySnsFields(item,{attendanceApproved:true})}<button class="member-primary member-primary--compact" data-history-submit="" disabled type="submit">Odeslat S&amp;S ke kontrole</button></form>`;
  return `<form class="${cardClass}" data-attendance-approved="false" data-history-claim-form="" ${focusAttrs}><input name="eventId" type="hidden" value="${esc(item.eventId)}"/><header><strong>UNITED ${item.eventYear}</strong><span>${status==='rejected'?'DOPLŇ A ODEŠLI ZNOVU':'DOLOŽ SVOJI ÚČAST'}</span></header><p>Nahraj důkaz účasti a případně doplň Show &amp; Shine.</p>${historyEvidenceMarkup(item)}${status==='rejected'?`<div class="history-rejection-note"><b>DŮVOD ZAMÍTNUTÍ</b><span>${esc(item.attendance.reviewNote||'Doplň důkaz účasti.')}</span></div>`:''}<div class="history-claim-fields" data-history-claim-fields=""><label class="history-evidence-upload"><span>${status==='rejected'?'NOVÝ DŮKAZ ÚČASTI · POVINNÉ':'DŮKAZ ÚČASTI · POVINNÉ'}</span><input accept="image/jpeg,image/png,image/webp" data-history-evidence-input="" multiple name="evidence" type="file"/><b>Vybrat 1–4 soukromé fotografie</b><small>${status==='rejected'?'Nové fotky po schválení bezpečně nahradí předchozí důkaz.':'Fotky uvidíš pouze ty a oprávněný Admin.'}</small></label><div class="image-selection-preview-grid" data-history-evidence-preview=""></div>${historySnsFields(item)}<button class="member-primary member-primary--compact" data-history-submit="" disabled type="submit">Odeslat ke kontrole</button></div></form>`;
}
function closeHistoryCategoryField(field,{restoreFocus=false}={}){if(!field)return;const menu=$('[data-history-category-menu]',field),trigger=$('[data-history-category-trigger]',field);if(menu)menu.hidden=true;if(trigger)trigger.setAttribute('aria-expanded','false');if(restoreFocus)trigger?.focus()}
function closeHistoryCategoryMenus({except=null}={}){$$('[data-history-category-field]',historyEditor||document).forEach(field=>{if(field!==except)closeHistoryCategoryField(field)})}
function setHistoryCategory(field,value){
  const input=$('[data-history-category-input]',field),label=$('[data-history-category-label]',field);if(!input||!label)return;input.value=value;label.textContent=historyCategoryLabel(value);$$('[data-history-category-value]',field).forEach(option=>option.setAttribute('aria-selected',String(option.dataset.historyCategoryValue===value)));syncHistorySubmitState(field.closest('form'));
}
function setHistorySnsChoice(form,choice){
  const yes=choice==='yes',input=$('[data-history-sns-input]',form),fields=$('[data-history-sns-fields]',form);if(!input)return;input.checked=yes;if(fields)fields.hidden=!yes;$$('[data-history-sns-choice]',form).forEach(button=>{const selected=button.dataset.historySnsChoice===choice;button.classList.toggle('is-selected',selected);button.setAttribute('aria-pressed',String(selected))});if(!yes)closeHistoryCategoryMenus();syncHistorySubmitState(form);
}
function syncHistorySubmitState(form){
  if(!form)return;const button=$('[data-history-submit]',form);if(!button)return;const approved=form.dataset.attendanceApproved==='true',sns=$('[data-history-sns-input]',form)?.checked===true,category=$('[data-history-category-input]',form)?.value||'',evidenceReady=approved||Number($('[data-history-evidence-input]',form)?.files?.length||0)>0;button.disabled=!evidenceReady||(sns&&!category)||(approved&&!sns);
}
async function hydrateHistoryCardEvidence(){
  for(const img of $$('[data-history-card-evidence-id]',$('[data-history-grid]')||document)){
    const id=img.dataset.historyCardEvidenceId;if(!id)continue;
    try{img.src=await getPrivateHistoryEvidenceUrl(id)}catch(error){console.warn('History card evidence unavailable',id,error);const media=img.closest('.history-year-media');media?.closest('.history-year')?.classList.remove('has-evidence-photo');media?.remove()}
  }
}
async function hydrateHistoryEvidence(){
  for(const img of $$('[data-history-evidence-id]',historyEditor||document)){
    const id=img.dataset.historyEvidenceId;
    try{const url=await getPrivateHistoryEvidenceUrl(id);if(img.isConnected)img.src=url}catch(error){console.warn('History evidence thumbnail unavailable',error)}
  }
}
function preferredHistoryEditorMode(item){const attendance=item?.attendance?.status||'not_claimed';return attendance==='approved'||attendance==='pending'?'view':'edit'}
function defaultHistoryEditorItem(items=[]){return items.find(item=>historyEditorItemState(item).key==='pending')||items.find(item=>['empty','rejected'].includes(historyEditorItemState(item).key))||items[0]||null}
function historyYearSelectorMarkup(item,selected){const state=historyEditorItemState(item);return `<button aria-current="${selected?'true':'false'}" aria-label="United ${item.eventYear}: ${state.label}" class="history-editor-year is-${state.key} ${selected?'is-selected':''}" data-history-year-select="${esc(item.eventId)}" type="button"><strong>${item.eventYear}</strong><span>${state.key==='verified'?'<i aria-hidden="true">✓</i>':''}${state.label}</span></button>`}
function renderHistoryEditor(selectedEventId='',mode=''){
  const list=$('[data-history-editor-list]'),nav=$('[data-history-year-nav]');if(!list||!nav)return '';historyPreviewControllers.forEach(controller=>controller.clear());historyPreviewControllers=[];
  const concluded=(data.club?.history||[]).filter(item=>item.concluded).sort((a,b)=>Number(b.eventYear)-Number(a.eventYear));let selected=concluded.find(item=>String(item.eventId)===String(selectedEventId||historyEditorSelectedEventId));if(!selected||!selectedEventId)selected=selectedEventId?selected:defaultHistoryEditorItem(concluded);if(!selected)selected=defaultHistoryEditorItem(concluded);historyEditorSelectedEventId=selected?.eventId||'';historyEditorMode=mode||preferredHistoryEditorMode(selected);nav.innerHTML=concluded.map(item=>historyYearSelectorMarkup(item,String(item.eventId)===String(historyEditorSelectedEventId))).join('');list.dataset.selectedEvent=historyEditorSelectedEventId;list.innerHTML=selected?historyClaimForm(selected,{mode:historyEditorMode}):'<article class="history-editor-empty"><b>Zatím tu není žádný ukončený ročník.</b><p>Ročník se nabídne až podle skutečného data konce uloženého na serveru.</p></article>';
  const completeButton=$('[data-history-complete]');if(completeButton){completeButton.disabled=!!data.club?.historyCompletedAt;completeButton.textContent=data.club?.historyCompletedAt?'Historie je zkontrolovaná ✓':'Mám historii zkontrolovanou'}
  $$('[data-history-year-select]',nav).forEach(button=>button.addEventListener('click',()=>{const item=concluded.find(entry=>String(entry.eventId)===String(button.dataset.historyYearSelect));renderHistoryEditor(button.dataset.historyYearSelect,preferredHistoryEditorMode(item));requestAnimationFrame(()=>$('[data-history-event]',list)?.focus({preventScroll:true}))}));
  $('[data-history-edit-selected]',list)?.addEventListener('click',buttonEvent=>{renderHistoryEditor(buttonEvent.currentTarget.dataset.historyEditSelected,'edit');requestAnimationFrame(()=>$('[data-history-event]',list)?.focus({preventScroll:true}))});
  $('[data-history-view-selected]',list)?.addEventListener('click',buttonEvent=>{renderHistoryEditor(buttonEvent.currentTarget.dataset.historyViewSelected,'view');requestAnimationFrame(()=>$('[data-history-event]',list)?.focus({preventScroll:true}))});
  $$('[data-history-sns-choice]',list).forEach(button=>button.addEventListener('click',()=>setHistorySnsChoice(button.closest('form'),button.dataset.historySnsChoice)));
  $$('[data-history-category-trigger]',list).forEach(trigger=>trigger.addEventListener('click',()=>{const field=trigger.closest('[data-history-category-field]'),menu=$('[data-history-category-menu]',field),opening=menu?.hidden!==false;closeHistoryCategoryMenus({except:field});if(menu)menu.hidden=!opening;trigger.setAttribute('aria-expanded',String(opening));if(opening)$('[data-history-category-value]',field)?.focus()}));
  $$('[data-history-category-value]',list).forEach(option=>option.addEventListener('click',()=>{const field=option.closest('[data-history-category-field]');setHistoryCategory(field,option.dataset.historyCategoryValue);closeHistoryCategoryField(field,{restoreFocus:true})}));
  $$('input[name="snsPlacement"],input[name="snsBestOfBest"],input[name="snsBestExhaust"]',list).forEach(input=>input.addEventListener('change',()=>syncHistorySubmitState(input.closest('form'))));
  $$('[data-history-evidence-input]',list).forEach(input=>{const form=input.closest('form'),controller=createImagePreviewController(form.querySelector('[data-history-evidence-preview]'));historyPreviewControllers.push(controller);input.addEventListener('change',()=>{const selection=selectImageFiles(input.files,{maxFiles:4,maxBytes:8*1024*1024});if(selection.invalidType||selection.tooLarge||selection.truncated){input.value='';controller.clear();syncHistorySubmitState(form);return toast(selection.tooLarge?'Jedna důkazní fotka může mít nejvýše 8 MB.':selection.truncated?'Vyber nejvýše 4 fotografie.':'Vyber JPG, PNG nebo WebP.')}controller.render(selection.files);syncHistorySubmitState(form)})});
  $$('[data-history-claim-form]',list).forEach(form=>{form.addEventListener('submit',submitHistoryEditorForm);syncHistorySubmitState(form)});void hydrateHistoryEvidence();return historyEditorSelectedEventId;
}
async function submitHistoryEditorForm(event){
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),fd=new FormData(form),approved=(data.club?.history||[]).find(item=>String(item.eventId)===String(fd.get('eventId')))?.attendance?.status==='approved';
  if(approved&&!fd.get('snsCompeted'))return toast('Zvol ANO a doplň Show & Shine.');
  if(fd.get('snsCompeted')&&!fd.get('snsCategory'))return toast('Vyber Show & Shine kategorii.');
  const upload=new FormData();upload.append('eventId',fd.get('eventId'));if(fd.get('snsCompeted')){upload.append('snsCompeted',fd.get('snsCompeted'));upload.append('snsCategory',fd.get('snsCategory'));if(fd.get('snsPlacement'))upload.append('snsPlacement',fd.get('snsPlacement'));for(const key of ['snsBestOfBest','snsBestExhaust'])if(fd.get(key))upload.append(key,fd.get(key))}
  if(!approved){const input=form.querySelector('[data-history-evidence-input]'),files=selectImageFiles(input?.files,{maxFiles:4,maxBytes:8*1024*1024}).files;if(!files.length)return toast('Přilož alespoň jednu důkazní fotografii.');for(const file of files)upload.append('files',file,file.name)}
  setButtonBusy(button,true,'Odesílám…');try{await apiRequestForm('/api/history/claims',upload);data.club=await loadUnitedClub();renderAll();renderHistoryEditor(fd.get('eventId'),'view');toast('Žádost byla odeslána United týmu.')}catch(error){console.error('History claim failed',error);toast(apiError(error))}finally{setButtonBusy(button,false);syncHistorySubmitState(form)}
}
function openHistoryEditor(trigger=null,eventId=''){if(!historyEditor)return;historyEditorReturnFocus=trigger;const selectedEvent=renderHistoryEditor(eventId,eventId?'view':'');historyEditor.hidden=false;document.body.classList.add('modal-open');requestAnimationFrame(()=>{const target=$('[data-history-event]',historyEditor);if(target){target.focus({preventScroll:true});if(eventId)target.scrollIntoView({block:'start'})}else $(`[data-history-year-select="${historyDomId(selectedEvent)}"]`,historyEditor)?.focus()})}
function closeHistoryEditor({restoreFocus=false}={}){if(!historyEditor)return;historyEditor.hidden=true;document.body.classList.remove('modal-open');historyPreviewControllers.forEach(controller=>controller.clear());historyPreviewControllers=[];const trigger=historyEditorReturnFocus;historyEditorReturnFocus=null;if(restoreFocus)trigger?.focus?.()}
$('[data-open-history-editor]')?.addEventListener('click',event=>openHistoryEditor(event.currentTarget));
$$('[data-close-history-editor]').forEach(button=>button.addEventListener('click',()=>closeHistoryEditor({restoreFocus:true})));
document.addEventListener('click',event=>{if(!event.target.closest('[data-history-category-field]'))closeHistoryCategoryMenus()});
document.addEventListener('keydown',event=>{if(event.key!=='Escape'||historyEditor?.hidden)return;const openMenu=$('[data-history-category-menu]:not([hidden])',historyEditor);if(openMenu){event.preventDefault();closeHistoryCategoryField(openMenu.closest('[data-history-category-field]'),{restoreFocus:true});return}closeHistoryEditor({restoreFocus:true})});
$('[data-history-complete]')?.addEventListener('click',async event=>{const button=event.currentTarget;setButtonBusy(button,true,'Ukládám…');try{await apiRequest('/api/history/completed',{method:'POST',body:{complete:true}});data.club=await loadUnitedClub();renderAll();renderHistoryEditor();toast('Historie je označená jako zkontrolovaná.')}catch(error){console.error(error);toast(apiError(error))}finally{setButtonBusy(button,false)}});

function renderRewards(){
  const p=points(),threshold=Number(data.club?.rewardThreshold||12),remaining=Math.max(0,threshold-p);
  const rewardState=$('[data-points-reward-state]'),rewardRemaining=$('[data-reward-remaining]');if(rewardState)rewardState.classList.toggle('is-unlocked',p>=threshold);if(rewardRemaining)rewardRemaining.textContent=p>=threshold?'ODMĚNA ODEMČENA':`${formatPoints(remaining)} ${pointsRemainingVerb(remaining)}`;
  const journey=$('[data-points-journey]'),journeyScore=$('[data-points-journey-score]'),journeyCopy=$('[data-points-journey-copy]'),journeyMarker=$('[data-points-journey-marker]'),progress=Math.min(100,p/threshold*100);
  if(journey){journey.setAttribute('aria-valuemax',String(threshold));journey.setAttribute('aria-valuenow',String(p));journey.setAttribute('aria-label',`United Points: ${p} z ${formatPoints(threshold)}`);journey.style.setProperty('--points-progress',`${progress}%`)}if(journeyScore)journeyScore.textContent=p;if(journeyCopy)journeyCopy.textContent=p>=threshold?'United Merch reward je odemčený.':`Do odměny ${pointsRemainingVerb(remaining)} ${formatPoints(remaining)}.`;if(journeyMarker)journeyMarker.textContent=String(p);
  const earnStrip=$('[data-earn-strip]');if(earnStrip)earnStrip.innerHTML=[
    ['earn-attendance',pictogram('<path d="M5 12.5 9.5 17 19 7.5"/>'),'01','Účast na srazu'],
    ['earn-showshine',pictogram('<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M12 12v6m-3 2h6"/>'),'02','Umístění v Show & Shine'],
    ['earn-photos',pictogram('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-4L5 19"/>'),'03','Nahrávání fotek'],
    ['earn-profile',pictogram('<path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-5"/>'),'04','Doplnění profilu'],
  ].map(([help,icon,index,label])=>`<button aria-controls="member-card-help" aria-expanded="false" class="earn-card" data-member-help="${help}" type="button"><i>${icon}</i><span><small>${index}</small><b>${label}</b></span><em>ⓘ DETAIL</em></button>`).join('');
}

bindGarage();
bindMemberPhotos();
memberPlanner.bind();

bindMainNavigation();
memberPlanner.hydratePlannerHandoffFromUrl();
const requestedAuthMode=memberUrlParams.get('mode');if(requestedAuthMode==='register'||requestedAuthMode==='login')activateAuthTab(requestedAuthMode);
initFirebase();
