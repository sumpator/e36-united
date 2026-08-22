import { firebaseConfig, portalConfig } from './firebase-config.js';

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const firebaseReady = firebaseConfig?.apiKey && !firebaseConfig.apiKey.startsWith('PASTE_') && firebaseConfig.projectId && !firebaseConfig.projectId.startsWith('PASTE_');
let firebase = null, currentUser = null, authFlowActive = false;
const apiBaseUrl=(portalConfig.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'');
const localKey='e36UnitedMemberPreviewV19';
const plannerDraftKey=portalConfig.plannerDraftKey||'e36UnitedPlannerDraftV19';
const defaultData=()=>({
  profile:{name:'United Member',nickname:'Driver',email:'',phone:'',createdAt:new Date().toISOString()},
  history:portalConfig.unitedYears.map(y=>({year:y,attended:false,verified:false,winner:false,category:''})),
  cars:[], reservation:null, bonuses:[]
});
let data=loadLocal();
function loadLocal(){try{const raw=localStorage.getItem(localKey)||localStorage.getItem('e36UnitedMemberPreviewV18');return {...defaultData(),...(JSON.parse(raw)||{})}}catch{return defaultData()}}
// Auth state belongs to Firebase and the profile belongs to the Worker API.
// Only the still-local Phase 1 modules are persisted by the portal itself.
function saveLocal(){const {profile,...localPortalData}=data;localStorage.setItem(localKey,JSON.stringify(localPortalData));renderAll()}
function toast(msg){const el=$('[data-toast]'); el.textContent=msg; el.classList.add('is-visible'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('is-visible'),2600)}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function uid(){return Math.random().toString(36).slice(2,10)}

async function initFirebase(){
  if(!firebaseReady){setMode('AUTH NENÍ NASTAVENÝ');showAuth();return}
  try{
    const appMod=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
    const authMod=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
    const app=appMod.getApps().length?appMod.getApps()[0]:appMod.initializeApp(firebaseConfig);
    const auth=authMod.getAuth(app);
    await authMod.setPersistence(auth,authMod.browserLocalPersistence);
    firebase={...authMod,auth};setMode('AUTH + PROFIL LIVE');
    authMod.onAuthStateChanged(auth,async user=>{
      currentUser=user;
      if(authFlowActive)return;
      if(!user){showAuth();return}
      await openAuthenticatedSession(user,{quiet:true});
    });
  }catch(e){console.warn('Firebase Auth unavailable',e);setMode('AUTH NEDOSTUPNÝ');showAuth()}
}
function setMode(t){$$('[data-mode-badge]').forEach(x=>x.textContent=t);const s=$('[data-sync-state]');if(s)s.textContent=t;$$('[data-demo-hint]').forEach(x=>x.hidden=t==='AUTH + PROFIL LIVE')}
function normalizeProfile(payload,user=currentUser){
  const source=payload?.profile||payload?.member||payload?.data?.profile||payload?.data||payload||{};
  return {...data.profile,...source,name:source.name||user?.displayName||data.profile.name,nickname:source.nickname||source.name?.split(' ')[0]||user?.displayName?.split(' ')[0]||data.profile.nickname,email:source.email||user?.email||data.profile.email};
}
async function apiRequest(path,{method='GET',body,token}={}){
  if(!currentUser)throw new Error('api_auth_required');
  const idToken=token||await currentUser.getIdToken();
  const response=await fetch(`${apiBaseUrl}${path}`,{method,headers:{Authorization:`Bearer ${idToken}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  const text=await response.text();let payload=null;
  if(text){try{payload=JSON.parse(text)}catch{payload={message:text}}}
  if(!response.ok){const error=new Error(payload?.message||payload?.error||`API ${response.status}`);error.status=response.status;throw error}
  return payload;
}
async function syncProfileFromApi(token){const payload=await apiRequest('/api/me',{token});data.profile=normalizeProfile(payload);saveLocal();return data.profile}
async function openAuthenticatedSession(user,{quiet=false}={}){
  currentUser=user;
  data.profile=normalizeProfile({},user);
  try{await syncProfileFromApi()}catch(err){console.warn('Profile API unavailable',err);saveLocal();setMode('AUTH LIVE · PROFIL OFFLINE');if(!quiet)toast('Přihlášení proběhlo, profil se ale nepodařilo načíst.')}
  showApp();await applyPlannerDraft();
}
async function commit(msg='Uloženo'){saveLocal();toast(msg)}

function showAuth(){ document.body.classList.remove('member-authenticated'); $('[data-auth-view]').hidden=false; $('[data-app-view]').hidden=true; }
function showApp(){ document.body.classList.add('member-authenticated'); $('[data-auth-view]').hidden=true; $('[data-app-view]').hidden=false; renderAll(); }

$$('[data-auth-tab]').forEach(btn=>btn.addEventListener('click',()=>{$$('[data-auth-tab]').forEach(x=>x.classList.toggle('is-active',x===btn));$$('[data-auth-form]').forEach(f=>f.classList.toggle('is-active',f.dataset.authForm===btn.dataset.authTab))}));
$$('[data-toggle-password]').forEach(b=>b.addEventListener('click',()=>{const i=b.parentElement.querySelector('input');i.type=i.type==='password'?'text':'password'}));

$('[data-auth-form="login"]').addEventListener('submit',async e=>{e.preventDefault();if(!firebase)return toast('Přihlášení teď není dostupné.');const fd=new FormData(e.currentTarget),email=fd.get('email'),password=fd.get('password');authFlowActive=true;try{const cred=await firebase.signInWithEmailAndPassword(firebase.auth,email,password);currentUser=cred.user;const token=await currentUser.getIdToken();await syncProfileFromApi(token);setMode('AUTH + PROFIL LIVE');showApp();await applyPlannerDraft()}catch(err){if(currentUser){data.profile=normalizeProfile({},currentUser);saveLocal();setMode('AUTH LIVE · PROFIL OFFLINE');showApp();toast('Přihlášení proběhlo, profil se ale nepodařilo načíst.')}else toast(authError(err))}finally{authFlowActive=false}});
$('[data-auth-form="register"]').addEventListener('submit',async e=>{e.preventDefault();if(!firebase)return toast('Registrace teď není dostupná.');const fd=new FormData(e.currentTarget),email=fd.get('email'),password=fd.get('password'),name=fd.get('name'),nickname=fd.get('nickname')||name.split(' ')[0];authFlowActive=true;try{const cred=await firebase.createUserWithEmailAndPassword(firebase.auth,email,password);currentUser=cred.user;await firebase.updateProfile(currentUser,{displayName:name});await firebase.sendEmailVerification(currentUser);const token=await currentUser.getIdToken();const payload=await apiRequest('/api/bootstrap',{method:'POST',token,body:{name,nickname}});data=defaultData();data.profile=normalizeProfile(payload,currentUser);saveLocal();setMode('AUTH + PROFIL LIVE');showApp();await applyPlannerDraft();toast('United ID vytvořeno · ověření e-mailu odesláno')}catch(err){if(currentUser){data.profile={...data.profile,name,nickname,email};saveLocal();setMode('AUTH LIVE · PROFIL OFFLINE');showApp();toast('United ID vzniklo, profil se ale nepodařilo synchronizovat.')}else toast(authError(err))}finally{authFlowActive=false}});
$('[data-password-reset]').addEventListener('click',async()=>{const email=$('[data-auth-form="login"] input[name="email"]').value;if(!email)return toast('Nejdřív vyplň e-mail.');if(!firebase)return toast('Reset hesla teď není dostupný.');try{await firebase.sendPasswordResetEmail(firebase.auth,email);toast('Odkaz pro nové heslo byl odeslán.')}catch(e){toast(authError(e))}});
$('[data-logout]').addEventListener('click',async()=>{if(firebase)await firebase.signOut(firebase.auth);currentUser=null;showAuth()});
function authError(e){const c=e?.code||'';if(c.includes('invalid-credential'))return 'E-mail nebo heslo nesedí.';if(c.includes('email-already'))return 'Tento e-mail už United ID má.';if(c.includes('weak-password'))return 'Heslo musí mít alespoň 6 znaků.';return 'Akci se nepodařilo dokončit.'}

$$('.member-nav-item[data-member-section]').forEach(b=>b.addEventListener('click',()=>openSection(b.dataset.memberSection)));
$$('[data-jump]').forEach(b=>b.addEventListener('click',()=>openSection(b.dataset.jump)));
function openSection(id){$$('.member-nav-item[data-member-section]').forEach(b=>b.classList.toggle('is-active',b.dataset.memberSection===id));$$('[data-member-panel]').forEach(p=>p.classList.toggle('is-active',p.dataset.memberPanel===id));if(innerWidth<700)window.scrollTo({top:82,behavior:'smooth'})}

const badgeDefs=[
  {id:'first',icon:'1×',name:'First United',desc:'První účast',test:d=>attended(d)>=1},
  {id:'regular',icon:'3×',name:'United Regular',desc:'3 ověřené účasti',test:d=>verified(d)>=3},
  {id:'veteran',icon:'5×',name:'Veteran',desc:'5 ověřených účastí',test:d=>verified(d)>=5},
  {id:'og',icon:'OG',name:'Old School',desc:'Member since 2022 nebo dřív',test:d=>(memberSince(d)||9999)<=2022},
  {id:'winner',icon:'★',name:'S&S Winner',desc:'Ověřená výhra',test:d=>d.history.some(h=>h.verified&&h.winner)},
  {id:'garage',icon:'▦',name:'Full Garage',desc:'3 auta v garáži',test:d=>d.cars.length>=3},
  {id:'twelve',icon:'12',name:'Full Points',desc:'12 / 12 United Points',test:d=>points(d)>=12}
];
function attended(d=data){return d.history.filter(h=>h.attended).length} function verified(d=data){return d.history.filter(h=>h.attended&&h.verified).length}
function memberSince(d=data){const y=d.history.filter(h=>h.attended).map(h=>h.year);return y.length?Math.min(...y):null}
function points(d=data){const p=portalConfig.points;return Math.min(p.rewardThreshold,d.history.reduce((n,h)=>n+(h.attended&&h.verified?p.attendance:0)+(h.winner&&h.verified?p.showShineWin:0),0)+(d.bonuses||[]).reduce((n,b)=>n+(b.points||0),0))}
function lifetimePoints(d=data){const p=portalConfig.points;return d.history.reduce((n,h)=>n+(h.attended&&h.verified?p.attendance:0)+(h.winner&&h.verified?p.showShineWin:0),0)+(d.bonuses||[]).reduce((n,b)=>n+(b.points||0),0)}
function status(d=data){const n=verified(d);if(n>=5)return 'VETERAN';if(n>=3)return 'REGULAR';if(n>=1)return 'MEMBER';return 'ROOKIE'}

function renderAll(){renderProfile();renderPoints();renderBadges();renderGarage();renderHistory();renderReservation();renderRewards()}
function renderProfile(){const p=data.profile||{};const nick=p.nickname||p.name?.split(' ')[0]||'Driver';$('[data-member-nickname]').textContent=nick;$('[data-card-name]').textContent=(p.name||'United Member').toUpperCase();$('[data-card-id]').textContent=String((p.email||nick).split('').reduce((a,c)=>a+c.charCodeAt(0),0)%900+100);const car=data.cars.find(c=>c.primary)||data.cars[0];$('[data-card-car]').textContent=car?`${car.body} · ${car.model}${car.nickname?' · '+car.nickname:''}`:'BMW E36 · Garage pending';$('[data-member-since]').textContent=memberSince()||'—';$('[data-history-since]').textContent=memberSince()||'—';$('[data-attendance-count]').textContent=attended();$('[data-member-status]').textContent=status()}
function renderPoints(){const p=points();$('[data-points]').textContent=p;const track=$('[data-points-track]');track.innerHTML=Array.from({length:12},(_,i)=>`<i class="${i<p?'is-on':''}"></i>`).join('');$('[data-points-copy]').textContent=p>=12?'12 / 12. United Merch reward je odemčený.':`Ještě ${12-p} bodů a odemykáš United Merch reward.`}
function renderBadges(){const unlocked=badgeDefs.filter(b=>b.test(data));const html=(arr)=>arr.map(b=>`<div class="badge ${b.test(data)?'':'is-locked'}"><span class="badge-icon">${b.icon}</span><div><b>${b.name}</b><small>${b.desc}</small></div></div>`).join('');$('[data-badges-preview]').innerHTML=html((unlocked.length?unlocked:badgeDefs).slice(0,5));$('[data-badge-cabinet]').innerHTML=html(badgeDefs)}
function renderGarage(){const grid=$('[data-garage-grid]');if(!data.cars.length){grid.innerHTML='<div class="garage-empty"><div><b>Garáž je zatím prázdná.</b><br><small>Přidej svoje první E36. Pak ho můžeš napárovat na rezervaci.</small></div></div>';renderCarSelect();return}grid.innerHTML=data.cars.map(c=>`<article class="car-card"><div class="car-photo">${c.photos?.[0]?`<img src="${c.photos[0]}" alt="${esc(c.nickname||c.model)}">`:'<div class="car-photo-placeholder">E36</div>'}${c.primary?'<span class="car-primary">HLAVNÍ AUTO</span>':''}</div><div class="car-body"><small>${esc(c.body)} · ${esc(c.year||'')}</small><h3>${esc(c.nickname||c.model)}</h3><p>${esc(c.model)}${c.color?' · '+esc(c.color):''}</p><div class="car-actions"><button data-primary-car="${c.id}">${c.primary?'Hlavní':'Nastavit hlavní'}</button><button data-delete-car="${c.id}">Odebrat</button></div></div></article>`).join('');$$('[data-primary-car]').forEach(b=>b.onclick=async()=>{data.cars.forEach(c=>c.primary=c.id===b.dataset.primaryCar);await commit('Hlavní auto změněno')});$$('[data-delete-car]').forEach(b=>b.onclick=async()=>{if(!confirm('Odebrat auto z garáže?'))return;const removedId=b.dataset.deleteCar;data.cars=data.cars.filter(c=>c.id!==removedId);if(data.cars.length&&!data.cars.some(c=>c.primary))data.cars[0].primary=true;await commit('Auto odebráno')});renderCarSelect()}
function renderCarSelect(){const s=$('[data-car-select]');if(!s)return;s.innerHTML=data.cars.length?data.cars.map(c=>`<option value="${c.id}">${esc(c.nickname||c.model)} · ${esc(c.body)}</option>`).join(''):'<option value="">Nejdřív přidej auto do garáže</option>'}
function renderHistory(){const grid=$('[data-history-grid]');grid.innerHTML=data.history.map(h=>`<button class="history-year ${h.attended?'is-attended':''}" data-history-year="${h.year}"><div class="history-year-number">${h.year}</div><div class="history-year-status"><div><b>${h.attended?'ÚČAST PŘIDÁNA':'NEBYL/A JSEM'}</b><small>${h.attended?(h.verified?'Ověřeno United týmem':'Čeká na ověření'):'Klikni pro přidání'}</small></div><span class="history-check">${h.attended?'✓':'+'}</span></div></button>`).join('');$$('[data-history-year]').forEach(b=>b.onclick=async()=>{const h=data.history.find(x=>x.year===+b.dataset.historyYear);h.attended=!h.attended;if(!h.attended){h.verified=false;h.winner=false}await commit(h.attended?`United ${h.year} přidáno do historie`:`United ${h.year} odebráno`)})}
function renderReservation(){
  const r=data.reservation;
  const miniStatus=$('[data-reservation-status]'),year=$('[data-res-year]'),title=$('[data-res-title]'),car=$('[data-res-car]');
  const mailState=$('[data-reservation-mail-state]');
  if(!r){
    miniStatus.textContent='Žádná aktivní';year.textContent='—';title.textContent='Příští United';car.textContent='Vyber auto z garáže při potvrzení rezervace.';
    $('[data-reservation-state-label]').textContent='Bez aktivní rezervace';$('[data-reservation-year]').textContent='—';$('[data-reservation-title]').textContent='Příští E36 United';$('[data-reservation-summary]').innerHTML='';
    if(mailState){mailState.classList.remove('is-confirmed');mailState.querySelector('span').textContent='Phase 1: rezervace se ukládá lokálně v tomto prohlížeči.'}
    return;
  }
  const confirmed=r.status==='confirmed';
  const isDraft=r.status==='draft';
  const isLocal=!confirmed&&!isDraft;
  if(reservationForm){
    if(reservationForm.elements.carId&&r.carId)reservationForm.elements.carId.value=r.carId;
    if(reservationForm.elements.arrival)reservationForm.elements.arrival.value=r.arrival||'Pátek';
    if(reservationForm.elements.crew)reservationForm.elements.crew.value=r.crew||2;
    if(reservationForm.elements.sleep)reservationForm.elements.sleep.value=r.sleep||'Chatka';
    if(reservationForm.elements.showshine)reservationForm.elements.showshine.value=r.showshine||'Ne';
    if(reservationForm.elements.note)reservationForm.elements.note.value=r.note||'';
    syncMemberSleep();
  }
  miniStatus.textContent=confirmed?'Potvrzeno':(isDraft?'Rozpracováno':(isLocal?'Uloženo lokálně':'Čeká na e-mail'));year.textContent=r.year||'NEXT';title.textContent=r.title||'United rezervace';car.textContent=r.carSnapshot?`${r.carSnapshot.nickname||r.carSnapshot.model} · ${r.carSnapshot.body}`:'Auto zatím není vybrané';
  $('[data-reservation-state-label]').textContent=confirmed?'Rezervace potvrzena':(isDraft?'Rezervace z Weekend Planneru':(isLocal?'Rezervace uložená lokálně':'Čeká na potvrzení e-mailem'));$('[data-reservation-year]').textContent=r.year||'NEXT';$('[data-reservation-title]').textContent=r.title||'E36 United';
  $('[data-reservation-description]').textContent=confirmed?'Rezervace je potvrzená a napárovaná na konkrétní snapshot auta z tvojí garáže.':(isDraft?'Výběr z Weekend Planneru je už uložený v profilu. Vyber auto a rezervaci ulož.':(isLocal?'Rezervace je uložená v tomto prohlížeči. Napojení rezervací na Worker přijde v další fázi.':'Rezervace je uložená lokálně v tomto prohlížeči.'));
  const sleep = r.arrival==='Jen na otočku' ? 'Bez ubytování' : r.sleep;
  const statusText=confirmed?'POTVRZENO':(isDraft?'ROZPRACOVÁNO':'ULOŽENO LOKÁLNĚ');
  $('[data-reservation-summary]').innerHTML=`<div><small>AUTO</small><b>${esc(r.carSnapshot?.nickname||r.carSnapshot?.model||'—')}</b></div><div><small>PŘÍJEZD</small><b>${esc(r.arrival||'—')}</b></div><div><small>POSÁDKA</small><b>${esc(r.crew)} osoby</b></div><div><small>UBYTOVÁNÍ</small><b>${esc(sleep||'—')}</b></div><div><small>SHOW & SHINE</small><b>${esc(r.showshine)}</b></div><div><small>STATUS</small><b>${statusText}</b></div>`;
  if(mailState){mailState.classList.toggle('is-confirmed',confirmed);mailState.querySelector('span').textContent=confirmed?'Rezervace je potvrzená.':(isDraft?'Výběr je připravený k lokálnímu uložení.':'Phase 1: rezervace zůstává lokálně v tomto prohlížeči.')}
}
function renderRewards(){const p=points(),life=lifetimePoints();$('[data-reward-score]').textContent=p;const lock=$('[data-reward-lock]');lock.classList.toggle('is-unlocked',p>=12);lock.querySelector('span').textContent=p>=12?'UNLOCKED':'LOCKED';$('[data-reward-remaining]').textContent=p>=12?'United Merch reward je aktivní':`${12-p} bodů zbývá`;$('[data-points-ledger]').innerHTML=`<div class="ledger-item"><span>OVĚŘENÁ ÚČAST</span><b>+${portalConfig.points.attendance} body</b><small>Za každý potvrzený United.</small></div><div class="ledger-item"><span>SHOW & SHINE WIN</span><b>+${portalConfig.points.showShineWin} body</b><small>Po potvrzení výsledku organizátorem.</small></div><div class="ledger-item"><span>LIFETIME SCORE</span><b>${life} bodů</b><small>Celoživotní skóre se nemaže po rewardu.</small></div>`;const perks=[['⚡','Early registration','Členové dostanou registraci dřív.',verified()>=1],['◆','Member-only United Merch','Přístup k vybraným dropům.',verified()>=1],['12','United Merch reward','Odměna po dosažení 12 / 12.',p>=12],['★','Community voting','Hlasování o vybraných aktivitách.',verified()>=3],['⌁','Priority accommodation','Dřívější přístup k vybranému ubytování.',verified()>=5]];$('[data-perks-list]').innerHTML=perks.map(x=>`<div class="perk ${x[3]?'':'is-locked'}"><i>${x[0]}</i><div><b>${x[1]}</b><small>${x[2]}</small></div><span>${x[3]?'ACTIVE':'LOCKED'}</span></div>`).join('')}

const reservationForm=$('[data-reservation-form]');
const arrivalSelect=reservationForm?.elements?.arrival;
const sleepField=$('[data-member-sleep-field]');
function syncMemberSleep(){
  if(!reservationForm||!arrivalSelect||!sleepField)return;
  const dayPass=arrivalSelect.value==='Jen na otočku';
  sleepField.hidden=dayPass;
  if(dayPass)reservationForm.elements.sleep.value='Bez ubytování';
}
arrivalSelect?.addEventListener('change',syncMemberSleep);syncMemberSleep();

reservationForm?.addEventListener('submit',async e=>{
  e.preventDefault();
  const fd=new FormData(e.currentTarget),car=data.cars.find(c=>c.id===fd.get('carId'));
  if(!car)return toast('Nejdřív přidej auto do garáže.');
  const arrival=fd.get('arrival')||'Pátek';
  const sleep=arrival==='Jen na otočku'?'Bez ubytování':fd.get('sleep');
  data.reservation={year:'NEXT',title:'Příští E36 United',carId:car.id,carSnapshot:{id:car.id,nickname:car.nickname,model:car.model,body:car.body,year:car.year,color:car.color,photo:car.photos?.[0]||''},arrival,crew:+fd.get('crew'),sleep,showshine:fd.get('showshine'),note:fd.get('note'),status:'local_saved',updatedAt:new Date().toISOString()};
  await commit('Rezervace uložena lokálně');
});

const carModal=$('[data-car-modal]');$('[data-open-car]').onclick=()=>{carModal.hidden=false;document.body.classList.add('modal-open')};$$('[data-close-car]').forEach(b=>b.onclick=()=>{carModal.hidden=true;document.body.classList.remove('modal-open')});
$('[data-car-form]').addEventListener('submit',async e=>{
  e.preventDefault();
  const fd=new FormData(e.currentTarget),files=[...e.currentTarget.elements.photos.files].slice(0,3),carId=uid();
  const photos=[];
  try{
    for(let i=0;i<files.length;i++)photos.push(await compressImageDataUrl(files[i]));
  }catch(err){console.warn(err);return toast('Fotky se nepodařilo uložit lokálně.');}
  const car={id:carId,nickname:fd.get('nickname'),body:fd.get('body'),model:fd.get('model'),year:fd.get('year'),color:fd.get('color'),plate:fd.get('plate'),primary:fd.get('primary')==='on'||!data.cars.length,photos};
  if(car.primary)data.cars.forEach(c=>c.primary=false);data.cars.push(car);carModal.hidden=true;document.body.classList.remove('modal-open');e.currentTarget.reset();await commit('Auto přidáno do lokální garáže');
});
async function compressImageBlob(file,max=1600,quality=.78){return await new Promise((resolve,reject)=>{const img=new Image,reader=new FileReader;reader.onload=()=>img.src=reader.result;reader.onerror=reject;img.onload=()=>{const scale=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);c.getContext('2d').drawImage(img,0,0,c.width,c.height);c.toBlob(blob=>blob?resolve(blob):reject(new Error('image_compression_failed')),'image/jpeg',quality)};reader.readAsDataURL(file)})}
async function compressImageDataUrl(file){const blob=await compressImageBlob(file,900,.62);return await new Promise((resolve,reject)=>{const r=new FileReader;r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob)})}
async function applyPlannerDraft(){
  const raw=localStorage.getItem(plannerDraftKey)||localStorage.getItem('e36UnitedReservationDraftV20');if(!raw||!reservationForm)return;
  try{
    const draft=JSON.parse(raw);if(!draft)return;
    if(reservationForm.elements.arrival)reservationForm.elements.arrival.value=draft.arrival||'Pátek';
    if(reservationForm.elements.crew)reservationForm.elements.crew.value=draft.people||2;
    if(reservationForm.elements.sleep)reservationForm.elements.sleep.value=draft.arrival==='Jen na otočku'?'Bez ubytování':(draft.sleep||'Chatka');
    const showMap={'Chci soutěžit':'Ano','Jedu se podívat':'Ne','Možná':'Možná'};
    if(reservationForm.elements.showshine)reservationForm.elements.showshine.value=showMap[draft.showshine]||draft.showshine||'Ne';
    syncMemberSleep();
    const selectedCar=data.cars.find(c=>c.primary)||data.cars[0]||null;
    data.reservation={year:'NEXT',title:'Příští E36 United',carId:selectedCar?.id||'',carSnapshot:selectedCar?{id:selectedCar.id,nickname:selectedCar.nickname,model:selectedCar.model,body:selectedCar.body,year:selectedCar.year,color:selectedCar.color,photo:selectedCar.photos?.[0]||''}:null,arrival:draft.arrival||'Pátek',crew:+(draft.people||2),sleep:draft.arrival==='Jen na otočku'?'Bez ubytování':(draft.sleep||'Chatka'),showshine:showMap[draft.showshine]||draft.showshine||'Ne',note:'',status:'draft',source:'weekend_planner',updatedAt:new Date().toISOString()};
    saveLocal();openSection('reservation');
    localStorage.removeItem(plannerDraftKey);localStorage.removeItem('e36UnitedReservationDraftV20');
    toast(selectedCar?'Rezervace z Weekend Planneru je už v profilu. Zkontroluj ji a ulož.':'Rezervace z Weekend Planneru je už v profilu. Přidej nebo vyber auto a ulož ji.');
  }catch(err){console.warn(err);localStorage.removeItem(plannerDraftKey);localStorage.removeItem('e36UnitedReservationDraftV20')}
}

// Mobile nav
const menuBtn=$('.menu-btn'),nav=$('.nav-links');if(menuBtn&&nav)menuBtn.addEventListener('click',()=>{const o=document.body.classList.toggle('menu-open');menuBtn.setAttribute('aria-expanded',String(o));nav.classList.toggle('open',o)});

initFirebase();
