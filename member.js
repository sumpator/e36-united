import { firebaseConfig, portalConfig } from './firebase-config.js?v=20260823-auth2';

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const firebaseReady=Boolean(firebaseConfig?.apiKey&&firebaseConfig?.projectId&&firebaseConfig?.appId&&!String(firebaseConfig.apiKey).startsWith('PASTE_')&&!String(firebaseConfig.projectId).startsWith('PASTE_'));
const apiBaseUrl=(portalConfig.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'');
const localPrefix=portalConfig.memberLocalPrefix||'e36UnitedMemberLocalV20';
const plannerDraftKey=portalConfig.plannerDraftKey||'e36UnitedPlannerDraftV19';
const plannerHandoffPrefix='e36UnitedPlannerHandoff:v1:';
const memberUrlParams=new URLSearchParams(window.location.search);
let pendingPlannerHandoffId=memberUrlParams.get('draft')||'';
const requestedMemberPanel=memberUrlParams.get('panel')||'';

let firebase=null;
let currentUser=null;
let authFlowActive=false;
let memberGallery=[];
let reservationState={registrationOpen:false,event:null,message:''};
const carPhotoObjectUrls=new Map();
const carPhotoObjectUrlRequests=new Map();

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
let returnToReservationAfterCar=false;

function decodePlannerHandoff(value){
  try{
    const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),padding='='.repeat((4-normalized.length%4)%4);
    const binary=atob(normalized+padding),bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }catch(error){console.debug('Weekend Planner handoff could not be decoded.',error);return null}
}
function validatePlannerHandoff(candidate){
  if(!candidate||candidate.version!==1||candidate.source!=='weekend-planner')return null;
  const draftId=String(candidate.draftId||''),createdAt=Date.parse(candidate.createdAt),expiresAt=Date.parse(candidate.expiresAt),eventYear=Number(candidate.eventYear),crew=Number(candidate.crew),units=Number(candidate.accommodationUnits),handoffLifetime=7*24*60*60*1000;
  const attendanceByArrival={Pátek:'full_weekend',Sobota:'saturday_only','Jen na otočku':'day_visit'};
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(draftId)||!Number.isFinite(createdAt)||!Number.isFinite(expiresAt)||expiresAt<=Date.now()||expiresAt<=createdAt||Date.now()-createdAt>handoffLifetime||expiresAt-createdAt>handoffLifetime)return null;
  const currentYear=new Date().getFullYear();if(!Number.isInteger(eventYear)||eventYear<currentYear-1||eventYear>currentYear+3)return null;
  if(!attendanceByArrival[candidate.arrival]||candidate.attendanceType!==attendanceByArrival[candidate.arrival])return null;
  if(!['Chatka','Stan','Bez ubytování'].includes(candidate.accommodation)||!Number.isInteger(crew)||crew<1||crew>8||!Number.isInteger(units)||units<0||units>crew||!['Ano','Ne','Možná'].includes(candidate.showShine))return null;
  if((candidate.arrival==='Jen na otočku'||candidate.accommodation==='Bez ubytování')&&units!==0)return null;
  if(candidate.arrival!=='Jen na otočku'&&candidate.accommodation!=='Bez ubytování'&&units<1)return null;
  const eventId=candidate.eventId==null?null:String(candidate.eventId);if(eventId!==null&&!/^[a-z0-9_-]{1,128}$/i.test(eventId))return null;
  return {version:1,draftId,source:'weekend-planner',eventYear,eventId,createdAt:new Date(createdAt).toISOString(),expiresAt:new Date(expiresAt).toISOString(),arrival:candidate.arrival,attendanceType:candidate.attendanceType,accommodation:candidate.accommodation,accommodationUnits:units,crew,showShine:candidate.showShine};
}
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
function clearCarPhotoObjectUrls(){for(const url of carPhotoObjectUrls.values())URL.revokeObjectURL(url);carPhotoObjectUrls.clear();carPhotoObjectUrlRequests.clear()}
function resetMemberState(){clearCarPhotoObjectUrls();memberGallery=[];reservationState={registrationOpen:false,event:null,message:''};data=defaultData();renderAll()}
function toast(msg){const el=$('[data-toast]');if(!el)return;el.textContent=msg;el.classList.add('is-visible');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('is-visible'),3200)}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function uid(){return crypto?.randomUUID?.()||Math.random().toString(36).slice(2,10)}

function setMode(text){
  $$('[data-mode-badge]').forEach(x=>x.textContent=text);
  const sync=$('[data-sync-state]');if(sync)sync.textContent=text;
  $$('[data-demo-hint]').forEach(x=>x.hidden=text.includes('LIVE'));
}
function showAuth(){
  document.body.classList.remove('member-authenticated');
  const authView=$('[data-auth-view]'),appView=$('[data-app-view]');
  if(authView)authView.hidden=false;
  if(appView)appView.hidden=true;
}
function showApp(){
  document.body.classList.add('member-authenticated');
  const authView=$('[data-auth-view]'),appView=$('[data-app-view]');
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
  const request=apiRequestBlob(`/api/cars/media/${encodeURIComponent(photoId)}`).then(blob=>{const existing=carPhotoObjectUrls.get(photoId);if(existing)return existing;const url=URL.createObjectURL(blob);carPhotoObjectUrls.set(photoId,url);return url}).finally(()=>carPhotoObjectUrlRequests.delete(photoId));
  carPhotoObjectUrlRequests.set(photoId,request);
  return await request;
}

async function loadCarsFromApi(){
  const payload=await apiRequest('/api/cars');
  return Array.isArray(payload?.cars)?payload.cars:[];
}
async function loadMemberGallery(){
  const payload=await apiRequest('/api/gallery/mine');
  memberGallery=Array.isArray(payload?.submissions)?payload.submissions:[];
  renderMemberGallery();
  return memberGallery;
}
function normalizeReservation(source){
  if(!source)return null;
  const snapshot=source.carSnapshot||{};
  return {
    id:source.id||'',
    eventId:source.eventId||'',
    year:source.year||'NEXT',
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
    showshine:source.showShine||source.showshine||'Ne',
    note:source.note||'',
    status:source.status||'pending',
    paymentStatus:source.paymentStatus||'unpaid',
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
  };
  return normalizeReservation(payload?.reservation);
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
  const [cars,reservation]=await Promise.all([
    loadCarsFromApi().catch(error=>{console.warn('Cars API unavailable',error);return []}),
    loadCurrentReservation(),
    loadMemberGallery().catch(error=>{console.warn('Gallery status unavailable',error);memberGallery=[];return []}),
  ]);
  data={...local,profile:member,cars,reservation};
  saveUserLocal();
  setMode('AUTH + PROFIL LIVE');
  showApp();
  await applyPlannerDraft();
  if(requestedMemberPanel==='reservation')openSection('reservation');
  if(!quiet)toast(`Přihlášen jako ${member.nickname||member.name}.`);
}

async function initFirebase(){
  // Production auth must fail closed. Remove legacy preview/session state so it can never authenticate a user.
  ['e36UnitedMemberPreviewV19','e36UnitedMemberPreviewV18','e36UnitedMemberSessionV19'].forEach(key=>localStorage.removeItem(key));
  resetMemberState();
  showAuth();
  if(!firebaseReady){setMode('AUTH NENÍ NASTAVENÝ');toast('Přihlášení není nakonfigurované.');return}
  try{
    const appMod=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
    const authMod=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const app=appMod.getApps().length?appMod.getApps()[0]:appMod.initializeApp(firebaseConfig);
    const auth=authMod.getAuth(app);
    await authMod.setPersistence(auth,authMod.browserLocalPersistence);
    firebase={...authMod,auth};
    setMode('AUTH READY');
    authMod.onAuthStateChanged(auth,async user=>{
      if(authFlowActive)return;
      currentUser=user;
      if(!user){resetMemberState();showAuth();setMode('AUTH READY');return}
      try{
        await openAuthenticatedSession(user,{quiet:true});
      }catch(error){
        console.error('Unable to restore member session',error);
        resetMemberState();
        showAuth();
        setMode('AUTH OK · PROFIL NEDOSTUPNÝ');
        toast(apiError(error));
      }
    });
  }catch(error){
    console.error('Firebase Auth initialization failed',error);
    firebase=null;currentUser=null;resetMemberState();showAuth();setMode('AUTH NEDOSTUPNÝ');toast('Přihlášení se nepodařilo inicializovat.');
  }
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
  try{
    const cred=await firebase.signInWithEmailAndPassword(firebase.auth,email,password);
    currentUser=cred.user;
    await openAuthenticatedSession(cred.user);
  }catch(error){
    console.error('Login failed',error);
    if(firebase.auth.currentUser){try{await firebase.signOut(firebase.auth)}catch{}}
    currentUser=null;resetMemberState();showAuth();setMode('AUTH READY');toast(authOrApiError(error));
  }finally{
    authFlowActive=false;setButtonBusy(button,false);
  }
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

$('[data-logout]')?.addEventListener('click',async()=>{
  authFlowActive=true;
  try{if(firebase)await firebase.signOut(firebase.auth)}catch(error){console.warn('Firebase logout failed',error)}
  currentUser=null;resetMemberState();resetAuthForms();showAuth();setMode(firebase?'AUTH READY':'AUTH NEDOSTUPNÝ');authFlowActive=false;toast('Odhlášeno.');
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
  if(error?.message==='member_identity_mismatch')return 'Bezpečnostní kontrola profilu selhala. Byl jsi odhlášen.';
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
function openSection(id){$$('.member-nav-item[data-member-section]').forEach(button=>button.classList.toggle('is-active',button.dataset.memberSection===id));$$('[data-member-panel]').forEach(panel=>panel.classList.toggle('is-active',panel.dataset.memberPanel===id));if(innerWidth<700)window.scrollTo({top:82,behavior:'smooth'})}

const badgeDefs=[
  {id:'first',icon:'1×',name:'First United',desc:'První účast',test:d=>attended(d)>=1},
  {id:'regular',icon:'3×',name:'United Regular',desc:'3 ověřené účasti',test:d=>verified(d)>=3},
  {id:'veteran',icon:'5×',name:'Veteran',desc:'5 ověřených účastí',test:d=>verified(d)>=5},
  {id:'og',icon:'OG',name:'Old School',desc:'Member since 2022 nebo dřív',test:d=>(memberSince(d)||9999)<=2022},
  {id:'winner',icon:'★',name:'S&S Winner',desc:'Ověřená výhra',test:d=>d.history.some(h=>h.verified&&h.winner)},
  {id:'garage',icon:'▦',name:'Full Garage',desc:'3 auta v garáži',test:d=>d.cars.length>=3},
  {id:'twelve',icon:'12',name:'Full Points',desc:'12 / 12 United Points',test:d=>points(d)>=12}
];
function attended(d=data){return d.history.filter(h=>h.attended).length}
function verified(d=data){return d.history.filter(h=>h.attended&&h.verified).length}
function memberSince(d=data){const years=d.history.filter(h=>h.attended).map(h=>h.year);return years.length?Math.min(...years):null}
function points(d=data){const p=portalConfig.points;return Math.min(p.rewardThreshold,d.history.reduce((n,h)=>n+(h.attended&&h.verified?p.attendance:0)+(h.winner&&h.verified?p.showShineWin:0),0)+(d.bonuses||[]).reduce((n,b)=>n+(b.points||0),0))}
function lifetimePoints(d=data){const p=portalConfig.points;return d.history.reduce((n,h)=>n+(h.attended&&h.verified?p.attendance:0)+(h.winner&&h.verified?p.showShineWin:0),0)+(d.bonuses||[]).reduce((n,b)=>n+(b.points||0),0)}
function status(d=data){const count=verified(d);if(count>=5)return 'VETERAN';if(count>=3)return 'REGULAR';if(count>=1)return 'MEMBER';return 'ROOKIE'}

function renderAll(){renderProfile();renderPoints();renderBadges();renderGarage();renderHistory();renderReservation();renderRewards();renderMemberGallery()}
function renderProfile(){
  const p=data.profile||{},nick=p.nickname||p.name?.split(' ')[0]||'Driver';
  const nickEl=$('[data-member-nickname]');if(nickEl)nickEl.textContent=nick;
  const nameEl=$('[data-card-name]');if(nameEl)nameEl.textContent=(p.name||'United Member').toUpperCase();
  const code=p.memberCode?String(p.memberCode).replace(/^EU-?/i,'').slice(-6):String((p.email||nick).split('').reduce((a,c)=>a+c.charCodeAt(0),0)%900+100);
  const idEl=$('[data-card-id]');if(idEl)idEl.textContent=code;
  const accountEl=$('[data-member-account]');if(accountEl)accountEl.textContent=[p.email,p.memberCode,p.emailVerified?'e-mail ověřen':'e-mail neověřen'].filter(Boolean).join(' · ');
  const car=data.cars.find(c=>c.primary)||data.cars[0];const carEl=$('[data-card-car]');if(carEl)carEl.textContent=car?`${car.body} · ${car.model}${car.nickname?' · '+car.nickname:''}`:'BMW E36 · Garáž čeká na první auto';
  $('[data-member-since]').textContent=memberSince()||'—';$('[data-history-since]').textContent=memberSince()||'—';$('[data-attendance-count]').textContent=attended();$('[data-member-status]').textContent=status();
}
function renderPoints(){const p=points();$('[data-points]').textContent=p;const track=$('[data-points-track]');track.innerHTML=Array.from({length:12},(_,i)=>`<i class="${i<p?'is-on':''}"></i>`).join('');$('[data-points-copy]').textContent=p>=12?'12 / 12. United Merch reward je odemčený.':`Ještě ${12-p} bodů a odemykáš United Merch reward.`}
function renderBadges(){const unlocked=badgeDefs.filter(b=>b.test(data));const html=arr=>arr.map(b=>`<div class="badge ${b.test(data)?'':'is-locked'}"><span class="badge-icon">${b.icon}</span><div><b>${b.name}</b><small>${b.desc}</small></div></div>`).join('');$('[data-badges-preview]').innerHTML=html((unlocked.length?unlocked:badgeDefs).slice(0,5));$('[data-badge-cabinet]').innerHTML=html(badgeDefs)}
function renderGarage(){
  const grid=$('[data-garage-grid]');
  if(!grid)return;
  clearCarPhotoObjectUrls();
  if(!data.cars.length){grid.innerHTML='<div class="garage-empty"><div><b>Garáž je zatím prázdná.</b><br><small>Přidej svoje první E36. Fotku můžeš doplnit kdykoliv později.</small></div></div>';renderCarSelect();renderReservationCarPhoto(data.reservation);return}
  grid.innerHTML=data.cars.map(c=>{const first=c.photos?.[0];return `<article class="car-card"><div class="car-photo">${first?`<img data-car-photo-id="${esc(first.id)}" alt="${esc(c.nickname||c.model)}">`:'<div class="car-photo-placeholder">E36</div>'}${c.primary?'<span class="car-primary">HLAVNÍ AUTO</span>':''}</div><div class="car-body"><small>${esc(c.body)} · ${esc(c.year||'')}</small><h3>${esc(c.nickname||c.model)}</h3><p>${esc(c.model)}${c.color?' · '+esc(c.color):''}</p><div class="car-actions"><button data-primary-car="${c.id}">${c.primary?'Hlavní':'Nastavit hlavní'}</button><button data-delete-car="${c.id}">Odebrat</button></div></div></article>`}).join('');
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
function clampReservationNumber(value,min,max,fallback){const number=Math.trunc(Number(value));return Number.isFinite(number)?Math.max(min,Math.min(max,number)):fallback}
function syncMemberSleep(source='form'){
  if(!reservationForm||!arrivalSelect||!sleepField||!crewInput||!accommodationUnitsInput||!sleepSelect)return;
  const dayPass=arrivalSelect.value==='Jen na otočku';let crew=clampReservationNumber(crewInput.value,1,8,1);crewInput.value=String(crew);
  sleepField.hidden=dayPass;if(dayPass)sleepSelect.value='Bez ubytování';
  const withoutAccommodation=dayPass||sleepSelect.value==='Bez ubytování',unitsField=accommodationUnitsInput.closest('label');
  accommodationUnitsInput.min=withoutAccommodation?'0':'1';accommodationUnitsInput.max='8';accommodationUnitsInput.disabled=withoutAccommodation||!reservationState.registrationOpen;if(unitsField)unitsField.hidden=dayPass;
  if(withoutAccommodation){accommodationUnitsInput.value='0';return}
  let units=clampReservationNumber(accommodationUnitsInput.value,1,8,1);
  if(source==='accommodationUnits'&&units>crew){crew=units;crewInput.value=String(crew)}else if(units>crew)units=crew;
  accommodationUnitsInput.value=String(units);
}
arrivalSelect?.addEventListener('change',()=>syncMemberSleep('arrival'));
crewInput?.addEventListener('input',()=>syncMemberSleep('crew'));crewInput?.addEventListener('change',()=>syncMemberSleep('crew'));
accommodationUnitsInput?.addEventListener('input',()=>syncMemberSleep('accommodationUnits'));accommodationUnitsInput?.addEventListener('change',()=>syncMemberSleep('accommodationUnits'));
sleepSelect?.addEventListener('change',()=>syncMemberSleep('accommodation'));
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
  const units=handoff.accommodationUnits,accommodation=units?`${handoff.accommodation} / ${units} ${units===1?'místo':units<=4?'místa':'míst'}`:handoff.accommodation;
  const crew=`${handoff.crew} ${handoff.crew===1?'osoba':handoff.crew<=4?'osoby':'osob'}`;
  container.replaceChildren(...[handoff.arrival,accommodation,crew,`Show & Shine: ${handoff.showShine}`].map(value=>{const chip=document.createElement('span');chip.textContent=value;return chip}));
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
function applyPlannerHandoffToForm(){
  const handoff=activePlannerHandoff;if(!handoff||!reservationForm)return;
  if(reservationForm.elements.arrival)reservationForm.elements.arrival.value=handoff.arrival;
  if(reservationForm.elements.crew)reservationForm.elements.crew.value=handoff.crew;
  if(reservationForm.elements.sleep)reservationForm.elements.sleep.value=handoff.arrival==='Jen na otočku'?'Bez ubytování':handoff.accommodation;
  if(reservationForm.elements.accommodationUnits)reservationForm.elements.accommodationUnits.value=handoff.accommodationUnits;
  if(reservationForm.elements.showshine)reservationForm.elements.showshine.value=handoff.showShine;
  syncMemberSleep();
  const selectedCar=data.cars.length===1?data.cars[0]:(data.cars.find(car=>car.primary)||data.cars[0]||null);
  if(selectedCar&&reservationForm.elements.carId)reservationForm.elements.carId.value=selectedCar.id;
  plannerHandoffApplied=true;plannerHandoffChoice='applied';openSection('reservation');if(data.reservation)renderPlannerHandoff();else renderReservation();
}
function clearPlannerHandoff(){
  if(activePlannerHandoff?.draftId){try{localStorage.removeItem(`${plannerHandoffPrefix}${activePlannerHandoff.draftId}`)}catch(error){console.debug('Weekend Planner handoff could not be removed.',error)}}
  const url=new URL(window.location.href),fragment=new URLSearchParams(url.hash.replace(/^#/,''));url.searchParams.delete('draft');fragment.delete('handoff');url.hash=fragment.toString()?`#${fragment}`:'';
  try{history.replaceState(null,'',`${url.pathname}${url.search}${url.hash}`)}catch(error){console.debug('Weekend Planner address cleanup is unavailable.',error)}
  pendingPlannerHandoffId='';plannerHandoffMemory=null;activePlannerHandoff=null;plannerHandoffChoice='none';plannerHandoffApplied=false;renderPlannerHandoff();
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
  return {pending:'Rezervace čeká na kontrolu United týmem.',approved:'Rezervace byla schválena United týmem.'}[reservation.status]||'Rezervace je uložená.';
}
function renderReservationOverview(reservation){
  const open=reservationState.registrationOpen,status=reservation?.status,waiting=isPlannerWaitingState();
  const eventYear=reservation?.year&&reservation.year!=='NEXT'?reservation.year:(waiting?activePlannerHandoff.eventYear:new Date().getFullYear());
  const event=$('[data-reservation-overview-event]'),label=$('[data-reservation-overview-label]'),copy=$('[data-reservation-overview-copy]'),action=$('[data-reservation-overview-action]');
  if(event)event.textContent=`UNITED ${eventYear}`;
  if(!reservation){
    if(label)label.textContent=waiting?'TVŮJ PLÁN JE PŘIPRAVENÝ':open?'JEŠTĚ NEMÁŠ REZERVACI':'REGISTRACE JE UZAVŘENÁ';
    if(copy)copy.textContent=waiting?'Výběr z Weekend Planneru jsme uložili. Dokončíš ho tady, jakmile spustíme rezervace.':open?'Registrace je otevřená. Vytvoř si rezervaci pro aktuální United.':'Aktuálně nemáš rezervaci a registrace je už uzavřená.';
    if(action)action.innerHTML=`${waiting?'Dokončit rezervaci':open?'Vytvořit rezervaci':'Zobrazit registraci'} <b>→</b>`;
    return;
  }
  const labels={approved:'REZERVACE SCHVÁLENA',pending:'ČEKÁ NA SCHVÁLENÍ',rejected:'REZERVACE ZAMÍTNUTA',cancelled:'REZERVACE ZRUŠENA'};
  const copies={approved:'Máš potvrzeno. Tvoje rezervace je schválená United týmem.',pending:'Rezervaci máme. United tým ji ještě zkontroluje.',rejected:'Tvoje rezervace nebyla schválena.',cancelled:'Tvoje rezervace je zrušená.'};
  if(label)label.textContent=labels[status]||'AKTUÁLNÍ REZERVACE';
  if(copy)copy.textContent=copies[status]||'Otevři detail aktuální rezervace.';
  if(action)action.innerHTML='Otevřít rezervaci <b>→</b>';
}
function renderReservationCarPhoto(reservation){
  const card=$('[data-reservation-card]'),hero=$('[data-reservation-car-hero]');if(!card||!hero)return;
  const car=reservation?data.cars.find(item=>String(item.id)===String(reservation.carId)):null;
  const photo=car?.photos?.[0];
  if(!photo?.id){hero.hidden=true;hero.replaceChildren();delete hero.dataset.photoId;delete hero.dataset.loading;card.classList.remove('has-car-photo');return}
  const photoId=String(photo.id);
  if(hero.dataset.photoId===photoId&&card.classList.contains('has-car-photo')&&carPhotoObjectUrls.has(photoId))return;
  if(hero.dataset.photoId===photoId&&hero.dataset.loading==='true')return;
  hero.hidden=true;hero.replaceChildren();hero.dataset.photoId=photoId;hero.dataset.loading='true';card.classList.remove('has-car-photo');
  const img=document.createElement('img');img.alt=car.nickname||car.model||'Rezervované BMW E36';img.decoding='async';hero.append(img);
  void (async()=>{
    try{
      img.src=await getPrivateCarPhotoUrl(photoId);await img.decode().catch(()=>{});
      if(hero.dataset.photoId!==photoId||String(data.reservation?.carId||'')!==String(reservation.carId||''))return;
      hero.hidden=false;card.classList.add('has-car-photo');
    }catch(error){if(hero.dataset.photoId===photoId){hero.hidden=true;hero.replaceChildren();card.classList.remove('has-car-photo')}console.warn('Reservation car photo unavailable',photoId,error)}
    finally{if(hero.dataset.photoId===photoId)delete hero.dataset.loading}
  })();
}

function renderReservation(){
  const r=data.reservation,miniStatus=$('[data-reservation-status]'),year=$('[data-res-year]'),title=$('[data-res-title]'),car=$('[data-res-car]'),mailState=$('[data-reservation-mail-state]');
  const submit=$('[data-reservation-submit]');
  if(reservationForm){for(const field of reservationForm.elements)field.disabled=!reservationState.registrationOpen;syncMemberSleep()}
  const buttonLabels={pending:'Uložit změny',approved:'Upravit rezervaci',rejected:'Upravit a znovu odeslat',cancelled:'Obnovit rezervaci'};
  const buttonLabel=!reservationState.registrationOpen?'Registrace je uzavřená':r?(buttonLabels[r.status]||'Uložit změny'):'Odeslat rezervaci';
  if(submit){submit.disabled=!reservationState.registrationOpen;if(!submit.dataset.originalHtml)submit.innerHTML=`${buttonLabel} <span>→</span>`}
  setReservationCardStatus(r?.status);renderReservationOverview(r);renderReservationCarPhoto(r);renderPlannerHandoff();
  if(!r){
    const open=reservationState.registrationOpen,waiting=isPlannerWaitingState();
    miniStatus.textContent=waiting?'Plán připravený':open?'Bez rezervace':'Registrace zavřená';year.textContent=waiting?activePlannerHandoff.eventYear:open?'NEXT':'—';title.textContent=waiting?'Tvůj plán je připravený':'Příští United';car.textContent=waiting?'Dokončíš ho tady, jakmile spustíme rezervace.':open?'Vyber auto z garáže a odešli rezervaci.':'Aktuálně není otevřená registrace.';
    $('[data-reservation-state-symbol]').textContent=open?'+':'—';$('[data-reservation-state-label]').textContent=open?'JEŠTĚ NEMÁŠ REZERVACI':'REGISTRACE JE UZAVŘENÁ';$('[data-reservation-year]').textContent=open?'NEXT':'—';$('[data-reservation-title]').textContent='Příští E36 United';$('[data-reservation-description]').textContent=reservationDescription(null);$('[data-reservation-summary]').innerHTML='';
    if(mailState){mailState.classList.remove('is-confirmed');mailState.querySelector('span').textContent=open?'Po odeslání bude rezervace čekat na schválení.':'Rezervaci bude možné odeslat po otevření registrace.'}
    return;
  }
  const statusText=reservationStatusNames[r.status]||r.status||'Čeká na schválení';
  if(reservationForm){if(reservationForm.elements.carId&&r.carId)reservationForm.elements.carId.value=r.carId;if(reservationForm.elements.arrival)reservationForm.elements.arrival.value=r.arrival||'Pátek';if(reservationForm.elements.crew)reservationForm.elements.crew.value=r.crew||2;if(reservationForm.elements.sleep)reservationForm.elements.sleep.value=r.sleep||'Chatka';if(reservationForm.elements.accommodationUnits)reservationForm.elements.accommodationUnits.value=r.accommodationUnits??0;if(reservationForm.elements.showshine)reservationForm.elements.showshine.value=r.showshine||'Ne';if(reservationForm.elements.note)reservationForm.elements.note.value=r.note||'';syncMemberSleep()}
  miniStatus.textContent=statusText;year.textContent=r.year||'NEXT';title.textContent=r.title||'United rezervace';car.textContent=r.carSnapshot?`${r.carSnapshot.nickname||r.carSnapshot.model} · ${r.carSnapshot.body}`:'Auto zatím není vybrané';
  $('[data-reservation-state-symbol]').textContent=reservationStatusSymbols[r.status]||'·';$('[data-reservation-state-label]').textContent=reservationStatusLoudNames[r.status]||String(r.status||'AKTUÁLNÍ').toUpperCase();$('[data-reservation-year]').textContent=r.year||'NEXT';$('[data-reservation-title]').textContent=r.title||'E36 United';
  const description=reservationDescription(r);$('[data-reservation-description]').textContent=description;
  const sleep=r.arrival==='Jen na otočku'?'Bez ubytování':r.sleep;
  $('[data-reservation-summary]').innerHTML=`<div><small>AUTO</small><b>${esc(r.carSnapshot?.nickname||r.carSnapshot?.model||'—')}</b></div><div><small>PŘÍJEZD</small><b>${esc(r.arrival||'—')}</b></div><div><small>POSÁDKA</small><b>${esc(r.crew)} osoby</b></div><div><small>UBYTOVÁNÍ</small><b>${esc(sleep||'—')}</b></div><div><small>SHOW & SHINE</small><b>${esc(r.showshine)}</b></div><div><small>STATUS</small><b>${esc(statusText)}</b></div>`;
  if(mailState){mailState.classList.toggle('is-confirmed',r.status==='approved');mailState.querySelector('span').textContent=description}
}
function renderRewards(){const p=points(),life=lifetimePoints();$('[data-reward-score]').textContent=p;const lock=$('[data-reward-lock]');lock.classList.toggle('is-unlocked',p>=12);lock.querySelector('span').textContent=p>=12?'UNLOCKED':'LOCKED';$('[data-reward-remaining]').textContent=p>=12?'United Merch reward je aktivní':`${12-p} bodů zbývá`;$('[data-points-ledger]').innerHTML=`<div class="ledger-item"><span>OVĚŘENÁ ÚČAST</span><b>+${portalConfig.points.attendance} body</b><small>Za každý potvrzený United.</small></div><div class="ledger-item"><span>SHOW & SHINE WIN</span><b>+${portalConfig.points.showShineWin} body</b><small>Po potvrzení výsledku organizátorem.</small></div><div class="ledger-item"><span>LIFETIME SCORE</span><b>${life} bodů</b><small>Celoživotní skóre se nemaže po rewardu.</small></div>`;const perks=[['⚡','Early registration','Členové dostanou registraci dřív.',verified()>=1],['◆','Member-only United Merch','Přístup k vybraným dropům.',verified()>=1],['12','United Merch reward','Odměna po dosažení 12 / 12.',p>=12],['★','Community voting','Hlasování o vybraných aktivitách.',verified()>=3],['⌁','Priority accommodation','Dřívější přístup k vybranému ubytování.',verified()>=5]];$('[data-perks-list]').innerHTML=perks.map(x=>`<div class="perk ${x[3]?'':'is-locked'}"><i>${x[0]}</i><div><b>${x[1]}</b><small>${x[2]}</small></div><span>${x[3]?'ACTIVE':'LOCKED'}</span></div>`).join('')}

async function commit(message='Uloženo'){saveUserLocal();renderAll();toast(message)}

reservationForm?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!currentUser)return toast('Nejdřív se přihlas.');
  if(!reservationState.registrationOpen)return toast('Registrace na žádný event aktuálně není otevřená.');
  syncMemberSleep();const car=ensureSelectedReservationCar();
  if(!data.cars.length||!car){setReservationCarError(true);toast('Nejdřív přidej auto do garáže.');return}
  setReservationCarError(false);const fd=new FormData(event.currentTarget);
  const arrival=fd.get('arrival')||'Pátek',sleep=arrival==='Jen na otočku'?'Bez ubytování':fd.get('sleep');
  const attendanceType=arrival==='Pátek'?'full_weekend':arrival==='Sobota'?'saturday_only':'day_visit';
  const button=$('[data-reservation-submit]');setButtonBusy(button,true,'Odesílám rezervaci…');
  try{
    const payload=await apiRequest('/api/reservations/current',{method:'PUT',body:{carId:car.id,arrival,crew:+fd.get('crew'),attendanceType,accommodation:sleep,accommodationUnits:+fd.get('accommodationUnits'),showShine:fd.get('showshine'),note:fd.get('note')}});
    const reservation=normalizeReservation(payload?.reservation);if(!reservation)throw new Error('reservation_response_invalid');
    reservationState={registrationOpen:payload?.registrationOpen===true,event:payload?.event||reservationState.event,message:payload?.message||''};
    data.reservation=reservation;if(activePlannerHandoff&&plannerHandoffApplied)clearPlannerHandoff();renderReservation();renderProfile();toast(payload?.message||'Rezervace byla uložena.');
  }catch(error){console.error('Reservation save failed',error);toast(apiError(error))}
  finally{setButtonBusy(button,false);renderReservation();if(activePlannerHandoff&&plannerHandoffApplied)applyPlannerHandoffToForm()}
});

const carModal=$('[data-car-modal]');
function openCarModal(){if(!carModal)return;carModal.hidden=false;document.body.classList.add('modal-open')}
function openCarForReservation(){returnToReservationAfterCar=true;openCarModal()}
$('[data-open-car]')?.addEventListener('click',openCarModal);
$('[data-planner-handoff-add-car]')?.addEventListener('click',openCarForReservation);
$('[data-reservation-add-car]')?.addEventListener('click',openCarForReservation);
$$('[data-close-car]').forEach(button=>button.addEventListener('click',()=>{carModal.hidden=true;document.body.classList.remove('modal-open');returnToReservationAfterCar=false}));
$('[data-car-form]')?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!currentUser)return toast('Nejdřív se přihlas.');
  const form=event.currentTarget,button=form.querySelector('button[type="submit"]'),fd=new FormData(form),files=[...form.elements.photos.files].slice(0,3);
  setButtonBusy(button,true,'Ukládám auto…');
  try{
    const created=await apiRequest('/api/cars',{method:'POST',body:{nickname:fd.get('nickname'),body:fd.get('body'),model:fd.get('model'),year:fd.get('year'),color:fd.get('color'),primary:fd.get('primary')==='on'}});
    const carId=created?.car?.id;if(!carId)throw new Error('car_create_failed');
    for(const file of files){
      const blob=await compressImageBlob(file,1800,.82);
      const upload=new FormData();upload.append('file',blob,`${file.name.replace(/\.[^.]+$/,'')||'car'}.jpg`);
      await apiRequestForm(`/api/cars/${encodeURIComponent(carId)}/photos`,upload);
    }
    data.cars=await loadCarsFromApi();
    carModal.hidden=true;document.body.classList.remove('modal-open');form.reset();setReservationCarError(false);renderGarage();renderProfile();
    if(activePlannerHandoff&&plannerHandoffApplied){renderReservation();applyPlannerHandoffToForm()}
    else if(returnToReservationAfterCar)openSection('reservation');
    returnToReservationAfterCar=false;toast(files.length?'Auto i fotky jsou uložené v Můj United.':'Auto je uložené v Můj United.');
  }catch(error){console.error('Car upload failed',error);toast(error?.status===409?'K autu lze uložit maximálně 3 fotky.':apiError(error))}
  finally{setButtonBusy(button,false)}
});
async function compressImageBlob(file,max=1800,quality=.82){return new Promise((resolve,reject)=>{const img=new Image(),reader=new FileReader();reader.onload=()=>img.src=reader.result;reader.onerror=reject;img.onload=()=>{const scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('image_compression_failed')),'image/jpeg',quality)};reader.readAsDataURL(file)})}

function renderMemberGallery(){
  const list=$('[data-member-gallery-list]');if(!list)return;
  if(!memberGallery.length){list.innerHTML='<div class="member-gallery-empty"><b>Zatím jsi neposlal žádné fotografie.</b><small>Nahraj je tady. Po schválení se objeví ve veřejné galerii.</small></div>';return}
  const label={pending:'ČEKÁ NA SCHVÁLENÍ',approved:'SCHVÁLENA',rejected:'ZAMÍTNUTA'};
  list.innerHTML=memberGallery.map(item=>`<article class="member-gallery-item"><div><small>${esc(new Date(item.createdAt||Date.now()).toLocaleDateString('cs-CZ'))}</small><b>${esc(item.caption||'Fotka do United galerie')}</b></div><span class="status-${esc(item.status)}">${label[item.status]||esc(item.status)}</span></article>`).join('');
}

const memberGalleryForm=$('[data-member-gallery-form]'),memberPhotoInput=$('[data-member-photo-input]'),memberPhotoDropzone=$('[data-member-photo-dropzone]');
const memberPhotoTypes=new Set(['image/jpeg','image/png','image/webp']);
let memberPhotoSelection=[];
function renderMemberPhotoSelection(){
  const panel=$('[data-member-photo-selection]'),count=$('[data-member-photo-count]'),names=$('[data-member-photo-names]');if(!panel||!count||!names)return;
  const total=memberPhotoSelection.length;panel.hidden=!total;if(!total){count.textContent='';names.textContent='';return}
  const noun=total===1?'fotka připravená':total<=4?'fotky připravené':'fotek připravených';count.textContent=`${total} ${noun} k nahrání`;
  const visible=memberPhotoSelection.slice(0,2).map(file=>file.name),remaining=total-visible.length;names.textContent=`${visible.join(' · ')}${remaining?` · +${remaining} další`:''}`;
}
function selectMemberPhotos(fileList,{notify=true,updateInput=false}={}){
  const source=[...fileList],accepted=source.filter(file=>memberPhotoTypes.has(file.type)),limited=accepted.slice(0,8);
  memberPhotoSelection=limited;
  if(notify&&source.length!==accepted.length)toast('Vyber fotky ve formátu JPG, PNG nebo WebP.');
  else if(notify&&accepted.length>8)toast('Najednou můžeš nahrát maximálně 8 fotek.');
  if(updateInput&&memberPhotoInput){try{const transfer=new DataTransfer();for(const file of limited)transfer.items.add(file);memberPhotoInput.files=transfer.files}catch(error){console.debug('Dropped photos stay in the upload selection.',error)}}
  renderMemberPhotoSelection();
}
memberPhotoInput?.addEventListener('change',()=>selectMemberPhotos(memberPhotoInput.files));
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
    form.reset();memberPhotoSelection=[];renderMemberPhotoSelection();await loadMemberGallery();toast('Fotky jsou nahrané a čekají na schválení United týmem.');
  }catch(error){console.error('Gallery upload failed',error);toast(error?.status===429?'Dnešní limit nahrávání byl dosažen.':apiError(error))}
  finally{setButtonBusy(button,false)}
});

async function applyPlannerDraft(){
  if(!reservationForm||!currentUser)return;
  const handoff=loadPlannerHandoff();
  if(handoff){
    activePlannerHandoff=handoff;plannerHandoffApplied=false;plannerHandoffChoice=data.reservation?'pending':'applied';
    if(!data.reservation)applyPlannerHandoffToForm();else{openSection('reservation');renderPlannerHandoff()}
    return;
  }
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
    const showMap={'Chci soutěžit':'Ano','Jedu se podívat':'Ne','Možná':'Možná'};
    if(reservationForm.elements.showshine)reservationForm.elements.showshine.value=showMap[draft.showshine]||draft.showshine||'Ne';
    syncMemberSleep();
    const selectedCar=data.cars.find(c=>c.primary)||data.cars[0]||null;
    if(selectedCar&&reservationForm.elements.carId)reservationForm.elements.carId.value=selectedCar.id;
    openSection('reservation');
    localStorage.removeItem(plannerDraftKey);localStorage.removeItem('e36UnitedReservationDraftV20');
    toast(selectedCar?'Výběr z Weekend Planneru je připravený. Zkontroluj ho a rezervaci odešli.':'Výběr z Weekend Planneru je připravený. Přidej auto a rezervaci odešli.');
  }catch(error){console.warn(error);localStorage.removeItem(plannerDraftKey);localStorage.removeItem('e36UnitedReservationDraftV20')}
}

const menuBtn=$('.menu-btn'),nav=$('.nav-links');
if(menuBtn&&nav)menuBtn.addEventListener('click',()=>{const open=document.body.classList.toggle('menu-open');menuBtn.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open)});

hydratePlannerHandoffFromUrl();
const requestedAuthMode=memberUrlParams.get('mode');if(requestedAuthMode==='register'||requestedAuthMode==='login')activateAuthTab(requestedAuthMode);
initFirebase();
