import { firebaseConfig, portalConfig } from './firebase-config.js?v=20260823-auth2';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const apiBaseUrl=(portalConfig.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'');
const money=new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:0});
const dateTime=new Intl.DateTimeFormat('cs-CZ',{dateStyle:'medium',timeStyle:'short'});
let currentUser=null;
let loading=false;
let reservationItems=[];
let reservationFilter='pending';
let galleryItems=[];
let galleryFilter='pending';
let selectedGalleryId=null;
let lightboxReturnFocus=null;
const galleryMediaUrls=new Map();
const galleryMediaPromises=new Map();
const galleryMediaTokens=new Map();
const reservationFilterLabels={pending:'Žádosti',approved:'Schválené',rejected:'Zamítnuté',cancelled:'Zrušené',all:'Všechny'};
const galleryFilterLabels={pending:'Žádosti',approved:'Schválené',rejected:'Zamítnuté',all:'Všechny'};

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
await setPersistence(auth,browserLocalPersistence);

function setView(name){
  $('[data-auth-view]').hidden=name!=='auth';
  $('[data-denied-view]').hidden=name!=='denied';
  $('[data-admin-view]').hidden=name!=='admin';
}
function toast(message){const el=$('[data-toast]');el.textContent=message;el.classList.add('is-visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('is-visible'),3200)}
function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
function numeric(value){return Number(value||0)}
function formatMoney(value){return money.format(numeric(value))}
function formatDate(value,withTime=true){if(!value)return '—';const normalized=/Z$|[+-]\d\d:\d\d$/.test(value)?value:`${value.replace(' ','T')}Z`;const date=new Date(normalized);if(Number.isNaN(date.getTime()))return value;return withTime?dateTime.format(date):new Intl.DateTimeFormat('cs-CZ',{dateStyle:'medium'}).format(date)}
function statusLabel(status){return({pending:'Čeká',approved:'Schválená',rejected:'Zamítnutá',cancelled:'Zrušená'})[status]||status||'—'}
function galleryStatusLabel(status){return({pending:'Čeká na schválení',approved:'Schválena',rejected:'Zamítnuta'})[status]||status||'—'}
function paymentLabel(status){return({paid:'Zaplaceno',unpaid:'Nezaplaceno',overdue:'Po splatnosti',early_paid:'Zaplaceno předem',refunded:'Vráceno'})[status]||status||'—'}
function attendanceLabel(type){return({full_weekend:'Full weekend',saturday_only:'Sobota',day_visit:'Day visit'})[type]||type||'—'}

async function apiRequest(path,{method='GET',body,retry=true}={}){
  if(!currentUser)throw new Error('Přihlášení vypršelo.');
  const token=await currentUser.getIdToken(!retry);
  const response=await fetch(`${apiBaseUrl}${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  if(response.status===401&&retry)return apiRequest(path,{method,body,retry:false});
  const text=await response.text();let payload={};try{payload=text?JSON.parse(text):{}}catch{payload={message:text}}
  if(!response.ok){const error=new Error(payload.message||payload.error||`API ${response.status}`);error.status=response.status;throw error}
  return payload;
}

async function apiMedia(path,{retry=true}={}){
  if(!currentUser)throw new Error('Přihlášení vypršelo.');
  const token=await currentUser.getIdToken(!retry);
  const response=await fetch(`${apiBaseUrl}${path}`,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
  if(response.status===401&&retry)return apiMedia(path,{retry:false});
  if(!response.ok){
    const text=await response.text();let payload={};try{payload=text?JSON.parse(text):{}}catch{payload={message:text}}
    const error=new Error(payload.message||payload.error||`API ${response.status}`);error.status=response.status;throw error;
  }
  return response.blob();
}

function setLoading(active){loading=active;$('[data-loading]').hidden=!active;$$('[data-refresh], [data-review-action], [data-gallery-action]').forEach(button=>button.disabled=active)}
function setDenied(){closeGalleryLightbox();setView('denied')}
function setBar(selector,value,total){$(selector).style.width=`${total?Math.min(100,(numeric(value)/total)*100):0}%`}

function renderOverview(payload){
  const event=payload.event;
  const overview=payload.overview||{};
  const statuses=overview.statuses||{};
  const attendance=overview.attendance||{};
  const show=overview.showShine||{};
  const accommodation=overview.accommodation||{};
  const payments=overview.payments||{};
  const gallery=overview.gallery||{};
  $('[data-event-year]').textContent=event?.year||'—';
  $('[data-event-state]').textContent=event?`Registrace: ${event.registrationStatus||'—'}`:'Žádný event v databázi';
  $('[data-kpi-reservations]').textContent=numeric(overview.reservations);
  $('[data-kpi-people]').textContent=numeric(overview.people);
  $('[data-kpi-cars]').textContent=numeric(overview.cars);
  $('[data-kpi-pending]').textContent=numeric(statuses.pending);
  $('[data-kpi-payments]').textContent=`${numeric(payments.paid)+numeric(payments.earlyPaid)} / ${numeric(payments.unpaid)+numeric(payments.overdue)}`;
  $('[data-kpi-gallery-pending]').textContent=numeric(gallery.pending);
  $('[data-gallery-nav-count]').textContent=numeric(gallery.pending);
  $('[data-capacity-reservations]').textContent=event?.reservationCapacity?`kapacita ${event.reservationCapacity}`:'kapacita —';

  const attendanceTotal=numeric(attendance.fullWeekend)+numeric(attendance.saturdayOnly)+numeric(attendance.dayVisit);
  $('[data-attendance-full]').textContent=numeric(attendance.fullWeekend);$('[data-attendance-saturday]').textContent=numeric(attendance.saturdayOnly);$('[data-attendance-day]').textContent=numeric(attendance.dayVisit);
  setBar('[data-bar-full]',attendance.fullWeekend,attendanceTotal);setBar('[data-bar-saturday]',attendance.saturdayOnly,attendanceTotal);setBar('[data-bar-day]',attendance.dayVisit,attendanceTotal);

  const showTotal=numeric(show.yes)+numeric(show.no)+numeric(show.maybe);
  $('[data-show-total]').textContent=showTotal;$('[data-show-yes]').textContent=numeric(show.yes);$('[data-show-no]').textContent=numeric(show.no);$('[data-show-maybe]').textContent=numeric(show.maybe);
  const yesDegrees=showTotal?(numeric(show.yes)/showTotal)*360:0;
  const maybeDegrees=showTotal?((numeric(show.yes)+numeric(show.maybe))/showTotal)*360:0;
  $('[data-show-ring]').style.background=`conic-gradient(#4da3ff 0 ${yesDegrees}deg,#76b9ff ${yesDegrees}deg ${maybeDegrees}deg,rgba(255,255,255,.08) ${maybeDegrees}deg 360deg)`;

  const accommodationCapacity=numeric(event?.accommodationCapacity);
  $('[data-accommodation-occupancy]').textContent=`${numeric(accommodation.units)} / ${accommodationCapacity||'—'}`;
  $('[data-accommodation-cabin]').textContent=numeric(accommodation.cabin);$('[data-accommodation-tent]').textContent=numeric(accommodation.tent);$('[data-accommodation-none]').textContent=numeric(accommodation.none);
  setBar('[data-accommodation-bar]',accommodation.units,accommodationCapacity);

  const commitment=numeric(event?.bookingCommitmentCzk);
  const collected=numeric(payments.amountPaidCzk);
  const paid=numeric(event?.bookingPaidCzk);
  $('[data-booking-commitment]').textContent=formatMoney(commitment);$('[data-booking-due]').textContent=formatDate(event?.bookingDueAt,false);
  $('[data-booking-capacity]').textContent=accommodationCapacity||'—';$('[data-booking-reserved]').textContent=numeric(accommodation.units);
  $('[data-booking-collected]').textContent=formatMoney(collected);$('[data-booking-paid]').textContent=formatMoney(paid);
  $('[data-booking-gap]').textContent=formatMoney(Math.max(0,commitment-collected));
}

function recordsLabel(count){return `${count} ${count===1?'záznam':count>1&&count<5?'záznamy':'záznamů'}`}
function photosLabel(count){return `${count} ${count===1?'fotografie':count>1&&count<5?'fotografie':'fotografií'}`}
function renderReservationTabs(){
  $$('[data-reservation-filter]').forEach(button=>{
    const filter=button.dataset.reservationFilter;
    const count=filter==='all'?reservationItems.length:reservationItems.filter(item=>item.status===filter).length;
    const counter=$(`[data-reservation-filter-count="${filter}"]`,button);
    if(counter)counter.textContent=count;
    const active=filter===reservationFilter;
    button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  });
}
function reservationActions(item){
  const actions=[
    {status:'pending',label:'Vrátit k posouzení',className:'pending'},
    {status:'approved',label:'Schválit',className:'approve'},
    {status:'rejected',label:'Zamítnout',className:'reject'},
  ];
  return actions.filter(action=>action.status!==item.status).map(action=>`<button class="admin-button ${action.className}" data-review-action="${action.status}" type="button">${action.label}</button>`).join('');
}
function renderReservationList(){
  const reservations=reservationFilter==='all'?reservationItems:reservationItems.filter(item=>item.status===reservationFilter);
  $('[data-reservation-count]').textContent=reservationFilter==='all'?recordsLabel(reservations.length):`${recordsLabel(reservations.length)} z ${reservationItems.length}`;
  const list=$('[data-reservation-list]');
  if(!reservations.length){list.innerHTML=`<div class="admin-empty">V záložce ${escapeHtml(reservationFilterLabels[reservationFilter].toLowerCase())} nejsou žádné rezervace.</div>`;return}
  list.innerHTML=reservations.map(item=>{
    const member=item.member||{};const car=item.carSnapshot||{};
    const memberTitle=member.nickname||member.name||member.email||'United member';
    const carTitle=[car.nickname,car.model].filter(Boolean).join(' · ')||'Auto bez názvu';
    const note=item.note||'Bez poznámky člena.';
    const review=item.reviewNote?`Poslední admin poznámka: ${item.reviewNote}`:'';
    return `<article class="admin-reservation" data-reservation-id="${escapeHtml(item.id)}">
      <div class="admin-reservation-main">
        <div><h3>${escapeHtml(memberTitle)}</h3><p>${escapeHtml(member.name)} · ${escapeHtml(member.memberCode)}<br/>${escapeHtml(member.email)}</p></div>
        <div><h3>${escapeHtml(carTitle)}</h3><p>${escapeHtml([car.body,car.year,car.color].filter(Boolean).join(' · '))}</p></div>
        <div class="admin-reservation-cell"><span>Příjezd / účast</span><b>${escapeHtml(item.arrival||'—')}</b><small>${escapeHtml(attendanceLabel(item.attendanceType))}</small></div>
        <div class="admin-reservation-cell"><span>Posádka</span><b>${numeric(item.crew)} osob</b><small>${escapeHtml(item.accommodation||'—')} · ${numeric(item.accommodationUnits)} míst</small></div>
        <div class="admin-reservation-cell"><span>Show &amp; Shine</span><b>${escapeHtml(item.showShine||'Ne')}</b><small>${escapeHtml(paymentLabel(item.paymentStatus))} · ${escapeHtml(formatMoney(item.amountPaidCzk))} / ${escapeHtml(formatMoney(item.amountDueCzk))}</small></div>
        <div class="admin-reservation-cell"><span>Stav</span><small class="admin-badge admin-badge--${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</small><small>${escapeHtml(formatDate(item.updatedAt||item.submittedAt))}</small></div>
      </div>
      <div class="admin-reservation-detail">
        <p class="admin-reservation-note">${escapeHtml(note)}${review?`<br/><small>${escapeHtml(review)}</small>`:''}</p>
        <div class="admin-review"><input maxlength="1000" data-review-note placeholder="Krátká admin poznámka (hlavně při zamítnutí)" value="${escapeHtml(item.reviewNote||'')}"/><div class="admin-review-actions">${reservationActions(item)}</div></div>
      </div>
    </article>`;
  }).join('');
}
function renderReservations(payload){reservationItems=Array.isArray(payload.reservations)?payload.reservations:[];renderReservationTabs();renderReservationList()}
function setReservationFilter(filter,scroll=false){
  if(!reservationFilterLabels[filter])return;
  reservationFilter=filter;renderReservationTabs();renderReservationList();
  if(scroll)$('[data-reservation-tabs]')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function galleryActions(item){
  const actions=[
    {status:'pending',label:'Vrátit k posouzení',className:'pending'},
    {status:'approved',label:'Schválit',className:'approve'},
    {status:'rejected',label:'Zamítnout',className:'reject'},
  ];
  return actions.filter(action=>action.status!==item.status).map(action=>`<button class="admin-button ${action.className}" data-gallery-action="${action.status}" type="button">${action.label}</button>`).join('');
}
function galleryIdentity(item){const member=item.member||{};return member.nickname||member.name||member.email||'United member'}
function galleryMeta(item){const member=item.member||{};return [member.name,member.memberCode,member.email].filter(Boolean).join(' · ')}
function galleryCard(item){
  return `<article class="admin-gallery-card" data-gallery-id="${escapeHtml(item.id)}">
    <button aria-label="Otevřít náhled fotografie od ${escapeHtml(galleryIdentity(item))}" class="admin-gallery-image" data-gallery-preview="${escapeHtml(item.id)}" type="button">
      <img alt="Fotografie od ${escapeHtml(galleryIdentity(item))}" data-gallery-media="${escapeHtml(item.id)}"/>
      <span>Otevřít náhled</span>
    </button>
    <div class="admin-gallery-card-body">
      <div class="admin-gallery-card-head"><div><h3>${escapeHtml(galleryIdentity(item))}</h3><p>${escapeHtml(galleryMeta(item))}</p></div><small class="admin-badge admin-badge--${escapeHtml(item.status)}">${escapeHtml(galleryStatusLabel(item.status))}</small></div>
      <p class="admin-gallery-caption">${escapeHtml(item.caption||'Bez popisku.')}</p>
      <small class="admin-gallery-date">Nahráno ${escapeHtml(formatDate(item.createdAt))}</small>
      <div class="admin-gallery-review"><textarea data-gallery-review-note maxlength="1000" placeholder="Krátká admin poznámka">${escapeHtml(item.reviewNote||'')}</textarea><div class="admin-review-actions">${galleryActions(item)}</div></div>
    </div>
  </article>`;
}
function renderGalleryTabs(){
  $$('[data-gallery-filter]').forEach(button=>{
    const filter=button.dataset.galleryFilter;
    const count=filter==='all'?galleryItems.length:galleryItems.filter(item=>item.status===filter).length;
    $(`[data-gallery-filter-count="${filter}"]`,button).textContent=count;
    const active=filter===galleryFilter;
    button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  });
}
function renderGalleryCounts(){
  const pending=galleryItems.filter(item=>item.status==='pending').length;
  $('[data-kpi-gallery-pending]').textContent=pending;
  $('[data-gallery-nav-count]').textContent=pending;
}
function renderGalleryList(){
  const photos=galleryFilter==='all'?galleryItems:galleryItems.filter(item=>item.status===galleryFilter);
  const neededIds=new Set(photos.map(item=>item.id));if(selectedGalleryId)neededIds.add(selectedGalleryId);pruneGalleryMedia(neededIds);
  $('[data-gallery-count]').textContent=galleryFilter==='all'?photosLabel(photos.length):`${photosLabel(photos.length)} z ${galleryItems.length}`;
  const list=$('[data-gallery-list]');
  if(!photos.length){list.innerHTML=`<div class="admin-empty">V záložce ${escapeHtml(galleryFilterLabels[galleryFilter].toLowerCase())} nejsou žádné fotografie.</div>`;return}
  list.innerHTML=photos.map(galleryCard).join('');
  hydrateGalleryMedia(list);
}
function renderGallery(payload){galleryItems=Array.isArray(payload.photos)?payload.photos:[];renderGalleryTabs();renderGalleryCounts();renderGalleryList()}
function setGalleryFilter(filter,scroll=false){
  if(!galleryFilterLabels[filter])return;
  galleryFilter=filter;renderGalleryTabs();renderGalleryList();
  if(scroll)$('[data-gallery-tabs]')?.scrollIntoView({behavior:'smooth',block:'start'});
}

async function galleryMediaUrl(id){
  if(galleryMediaUrls.has(id))return galleryMediaUrls.get(id);
  if(galleryMediaPromises.has(id))return galleryMediaPromises.get(id);
  const token={};galleryMediaTokens.set(id,token);
  const promise=apiMedia(`/api/admin/gallery/media/${encodeURIComponent(id)}`).then(blob=>{
    if(galleryMediaTokens.get(id)!==token||!currentUser)throw new Error('Náhled už není potřeba.');
    const url=URL.createObjectURL(blob);galleryMediaUrls.set(id,url);return url;
  }).finally(()=>{if(galleryMediaTokens.get(id)===token)galleryMediaTokens.delete(id);if(galleryMediaPromises.get(id)===promise)galleryMediaPromises.delete(id)});
  galleryMediaPromises.set(id,promise);return promise;
}
function hydrateGalleryMedia(root=document){
  $$('[data-gallery-media]',root).forEach(async image=>{
    if(image.dataset.loaded==='true')return;
    try{image.src=await galleryMediaUrl(image.dataset.galleryMedia);image.dataset.loaded='true';image.closest('.admin-gallery-image, .admin-gallery-lightbox-media')?.classList.add('is-loaded')}
    catch{image.alt='Náhled fotografie se nepodařilo načíst.';image.closest('.admin-gallery-image, .admin-gallery-lightbox-media')?.classList.add('is-error')}
  });
}
function releaseGalleryMediaId(id){const url=galleryMediaUrls.get(id);if(url)URL.revokeObjectURL(url);galleryMediaUrls.delete(id);galleryMediaTokens.delete(id);galleryMediaPromises.delete(id)}
function pruneGalleryMedia(neededIds){const knownIds=new Set([...galleryMediaUrls.keys(),...galleryMediaTokens.keys()]);knownIds.forEach(id=>{if(!neededIds.has(id))releaseGalleryMediaId(id)})}
function releaseGalleryMedia(){pruneGalleryMedia(new Set())}

function renderGalleryLightbox(){
  const item=galleryItems.find(photo=>photo.id===selectedGalleryId);
  if(!item){closeGalleryLightbox();return}
  const content=$('[data-gallery-lightbox-content]');
  content.innerHTML=`<article class="admin-gallery-lightbox-card" data-gallery-id="${escapeHtml(item.id)}">
    <div class="admin-gallery-lightbox-media"><img alt="Fotografie od ${escapeHtml(galleryIdentity(item))}" data-gallery-media="${escapeHtml(item.id)}"/></div>
    <div class="admin-gallery-lightbox-info">
      <span class="admin-kicker">FOTOGRAFIE ČLENA</span><h2 id="admin-gallery-lightbox-title">${escapeHtml(galleryIdentity(item))}</h2><p>${escapeHtml(galleryMeta(item))}</p>
      <small class="admin-badge admin-badge--${escapeHtml(item.status)}">${escapeHtml(galleryStatusLabel(item.status))}</small>
      <p class="admin-gallery-caption">${escapeHtml(item.caption||'Bez popisku.')}</p><small class="admin-gallery-date">Nahráno ${escapeHtml(formatDate(item.createdAt))}</small>
      <div class="admin-gallery-review"><textarea data-gallery-review-note maxlength="1000" placeholder="Krátká admin poznámka">${escapeHtml(item.reviewNote||'')}</textarea><div class="admin-review-actions">${galleryActions(item)}</div></div>
    </div>
  </article>`;
  hydrateGalleryMedia(content);
}
function openGalleryLightbox(id,source){
  if(!galleryItems.some(item=>item.id===id))return;
  selectedGalleryId=id;lightboxReturnFocus=source||document.activeElement;renderGalleryLightbox();
  $('[data-gallery-lightbox]').hidden=false;document.body.classList.add('admin-lightbox-open');
  $('[data-gallery-lightbox-close]:not(.admin-gallery-lightbox-backdrop)')?.focus();
}
function closeGalleryLightbox(){
  const closingId=selectedGalleryId;const lightbox=$('[data-gallery-lightbox]');if(lightbox)lightbox.hidden=true;
  document.body.classList.remove('admin-lightbox-open');selectedGalleryId=null;
  if(closingId){const visible=galleryFilter==='all'||galleryItems.some(item=>item.id===closingId&&item.status===galleryFilter);if(!visible)releaseGalleryMediaId(closingId)}
  if(lightboxReturnFocus?.isConnected)lightboxReturnFocus.focus();lightboxReturnFocus=null;
}

async function loadAdminData(){
  if(loading)return;setLoading(true);
  try{
    const [overview,reservations,gallery]=await Promise.all([apiRequest('/api/admin/overview'),apiRequest('/api/admin/reservations'),apiRequest('/api/admin/gallery')]);
    renderOverview(overview);renderReservations(reservations);renderGallery(gallery);setView('admin');
  }catch(error){if(error.status===403){setDenied();return}toast(error.message||'Admin data se nepodařilo načíst.')}finally{setLoading(false)}
}

async function updateReservation(card,status){
  const button=card.querySelector(`[data-review-action="${status}"]`);const note=$('[data-review-note]',card)?.value||'';const reservationId=card.dataset.reservationId;
  if(button)button.disabled=true;
  try{
    await apiRequest(`/api/admin/reservations/${encodeURIComponent(reservationId)}`,{method:'PATCH',body:{status,reviewNote:note}});
    const reservation=reservationItems.find(item=>item.id===reservationId);if(reservation){reservation.status=status;reservation.reviewNote=note;renderReservationTabs();renderReservationList()}
    const messages={pending:'Rezervace byla vrácena k posouzení.',approved:'Rezervace byla schválena.',rejected:'Rezervace byla zamítnuta.'};toast(messages[status]||'Stav rezervace byl změněn.');
    await loadAdminData();
  }
  catch(error){if(error.status===403){setDenied();return}toast(error.message||'Rezervaci se nepodařilo změnit.')}finally{if(button)button.disabled=false}
}

async function updateGallery(container,status){
  const submissionId=container.dataset.galleryId;const note=$('[data-gallery-review-note]',container)?.value||'';
  $$('[data-gallery-action]',container).forEach(button=>button.disabled=true);
  try{
    await apiRequest(`/api/admin/gallery/${encodeURIComponent(submissionId)}`,{method:'PATCH',body:{status,reviewNote:note}});
    const item=galleryItems.find(photo=>photo.id===submissionId);if(item){item.status=status;item.reviewNote=note}
    renderGalleryTabs();renderGalleryCounts();renderGalleryList();if(selectedGalleryId===submissionId)renderGalleryLightbox();
    const messages={pending:'Fotografie byla vrácena k posouzení.',approved:'Fotografie byla schválena.',rejected:'Fotografie byla zamítnuta.'};toast(messages[status]||'Stav fotografie byl změněn.');
  }catch(error){if(error.status===403){setDenied();return}toast(error.message||'Fotografii se nepodařilo změnit.')}finally{$$('[data-gallery-action]',container).forEach(button=>button.disabled=false)}
}

function jumpToSection(section){
  const target=section==='dashboard'?$('.admin-kpis'):$(`[data-admin-section="${section}"]`);
  target?.scrollIntoView({behavior:'smooth',block:'start'});
}

$('[data-login-form]').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('button[type="submit"]',event.currentTarget);const form=new FormData(event.currentTarget);button.disabled=true;$('[data-auth-status]').textContent='';
  try{await signInWithEmailAndPassword(auth,String(form.get('email')||'').trim(),String(form.get('password')||''))}
  catch(error){$('[data-auth-status]').textContent=error.code==='auth/invalid-credential'?'Neplatný e-mail nebo heslo.':'Přihlášení se nepodařilo.'}finally{button.disabled=false}
});

document.addEventListener('click',event=>{
  const logout=event.target.closest('[data-logout]');if(logout){signOut(auth);return}
  const refresh=event.target.closest('[data-refresh]');if(refresh){loadAdminData();return}
  const jump=event.target.closest('[data-admin-jump]');if(jump){jumpToSection(jump.dataset.adminJump);return}
  const filter=event.target.closest('[data-reservation-filter]');if(filter){setReservationFilter(filter.dataset.reservationFilter);return}
  const pending=event.target.closest('[data-open-pending]');if(pending){setReservationFilter('pending',true);return}
  const galleryPending=event.target.closest('[data-open-gallery-pending]');if(galleryPending){setGalleryFilter('pending',true);return}
  const galleryFilterButton=event.target.closest('[data-gallery-filter]');if(galleryFilterButton){setGalleryFilter(galleryFilterButton.dataset.galleryFilter);return}
  const preview=event.target.closest('[data-gallery-preview]');if(preview){openGalleryLightbox(preview.dataset.galleryPreview,preview);return}
  if(event.target.closest('[data-gallery-lightbox-close]')){closeGalleryLightbox();return}
  const galleryAction=event.target.closest('[data-gallery-action]');if(galleryAction){const card=galleryAction.closest('[data-gallery-id]');if(card)updateGallery(card,galleryAction.dataset.galleryAction);return}
  const action=event.target.closest('[data-review-action]');if(action){const card=action.closest('[data-reservation-id]');if(card)updateReservation(card,action.dataset.reviewAction)}
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('[data-gallery-lightbox]').hidden){closeGalleryLightbox();return}
  if((event.key==='Enter'||event.key===' ')&&event.target.closest('[data-open-pending]')){event.preventDefault();setReservationFilter('pending',true)}
  if((event.key==='Enter'||event.key===' ')&&event.target.closest('[data-open-gallery-pending]')){event.preventDefault();setGalleryFilter('pending',true)}
});

onAuthStateChanged(auth,user=>{
  currentUser=user;
  if(!user){closeGalleryLightbox();releaseGalleryMedia();galleryItems=[];reservationItems=[];setView('auth');$('[data-admin-account]').textContent='';return}
  reservationFilter='pending';galleryFilter='pending';
  $('[data-admin-account]').textContent=user.email||user.uid;
  loadAdminData();
});
