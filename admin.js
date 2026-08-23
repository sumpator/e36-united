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

function setLoading(active){loading=active;$('[data-loading]').hidden=!active;$$('[data-refresh], [data-review-action]').forEach(button=>button.disabled=active)}
function setDenied(){setView('denied')}
function setBar(selector,value,total){$(selector).style.width=`${total?Math.min(100,(numeric(value)/total)*100):0}%`}

function renderOverview(payload){
  const event=payload.event;
  const overview=payload.overview||{};
  const statuses=overview.statuses||{};
  const attendance=overview.attendance||{};
  const show=overview.showShine||{};
  const accommodation=overview.accommodation||{};
  const payments=overview.payments||{};
  $('[data-event-year]').textContent=event?.year||'—';
  $('[data-event-state]').textContent=event?`Registrace: ${event.registrationStatus||'—'}`:'Žádný event v databázi';
  $('[data-kpi-reservations]').textContent=numeric(overview.reservations);
  $('[data-kpi-people]').textContent=numeric(overview.people);
  $('[data-kpi-cars]').textContent=numeric(overview.cars);
  $('[data-kpi-pending]').textContent=numeric(statuses.pending);
  $('[data-kpi-payments]').textContent=`${numeric(payments.paid)+numeric(payments.earlyPaid)} / ${numeric(payments.unpaid)+numeric(payments.overdue)}`;
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

function renderReservations(payload){
  const reservations=Array.isArray(payload.reservations)?payload.reservations:[];
  $('[data-reservation-count]').textContent=`${reservations.length} ${reservations.length===1?'záznam':reservations.length>1&&reservations.length<5?'záznamy':'záznamů'}`;
  const list=$('[data-reservation-list]');
  if(!reservations.length){list.innerHTML='<div class="admin-empty">Pro tento event zatím nejsou žádné rezervace.</div>';return}
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
        <div class="admin-review"><input maxlength="1000" data-review-note placeholder="Krátká admin poznámka (hlavně při zamítnutí)" value="${escapeHtml(item.reviewNote||'')}"/><button class="admin-button approve" data-review-action="approved">Schválit</button><button class="admin-button reject" data-review-action="rejected">Zamítnout</button></div>
      </div>
    </article>`;
  }).join('');
}

async function loadAdminData(){
  if(loading)return;setLoading(true);
  try{
    const [overview,reservations]=await Promise.all([apiRequest('/api/admin/overview'),apiRequest('/api/admin/reservations')]);
    renderOverview(overview);renderReservations(reservations);setView('admin');
  }catch(error){if(error.status===403){setDenied();return}toast(error.message||'Admin data se nepodařilo načíst.')}finally{setLoading(false)}
}

async function updateReservation(card,status){
  const button=card.querySelector(`[data-review-action="${status}"]`);const note=$('[data-review-note]',card)?.value||'';
  button.disabled=true;
  try{await apiRequest(`/api/admin/reservations/${encodeURIComponent(card.dataset.reservationId)}`,{method:'PATCH',body:{status,reviewNote:note}});toast(status==='approved'?'Rezervace byla schválena.':'Rezervace byla zamítnuta.');await loadAdminData()}
  catch(error){if(error.status===403){setDenied();return}toast(error.message||'Rezervaci se nepodařilo změnit.')}finally{button.disabled=false}
}

$('[data-login-form]').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('button[type="submit"]',event.currentTarget);const form=new FormData(event.currentTarget);button.disabled=true;$('[data-auth-status]').textContent='';
  try{await signInWithEmailAndPassword(auth,String(form.get('email')||'').trim(),String(form.get('password')||''))}
  catch(error){$('[data-auth-status]').textContent=error.code==='auth/invalid-credential'?'Neplatný e-mail nebo heslo.':'Přihlášení se nepodařilo.'}finally{button.disabled=false}
});

document.addEventListener('click',event=>{
  const logout=event.target.closest('[data-logout]');if(logout){signOut(auth);return}
  const refresh=event.target.closest('[data-refresh]');if(refresh){loadAdminData();return}
  const action=event.target.closest('[data-review-action]');if(action){const card=action.closest('[data-reservation-id]');if(card)updateReservation(card,action.dataset.reviewAction)}
});

onAuthStateChanged(auth,user=>{
  currentUser=user;
  if(!user){setView('auth');$('[data-admin-account]').textContent='';return}
  $('[data-admin-account]').textContent=user.email||user.uid;
  loadAdminData();
});
