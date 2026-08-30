import { firebaseConfig, portalConfig } from './firebase-config.js?v=20260823-auth2';
import qrcode from './vendor/qrcode-generator.mjs';
import { initPortalNavigation } from './portal-navigation.js?v=20260825-mobile1';
import { ADMIN_VIEW_IDS, RESERVATION_DETAIL_FILTERS, RESERVATION_PRIMARY_FILTERS, RESERVATION_VIEW_MODES, adminItemPayment, filterAdminPayments, filterAdminReservations, paymentMatchesFilter, paymentNeedsAttention, reservationMatchesFilter } from './admin-view-model.js?v=20260827-accommodation1';
import { selectImageFiles } from './image-upload.js?v=20260827-accommodation1';
import { accommodationVisualMarkup, bindAccommodationVisualFallbacks } from './accommodation-visual.js?v=20260827-accommodation1';

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const apiBaseUrl=(portalConfig.apiBaseUrl||'https://api.e36united.cz').replace(/\/$/,'');
const money=new Intl.NumberFormat('cs-CZ',{style:'currency',currency:'CZK',maximumFractionDigits:0});
const dateTime=new Intl.DateTimeFormat('cs-CZ',{dateStyle:'medium',timeStyle:'short'});
let currentUser=null;
let loading=false;
let adminEvents=[];
let selectedEventId='';
let accommodationItems=[];
let reservationItems=[];
let reservationFilter='all';
let reservationDetailFilters=new Set();
let reservationFiltersOpen=false;
let reservationSearch='';
let reservationViewMode=readSessionChoice('e36UnitedAdmin.reservationViewMode',RESERVATION_VIEW_MODES,'quick');
let paymentFilter='attention';
let paymentSearch='';
let activeAdminView=readSessionChoice('e36UnitedAdmin.activeView',ADMIN_VIEW_IDS,'dashboard');
let selectedReservationId=null;
let reservationDrawerReturnFocus=null;
let galleryItems=[];
let galleryFilter='pending';
let galleryMode='community';
let historyClaims=[];
let historyFilter='pending';
let historySearch='';
let historyCounts={attendancePending:0,snsPending:0,pending:0,total:0};
let selectedGalleryId=null;
let lightboxReturnFocus=null;
let historyEvidenceReturnFocus=null;
let adminPortalNavigation=null;
const galleryMediaUrls=new Map();
const galleryMediaPromises=new Map();
const galleryMediaTokens=new Map();
const historyEvidenceUrls=new Map();
const historyEvidencePromises=new Map();
const accommodationPhotoSelections=new Map();
const reservationFilterLabels={all:'Vše',action:'Vyžaduje akci',active:'Aktivní',complete:'Hotové'};
const paymentFilterLabels={attention:'Vyžaduje kontrolu',all:'Vše',unpaid:'K platbě',underpaid:'Doplatek',paid:'Zaplaceno',overpaid:'Přeplatek'};
const galleryFilterLabels={pending:'Žádosti',approved:'Schválené',rejected:'Zamítnuté',all:'Všechny'};
const adminCollapseStorageKey='e36UnitedAdmin.collapsedSections.v1';
const adminCollapsePreferences=readAdminCollapsePreferences();

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
await setPersistence(auth,browserLocalPersistence);

function setView(name){
  $('[data-auth-view]').hidden=name!=='auth';
  $('[data-denied-view]').hidden=name!=='denied';
  $('[data-admin-view]').hidden=name!=='admin';
  if(name==='admin')requestAnimationFrame(()=>setAdminView(activeAdminView,{focus:false}));
}
function toast(message){const el=$('[data-toast]');el.textContent=message;el.classList.add('is-visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('is-visible'),3200)}
function escapeHtml(value=''){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
function numeric(value){return Number(value||0)}
function formatMoney(value){return money.format(numeric(value))}
function formatDate(value,withTime=true){if(!value)return '—';const normalized=/Z$|[+-]\d\d:\d\d$/.test(value)?value:`${value.replace(' ','T')}Z`;const date=new Date(normalized);if(Number.isNaN(date.getTime()))return value;return withTime?dateTime.format(date):new Intl.DateTimeFormat('cs-CZ',{dateStyle:'medium'}).format(date)}
function statusLabel(status){return({pending:'Čeká',approved:'Schválená',rejected:'Zamítnutá',cancelled:'Zrušená'})[status]||status||'—'}
function galleryStatusLabel(status){return({pending:'Čeká na schválení',approved:'Schválena',rejected:'Zamítnuta'})[status]||status||'—'}
function paymentLabel(status){return({paid:'Zaplaceno',unpaid:'K platbě',underpaid:'Doplatek',overpaid:'Přeplatek',not_required:'Bez platby',overdue:'Po splatnosti',early_paid:'Zaplaceno',refunded:'Vráceno'})[status]||status||'—'}
function itemPayment(item){return adminItemPayment(item)}
function paymentQrSvg(spayd){if(!spayd)return '';try{const qr=qrcode(0,'M');qr.addData(spayd,'Byte');qr.make();return qr.createSvgTag({cellSize:4,margin:8,scalable:true})}catch(error){console.error('QR payment render failed',error);return ''}}
function attendanceLabel(type){return({full_weekend:'Full weekend',saturday_only:'Sobota',day_visit:'Day visit'})[type]||type||'—'}
function attendanceShortLabel(item){
  if(item.attendanceType==='full_weekend')return item.arrival==='Pátek'?'Pá → Ne':'Full weekend';
  if(item.attendanceType==='saturday_only')return 'Sobota';
  if(item.attendanceType==='day_visit')return 'Na otočku';
  return item.arrival||'—';
}

function readSessionChoice(key,allowed,fallback){
  try{const value=sessionStorage.getItem(key);return allowed.includes(value)?value:fallback}catch{return fallback}
}
function rememberSessionChoice(key,value){try{sessionStorage.setItem(key,value)}catch{}}

function readAdminCollapsePreferences(){
  try{
    const value=JSON.parse(localStorage.getItem(adminCollapseStorageKey)||'{}');
    return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  }catch{return{}}
}
function hasAdminCollapsePreference(section){return Object.prototype.hasOwnProperty.call(adminCollapsePreferences,section)}
function setAdminSectionCollapsed(section,collapsed,{persist=false,animate=true}={}){
  const container=$(`[data-admin-collapsible="${section}"]`);
  const button=$(`[data-admin-collapse-toggle="${section}"]`,container||document);
  const body=button?.getAttribute('aria-controls')?document.getElementById(button.getAttribute('aria-controls')):null;
  if(!container||!button||!body)return;
  body.getAnimations?.().forEach(animation=>animation.cancel());
  if(!animate){container.classList.toggle('is-collapsed',collapsed);body.style.maxHeight=collapsed?'0px':'none'}
  else if(collapsed){
    body.style.maxHeight=`${body.scrollHeight}px`;body.offsetHeight;
    container.classList.add('is-collapsed');body.style.maxHeight='0px';
  }else{
    container.classList.remove('is-collapsed');body.style.maxHeight='0px';body.offsetHeight;
    body.style.maxHeight=`${body.scrollHeight}px`;
    body.addEventListener('transitionend',()=>{if(!container.classList.contains('is-collapsed'))body.style.maxHeight='none'},{once:true});
  }
  button.setAttribute('aria-expanded',String(!collapsed));
  const label=$('span',button);if(label)label.textContent=collapsed?'Rozbalit':'Sbalit';
  body.setAttribute('aria-hidden',String(collapsed));
  if(persist){
    adminCollapsePreferences[section]=collapsed;
    try{localStorage.setItem(adminCollapseStorageKey,JSON.stringify(adminCollapsePreferences))}catch{}
  }
}
function initializeAdminCollapsibles(){
  $$('[data-admin-collapsible]').forEach(container=>{
    const section=container.dataset.adminCollapsible;
    const collapsed=hasAdminCollapsePreference(section)?!!adminCollapsePreferences[section]:container.dataset.defaultCollapsed==='true';
    setAdminSectionCollapsed(section,collapsed,{animate:false});
  });
}

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

async function apiUpload(path,file,{retry=true}={}){
  if(!currentUser)throw new Error('Přihlášení vypršelo.');
  const token=await currentUser.getIdToken(!retry),body=new FormData();body.append('file',file);
  const response=await fetch(`${apiBaseUrl}${path}`,{method:'PUT',headers:{Authorization:`Bearer ${token}`},body,cache:'no-store'});
  if(response.status===401&&retry)return apiUpload(path,file,{retry:false});
  const text=await response.text();let payload={};try{payload=text?JSON.parse(text):{}}catch{payload={message:text}}
  if(!response.ok){const error=new Error(payload.message||payload.error||`API ${response.status}`);error.status=response.status;throw error}
  return payload;
}

function setLoading(active){loading=active;$('[data-loading]').hidden=!active;$$('[data-refresh], [data-review-action], [data-gallery-action], [data-history-action], [data-accommodation-save], [data-event-settings-form] button').forEach(button=>button.disabled=active);const selector=$('[data-event-select]');if(selector)selector.disabled=active||adminEvents.length<2}
function setDenied(){closeGalleryLightbox();closeReservationDrawer();setView('denied')}
function setBar(selector,value,total){$(selector).style.width=`${total?Math.min(100,(numeric(value)/total)*100):0}%`}

function renderEventSelector(){
  const select=$('[data-event-select]');
  select.innerHTML=adminEvents.map(event=>`<option value="${escapeHtml(event.id)}">United ${numeric(event.year)}${event.isCurrent?' · AKTUÁLNÍ':''}</option>`).join('');
  select.value=selectedEventId;
  select.disabled=loading||adminEvents.length<2;
}

function selectedEvent(){return adminEvents.find(event=>event.id===selectedEventId)||null}

function renderEventSettings(event){
  const form=$('[data-event-settings-form]');
  if(!form||!event)return;
  const year=$('[data-event-settings-year]');if(year)year.textContent=event.year||'—';
  form.elements.registrationStatus.value=event.registrationStatus||'closed';
  form.elements.reservationCapacity.value=numeric(event.reservationCapacity);
  form.elements.fullWeekendNights.value=numeric(event.fullWeekendNights);
  form.elements.saturdayOnlyNights.value=numeric(event.saturdayOnlyNights);
  form.elements.bookingCommitmentCzk.value=numeric(event.bookingCommitmentCzk);
  form.elements.bookingDueAt.value=event.bookingDueAt||'';
  form.elements.bookingPaidCzk.value=numeric(event.bookingPaidCzk);
  form.elements.eventEndAt.value=event.eventEndAt||'';
  form.elements.isCurrent.checked=!!event.isCurrent;
  form.elements.isCurrent.disabled=!!event.isCurrent;
}

function renderOverview(payload){
  const event=payload.event;
  const overview=payload.overview||{};
  const statuses=overview.statuses||{};
  const attendance=overview.attendance||{};
  const show=overview.showShine||{};
  const accommodation=overview.accommodation||{};
  const payments=overview.payments||{};
  const gallery=overview.gallery||{};
  const history=overview.history||{};
  historyCounts={...historyCounts,...history};
  $('[data-event-year]').textContent=event?.year||'—';
  $('[data-event-state]').textContent=event?`${event.isCurrent?'Aktuální event · ':''}Rezervace: ${event.registrationStatus==='open'?'otevřené':'uzavřené'}`:'Žádný event v databázi';
  renderEventSettings(event);
  $('[data-kpi-reservations]').textContent=numeric(overview.reservations);
  $('[data-kpi-people]').textContent=numeric(overview.people);
  $('[data-kpi-cars]').textContent=numeric(overview.cars);
  $('[data-kpi-pending]').textContent=numeric(statuses.pending);
  $('[data-kpi-payments]').textContent=`${numeric(payments.paid)} / ${numeric(payments.unpaid)+numeric(payments.underpaid)}`;
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
  $('[data-payment-total-due]').textContent=formatMoney(payments.amountDueCzk);$('[data-payment-total-paid]').textContent=formatMoney(payments.amountPaidCzk);$('[data-payment-total-remaining]').textContent=formatMoney(payments.amountRemainingCzk);
  $('[data-payment-count-unpaid]').textContent=numeric(payments.unpaid);$('[data-payment-count-underpaid]').textContent=numeric(payments.underpaid);$('[data-payment-count-paid]').textContent=numeric(payments.paid);$('[data-payment-count-overpaid]').textContent=numeric(payments.overpaid);$('[data-payment-count-overdue]').textContent=numeric(payments.overdue);
  const testWarning=$('[data-admin-payment-test]');if(testWarning)testWarning.hidden=!event?.paymentTestMode;
  renderAttentionCounts();
}

function renderAttentionCounts(){
  const pendingReservations=reservationItems.filter(item=>reservationMatchesFilter(item,'action')).length;
  const paymentAttention=reservationItems.filter(paymentNeedsAttention).length;
  const pendingGallery=galleryItems.filter(item=>item.status==='pending').length;
  const reservationAttention=$('[data-attention-reservations]');if(reservationAttention)reservationAttention.textContent=pendingReservations;
  const paymentAttentionElement=$('[data-attention-payments]');if(paymentAttentionElement)paymentAttentionElement.textContent=paymentAttention;
  const galleryAttention=$('[data-attention-gallery]');if(galleryAttention)galleryAttention.textContent=pendingGallery;
  const historyAttention=$('[data-attention-history]');if(historyAttention)historyAttention.textContent=numeric(historyCounts.pending);
  const paymentNav=$('[data-payment-nav-count]');if(paymentNav)paymentNav.textContent=paymentAttention;
}

function recordsLabel(count){return `${count} ${count===1?'záznam':count>1&&count<5?'záznamy':'záznamů'}`}
function photosLabel(count){return `${count} ${count===1?'fotografie':count>1&&count<5?'fotografie':'fotografií'}`}
function renderReservationTabs(){
  $('[data-reservation-nav-count]').textContent=reservationItems.filter(item=>item.status==='pending').length;
  $$('[data-reservation-filter]').forEach(button=>{
    const filter=button.dataset.reservationFilter;
    const count=reservationItems.filter(item=>reservationMatchesFilter(item,filter)).length;
    const counter=$(`[data-reservation-filter-count="${filter}"]`,button);
    if(counter)counter.textContent=count;
    const active=filter===reservationFilter;
    button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  });
  $$('[data-reservation-detail-filter]').forEach(button=>{const active=reservationDetailFilters.has(button.dataset.reservationDetailFilter);button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active))});
  const panel=$('[data-reservation-detail-panel]'),toggle=$('[data-reservation-filter-toggle]'),count=$('[data-reservation-detail-count]');
  if(panel)panel.hidden=!reservationFiltersOpen;if(toggle){toggle.classList.toggle('is-active',reservationFiltersOpen||reservationDetailFilters.size>0);toggle.setAttribute('aria-expanded',String(reservationFiltersOpen))}if(count)count.textContent=reservationDetailFilters.size;
}
function renderReservationViewMode(){
  $$('[data-reservation-mode]').forEach(button=>{const active=button.dataset.reservationMode===reservationViewMode;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active))});
}
function reservationActions(item){
  const actions=[
    {status:'pending',label:'Vrátit k posouzení',className:'pending'},
    {status:'approved',label:'Schválit',className:'approve'},
    {status:'rejected',label:'Zamítnout',className:'reject'},
  ];
  return actions.filter(action=>action.status!==item.status).map(action=>`<button class="admin-button ${action.className}" data-review-action="${action.status}" type="button">${action.label}</button>`).join('');
}
function reservationMemberTitle(item){const member=item.member||{};return member.nickname||member.name||member.email||'United member'}
function reservationDifference(item){const payment=itemPayment(item);if(payment.status==='overpaid')return `Přeplatek ${formatMoney(payment.overpaymentCzk)}`;if(payment.status==='underpaid')return `Doplatek ${formatMoney(payment.remainingCzk)}`;if(payment.status==='unpaid')return `K platbě ${formatMoney(payment.remainingCzk)}`;return payment.status==='paid'?'Zaplaceno':'Bez platby'}
function reservationQuickRow(item){
  const member=item.member||{},payment=itemPayment(item),attention=payment.overdue&&payment.remainingCzk>0?'Po splatnosti':paymentLabel(payment.status),reservationState=item.changePending?'Změna čeká':statusLabel(item.status);
  return `<tr data-reservation-open="${escapeHtml(item.id)}" tabindex="0"><td><strong>${escapeHtml(reservationMemberTitle(item))}</strong><small>${escapeHtml(member.email||member.name||'Bez kontaktu')}</small></td><td><i class="admin-badge admin-badge--${escapeHtml(item.status)}">${escapeHtml(reservationState)}</i></td><td class="admin-table-money">${escapeHtml(formatMoney(payment.amountDueCzk))}</td><td class="admin-table-money">${escapeHtml(formatMoney(payment.amountPaidCzk))}</td><td><i class="admin-badge admin-payment--${escapeHtml(payment.status)}">${escapeHtml(attention)}</i></td><td class="admin-table-money"><strong>${escapeHtml(reservationDifference(item))}</strong></td><td><span>${escapeHtml(formatDate(item.updatedAt))}</span></td><td><button aria-label="Otevřít detail rezervace ${escapeHtml(reservationMemberTitle(item))}" class="admin-table-detail" data-reservation-open="${escapeHtml(item.id)}" type="button">Detail →</button></td></tr>`;
}
function reservationDetailRow(item){
  const member=item.member||{},payment=itemPayment(item),snapshot=item.accommodationSnapshot||null,accommodation=snapshot?`${numeric(snapshot.unitCount)}× ${snapshot.optionName}`:item.accommodation||'Bez ubytování';
  return `<tr data-reservation-open="${escapeHtml(item.id)}" tabindex="0"><td><strong>${escapeHtml(member.name||reservationMemberTitle(item))}</strong></td><td>${escapeHtml(member.email||'—')}</td><td>${escapeHtml(member.nickname||'—')}</td><td>${numeric(item.crew)}</td><td>${escapeHtml(attendanceLabel(item.attendanceType))}</td><td>${escapeHtml(accommodation)}</td><td class="admin-table-money">${escapeHtml(formatMoney(payment.amountDueCzk))}</td><td class="admin-table-money">${escapeHtml(formatMoney(payment.amountPaidCzk))}</td><td>${escapeHtml(payment.variableSymbol||'—')}</td><td><i class="admin-badge admin-badge--${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</i><i class="admin-badge admin-payment--${escapeHtml(payment.status)}">${escapeHtml(paymentLabel(payment.status))}</i></td><td>${escapeHtml(formatDate(item.updatedAt))}</td><td><button aria-label="Otevřít detail rezervace ${escapeHtml(reservationMemberTitle(item))}" class="admin-table-detail" data-reservation-open="${escapeHtml(item.id)}" type="button">Detail →</button></td></tr>`;
}
function renderReservationList(){
  const reservations=filterAdminReservations(reservationItems,{filter:reservationFilter,filters:reservationDetailFilters,query:reservationSearch});
  $('[data-reservation-count]').textContent=`${recordsLabel(reservations.length)} z ${reservationItems.length}`;
  const list=$('[data-reservation-list]');
  if(!reservations.length){list.innerHTML=`<div class="admin-empty">Aktuálním filtrům a hledání neodpovídá žádná rezervace.</div>`;return}
  const quick=reservationViewMode==='quick';
  const headers=quick?'<th>Člen</th><th>Rezervace</th><th>Celkem</th><th>Uhrazeno</th><th>Platba</th><th>Bilance</th><th>Aktualizace</th><th></th>':'<th>Člen</th><th>E-mail</th><th>Přezdívka</th><th>Posádka</th><th>Účast</th><th>Ubytování</th><th>Celkem</th><th>Uhrazeno</th><th>VS</th><th>Stavy</th><th>Aktualizace</th><th></th>';
  list.innerHTML=`<div class="admin-table-scroll"><table class="admin-data-table admin-reservation-table admin-reservation-table--${quick?'quick':'detail'}" data-reservation-table data-mode="${reservationViewMode}"><thead><tr>${headers}</tr></thead><tbody>${reservations.map(quick?reservationQuickRow:reservationDetailRow).join('')}</tbody></table></div>`;
}
function renderReservationDrawer(){
  const item=reservationItems.find(reservation=>reservation.id===selectedReservationId);
  if(!item){closeReservationDrawer();return}
  const member=item.member||{},car=item.carSnapshot||{},snapshot=item.accommodationSnapshot||null;
  const accommodation=snapshot?`${numeric(snapshot.peopleCount)} ${numeric(snapshot.peopleCount)===1?'osoba':'osob'} · ${numeric(snapshot.unitCount)}× ${snapshot.optionName}`:`${item.accommodation||'Bez ubytování'} · ${numeric(item.accommodationUnits)} osob`,payment=itemPayment(item),qr=paymentQrSvg(payment.spayd);
  const accommodationVisual=snapshot?accommodationVisualMarkup({...snapshot,id:snapshot.optionId,name:snapshot.optionName},{apiBaseUrl,nights:snapshot.nights,className:'accommodation-visual--drawer'}):'';
  $('[data-reservation-drawer-content]').innerHTML=`<article class="admin-reservation-drawer-card" data-reservation-id="${escapeHtml(item.id)}">
    <header><span class="admin-kicker">RESERVATION DETAIL</span><h2 id="admin-reservation-drawer-title">${escapeHtml(member.nickname||member.name||'United member')}</h2><p>${escapeHtml(member.name||'Jméno neuvedeno')} · ${escapeHtml(member.email||'E-mail neuveden')}</p><div><small class="admin-badge admin-badge--${escapeHtml(item.status)}">${escapeHtml(item.changePending?'Změna čeká na schválení':statusLabel(item.status))}</small><small class="admin-badge admin-payment--${escapeHtml(payment.status)}">${escapeHtml(payment.overdue&&payment.remainingCzk>0?'Po splatnosti':paymentLabel(payment.status))}</small></div></header>
    <h3 class="admin-drawer-section-title">Rezervace</h3>
    <div class="admin-reservation-drawer-grid">
      <section><small>ČLEN</small><b>${escapeHtml(member.name||'—')}</b><span>${escapeHtml(member.nickname||'Bez přezdívky')} · ${escapeHtml(member.memberCode||'Bez kódu')}</span><span>${escapeHtml(member.email||'—')}</span></section>
      <section><small>AUTO</small><b>${escapeHtml([car.body,car.model].filter(Boolean).join(' · ')||'—')}</b><span>${escapeHtml([car.nickname,car.year,car.color].filter(Boolean).join(' · ')||'Bez dalších údajů')}</span></section>
      <section><small>POBYT</small><b>${escapeHtml(attendanceShortLabel(item))} · ${numeric(item.crew)} ${numeric(item.crew)===1?'osoba':'osob'}</b><span>${escapeHtml(attendanceLabel(item.attendanceType))} · příjezd ${escapeHtml(item.arrival||'—')}</span></section>
      <section class="admin-drawer-accommodation"><small>UBYTOVÁNÍ</small>${accommodationVisual}<b>${escapeHtml(accommodation)}</b><span>${snapshot?`max. ${numeric(snapshot.capacityPerUnit)} osob / jednotku · ${numeric(snapshot.nights)} ${numeric(snapshot.nights)===1?'noc':'noci'} · ${escapeHtml(formatMoney(snapshot.totalCzk))}`:'Cena není ve snapshotu'}</span>${item.capacityConflict?'<em>Pending požadavek nyní přesahuje potvrzenou dostupnost.</em>':''}</section>
      <section><small>SHOW &amp; SHINE</small><b>${escapeHtml(item.showShine||'Ne')}</b><span>Účast v soutěži</span></section>
      <section><small>PLATBA</small><b>${escapeHtml(paymentLabel(payment.status))}</b><span>${escapeHtml(reservationDifference(item))}</span></section>
      <section><small>ODESLÁNO</small><b>${escapeHtml(formatDate(item.submittedAt))}</b><span>Aktualizováno ${escapeHtml(formatDate(item.updatedAt))}</span></section>
      <section><small>POSOUZENO</small><b>${escapeHtml(formatDate(item.reviewedAt))}</b><span>${escapeHtml(item.reviewNote||'Bez admin poznámky')}</span></section>
    </div>
    <h3 class="admin-drawer-section-title">Finance</h3>
    <section class="admin-payment-editor">${payment.testMode?'<div class="payment-test-warning">TESTOVACÍ PLATBA – NEPLAŤTE</div>':''}<div class="admin-payment-editor-grid"><div><span class="admin-kicker">PAYMENT</span><h3>${escapeHtml(payment.overdue&&payment.remainingCzk>0?'Platba po splatnosti':reservationDifference(item))}</h3><dl><div><dt>Cena rezervace</dt><dd>${escapeHtml(formatMoney(payment.amountDueCzk))}</dd></div><div><dt>Již zaplaceno</dt><dd>${escapeHtml(formatMoney(payment.amountPaidCzk))}</dd></div><div><dt>${payment.status==='overpaid'?'Přeplatek':payment.status==='underpaid'?'Doplatek':'Bilance'}</dt><dd>${escapeHtml(payment.status==='overpaid'?formatMoney(payment.overpaymentCzk):formatMoney(payment.remainingCzk))}</dd></div><div><dt>VS</dt><dd>${escapeHtml(payment.variableSymbol||'—')}</dd></div><div><dt>Účet</dt><dd>${escapeHtml(payment.accountDisplay||'—')}</dd></div><div><dt>Splatnost</dt><dd>${escapeHtml(formatDate(payment.deadline,false))}</dd></div></dl><label><span>SKUTEČNĚ UHRAZENO (KČ)</span><input data-payment-amount max="10000000" min="0" step="1" type="number" value="${numeric(payment.amountPaidCzk)}"/></label><div class="admin-payment-actions"><button class="admin-button admin-button--primary" data-payment-save type="button">Uložit platbu <span>→</span></button><button class="admin-button" data-payment-full type="button">Označit plně uhrazeno</button></div></div>${qr?`<div class="admin-payment-qr"><div>${qr}</div><small>${escapeHtml(payment.message||'')}</small></div>`:''}</div></section>
    <div class="admin-reservation-drawer-notes"><div><small>POZNÁMKA ČLENA</small><p>${escapeHtml(item.note||'Bez poznámky člena.')}</p></div></div>
    <h3 class="admin-drawer-section-title">Admin akce</h3>
    <div class="admin-review admin-reservation-drawer-review"><input maxlength="1000" data-review-note placeholder="Krátká admin poznámka (hlavně při zamítnutí)" value="${escapeHtml(item.reviewNote||'')}"/><div class="admin-review-actions">${reservationActions(item)}</div></div>
  </article>`;bindAccommodationVisualFallbacks($('[data-reservation-drawer-content]'));
}
function openReservationDrawer(id,source){
  if(!reservationItems.some(item=>item.id===id))return;
  selectedReservationId=id;reservationDrawerReturnFocus=source||document.activeElement;renderReservationDrawer();
  $('[data-reservation-drawer]').hidden=false;document.body.classList.add('admin-overlay-open');
  $('[data-reservation-drawer-close]:not(.admin-reservation-drawer-backdrop)')?.focus();
}
function closeReservationDrawer(){
  const drawer=$('[data-reservation-drawer]');if(drawer)drawer.hidden=true;selectedReservationId=null;document.body.classList.remove('admin-overlay-open');
  if(reservationDrawerReturnFocus?.isConnected)reservationDrawerReturnFocus.focus();reservationDrawerReturnFocus=null;
}
function paymentRow(item){
  const member=item.member||{},payment=itemPayment(item),difference=reservationDifference(item),attention=payment.overdue&&payment.remainingCzk>0?'Po splatnosti':paymentLabel(payment.status);
  return `<tr data-reservation-open="${escapeHtml(item.id)}" tabindex="0"><td><strong>${escapeHtml(reservationMemberTitle(item))}</strong><small>${escapeHtml(member.email||member.name||'Bez kontaktu')}</small></td><td>${escapeHtml(payment.variableSymbol||'—')}</td><td class="admin-table-money">${escapeHtml(formatMoney(payment.amountDueCzk))}</td><td class="admin-table-money">${escapeHtml(formatMoney(payment.amountPaidCzk))}</td><td class="admin-table-money"><strong>${escapeHtml(difference)}</strong></td><td><i class="admin-badge admin-payment--${escapeHtml(payment.status)}">${escapeHtml(attention)}</i></td><td>${escapeHtml(formatDate(payment.deadline,false))}</td><td><button aria-label="Otevřít platbu ${escapeHtml(reservationMemberTitle(item))}" class="admin-table-detail" data-reservation-open="${escapeHtml(item.id)}" type="button">Detail →</button></td></tr>`;
}
function renderPaymentTabs(){
  $$('[data-payment-filter]').forEach(button=>{
    const filter=button.dataset.paymentFilter,count=reservationItems.filter(item=>paymentMatchesFilter(item,filter)).length;
    const counter=$(`[data-payment-filter-count="${filter}"]`,button);if(counter)counter.textContent=count;
    const active=filter===paymentFilter;button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  });
}
function renderPaymentList(){
  const payments=filterAdminPayments(reservationItems,{filter:paymentFilter,query:paymentSearch});
  const count=$('[data-payment-count]');if(count)count.textContent=`${recordsLabel(payments.length)} z ${reservationItems.length}`;
  const list=$('[data-payment-list]');if(!list)return;
  if(!payments.length){list.innerHTML=`<div class="admin-empty">Filtru ${escapeHtml(paymentFilterLabels[paymentFilter].toLowerCase())} a hledání neodpovídá žádná platba.</div>`;return}
  list.innerHTML=`<div class="admin-table-scroll"><table class="admin-data-table admin-payment-table"><thead><tr><th>Člen</th><th>VS</th><th>Předepsáno</th><th>Uhrazeno</th><th>Rozdíl</th><th>Stav</th><th>Splatnost</th><th></th></tr></thead><tbody>${payments.map(paymentRow).join('')}</tbody></table></div>`;
}
function renderReservations(payload){reservationItems=Array.isArray(payload.reservations)?payload.reservations:[];renderReservationTabs();renderReservationViewMode();renderReservationList();renderPaymentTabs();renderPaymentList();renderAttentionCounts();if(selectedReservationId)renderReservationDrawer()}
function setReservationFilter(filter){
  if(RESERVATION_DETAIL_FILTERS.includes(filter)){reservationFilter='all';reservationDetailFilters=new Set([filter]);reservationFiltersOpen=true}
  else if(RESERVATION_PRIMARY_FILTERS.includes(filter))reservationFilter=filter;else return;
  renderReservationTabs();renderReservationList();
}
function setPaymentFilter(filter){
  if(!paymentFilterLabels[filter])return;
  paymentFilter=filter;renderPaymentTabs();renderPaymentList();
}

function accommodationAvailability(item){
  if(item.inventoryMode==='unlimited')return '<strong>bez omezení</strong><small>kapacita se neblokuje</small>';
  const soldOut=numeric(item.freeUnits)===0;
  return `<strong>${numeric(item.approvedUnits)} / ${numeric(item.unitsTotal)} potvrzeno</strong><small class="${soldOut?'is-sold-out':''}">${soldOut?'0 volných':`${numeric(item.freeUnits)} volné`}</small><small class="admin-accommodation-pending">+ ${numeric(item.pendingUnits)} pending</small>`;
}
function accommodationCard(item){
  const inactive=item.active?'':' is-inactive',hasPhoto=item.visual?.hasCustomPhoto===true,conflict=numeric(item.pendingConflictUnits);
  return `<article class="admin-accommodation-card${inactive}" data-accommodation-id="${escapeHtml(item.id)}">
    ${accommodationVisualMarkup(item,{apiBaseUrl,className:'admin-accommodation-visual'})}
    <div class="admin-accommodation-head"><div><span class="admin-kicker">${item.kind==='cabin'?'CHATKA':'STAN'}${item.active?'':' · NEAKTIVNÍ'}</span><h3>${escapeHtml(item.name)}</h3></div><div class="admin-accommodation-availability">${accommodationAvailability(item)}</div></div>
    <div class="admin-accommodation-summary"><span>max. <b>${numeric(item.capacityPerUnit)}</b> osob / jednotku</span><span><b>${escapeHtml(formatMoney(item.unitPriceCzk))}</b> / jednotku / noc</span><span><b>${escapeHtml(formatMoney(item.personPriceCzk))}</b> / osobu</span></div>
    ${conflict?`<p class="admin-capacity-warning"><b>${conflict} pending</b> ${conflict===1?'požadavek již nebude možné schválit':'požadavky již nebude možné schválit'} bez uvolnění kapacity.</p>`:''}
    <div class="admin-accommodation-photo">
      <div><span class="admin-kicker">VIZUÁL UBYTOVÁNÍ</span><p>${hasPhoto?'Používá se vlastní fotografie. Její nahrazení se projeví ve všech rozhraních.':'Používá se generovaný přehled z aktuálních parametrů.'}</p></div>
      <label class="admin-photo-picker"><input accept="image/jpeg,image/png,image/webp" data-accommodation-photo-input hidden type="file"/><span>${hasPhoto?'Vybrat náhradu':'Vybrat fotografii'}</span><small>JPG, PNG nebo WebP · max. 8 MB</small></label>
      <div class="admin-accommodation-photo-preview" data-accommodation-photo-preview hidden></div>
      <div class="admin-accommodation-photo-actions"><button class="admin-button admin-button--primary" data-accommodation-photo-upload disabled type="button">${hasPhoto?'Nahradit fotografii':'Nahrát fotografii'}</button>${hasPhoto?'<button class="admin-button" data-accommodation-photo-remove type="button">Odebrat vlastní foto</button>':''}</div>
    </div>
    <details><summary>Upravit konfiguraci</summary>
      <form class="admin-config-form" data-accommodation-edit-form>
        <label class="admin-field admin-field--wide"><span>Název</span><input maxlength="80" name="name" required value="${escapeHtml(item.name)}"/></label>
        <label class="admin-field"><span>Druh</span><select name="kind"><option value="cabin" ${item.kind==='cabin'?'selected':''}>Chatka</option><option value="tent" ${item.kind==='tent'?'selected':''}>Stan</option></select></label>
        <label class="admin-field"><span>Kapacita</span><select name="inventoryMode"><option value="limited" ${item.inventoryMode==='limited'?'selected':''}>Omezená</option><option value="unlimited" ${item.inventoryMode==='unlimited'?'selected':''}>Bez omezení</option></select></label>
        <label class="admin-field"><span>Počet jednotek</span><input min="0" name="unitsTotal" required type="number" value="${numeric(item.unitsTotal)}"/></label>
        <label class="admin-field"><span>Max. osob / jednotku</span><input max="8" min="1" name="capacityPerUnit" required type="number" value="${numeric(item.capacityPerUnit)}"/></label>
        <label class="admin-field"><span>Cena / jednotku / noc (Kč)</span><input min="0" name="unitPriceCzk" required type="number" value="${numeric(item.unitPriceCzk)}"/></label>
        <label class="admin-field"><span>Cena / osobu (Kč)</span><input min="0" name="personPriceCzk" required type="number" value="${numeric(item.personPriceCzk)}"/></label>
        <label class="admin-field"><span>Povlečení / osobu (Kč)</span><input min="0" name="beddingFeePerPersonCzk" required type="number" value="${numeric(item.beddingFeePerPersonCzk)}"/></label>
        <label class="admin-field"><span>Taxa / osobu / noc (Kč)</span><input min="0" name="cityTaxPerPersonPerNightCzk" required type="number" value="${numeric(item.cityTaxPerPersonPerNightCzk)}"/></label>
        <label class="admin-check"><input name="active" type="checkbox" ${item.active?'checked':''}/><span>Aktivní nabídka</span></label>
        <button class="admin-button" data-accommodation-save type="submit">Uložit změny</button>
      </form>
    </details>
  </article>`;
}
function renderAccommodation(payload){
  for(const selection of accommodationPhotoSelections.values())URL.revokeObjectURL(selection.url);accommodationPhotoSelections.clear();
  accommodationItems=Array.isArray(payload.options)?payload.options:[];
  $('[data-accommodation-option-count]').textContent=`${accommodationItems.length} ${accommodationItems.length===1?'možnost':'možností'}`;
  const list=$('[data-accommodation-list]');
  list.innerHTML=accommodationItems.length?accommodationItems.map(accommodationCard).join(''):'<div class="admin-empty">Pro tento event zatím nejsou nastavené žádné typy ubytování.</div>';
  bindAccommodationVisualFallbacks(list);
}
function accommodationFormPayload(form){
  const data=new FormData(form);
  return {
    name:String(data.get('name')||'').trim(),kind:String(data.get('kind')||''),inventoryMode:String(data.get('inventoryMode')||''),
    unitsTotal:Number(data.get('unitsTotal')),capacityPerUnit:Number(data.get('capacityPerUnit')),unitPriceCzk:Number(data.get('unitPriceCzk')),
    personPriceCzk:Number(data.get('personPriceCzk')),beddingFeePerPersonCzk:Number(data.get('beddingFeePerPersonCzk')),
    cityTaxPerPersonPerNightCzk:Number(data.get('cityTaxPerPersonPerNightCzk')),active:data.get('active')==='on',
  };
}

async function saveAccommodation(form,optionId=''){
  const button=$('button[type="submit"]',form);if(button)button.disabled=true;
  try{
    const body=accommodationFormPayload(form);if(!optionId)body.eventId=selectedEventId;
    await apiRequest(optionId?`/api/admin/accommodation/${encodeURIComponent(optionId)}`:'/api/admin/accommodation',{method:optionId?'PATCH':'POST',body});
    toast(optionId?'Ubytování bylo upraveno.':'Ubytování bylo přidáno.');
    if(!optionId){form.reset();form.elements.unitsTotal.value=0;form.elements.capacityPerUnit.value=4;form.elements.active.checked=true;form.closest('details').open=false}
    await loadEventData();
  }catch(error){if(error.status===403){setDenied();return}toast(error.message||'Ubytování se nepodařilo uložit.')}finally{if(button)button.disabled=false}
}

function previewAccommodationPhoto(input){
  const card=input.closest('[data-accommodation-id]'),optionId=card?.dataset.accommodationId;if(!optionId)return;
  const selected=selectImageFiles(input.files,{maxFiles:1,maxBytes:8*1024*1024});
  if(selected.invalidType||selected.tooLarge||!selected.files.length){input.value='';toast(selected.tooLarge?'Fotografie může mít maximálně 8 MB.':'Vyber fotografii JPG, PNG nebo WebP.');return}
  const previous=accommodationPhotoSelections.get(optionId);if(previous)URL.revokeObjectURL(previous.url);
  const file=selected.files[0],url=URL.createObjectURL(file);accommodationPhotoSelections.set(optionId,{file,url});
  const preview=$('[data-accommodation-photo-preview]',card);preview.hidden=false;preview.innerHTML=`<img alt="Lokální náhled nové fotografie" src="${escapeHtml(url)}"/><span>${escapeHtml(file.name)}</span>`;
  $('[data-accommodation-photo-upload]',card).disabled=false;
}

async function uploadAccommodationPhoto(card){
  const optionId=card?.dataset.accommodationId,selection=accommodationPhotoSelections.get(optionId);if(!optionId||!selection)return;
  const button=$('[data-accommodation-photo-upload]',card);button.disabled=true;
  try{await apiUpload(`/api/admin/accommodation/${encodeURIComponent(optionId)}/photo`,selection.file);toast('Fotografie ubytování byla uložena.');await loadEventData()}
  catch(error){if(error.status===403){setDenied();return}toast(error.message||'Fotografii se nepodařilo uložit.');button.disabled=false}
}

async function removeAccommodationPhoto(card){
  const optionId=card?.dataset.accommodationId;if(!optionId)return;
  const button=$('[data-accommodation-photo-remove]',card);button.disabled=true;
  try{await apiRequest(`/api/admin/accommodation/${encodeURIComponent(optionId)}/photo`,{method:'DELETE'});toast('Vlastní fotografie byla odebrána.');await loadEventData()}
  catch(error){if(error.status===403){setDenied();return}toast(error.message||'Fotografii se nepodařilo odebrat.');button.disabled=false}
}

async function saveEventSettings(form){
  const event=selectedEvent();if(!event)return;
  const data=new FormData(form);
  const switchingCurrent=!event.isCurrent&&form.elements.isCurrent.checked;
  if(switchingCurrent&&!window.confirm(`Nastavit United ${numeric(event.year)} jako aktuální event? Změna okamžitě ovlivní veřejný Weekend Planner a členské rezervace.`)){form.elements.isCurrent.checked=false;return}
  const body={
    registrationStatus:String(data.get('registrationStatus')||''),reservationCapacity:Number(data.get('reservationCapacity')),
    fullWeekendNights:Number(data.get('fullWeekendNights')),saturdayOnlyNights:Number(data.get('saturdayOnlyNights')),
    bookingCommitmentCzk:Number(data.get('bookingCommitmentCzk')),bookingDueAt:String(data.get('bookingDueAt')||''),bookingPaidCzk:Number(data.get('bookingPaidCzk')),eventEndAt:String(data.get('eventEndAt')||''),
  };
  if(switchingCurrent)body.isCurrent=true;
  const button=$('button[type="submit"]',form);if(button)button.disabled=true;
  try{await apiRequest(`/api/admin/events/${encodeURIComponent(event.id)}`,{method:'PATCH',body});toast('Nastavení eventu bylo uloženo.');await loadAdminData({reloadGallery:false})}
  catch(error){if(error.status===403){setDenied();return}toast(error.message||'Nastavení eventu se nepodařilo uložit.')}finally{if(button)button.disabled=false}
}

function galleryActions(item){
  const actions=[
    {status:'pending',label:'Vrátit k posouzení',className:'pending'},
    {status:'approved',label:'Schválit',className:'approve'},
    {status:'rejected',label:'Zamítnout',className:'reject'},
  ];
  return actions.filter(action=>action.status!==item.status).map(action=>`<button class="admin-button ${action.className}" data-gallery-action="${action.status}" type="button">${action.label}</button>`).join('');
}
function galleryQuickActions(item){
  const actions=[{status:'pending',label:'Vrátit k posouzení',icon:'↺',className:'pending'},{status:'approved',label:'Schválit',icon:'✓',className:'approve'},{status:'rejected',label:'Zamítnout',icon:'×',className:'reject'}];
  return actions.filter(action=>action.status!==item.status).map(action=>`<button aria-label="${action.label}" class="admin-gallery-quick ${action.className}" data-gallery-action="${action.status}" title="${action.label}" type="button">${action.icon}</button>`).join('');
}
function galleryIdentity(item){const member=item.member||{};return member.nickname||member.name||member.email||'United member'}
function galleryMeta(item){const member=item.member||{};return [member.name,member.memberCode,member.email].filter(Boolean).join(' · ')}
function galleryCard(item){
  const member=item.member||{};
  return `<article class="admin-gallery-card" data-gallery-id="${escapeHtml(item.id)}">
    <button aria-label="Otevřít náhled fotografie od ${escapeHtml(galleryIdentity(item))}" class="admin-gallery-image" data-gallery-preview="${escapeHtml(item.id)}" type="button">
      <img alt="Fotografie od ${escapeHtml(galleryIdentity(item))}" data-gallery-media="${escapeHtml(item.id)}"/>
      <span>Otevřít náhled</span>
    </button>
    <div class="admin-gallery-card-body">
      <div class="admin-gallery-card-head"><div><h3>${escapeHtml(galleryIdentity(item))}</h3><p>${escapeHtml(member.name||'Jméno neuvedeno')}</p></div></div>
      <div class="admin-gallery-card-controls"><small class="admin-badge admin-badge--${escapeHtml(item.status)}">${escapeHtml(galleryStatusLabel(item.status))}</small><div class="admin-gallery-quick-actions">${galleryQuickActions(item)}</div></div>
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
  renderAttentionCounts();
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
function setGalleryFilter(filter){
  if(!galleryFilterLabels[filter])return;
  galleryFilter=filter;renderGalleryTabs();renderGalleryList();
}

function setGalleryMode(mode){
  galleryMode=mode==='history'?'history':'community';
  $$('[data-gallery-mode]').forEach(button=>{const active=button.dataset.galleryMode===galleryMode;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active))});
  const community=$('[data-gallery-community]'),history=$('[data-gallery-history]');if(community)community.hidden=galleryMode!=='community';if(history)history.hidden=galleryMode!=='history';
  if(galleryMode==='history'){renderHistoryClaims();$('[data-gallery-count]').textContent=recordsLabel(filteredHistoryClaims().length)}else{renderGalleryList()}
}
function historyComponentLabel(status){return({not_claimed:'Neuvedeno',pending:'Čeká na kontrolu',approved:'Schváleno',rejected:'Zamítnuto'})[status]||status||'—'}
function historyMatchesStatus(item,filter){if(filter==='all')return true;if(filter==='pending')return item.attendance?.status==='pending'||item.showShine?.status==='pending';return item.attendance?.status===filter||item.showShine?.status===filter}
function filteredHistoryClaims(){
  const query=historySearch.trim().toLocaleLowerCase('cs');return historyClaims.filter(item=>{if(!historyMatchesStatus(item,historyFilter))return false;if(!query)return true;const member=item.member||{};return [member.name,member.nickname,member.email,member.memberCode,item.eventYear].some(value=>String(value||'').toLocaleLowerCase('cs').includes(query))});
}
function historyReviewActions(item,component){
  const current=component==='attendance'?item.attendance?.status:item.showShine?.status;if(component==='sns'&&current==='not_claimed')return '';
  if(current==='approved')return '<p class="admin-history-locked">Schválený výsledek je uzamčený. Oprava vyžaduje budoucí reversal workflow.</p>';
  return `<div class="admin-history-review-actions"><button class="admin-button approve" data-history-action="approved" data-history-component="${component}" type="button" ${current==='approved'?'disabled':''}>Schválit</button><button class="admin-button reject" data-history-action="rejected" data-history-component="${component}" type="button" ${current==='rejected'?'disabled':''}>Zamítnout</button></div>`;
}
function historyEvidenceGrid(item){return item.evidence?.length?`<div class="admin-history-evidence-grid">${item.evidence.map(photo=>`<button aria-label="Otevřít důkaz účasti" data-history-evidence="${escapeHtml(photo.id)}" type="button"><img alt="Důkaz účasti United ${numeric(item.eventYear)}" data-history-evidence-media="${escapeHtml(photo.id)}"/><span>SOUKROMÝ DŮKAZ</span></button>`).join('')}</div>`:'<p class="admin-history-no-evidence">Důkazní fotografie chybí.</p>'}
function showShineSummary(item){const sns=item.showShine||{};if(!sns.competed)return 'Neuvedeno';return [sns.category||'Bez kategorie',sns.placement?`${sns.placement}. místo`:'bez TOP 3',sns.bestOfBest?'Best of the Best':null,sns.bestExhaust?'Nej zvuk výfuku':null].filter(Boolean).join(' · ')}
function historyReviewControl(item,component){
  const value=component==='attendance'?item.attendance:item.showShine,status=value?.status;if(component==='sns'&&status==='not_claimed')return '<p>Člen Show & Shine v tomto ročníku nenárokuje.</p>';
  const note=value?.reviewNote?`<p>${escapeHtml(value.reviewNote)}</p>`:'';
  if(status==='approved')return `${note}${historyReviewActions(item,component)}`;
  return `${note}<label><span>DŮVOD ROZHODNUTÍ</span><textarea data-history-review-note maxlength="1000" placeholder="Povinné při zamítnutí"></textarea></label>${historyReviewActions(item,component)}`;
}
function historyClaimCard(item){
  const member=item.member||{};return `<article class="admin-history-card" data-history-id="${escapeHtml(item.id)}"><header><div><span class="admin-kicker">UNITED ${numeric(item.eventYear)}</span><h3>${escapeHtml(member.nickname||member.name||member.email||'United member')}</h3><p>${escapeHtml([member.name,member.memberCode,member.email].filter(Boolean).join(' · '))}</p></div><time>${escapeHtml(formatDate(item.submittedAt))}</time></header>${historyEvidenceGrid(item)}<div class="admin-history-decisions"><section data-history-review="attendance"><div class="admin-history-decision-head"><div><small>DOCHÁZKA</small><b>${escapeHtml(historyComponentLabel(item.attendance?.status))}</b></div><i class="admin-badge admin-badge--${escapeHtml(item.attendance?.status)}">${escapeHtml(historyComponentLabel(item.attendance?.status))}</i></div>${historyReviewControl(item,'attendance')}</section><section data-history-review="sns"><div class="admin-history-decision-head"><div><small>SHOW &amp; SHINE</small><b>${escapeHtml(showShineSummary(item))}</b></div><i class="admin-badge admin-badge--${escapeHtml(item.showShine?.status)}">${escapeHtml(historyComponentLabel(item.showShine?.status))}</i></div>${historyReviewControl(item,'sns')}</section></div></article>`;
}
function renderHistoryTabs(){
  $$('[data-history-filter]').forEach(button=>{const filter=button.dataset.historyFilter,count=filter==='all'?historyClaims.length:historyClaims.filter(item=>historyMatchesStatus(item,filter)).length,active=filter===historyFilter;$(`[data-history-filter-count="${filter}"]`,button).textContent=count;button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1});
}
function renderHistoryClaims(payload=null){
  if(payload){historyClaims=Array.isArray(payload.claims)?payload.claims:[];historyCounts={...historyCounts,...(payload.counts||{})}}
  renderHistoryTabs();renderAttentionCounts();const items=filteredHistoryClaims(),list=$('[data-history-list]');if(!list)return;$('[data-gallery-count]').textContent=recordsLabel(items.length);
  if(!items.length){list.innerHTML='<div class="admin-empty">Tomuto filtru neodpovídá žádná historická žádost.</div>';return}list.innerHTML=items.map(historyClaimCard).join('');hydrateHistoryEvidence(list);
}
async function historyEvidenceUrl(id){
  if(historyEvidenceUrls.has(id))return historyEvidenceUrls.get(id);if(historyEvidencePromises.has(id))return historyEvidencePromises.get(id);
  const promise=apiMedia(`/api/admin/history/evidence/${encodeURIComponent(id)}`).then(blob=>{const url=URL.createObjectURL(blob);historyEvidenceUrls.set(id,url);return url}).finally(()=>historyEvidencePromises.delete(id));historyEvidencePromises.set(id,promise);return promise;
}
function hydrateHistoryEvidence(root=document){$$('[data-history-evidence-media]',root).forEach(async image=>{try{image.src=await historyEvidenceUrl(image.dataset.historyEvidenceMedia)}catch{image.alt='Důkaz se nepodařilo načíst.'}})}
function releaseHistoryEvidence(){for(const url of historyEvidenceUrls.values())URL.revokeObjectURL(url);historyEvidenceUrls.clear();historyEvidencePromises.clear()}
async function openHistoryEvidence(id,trigger=null){
  const modal=$('[data-history-evidence-lightbox]'),image=$('[data-history-evidence-full]'),claim=historyClaims.find(item=>item.evidence?.some(photo=>String(photo.id)===String(id))),evidence=claim?.evidence?.find(photo=>String(photo.id)===String(id));if(!modal||!image||!claim||!evidence)return;
  try{
    image.src=await historyEvidenceUrl(id);if(modal.hidden)historyEvidenceReturnFocus=trigger||historyEvidenceReturnFocus;
    $('[data-history-evidence-title]',modal).textContent=`United ${numeric(claim.eventYear)}`;
    $('[data-history-evidence-member]',modal).textContent=[claim.member?.nickname||claim.member?.name,claim.member?.name,claim.member?.memberCode,claim.member?.email].filter(Boolean).filter((value,index,items)=>items.indexOf(value)===index).join(' · ');
    $('[data-history-evidence-submitted]',modal).textContent=formatDate(claim.submittedAt);
    $('[data-history-evidence-created]',modal).textContent=formatDate(evidence.createdAt);
    $('[data-history-evidence-attendance]',modal).textContent=historyComponentLabel(claim.attendance?.status);
    $('[data-history-evidence-sns]',modal).textContent=`${historyComponentLabel(claim.showShine?.status)} · ${showShineSummary(claim)}`;
    const thumbs=$('[data-history-evidence-thumbs]',modal);thumbs.innerHTML=claim.evidence.map((photo,index)=>`<button aria-label="Otevřít důkaz ${index+1}" class="${String(photo.id)===String(id)?'is-active':''}" data-history-evidence="${escapeHtml(photo.id)}" type="button"><img alt="Důkaz účasti United ${numeric(claim.eventYear)}" data-history-evidence-media="${escapeHtml(photo.id)}"/></button>`).join('');hydrateHistoryEvidence(thumbs);
    modal.hidden=false;document.body.classList.add('admin-lightbox-open');$('[data-history-evidence-close]:not(.admin-gallery-lightbox-backdrop)')?.focus();
  }catch(error){toast(error.message||'Důkaz se nepodařilo otevřít.')}
}
function closeHistoryEvidence(){const modal=$('[data-history-evidence-lightbox]');if(modal)modal.hidden=true;document.body.classList.remove('admin-lightbox-open');const trigger=historyEvidenceReturnFocus;historyEvidenceReturnFocus=null;trigger?.focus?.()}
async function loadHistoryClaims(){const payload=await apiRequest('/api/admin/history/claims?status=all');renderHistoryClaims(payload);return payload}
async function reviewHistoryClaim(container,component,status){
  const claimId=container.dataset.historyId,review=$(`[data-history-review="${component}"]`,container),note=$('[data-history-review-note]',review)?.value.trim()||'';if(status==='rejected'&&!note){toast('Při zamítnutí je důvod povinný.');$('[data-history-review-note]',review)?.focus();return}
  $$('[data-history-action]',review).forEach(button=>button.disabled=true);try{await apiRequest(`/api/admin/history/claims/${encodeURIComponent(claimId)}/${component}`,{method:'PATCH',body:{status,reviewNote:note}});toast(component==='attendance'?'Rozhodnutí o docházce bylo uloženo.':'Rozhodnutí o Show & Shine bylo uloženo.');await loadHistoryClaims()}catch(error){if(error.status===403){setDenied();return}toast(error.message||'Rozhodnutí se nepodařilo uložit.')}finally{$$('[data-history-action]',review).forEach(button=>button.disabled=false)}
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
      <span class="admin-kicker">FOTOGRAFIE ČLENA</span><h2 id="admin-gallery-lightbox-title">${escapeHtml(galleryIdentity(item))}</h2>
      <div class="admin-gallery-member-meta"><p><small>JMÉNO</small><b>${escapeHtml(item.member?.name||'—')}</b></p><p><small>E-MAIL</small><b>${escapeHtml(item.member?.email||'—')}</b></p><p><small>MEMBER CODE</small><b>${escapeHtml(item.member?.memberCode||'—')}</b></p></div>
      <small class="admin-badge admin-badge--${escapeHtml(item.status)}">${escapeHtml(galleryStatusLabel(item.status))}</small>
      <p class="admin-gallery-caption">${escapeHtml(item.caption||'Bez popisku.')}</p><small class="admin-gallery-date">Nahráno ${escapeHtml(formatDate(item.createdAt))}</small>
      <div class="admin-gallery-review"><label><span>ADMIN POZNÁMKA</span><textarea data-gallery-review-note maxlength="1000" placeholder="Krátká admin poznámka">${escapeHtml(item.reviewNote||'')}</textarea></label><div class="admin-review-actions">${galleryActions(item)}</div></div>
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

function scopedPath(path){return `${path}?eventId=${encodeURIComponent(selectedEventId)}`}
async function loadEventData(){
  if(loading||!selectedEventId)return;setLoading(true);
  try{
    const [overview,reservations,accommodation]=await Promise.all([apiRequest(scopedPath('/api/admin/overview')),apiRequest(scopedPath('/api/admin/reservations')),apiRequest(scopedPath('/api/admin/accommodation'))]);
    renderOverview(overview);renderReservations(reservations);renderAccommodation(accommodation);renderEventSelector();setView('admin');
  }catch(error){if(error.status===403){setDenied();return}toast(error.message||'Data vybraného eventu se nepodařilo načíst.')}finally{setLoading(false)}
}

async function loadAdminData({reloadGallery=true}={}){
  if(loading)return;setLoading(true);
  try{
    const eventsPayload=await apiRequest('/api/admin/events');
    adminEvents=Array.isArray(eventsPayload.events)?eventsPayload.events:[];
    if(!adminEvents.some(event=>event.id===selectedEventId))selectedEventId=(adminEvents.find(event=>event.isCurrent)||adminEvents[0]||{}).id||'';
    renderEventSelector();
    if(!selectedEventId){const [gallery,history]=await Promise.all([reloadGallery?apiRequest('/api/admin/gallery'):null,apiRequest('/api/admin/history/claims?status=all')]);renderOverview({event:null,overview:{history:history.counts}});renderReservations({reservations:[]});renderAccommodation({options:[]});if(gallery)renderGallery(gallery);renderHistoryClaims(history);setGalleryMode(galleryMode);setView('admin');return}
    const [overview,reservations,accommodation,gallery,history]=await Promise.all([apiRequest(scopedPath('/api/admin/overview')),apiRequest(scopedPath('/api/admin/reservations')),apiRequest(scopedPath('/api/admin/accommodation')),reloadGallery?apiRequest('/api/admin/gallery'):null,apiRequest('/api/admin/history/claims?status=all')]);
    renderOverview(overview);renderReservations(reservations);renderAccommodation(accommodation);if(gallery)renderGallery(gallery);renderHistoryClaims(history);setGalleryMode(galleryMode);setView('admin');
  }catch(error){if(error.status===403){setDenied();return}toast(error.message||'Admin data se nepodařilo načíst.')}finally{setLoading(false)}
}

async function updateReservation(card,status){
  const button=card.querySelector(`[data-review-action="${status}"]`);const note=$('[data-review-note]',card)?.value||'';const reservationId=card.dataset.reservationId;
  if(button)button.disabled=true;
  try{
    await apiRequest(`/api/admin/reservations/${encodeURIComponent(reservationId)}`,{method:'PATCH',body:{status,reviewNote:note}});
    const reservation=reservationItems.find(item=>item.id===reservationId);if(reservation){reservation.status=status;reservation.reviewNote=note;renderReservationTabs();renderReservationList();renderPaymentTabs();renderPaymentList();renderAttentionCounts();renderReservationDrawer()}
    const messages={pending:'Rezervace byla vrácena k posouzení.',approved:'Rezervace byla schválena.',rejected:'Rezervace byla zamítnuta.'};toast(messages[status]||'Stav rezervace byl změněn.');
    await loadEventData();
  }
  catch(error){if(error.status===403){setDenied();return}toast(error.message||'Rezervaci se nepodařilo změnit.')}finally{if(button)button.disabled=false}
}

async function updateReservationPayment(card,markFull=false){
  const reservationId=card.dataset.reservationId,item=reservationItems.find(entry=>entry.id===reservationId),payment=itemPayment(item),input=$('[data-payment-amount]',card);
  const amountPaidCzk=markFull?numeric(payment.amountDueCzk):Number(input?.value);
  if(!Number.isInteger(amountPaidCzk)||amountPaidCzk<0||amountPaidCzk>10000000){toast('Zadej celou uhrazenou částku od 0 do 10 000 000 Kč.');input?.focus();return}
  $$('[data-payment-save], [data-payment-full]',card).forEach(button=>button.disabled=true);
  try{
    const payload=await apiRequest(`/api/admin/reservations/${encodeURIComponent(reservationId)}/payment`,{method:'PATCH',body:{amountPaidCzk}});
    if(item&&payload?.reservation?.payment){item.payment=payload.reservation.payment;item.paymentStatus=item.payment.status;item.amountPaidCzk=item.payment.amountPaidCzk;renderReservationTabs();renderReservationList();renderPaymentTabs();renderPaymentList();renderAttentionCounts();renderReservationDrawer()}
    toast(markFull?'Platba byla označena jako plně uhrazená.':'Uhrazená částka byla uložena.');await loadEventData();
  }catch(error){if(error.status===403){setDenied();return}toast(error.message||'Platbu se nepodařilo uložit.')}
  finally{$$('[data-payment-save], [data-payment-full]',card).forEach(button=>button.disabled=false)}
}

async function updateGallery(container,status){
  const submissionId=container.dataset.galleryId;const currentItem=galleryItems.find(photo=>photo.id===submissionId);const noteField=$('[data-gallery-review-note]',container);const note=noteField?noteField.value:(currentItem?.reviewNote||'');
  $$('[data-gallery-action]',container).forEach(button=>button.disabled=true);
  try{
    await apiRequest(`/api/admin/gallery/${encodeURIComponent(submissionId)}`,{method:'PATCH',body:{status,reviewNote:note}});
    const item=galleryItems.find(photo=>photo.id===submissionId);if(item){item.status=status;item.reviewNote=note}
    renderGalleryTabs();renderGalleryCounts();renderGalleryList();if(selectedGalleryId===submissionId)renderGalleryLightbox();
    const messages={pending:'Fotografie byla vrácena k posouzení.',approved:'Fotografie byla schválena.',rejected:'Fotografie byla zamítnuta.'};toast(messages[status]||'Stav fotografie byl změněn.');
  }catch(error){if(error.status===403){setDenied();return}toast(error.message||'Fotografii se nepodařilo změnit.')}finally{$$('[data-gallery-action]',container).forEach(button=>button.disabled=false)}
}

function setAdminView(view,{focus=true}={}){
  const nextView=ADMIN_VIEW_IDS.includes(view)?view:'dashboard';
  activeAdminView=nextView;rememberSessionChoice('e36UnitedAdmin.activeView',nextView);
  $$('[data-admin-panel]').forEach(panel=>{const active=panel.dataset.adminPanel===nextView;panel.hidden=!active;panel.classList.toggle('is-active',active);panel.setAttribute('aria-hidden',String(!active))});
  $$('[data-admin-jump]').forEach(button=>{const active=button.dataset.adminJump===nextView;button.classList.toggle('is-active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});
  adminPortalNavigation?.sync(nextView);
  closeReservationDrawer();closeGalleryLightbox();closeHistoryEvidence();
  window.scrollTo({top:0,behavior:'auto'});
  if(focus){const heading=$(`[data-admin-panel="${nextView}"] h2`);if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})}}
}
adminPortalNavigation=initPortalNavigation({root:$('[data-portal-nav="admin"]'),onSelect:view=>setAdminView(view)});

$('[data-login-form]').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('button[type="submit"]',event.currentTarget);const form=new FormData(event.currentTarget);button.disabled=true;$('[data-auth-status]').textContent='';
  try{await signInWithEmailAndPassword(auth,String(form.get('email')||'').trim(),String(form.get('password')||''))}
  catch(error){$('[data-auth-status]').textContent=error.code==='auth/invalid-credential'?'Neplatný e-mail nebo heslo.':'Přihlášení se nepodařilo.'}finally{button.disabled=false}
});

$('[data-event-select]').addEventListener('change',event=>{
  if(!adminEvents.some(item=>item.id===event.target.value))return;
  selectedEventId=event.target.value;reservationFilter='all';reservationDetailFilters.clear();reservationFiltersOpen=false;reservationSearch='';paymentFilter='attention';paymentSearch='';
  const reservationSearchInput=$('[data-reservation-search]');if(reservationSearchInput)reservationSearchInput.value='';
  const paymentSearchInput=$('[data-payment-search]');if(paymentSearchInput)paymentSearchInput.value='';
  loadEventData();
});

document.addEventListener('submit',event=>{
  const settings=event.target.closest('[data-event-settings-form]');
  if(settings){event.preventDefault();saveEventSettings(settings);return}
  const createForm=event.target.closest('[data-accommodation-create-form]');
  if(createForm){event.preventDefault();saveAccommodation(createForm);return}
  const editForm=event.target.closest('[data-accommodation-edit-form]');
  if(editForm){event.preventDefault();const card=editForm.closest('[data-accommodation-id]');if(card)saveAccommodation(editForm,card.dataset.accommodationId)}
});

document.addEventListener('click',event=>{
  const logout=event.target.closest('[data-logout]');if(logout){signOut(auth);return}
  const refresh=event.target.closest('[data-refresh]');if(refresh){loadAdminData();return}
  const collapse=event.target.closest('[data-admin-collapse-toggle]');if(collapse){const section=collapse.dataset.adminCollapseToggle;setAdminSectionCollapsed(section,collapse.getAttribute('aria-expanded')==='true',{persist:true});return}
  const jump=event.target.closest('[data-admin-jump]');if(jump){setAdminView(jump.dataset.adminJump);return}
  const filter=event.target.closest('[data-reservation-filter]');if(filter){setReservationFilter(filter.dataset.reservationFilter);return}
  const filterToggle=event.target.closest('[data-reservation-filter-toggle]');if(filterToggle){reservationFiltersOpen=!reservationFiltersOpen;renderReservationTabs();return}
  const detailFilter=event.target.closest('[data-reservation-detail-filter]');if(detailFilter){const value=detailFilter.dataset.reservationDetailFilter;if(reservationDetailFilters.has(value))reservationDetailFilters.delete(value);else reservationDetailFilters.add(value);renderReservationTabs();renderReservationList();return}
  if(event.target.closest('[data-reservation-filter-clear]')){reservationDetailFilters.clear();renderReservationTabs();renderReservationList();return}
  const reservationMode=event.target.closest('[data-reservation-mode]');if(reservationMode){const mode=reservationMode.dataset.reservationMode;if(RESERVATION_VIEW_MODES.includes(mode)){reservationViewMode=mode;rememberSessionChoice('e36UnitedAdmin.reservationViewMode',mode);renderReservationViewMode();renderReservationList()}return}
  const paymentFilterButton=event.target.closest('[data-payment-filter]');if(paymentFilterButton){setPaymentFilter(paymentFilterButton.dataset.paymentFilter);return}
  const attention=event.target.closest('[data-attention-target]');if(attention){const target=attention.dataset.attentionTarget;if(target==='reservations')setReservationFilter(attention.dataset.attentionFilter);if(target==='payments')setPaymentFilter(attention.dataset.attentionFilter);if(target==='gallery'){setGalleryFilter(attention.dataset.attentionFilter);setGalleryMode(attention.dataset.galleryModeTarget||'community')}setAdminView(target);return}
  const pending=event.target.closest('[data-open-pending]');if(pending){setReservationFilter('pending');setAdminView('reservations');return}
  const galleryPending=event.target.closest('[data-open-gallery-pending]');if(galleryPending){setGalleryMode('community');setGalleryFilter('pending');setAdminView('gallery');return}
  const galleryModeButton=event.target.closest('[data-gallery-mode]');if(galleryModeButton){setGalleryMode(galleryModeButton.dataset.galleryMode);return}
  const galleryFilterButton=event.target.closest('[data-gallery-filter]');if(galleryFilterButton){setGalleryFilter(galleryFilterButton.dataset.galleryFilter);return}
  const historyFilterButton=event.target.closest('[data-history-filter]');if(historyFilterButton){historyFilter=historyFilterButton.dataset.historyFilter;renderHistoryClaims();return}
  const reservationOpen=event.target.closest('[data-reservation-open]');if(reservationOpen){openReservationDrawer(reservationOpen.dataset.reservationOpen,reservationOpen);return}
  if(event.target.closest('[data-reservation-drawer-close]')){closeReservationDrawer();return}
  const paymentSave=event.target.closest('[data-payment-save]');if(paymentSave){const card=paymentSave.closest('[data-reservation-id]');if(card)updateReservationPayment(card);return}
  const paymentFull=event.target.closest('[data-payment-full]');if(paymentFull){const card=paymentFull.closest('[data-reservation-id]');if(card)updateReservationPayment(card,true);return}
  const preview=event.target.closest('[data-gallery-preview]');if(preview){openGalleryLightbox(preview.dataset.galleryPreview,preview);return}
  if(event.target.closest('[data-gallery-lightbox-close]')){closeGalleryLightbox();return}
  const galleryAction=event.target.closest('[data-gallery-action]');if(galleryAction){const card=galleryAction.closest('[data-gallery-id]');if(card)updateGallery(card,galleryAction.dataset.galleryAction);return}
  const historyEvidence=event.target.closest('[data-history-evidence]');if(historyEvidence){openHistoryEvidence(historyEvidence.dataset.historyEvidence,historyEvidence);return}
  if(event.target.closest('[data-history-evidence-close]')){closeHistoryEvidence();return}
  const historyAction=event.target.closest('[data-history-action]');if(historyAction){const card=historyAction.closest('[data-history-id]');if(card)reviewHistoryClaim(card,historyAction.dataset.historyComponent,historyAction.dataset.historyAction);return}
  const photoUpload=event.target.closest('[data-accommodation-photo-upload]');if(photoUpload){uploadAccommodationPhoto(photoUpload.closest('[data-accommodation-id]'));return}
  const photoRemove=event.target.closest('[data-accommodation-photo-remove]');if(photoRemove){removeAccommodationPhoto(photoRemove.closest('[data-accommodation-id]'));return}
  const action=event.target.closest('[data-review-action]');if(action){const card=action.closest('[data-reservation-id]');if(card)updateReservation(card,action.dataset.reviewAction)}
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('[data-reservation-drawer]').hidden){closeReservationDrawer();return}
  if(event.key==='Escape'&&!$('[data-gallery-lightbox]').hidden){closeGalleryLightbox();return}
  if(event.key==='Escape'&&!$('[data-history-evidence-lightbox]').hidden){closeHistoryEvidence();return}
  if((event.key==='Enter'||event.key===' ')&&event.target.matches('tr[data-reservation-open]')){event.preventDefault();openReservationDrawer(event.target.dataset.reservationOpen,event.target);return}
  if((event.key==='Enter'||event.key===' ')&&event.target.closest('[data-open-pending]')){event.preventDefault();setReservationFilter('pending');setAdminView('reservations')}
  if((event.key==='Enter'||event.key===' ')&&event.target.closest('[data-open-gallery-pending]')){event.preventDefault();setGalleryFilter('pending');setAdminView('gallery')}
});

$('[data-reservation-search]')?.addEventListener('input',event=>{reservationSearch=event.target.value;renderReservationList()});
$('[data-payment-search]')?.addEventListener('input',event=>{paymentSearch=event.target.value;renderPaymentList()});
$('[data-history-search]')?.addEventListener('input',event=>{historySearch=event.target.value;renderHistoryClaims()});
document.addEventListener('change',event=>{if(event.target.matches('[data-accommodation-photo-input]'))previewAccommodationPhoto(event.target)});

initializeAdminCollapsibles();

onAuthStateChanged(auth,user=>{
  currentUser=user;
  if(!user){closeGalleryLightbox();closeHistoryEvidence();closeReservationDrawer();releaseGalleryMedia();releaseHistoryEvidence();galleryItems=[];historyClaims=[];reservationItems=[];accommodationItems=[];adminEvents=[];selectedEventId='';setView('auth');$('[data-admin-account]').textContent='';return}
  reservationFilter='all';reservationDetailFilters.clear();reservationFiltersOpen=false;galleryFilter='pending';galleryMode='community';historyFilter='pending';historySearch='';paymentFilter='attention';
  $('[data-admin-account]').textContent=user.email||user.uid;
  loadAdminData();
});
