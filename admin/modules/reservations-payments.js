import { accommodationVisualMarkup, bindAccommodationVisualFallbacks } from '../../accommodation-visual.js?v=20260827-accommodation1';
import { RESERVATION_DETAIL_FILTERS, RESERVATION_PRIMARY_FILTERS, RESERVATION_VIEW_MODES, adminItemPayment, filterAdminPayments, filterAdminReservations, paymentMatchesFilter, reservationMatchesFilter } from '../../admin-view-model.js?v=20260831-admin-badge1';
import { apiBaseUrl, apiRequest } from '../api.js?v=20260903-mailing-b';
import { renderAttentionCounts } from './dashboard-events.js?v=20260903-phase5';
import { adminState } from '../state.js?v=20260903-mailing-b';
import { setDenied } from '../shell.js?v=20260903-mailing-b';
import { $, $$, attendanceLabel, attendanceShortLabel, escapeHtml, formatDate, formatMoney, numeric, paymentLabel, paymentQrSvg, recordsLabel, rememberSessionChoice, statusLabel, toast } from '../ui.js?v=20260903-phase5';

const paymentFilterLabels={attention:'Vyžaduje kontrolu',all:'Vše',unpaid:'K platbě',underpaid:'Doplatek',paid:'Zaplaceno',overpaid:'Přeplatek'};
let reservationDrawerReturnFocus=null;

function itemPayment(item){return adminItemPayment(item)}

function renderReservationTabs(){
  $('[data-reservation-nav-count]').textContent=adminState.reservationItems.filter(item=>item.status==='pending').length;
  $$('[data-reservation-filter]').forEach(button=>{
    const filter=button.dataset.reservationFilter;
    const count=adminState.reservationItems.filter(item=>reservationMatchesFilter(item,filter)).length;
    const counter=$(`[data-reservation-filter-count="${filter}"]`,button);
    if(counter)counter.textContent=count;
    const active=filter===adminState.reservationFilter;
    button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  });
  $$('[data-reservation-detail-filter]').forEach(button=>{const active=adminState.reservationDetailFilters.has(button.dataset.reservationDetailFilter);button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active))});
  const panel=$('[data-reservation-detail-panel]'),toggle=$('[data-reservation-filter-toggle]'),count=$('[data-reservation-detail-count]');
  if(panel)panel.hidden=!adminState.reservationFiltersOpen;if(toggle){toggle.classList.toggle('is-active',adminState.reservationFiltersOpen||adminState.reservationDetailFilters.size>0);toggle.setAttribute('aria-expanded',String(adminState.reservationFiltersOpen))}if(count)count.textContent=adminState.reservationDetailFilters.size;
}

function renderReservationViewMode(){
  $$('[data-reservation-mode]').forEach(button=>{const active=button.dataset.reservationMode===adminState.reservationViewMode;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active))});
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
  const reservations=filterAdminReservations(adminState.reservationItems,{filter:adminState.reservationFilter,filters:adminState.reservationDetailFilters,query:adminState.reservationSearch});
  $('[data-reservation-count]').textContent=`${recordsLabel(reservations.length)} z ${adminState.reservationItems.length}`;
  const list=$('[data-reservation-list]');
  if(!reservations.length){list.innerHTML='<div class="admin-empty">Aktuálním filtrům a hledání neodpovídá žádná rezervace.</div>';return}
  const quick=adminState.reservationViewMode==='quick';
  const headers=quick?'<th>Člen</th><th>Rezervace</th><th>Celkem</th><th>Uhrazeno</th><th>Platba</th><th>Bilance</th><th>Aktualizace</th><th></th>':'<th>Člen</th><th>E-mail</th><th>Přezdívka</th><th>Posádka</th><th>Účast</th><th>Ubytování</th><th>Celkem</th><th>Uhrazeno</th><th>VS</th><th>Stavy</th><th>Aktualizace</th><th></th>';
  list.innerHTML=`<div class="admin-table-scroll"><table class="admin-data-table admin-reservation-table admin-reservation-table--${quick?'quick':'detail'}" data-reservation-table data-mode="${adminState.reservationViewMode}"><thead><tr>${headers}</tr></thead><tbody>${reservations.map(quick?reservationQuickRow:reservationDetailRow).join('')}</tbody></table></div>`;
}

function renderReservationDrawer(){
  const item=adminState.reservationItems.find(reservation=>reservation.id===adminState.selectedReservationId);
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

export function openReservationDrawer(id,source){
  if(!adminState.reservationItems.some(item=>item.id===id))return;
  adminState.selectedReservationId=id;reservationDrawerReturnFocus=source||document.activeElement;renderReservationDrawer();
  $('[data-reservation-drawer]').hidden=false;document.body.classList.add('admin-overlay-open');
  $('[data-reservation-drawer-close]:not(.admin-reservation-drawer-backdrop)')?.focus();
}

export function closeReservationDrawer(){
  const drawer=$('[data-reservation-drawer]');if(drawer)drawer.hidden=true;adminState.selectedReservationId=null;document.body.classList.remove('admin-overlay-open');
  if(reservationDrawerReturnFocus?.isConnected)reservationDrawerReturnFocus.focus();reservationDrawerReturnFocus=null;
}

function paymentRow(item){
  const member=item.member||{},payment=itemPayment(item),difference=reservationDifference(item),attention=payment.overdue&&payment.remainingCzk>0?'Po splatnosti':paymentLabel(payment.status);
  return `<tr data-reservation-open="${escapeHtml(item.id)}" tabindex="0"><td><strong>${escapeHtml(reservationMemberTitle(item))}</strong><small>${escapeHtml(member.email||member.name||'Bez kontaktu')}</small></td><td>${escapeHtml(payment.variableSymbol||'—')}</td><td class="admin-table-money">${escapeHtml(formatMoney(payment.amountDueCzk))}</td><td class="admin-table-money">${escapeHtml(formatMoney(payment.amountPaidCzk))}</td><td class="admin-table-money"><strong>${escapeHtml(difference)}</strong></td><td><i class="admin-badge admin-payment--${escapeHtml(payment.status)}">${escapeHtml(attention)}</i></td><td>${escapeHtml(formatDate(payment.deadline,false))}</td><td><button aria-label="Otevřít platbu ${escapeHtml(reservationMemberTitle(item))}" class="admin-table-detail" data-reservation-open="${escapeHtml(item.id)}" type="button">Detail →</button></td></tr>`;
}

function renderPaymentTabs(){
  $$('[data-payment-filter]').forEach(button=>{
    const filter=button.dataset.paymentFilter,count=adminState.reservationItems.filter(item=>paymentMatchesFilter(item,filter)).length;
    const counter=$(`[data-payment-filter-count="${filter}"]`,button);if(counter)counter.textContent=count;
    const active=filter===adminState.paymentFilter;button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  });
}

function renderPaymentList(){
  const payments=filterAdminPayments(adminState.reservationItems,{filter:adminState.paymentFilter,query:adminState.paymentSearch});
  const count=$('[data-payment-count]');if(count)count.textContent=`${recordsLabel(payments.length)} z ${adminState.reservationItems.length}`;
  const list=$('[data-payment-list]');if(!list)return;
  if(!payments.length){list.innerHTML=`<div class="admin-empty">Filtru ${escapeHtml(paymentFilterLabels[adminState.paymentFilter].toLowerCase())} a hledání neodpovídá žádná platba.</div>`;return}
  list.innerHTML=`<div class="admin-table-scroll"><table class="admin-data-table admin-payment-table"><thead><tr><th>Člen</th><th>VS</th><th>Předepsáno</th><th>Uhrazeno</th><th>Rozdíl</th><th>Stav</th><th>Splatnost</th><th></th></tr></thead><tbody>${payments.map(paymentRow).join('')}</tbody></table></div>`;
}

export function renderReservations(payload){adminState.reservationItems=Array.isArray(payload.reservations)?payload.reservations:[];renderReservationTabs();renderReservationViewMode();renderReservationList();renderPaymentTabs();renderPaymentList();renderAttentionCounts();if(adminState.selectedReservationId)renderReservationDrawer()}

export function setReservationFilter(filter){
  if(RESERVATION_DETAIL_FILTERS.includes(filter)){adminState.reservationFilter='all';adminState.reservationDetailFilters=new Set([filter]);adminState.reservationFiltersOpen=true}
  else if(RESERVATION_PRIMARY_FILTERS.includes(filter))adminState.reservationFilter=filter;else return;
  renderReservationTabs();renderReservationList();
}

export function toggleReservationFilters(){adminState.reservationFiltersOpen=!adminState.reservationFiltersOpen;renderReservationTabs()}
export function toggleReservationDetailFilter(value){if(adminState.reservationDetailFilters.has(value))adminState.reservationDetailFilters.delete(value);else adminState.reservationDetailFilters.add(value);renderReservationTabs();renderReservationList()}
export function clearReservationDetailFilters(){adminState.reservationDetailFilters.clear();renderReservationTabs();renderReservationList()}
export function setReservationViewMode(mode){if(RESERVATION_VIEW_MODES.includes(mode)){adminState.reservationViewMode=mode;rememberSessionChoice('e36UnitedAdmin.reservationViewMode',mode);renderReservationViewMode();renderReservationList()}}
export function setReservationSearch(value){adminState.reservationSearch=value;renderReservationList()}

export function setPaymentFilter(filter){
  if(!paymentFilterLabels[filter])return;
  adminState.paymentFilter=filter;renderPaymentTabs();renderPaymentList();
}
export function setPaymentSearch(value){adminState.paymentSearch=value;renderPaymentList()}

export async function updateReservation(card,status,reloadEventData){
  const button=card.querySelector(`[data-review-action="${status}"]`);const note=$('[data-review-note]',card)?.value||'';const reservationId=card.dataset.reservationId;
  if(button)button.disabled=true;
  try{
    await apiRequest(`/api/admin/reservations/${encodeURIComponent(reservationId)}`,{method:'PATCH',body:{status,reviewNote:note}});
    const reservation=adminState.reservationItems.find(item=>item.id===reservationId);if(reservation){reservation.status=status;reservation.reviewNote=note;renderReservationTabs();renderReservationList();renderPaymentTabs();renderPaymentList();renderAttentionCounts();renderReservationDrawer()}
    const messages={pending:'Rezervace byla vrácena k posouzení.',approved:'Rezervace byla schválena.',rejected:'Rezervace byla zamítnuta.'};toast(messages[status]||'Stav rezervace byl změněn.');
    await reloadEventData();
  }
  catch(error){if(error.status===403){setDenied();return}toast(error.message||'Rezervaci se nepodařilo změnit.')}finally{if(button)button.disabled=false}
}

export async function updateReservationPayment(card,markFull=false,reloadEventData){
  const reservationId=card.dataset.reservationId,item=adminState.reservationItems.find(entry=>entry.id===reservationId),payment=itemPayment(item),input=$('[data-payment-amount]',card);
  const amountPaidCzk=markFull?numeric(payment.amountDueCzk):Number(input?.value);
  if(!Number.isInteger(amountPaidCzk)||amountPaidCzk<0||amountPaidCzk>10000000){toast('Zadej celou uhrazenou částku od 0 do 10 000 000 Kč.');input?.focus();return}
  $$('[data-payment-save], [data-payment-full]',card).forEach(button=>button.disabled=true);
  try{
    const payload=await apiRequest(`/api/admin/reservations/${encodeURIComponent(reservationId)}/payment`,{method:'PATCH',body:{amountPaidCzk}});
    if(item&&payload?.reservation?.payment){item.payment=payload.reservation.payment;item.paymentStatus=item.payment.status;item.amountPaidCzk=item.payment.amountPaidCzk;renderReservationTabs();renderReservationList();renderPaymentTabs();renderPaymentList();renderAttentionCounts();renderReservationDrawer()}
    toast(markFull?'Platba byla označena jako plně uhrazená.':'Uhrazená částka byla uložena.');await reloadEventData();
  }catch(error){if(error.status===403){setDenied();return}toast(error.message||'Platbu se nepodařilo uložit.')}
  finally{$$('[data-payment-save], [data-payment-full]',card).forEach(button=>button.disabled=false)}
}
