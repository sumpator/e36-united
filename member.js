import { firebaseConfig, portalConfig } from './firebase-config.js?v=20260823-auth2';

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const firebaseReady=Boolean(firebaseConfig?.apiKey&&firebaseConfig?.projectId&&firebaseConfig?.appId&&!String(firebaseConfig.apiKey).startsWith('PASTE_')&&!String(firebaseConfig.projectId).startsWith('PASTE_'));
const apiBaseUrl=(portalConfig.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'');
const localPrefix=portalConfig.memberLocalPrefix||'e36UnitedMemberLocalV20';
const plannerDraftKey=portalConfig.plannerDraftKey||'e36UnitedPlannerDraftV19';

let firebase=null;
let currentUser=null;
let authFlowActive=false;
let memberGallery=[];
let reservationState={registrationOpen:false,event:null,message:''};
const carPhotoObjectUrls=new Map();

const defaultData=()=>({
  profile:{id:'',memberCode:'',name:'United Member',nickname:'Driver',email:'',phone:'',role:'member',status:'active',emailVerified:false,createdAt:''},
  history:portalConfig.unitedYears.map(year=>({year,attended:false,verified:false,winner:false,category:''})),
  cars:[],
  reservation:null,
  bonuses:[]
});
let data=defaultData();

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
function clearCarPhotoObjectUrls(){for(const url of carPhotoObjectUrls.values())URL.revokeObjectURL(url);carPhotoObjectUrls.clear()}
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
  if(error?.message==='api_network_error')return 'Členské API není dostupné. Zkus stránku obnovit.';
  if(error?.message==='member_identity_mismatch')return 'Bezpečnostní kontrola profilu selhala. Byl jsi odhlášen.';
  if(error?.message==='member_inactive')return 'Tento členský účet není aktivní.';
  if(error?.status===401)return 'Přihlášení vypršelo. Přihlas se znovu.';
  if(error?.status===403)return 'Tato doména nemá povolený přístup k členskému API.';
  if(error?.status>=500)return 'Členský profil je dočasně nedostupný.';
  if(error?.message==='reservation_response_invalid')return 'Server vrátil neplatnou rezervaci. Zkus stránku obnovit.';
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
  const car=data.cars.find(c=>c.primary)||data.cars[0];const carEl=$('[data-card-car]');if(carEl)carEl.textContent=car?`${car.body} · ${car.model}${car.nickname?' · '+car.nickname:''}`:'BMW E36 · Garage pending';
  $('[data-member-since]').textContent=memberSince()||'—';$('[data-history-since]').textContent=memberSince()||'—';$('[data-attendance-count]').textContent=attended();$('[data-member-status]').textContent=status();
}
function renderPoints(){const p=points();$('[data-points]').textContent=p;const track=$('[data-points-track]');track.innerHTML=Array.from({length:12},(_,i)=>`<i class="${i<p?'is-on':''}"></i>`).join('');$('[data-points-copy]').textContent=p>=12?'12 / 12. United Merch reward je odemčený.':`Ještě ${12-p} bodů a odemykáš United Merch reward.`}
function renderBadges(){const unlocked=badgeDefs.filter(b=>b.test(data));const html=arr=>arr.map(b=>`<div class="badge ${b.test(data)?'':'is-locked'}"><span class="badge-icon">${b.icon}</span><div><b>${b.name}</b><small>${b.desc}</small></div></div>`).join('');$('[data-badges-preview]').innerHTML=html((unlocked.length?unlocked:badgeDefs).slice(0,5));$('[data-badge-cabinet]').innerHTML=html(badgeDefs)}
function renderGarage(){
  const grid=$('[data-garage-grid]');
  if(!grid)return;
  clearCarPhotoObjectUrls();
  if(!data.cars.length){grid.innerHTML='<div class="garage-empty"><div><b>Garáž je zatím prázdná.</b><br><small>Přidej svoje první E36. Fotky se bezpečně uloží na United server.</small></div></div>';renderCarSelect();return}
  grid.innerHTML=data.cars.map(c=>{const first=c.photos?.[0];return `<article class="car-card"><div class="car-photo">${first?`<img data-car-photo-id="${esc(first.id)}" alt="${esc(c.nickname||c.model)}">`:'<div class="car-photo-placeholder">E36</div>'}${c.primary?'<span class="car-primary">HLAVNÍ AUTO</span>':''}</div><div class="car-body"><small>${esc(c.body)} · ${esc(c.year||'')}</small><h3>${esc(c.nickname||c.model)}</h3><p>${esc(c.model)}${c.color?' · '+esc(c.color):''}</p><div class="car-actions"><button data-primary-car="${c.id}">${c.primary?'Hlavní':'Nastavit hlavní'}</button><button data-delete-car="${c.id}">Odebrat</button></div></div></article>`}).join('');
  $$('[data-primary-car]').forEach(button=>button.onclick=async()=>{try{await apiRequest(`/api/cars/${encodeURIComponent(button.dataset.primaryCar)}/primary`,{method:'POST'});data.cars=await loadCarsFromApi();renderGarage();renderProfile();toast('Hlavní auto změněno')}catch(error){console.error(error);toast(apiError(error))}});
  $$('[data-delete-car]').forEach(button=>button.onclick=async()=>{if(!confirm('Odebrat auto z garáže včetně jeho fotek?'))return;try{await apiRequest(`/api/cars/${encodeURIComponent(button.dataset.deleteCar)}`,{method:'DELETE'});data.cars=await loadCarsFromApi();renderGarage();renderProfile();toast('Auto odebráno')}catch(error){console.error(error);toast(apiError(error))}});
  renderCarSelect();
  hydrateCarPhotos();
}
async function hydrateCarPhotos(){
  for(const img of $$('img[data-car-photo-id]')){
    const id=img.dataset.carPhotoId;if(!id)continue;
    try{const blob=await apiRequestBlob(`/api/cars/media/${encodeURIComponent(id)}`);const url=URL.createObjectURL(blob);carPhotoObjectUrls.set(id,url);img.src=url}
    catch(error){console.warn('Car photo unavailable',id,error);img.replaceWith(Object.assign(document.createElement('div'),{className:'car-photo-placeholder',textContent:'E36'}))}
  }
}
function renderCarSelect(){const select=$('[data-car-select]');if(!select)return;select.innerHTML=data.cars.length?data.cars.map(c=>`<option value="${c.id}">${esc(c.nickname||c.model)} · ${esc(c.body)}</option>`).join(''):'<option value="">Nejdřív přidej auto do garáže</option>'}
function renderHistory(){const grid=$('[data-history-grid]');grid.innerHTML=data.history.map(h=>`<button class="history-year ${h.attended?'is-attended':''}" data-history-year="${h.year}"><div class="history-year-number">${h.year}</div><div class="history-year-status"><div><b>${h.attended?'ÚČAST PŘIDÁNA':'NEBYL/A JSEM'}</b><small>${h.attended?(h.verified?'Ověřeno United týmem':'Čeká na ověření'):'Klikni pro přidání'}</small></div><span class="history-check">${h.attended?'✓':'+'}</span></div></button>`).join('');$$('[data-history-year]').forEach(button=>button.onclick=async()=>{const h=data.history.find(x=>x.year===+button.dataset.historyYear);h.attended=!h.attended;if(!h.attended){h.verified=false;h.winner=false}await commit(h.attended?`United ${h.year} přidáno do historie`:`United ${h.year} odebráno`)})}

const reservationForm=$('[data-reservation-form]');
const arrivalSelect=reservationForm?.elements?.arrival;
const sleepField=$('[data-member-sleep-field]');
function syncMemberSleep(){if(!reservationForm||!arrivalSelect||!sleepField)return;const dayPass=arrivalSelect.value==='Jen na otočku',crew=Math.max(1,Math.min(8,Number(reservationForm.elements.crew.value)||1)),units=reservationForm.elements.accommodationUnits,unitsField=units?.closest('label');sleepField.hidden=dayPass;if(dayPass){reservationForm.elements.sleep.value='Bez ubytování';if(units)units.value='0'}if(units){units.max=String(crew);if(Number(units.value)>crew)units.value=String(crew);units.disabled=dayPass||!reservationState.registrationOpen}if(unitsField)unitsField.hidden=dayPass}
arrivalSelect?.addEventListener('change',syncMemberSleep);reservationForm?.elements?.crew?.addEventListener('input',syncMemberSleep);syncMemberSleep();

function renderReservation(){
  const r=data.reservation,miniStatus=$('[data-reservation-status]'),year=$('[data-res-year]'),title=$('[data-res-title]'),car=$('[data-res-car]'),mailState=$('[data-reservation-mail-state]');
  const submit=$('[data-reservation-submit]');
  if(reservationForm){for(const field of reservationForm.elements)field.disabled=!reservationState.registrationOpen;syncMemberSleep()}
  if(submit)submit.disabled=!reservationState.registrationOpen;
  if(!r){
    const open=reservationState.registrationOpen;
    miniStatus.textContent=open?'Bez rezervace':'Registrace zavřená';year.textContent=open?'NEXT':'—';title.textContent='Příští United';car.textContent=open?'Vyber auto z garáže a odešli rezervaci.':'Aktuálně není otevřená registrace.';
    $('[data-reservation-state-label]').textContent=open?'Bez aktivní rezervace':'Registrace není otevřená';$('[data-reservation-year]').textContent=open?'NEXT':'—';$('[data-reservation-title]').textContent='Příští E36 United';$('[data-reservation-description]').textContent=reservationState.message||(open?'Registrace je otevřená. Připrav a odešli svoji rezervaci.':'Aktuálně není otevřená registrace na žádný event.');$('[data-reservation-summary]').innerHTML='';
    if(mailState){mailState.classList.remove('is-confirmed');mailState.querySelector('span').textContent=open?'Rezervace se po odeslání uloží na server se stavem PENDING.':'Rezervaci bude možné odeslat po otevření registrace.'}
    return;
  }
  const statusLabels={pending:'Čeká na schválení',approved:'Schváleno',rejected:'Zamítnuto',cancelled:'Zrušeno'};
  const statusText=statusLabels[r.status]||r.status||'Pending';
  if(reservationForm){if(reservationForm.elements.carId&&r.carId)reservationForm.elements.carId.value=r.carId;if(reservationForm.elements.arrival)reservationForm.elements.arrival.value=r.arrival||'Pátek';if(reservationForm.elements.crew)reservationForm.elements.crew.value=r.crew||2;if(reservationForm.elements.sleep)reservationForm.elements.sleep.value=r.sleep||'Chatka';if(reservationForm.elements.accommodationUnits)reservationForm.elements.accommodationUnits.value=r.accommodationUnits??0;if(reservationForm.elements.showshine)reservationForm.elements.showshine.value=r.showshine||'Ne';if(reservationForm.elements.note)reservationForm.elements.note.value=r.note||'';syncMemberSleep()}
  miniStatus.textContent=statusText;year.textContent=r.year||'NEXT';title.textContent=r.title||'United rezervace';car.textContent=r.carSnapshot?`${r.carSnapshot.nickname||r.carSnapshot.model} · ${r.carSnapshot.body}`:'Auto zatím není vybrané';
  $('[data-reservation-state-label]').textContent=`Serverový stav: ${statusText}`;$('[data-reservation-year]').textContent=r.year||'NEXT';$('[data-reservation-title]').textContent=r.title||'E36 United';
  const descriptions={pending:'Rezervace je uložená na serveru a čeká na kontrolu United týmem.',approved:'Rezervace byla schválena United týmem.',rejected:'Rezervace byla zamítnuta. Údaje můžeš upravit a znovu odeslat.',cancelled:'Rezervace je zrušená. Pokud je registrace stále otevřená, můžeš ji upravit a znovu odeslat.'};
  $('[data-reservation-description]').textContent=descriptions[r.status]||'Rezervace je uložená na serveru.';
  const sleep=r.arrival==='Jen na otočku'?'Bez ubytování':r.sleep;
  $('[data-reservation-summary]').innerHTML=`<div><small>AUTO</small><b>${esc(r.carSnapshot?.nickname||r.carSnapshot?.model||'—')}</b></div><div><small>PŘÍJEZD</small><b>${esc(r.arrival||'—')}</b></div><div><small>POSÁDKA</small><b>${esc(r.crew)} osoby</b></div><div><small>UBYTOVÁNÍ</small><b>${esc(sleep||'—')}</b></div><div><small>SHOW & SHINE</small><b>${esc(r.showshine)}</b></div><div><small>STATUS</small><b>${esc(String(r.status||'pending').toUpperCase())}</b></div>`;
  if(mailState){mailState.classList.toggle('is-confirmed',r.status==='approved');mailState.querySelector('span').textContent=descriptions[r.status]||'Rezervace je uložená na serveru.'}
}
function renderRewards(){const p=points(),life=lifetimePoints();$('[data-reward-score]').textContent=p;const lock=$('[data-reward-lock]');lock.classList.toggle('is-unlocked',p>=12);lock.querySelector('span').textContent=p>=12?'UNLOCKED':'LOCKED';$('[data-reward-remaining]').textContent=p>=12?'United Merch reward je aktivní':`${12-p} bodů zbývá`;$('[data-points-ledger]').innerHTML=`<div class="ledger-item"><span>OVĚŘENÁ ÚČAST</span><b>+${portalConfig.points.attendance} body</b><small>Za každý potvrzený United.</small></div><div class="ledger-item"><span>SHOW & SHINE WIN</span><b>+${portalConfig.points.showShineWin} body</b><small>Po potvrzení výsledku organizátorem.</small></div><div class="ledger-item"><span>LIFETIME SCORE</span><b>${life} bodů</b><small>Celoživotní skóre se nemaže po rewardu.</small></div>`;const perks=[['⚡','Early registration','Členové dostanou registraci dřív.',verified()>=1],['◆','Member-only United Merch','Přístup k vybraným dropům.',verified()>=1],['12','United Merch reward','Odměna po dosažení 12 / 12.',p>=12],['★','Community voting','Hlasování o vybraných aktivitách.',verified()>=3],['⌁','Priority accommodation','Dřívější přístup k vybranému ubytování.',verified()>=5]];$('[data-perks-list]').innerHTML=perks.map(x=>`<div class="perk ${x[3]?'':'is-locked'}"><i>${x[0]}</i><div><b>${x[1]}</b><small>${x[2]}</small></div><span>${x[3]?'ACTIVE':'LOCKED'}</span></div>`).join('')}

async function commit(message='Uloženo'){saveUserLocal();renderAll();toast(message)}

reservationForm?.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!currentUser)return toast('Nejdřív se přihlas.');
  if(!reservationState.registrationOpen)return toast('Registrace na žádný event aktuálně není otevřená.');
  const fd=new FormData(event.currentTarget),car=data.cars.find(c=>c.id===fd.get('carId'));
  if(!car)return toast('Nejdřív přidej auto do garáže.');
  const arrival=fd.get('arrival')||'Pátek',sleep=arrival==='Jen na otočku'?'Bez ubytování':fd.get('sleep');
  const attendanceType=arrival==='Pátek'?'full_weekend':arrival==='Sobota'?'saturday_only':'day_visit';
  const button=$('[data-reservation-submit]');setButtonBusy(button,true,'Ukládám rezervaci…');
  try{
    const payload=await apiRequest('/api/reservations/current',{method:'PUT',body:{carId:car.id,arrival,crew:+fd.get('crew'),attendanceType,accommodation:sleep,accommodationUnits:+fd.get('accommodationUnits'),showShine:fd.get('showshine'),note:fd.get('note')}});
    const reservation=normalizeReservation(payload?.reservation);if(!reservation)throw new Error('reservation_response_invalid');
    reservationState={registrationOpen:payload?.registrationOpen===true,event:payload?.event||reservationState.event,message:payload?.message||''};
    data.reservation=reservation;renderReservation();renderProfile();toast(payload?.message||'Rezervace byla uložena na server.');
  }catch(error){console.error('Reservation save failed',error);toast(apiError(error))}
  finally{setButtonBusy(button,false);renderReservation()}
});

const carModal=$('[data-car-modal]');
$('[data-open-car]')?.addEventListener('click',()=>{carModal.hidden=false;document.body.classList.add('modal-open')});
$$('[data-close-car]').forEach(button=>button.addEventListener('click',()=>{carModal.hidden=true;document.body.classList.remove('modal-open')}));
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
    carModal.hidden=true;document.body.classList.remove('modal-open');form.reset();renderGarage();renderProfile();toast(files.length?'Auto i fotky jsou uložené na United serveru.':'Auto je uložené na United serveru.');
  }catch(error){console.error('Car upload failed',error);toast(error?.status===409?'K autu lze uložit maximálně 3 fotky.':apiError(error))}
  finally{setButtonBusy(button,false)}
});
async function compressImageBlob(file,max=1800,quality=.82){return new Promise((resolve,reject)=>{const img=new Image(),reader=new FileReader();reader.onload=()=>img.src=reader.result;reader.onerror=reject;img.onload=()=>{const scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('image_compression_failed')),'image/jpeg',quality)};reader.readAsDataURL(file)})}

function renderMemberGallery(){
  const list=$('[data-member-gallery-list]');if(!list)return;
  if(!memberGallery.length){list.innerHTML='<div class="member-gallery-empty"><b>Zatím jsi neposlal žádné fotografie.</b><small>Nahraj je tady. Po schválení se objeví ve veřejné galerii.</small></div>';return}
  const label={pending:'ČEKÁ NA SCHVÁLENÍ',approved:'SCHVÁLENO',rejected:'ZAMÍTNUTO'};
  list.innerHTML=memberGallery.map(item=>`<article class="member-gallery-item"><div><small>${esc(new Date(item.createdAt||Date.now()).toLocaleDateString('cs-CZ'))}</small><b>${esc(item.caption||'Fotka do United galerie')}</b></div><span class="status-${esc(item.status)}">${label[item.status]||esc(item.status)}</span></article>`).join('');
}

$('[data-member-gallery-form]')?.addEventListener('submit',async event=>{
  event.preventDefault();if(!currentUser)return toast('Nejdřív se přihlas.');
  const form=event.currentTarget,input=form.elements.photos,files=[...input.files].slice(0,8),caption=String(form.elements.caption?.value||'').trim(),button=form.querySelector('button[type="submit"]');
  if(!files.length)return toast('Vyber alespoň jednu fotku.');
  setButtonBusy(button,true,`Nahrávám 0 / ${files.length}…`);
  try{
    for(let i=0;i<files.length;i++){
      button.textContent=`Nahrávám ${i+1} / ${files.length}…`;
      const blob=await compressImageBlob(files[i],1800,.82),upload=new FormData();upload.append('file',blob,`${files[i].name.replace(/\.[^.]+$/,'')||'united'}.jpg`);upload.append('caption',caption);
      await apiRequestForm('/api/gallery/submissions',upload);
    }
    form.reset();await loadMemberGallery();toast('Fotky jsou nahrané. Status: čeká na schválení.');
  }catch(error){console.error('Gallery upload failed',error);toast(error?.status===429?'Dnešní limit nahrávání byl dosažen.':apiError(error))}
  finally{setButtonBusy(button,false)}
});

async function applyPlannerDraft(){
  const raw=localStorage.getItem(plannerDraftKey)||localStorage.getItem('e36UnitedReservationDraftV20');
  if(!raw||!reservationForm||!currentUser)return;
  try{
    const draft=JSON.parse(raw);if(!draft)return;
    if(data.reservation){
      localStorage.removeItem(plannerDraftKey);localStorage.removeItem('e36UnitedReservationDraftV20');
      toast('Serverová rezervace už existuje; Weekend Planner ji nepřepsal.');
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
    toast(selectedCar?'Weekend Planner předvyplnil formulář. Rezervace se uloží až po odeslání.':'Weekend Planner předvyplnil formulář. Přidej auto a rezervaci odešli.');
  }catch(error){console.warn(error);localStorage.removeItem(plannerDraftKey);localStorage.removeItem('e36UnitedReservationDraftV20')}
}

const menuBtn=$('.menu-btn'),nav=$('.nav-links');
if(menuBtn&&nav)menuBtn.addEventListener('click',()=>{const open=document.body.classList.toggle('menu-open');menuBtn.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open)});

initFirebase();
