import { canonicalMemberLink } from '../member-detail.js?v=20260911-member-rows-r3';
import {showReservationMedia,clearReservationMedia} from '../reservation-media.js?v=20260911-member-rows-r3';
import {listChanged,renderListPagination} from '../lists.js?v=20260911-member-rows-r3';
import { adminCommand, editorProtected, allowAdminNavigation, forgetAdminEditor } from '../editors.js?v=20260911-member-rows-r3';
import { accommodationVisualMarkup, bindAccommodationVisualFallbacks } from '../../accommodation-visual.js?v=20260911-member-rows-r3';
import { RESERVATION_DETAIL_FILTERS, RESERVATION_PRIMARY_FILTERS, RESERVATION_VIEW_MODES, adminItemPayment, filterAdminPayments, filterAdminReservations, paymentMatchesFilter, reservationMatchesFilter } from '../../admin-view-model.js?v=20260911-member-rows-r3';
import { apiBaseUrl, apiRequest } from '../api.js?v=20260911-member-rows-r3';
import { renderAttentionCounts } from './dashboard-events.js?v=20260911-member-rows-r3';
import { adminState } from '../state.js?v=20260911-member-rows-r3';
import { setDenied } from '../shell.js?v=20260911-member-rows-r3';
import { $, $$, attendanceLabel, attendanceShortLabel, escapeHtml, formatDate, formatMoney, numeric, paymentLabel, paymentQrSvg, recordsLabel, rememberSessionChoice, statusLabel, toast } from '../ui.js?v=20260911-member-rows-r3';

const paymentFilterLabels={attention:'Vyžaduje kontrolu',all:'Vše',unpaid:'K platbě',underpaid:'Doplatek',paid:'Zaplaceno',overpaid:'Přeplatek'};
import {mergeReservation} from '../confirmed-state.js?v=20260911-member-rows-r3';
let reservationDrawerReturnFocus=null;
let revisionContext='',revisionFloor=new Map();
function floors(){
  const key=[adminState.currentUser?.uid,adminState.sessionGeneration,adminState.selectedEventId].join('|');
  if(key!==revisionContext){revisionContext=key;revisionFloor=new Map()}return revisionFloor;
}
function acceptReservation(item,current=reservationById(item?.id)){
  if(!item)return current;
  if(!current)return Number(item.revision||0)>=(floors().get(item.id)||0)?item:null;
  return mergeReservation(current,item,floors().get(item.id)||0);
}
function commandResult(id){
  const user=adminState.currentUser,generation=adminState.sessionGeneration,eventId=adminState.selectedEventId;
  return payload=>{
    const receipt=payload.operation;
    if(adminState.currentUser!==user||adminState.sessionGeneration!==generation||adminState.selectedEventId!==eventId||adminState.denied||
      receipt.actorId!==user?.uid||receipt.eventId!==eventId||receipt.entityId!==id||!['reservation','payment'].includes(receipt.operation))return;
    floors().set(id,Math.max(floors().get(id)||0,receipt.revision));
    if(!payload.reservation||payload.reservation.id!==id)return; // receipt/replay: revalidate, do not invent a projection
    const incoming={...payload.reservation,revision:receipt.revision};
    if(adminState.reservationDetail?.id===id)adminState.reservationDetail=acceptReservation(incoming);
    adminState.reservationItems=adminState.reservationItems.map(item=>item.id===id?acceptReservation(incoming,item):item);
    renderReservationTabs();renderReservationList();renderPaymentTabs();renderPaymentList();
    if(adminState.selectedReservationId===id)renderReservationDrawer();
  };
}
function requestCommandResult(reservationId,requestId,request){
  const user=adminState.currentUser,generation=adminState.sessionGeneration,eventId=adminState.selectedEventId;
  return payload=>{
    const receipt=payload.operation,confirmedRequest=payload.request;
    if(adminState.currentUser!==user||adminState.sessionGeneration!==generation||adminState.selectedEventId!==eventId||adminState.denied||
      receipt?.actorId!==user?.uid||receipt?.eventId!==eventId||receipt?.entityId!==reservationId||receipt?.operation!=='reservation-request'||
      confirmedRequest?.id!==requestId||!['approved','rejected'].includes(confirmedRequest.status)||request?.dataset.reservationRequestId!==requestId||
      request.closest('article[data-reservation-id]')?.dataset.reservationId!==reservationId)return;
    const focusTarget=request.closest('[data-reservation-drawer]')?.querySelector('[data-reservation-drawer-close]:not(.admin-reservation-drawer-backdrop)');
    if(request.contains(document.activeElement))focusTarget?.focus({preventScroll:true});
    request.remove();
  };
}
const reservationById=id=>adminState.reservationDetail?.id===id?adminState.reservationDetail:adminState.reservationItems.find(item=>item.id===id);
export function renderReservationDetail(payload){
  const incoming=payload.reservations?.[0],id=adminState.selectedReservationId||adminState.requestedReservationId;
  if(incoming&&incoming.id!==id)return;
  if(incoming)adminState.reservationDetail=acceptReservation(incoming);
  else if(id)adminState.reservationDetail=null;
  if(adminState.selectedReservationId)return renderReservationDrawer();
}

function itemPayment(item){return adminItemPayment(item)}

function renderReservationTabs(){
  $$('[data-reservation-nav-count]').forEach(node=>node.textContent=adminState.summary?.overview?.statuses?.pending??'—');
  $$('[data-reservation-filter]').forEach(button=>{
    const filter=button.dataset.reservationFilter;
    const count=adminState.reservationCounts?.[filter]??adminState.reservationItems.filter(item=>reservationMatchesFilter(item,filter)).length;
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
    {status:'approved',label:'Schválit rezervaci',className:'approve'},
    {status:'rejected',label:'Zamítnout rezervaci',className:'reject'},
  ];
  return actions.filter(action=>action.status!==item.status).map(action=>`<button class="admin-button ${action.className}" data-review-action="${action.status}" type="button">${action.label}</button>`).join('');
}

function reservationMemberTitle(item){const member=item.member||{};return member.nickname||member.name||member.email||'Člen United'}
function reservationDifference(item){const payment=itemPayment(item);if(payment.status==='overpaid')return `Přeplatek ${formatMoney(payment.overpaymentCzk)}`;if(payment.status==='underpaid')return `Doplatek ${formatMoney(payment.remainingCzk)}`;if(payment.status==='unpaid')return `K platbě ${formatMoney(payment.remainingCzk)}`;return payment.status==='paid'?'Zaplaceno':'Bez platby'}
function requestValue(value){return value==null||value===''?'—':String(value)}
function requestFieldRows(request){
  const original=request.original||{},proposed=request.proposed||{};
  const value=(source,key)=>key==='accommodationName'?source.accommodationSnapshot?.optionName||source.accommodation:source[key];
  const fields=[['Příjezd','arrival'],['Posádka','crew'],['Ubytování','accommodationName'],['Ubytované osoby','accommodationUnits'],['Show & Shine','showShine'],['Poznámka','note'],['Cena','amountDueCzk']];
  return fields.filter(([,key])=>request.type==='change'&&String(value(original,key)??'')!==String(value(proposed,key)??''))
    .map(([label,key])=>`<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(key==='amountDueCzk'?formatMoney(value(original,key)):requestValue(value(original,key)))}</td><td>${escapeHtml(key==='amountDueCzk'?formatMoney(value(proposed,key)):requestValue(value(proposed,key)))}</td></tr>`).join('');
}
function reservationRequestMarkup(item){
  const request=item.requests?.find(value=>value.status==='pending');if(!request)return '';
  const title=request.type==='cancellation'?'Žádost o zrušení':'Žádost o změnu',rows=requestFieldRows(request);
  return `<section class="admin-reservation-request" data-reservation-request-id="${escapeHtml(request.id)}"><span class="admin-kicker">ČEKÁ NA ROZHODNUTÍ</span><h3>${title}</h3>${request.memberNote?`<p><b>Zpráva člena:</b> ${escapeHtml(request.memberNote)}</p>`:''}${rows?`<div class="admin-table-scroll"><table><thead><tr><th>Údaj</th><th>Platná rezervace</th><th>Navrhovaná změna</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<p>Původní rezervace zůstává platná do schválení žádosti.</p>`}<label><span>Komentář viditelný členovi</span><textarea data-request-admin-comment maxlength="1000" rows="3" placeholder="Rozhodnutí můžeš členovi stručně vysvětlit."></textarea></label><div class="admin-review-actions"><button class="admin-button approve" data-request-decision="approved" type="button">Schválit žádost</button><button class="admin-button reject" data-request-decision="rejected" type="button">Zamítnout žádost</button></div></section>`;
}
function reservationHistoryMarkup(item){
  if(!item.history?.length)return '';
  return `<section class="admin-reservation-history"><span class="admin-kicker">HISTORIE REZERVACE</span><ol>${item.history.map(entry=>`<li><time>${escapeHtml(formatDate(entry.at))}</time><div><b>${escapeHtml(entry.label||entry.type)}</b>${entry.comment?`<p>${escapeHtml(entry.comment)}</p>`:''}</div></li>`).join('')}</ol></section>`;
}

function reservationQuickRow(item){
  const member=item.member||{},payment=itemPayment(item),attention=payment.overdue&&payment.remainingCzk>0?'Po splatnosti':paymentLabel(payment.status),reservationState=item.cancellationPending?'Zrušení čeká':item.changePending?'Změna čeká':statusLabel(item.status);
  return `<tr data-reservation-open="${escapeHtml(item.id)}" tabindex="0"><td><strong>${canonicalMemberLink(item.memberId||member.id,reservationMemberTitle(item))}</strong><small>${escapeHtml(member.email||member.name||'Bez kontaktu')}</small></td><td><i class="admin-badge admin-badge--${escapeHtml(item.status)}">${escapeHtml(reservationState)}</i></td><td class="admin-table-money">${escapeHtml(formatMoney(payment.amountDueCzk))}</td><td class="admin-table-money">${escapeHtml(formatMoney(payment.amountPaidCzk))}</td><td><i class="admin-badge admin-payment--${escapeHtml(payment.status)}">${escapeHtml(attention)}</i></td><td class="admin-table-money"><strong>${escapeHtml(reservationDifference(item))}</strong></td><td><span>${escapeHtml(formatDate(item.updatedAt))}</span></td><td><button aria-label="Otevřít detail rezervace ${escapeHtml(reservationMemberTitle(item))}" class="admin-table-detail" data-reservation-open="${escapeHtml(item.id)}" type="button">Detail →</button></td></tr>`;
}

function reservationDetailRow(item){
  const member=item.member||{},payment=itemPayment(item),snapshot=item.accommodationSnapshot||null,accommodation=snapshot?`${numeric(snapshot.unitCount)}× ${snapshot.optionName}`:item.accommodation||'Bez ubytování';
  return `<tr data-reservation-open="${escapeHtml(item.id)}" tabindex="0"><td><strong>${canonicalMemberLink(item.memberId||member.id,member.name||reservationMemberTitle(item))}</strong></td><td>${escapeHtml(member.email||'—')}</td><td>${escapeHtml(member.nickname||'—')}</td><td>${numeric(item.crew)}</td><td>${escapeHtml(attendanceLabel(item.attendanceType))}</td><td>${escapeHtml(accommodation)}</td><td class="admin-table-money">${escapeHtml(formatMoney(payment.amountDueCzk))}</td><td class="admin-table-money">${escapeHtml(formatMoney(payment.amountPaidCzk))}</td><td>${escapeHtml(payment.variableSymbol||'—')}</td><td><i class="admin-badge admin-badge--${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</i><i class="admin-badge admin-payment--${escapeHtml(payment.status)}">${escapeHtml(paymentLabel(payment.status))}</i></td><td>${escapeHtml(formatDate(item.updatedAt))}</td><td><button aria-label="Otevřít detail rezervace ${escapeHtml(reservationMemberTitle(item))}" class="admin-table-detail" data-reservation-open="${escapeHtml(item.id)}" type="button">Detail →</button></td></tr>`;
}

function renderReservationList(){
  const reservations=filterAdminReservations(adminState.reservationItems,{filter:adminState.reservationFilter,filters:adminState.reservationDetailFilters,query:adminState.reservationSearch});
  $('[data-reservation-count]').textContent=`${recordsLabel(reservations.length)} z ${adminState.reservationPagination?.total??adminState.reservationItems.length}`;
  const list=$('[data-reservation-list]');
  if(!reservations.length){list.innerHTML='<div class="admin-empty">Aktuálním filtrům a hledání neodpovídá žádná rezervace.</div>';return}
  const quick=adminState.reservationViewMode==='quick';
  const headers=quick?'<th>Člen</th><th>Rezervace</th><th>Celkem</th><th>Uhrazeno</th><th>Platba</th><th>Bilance</th><th>Aktualizace</th><th></th>':'<th>Člen</th><th>E-mail</th><th>Přezdívka</th><th>Posádka</th><th>Účast</th><th>Ubytování</th><th>Celkem</th><th>Uhrazeno</th><th>VS</th><th>Stavy</th><th>Aktualizace</th><th></th>';
  list.innerHTML=`<div class="admin-table-scroll"><table class="admin-data-table admin-reservation-table admin-reservation-table--${quick?'quick':'detail'}" data-reservation-table data-mode="${adminState.reservationViewMode}"><thead><tr>${headers}</tr></thead><tbody>${reservations.map(quick?reservationQuickRow:reservationDetailRow).join('')}</tbody></table></div>`;
}

function renderReservationDrawer(){
  const editor=$('[data-reservation-drawer-content] article[data-reservation-id]');
  const protectedEditor=editorProtected(editor,reservationById(adminState.selectedReservationId)?.revision,renderReservationDrawer);
  const item=reservationById(adminState.selectedReservationId);
  if(!item){closeReservationDrawer();return}
  const member=item.member||{},car=item.carSnapshot||{},snapshot=item.accommodationSnapshot||null;
  const accommodation=snapshot?`${numeric(snapshot.peopleCount)} ${numeric(snapshot.peopleCount)===1?'osoba':'osob'} · ${numeric(snapshot.unitCount)}× ${snapshot.optionName}`:`${item.accommodation||'Bez ubytování'} · ${numeric(item.accommodationUnits)} osob`,payment=itemPayment(item),qr=paymentQrSvg(payment.spayd);
  const accommodationVisual=snapshot?accommodationVisualMarkup({...snapshot,id:snapshot.optionId,name:snapshot.optionName},{apiBaseUrl,nights:snapshot.nights,className:'accommodation-visual--drawer'}):'';
  const markup=`<article class="admin-reservation-drawer-card" data-reservation-id="${escapeHtml(item.id)}">
<header><span class="admin-kicker">Detail rezervace</span><div><small data-command-reservation-status class="admin-badge admin-badge--${escapeHtml(item.status)}">${escapeHtml(item.changePending?'Změna čeká na schválení':statusLabel(item.status))}</small><small class="admin-badge admin-payment--${escapeHtml(payment.status)}">${escapeHtml(payment.overdue&&payment.remainingCzk>0?'Po splatnosti':paymentLabel(payment.status))}</small></div><h2 id="admin-reservation-drawer-title">${escapeHtml(member.nickname||member.name||'Člen United')}</h2><p>${escapeHtml(member.name||'Jméno neuvedeno')} · ${escapeHtml(member.email||'E-mail neuveden')}</p><p class="command-reservation-reference">Rezervace ${escapeHtml(item.id)}</p></header>
    <h3 class="admin-drawer-section-title">Rezervace</h3>
    <div class="admin-reservation-drawer-grid">
      <section><small>ČLEN</small><b>${canonicalMemberLink(item.memberId||member.id,member.name||'—')}</b><span>${escapeHtml(member.nickname||'Bez přezdívky')} · ${escapeHtml(member.memberCode||'Bez kódu')}</span><span>${escapeHtml(member.email||'—')}</span><span class="command-qr">Členské QR: ${typeof item.reviewContext?.qrIssued==='boolean'?(item.reviewContext.qrIssued?'Vydáno':'Nevydáno'):'Nelze ověřit'}</span><button type="button" data-member-qr-open="${escapeHtml(item.memberId||member.id)}">Otevřít QR identitu člena</button></section>
      <section><small>VŮZ V REZERVACI</small>${item.reviewContext?.selectedCarPhoto?'<img class="command-selected-car" data-reservation-car-photo alt="Fotografie vozu vybraného v rezervaci"/>':'<p>Fotografie vybraného vozu není dostupná.</p>'}<b>${escapeHtml([car.body,car.model].filter(Boolean).join(' · ')||'—')}</b><span>${escapeHtml([car.nickname,car.year,car.color].filter(Boolean).join(' · ')||'Bez dalších údajů')}</span></section>
      <section class="command-stay"><small>POBYT</small><dl><div><dt>Příjezd</dt><dd>${escapeHtml(item.arrival||'Neuveden')}</dd></div>${item.departure?`<div><dt>Odjezd</dt><dd>${escapeHtml(item.departure)}</dd></div>`:''}<div><dt>Typ pobytu</dt><dd>${escapeHtml(attendanceLabel(item.attendanceType))}</dd></div><div><dt>Počet osob</dt><dd>${numeric(item.crew)}</dd></div>${snapshot&&Number.isFinite(snapshot.nights)?`<div><dt>Počet nocí</dt><dd>${snapshot.nights}</dd></div>`:''}</dl></section>
      <section class="admin-drawer-accommodation"><small>UBYTOVÁNÍ</small>${accommodationVisual}<b>${escapeHtml(accommodation)}</b><span>${snapshot?`max. ${numeric(snapshot.capacityPerUnit)} osob / jednotku · ${numeric(snapshot.nights)} ${numeric(snapshot.nights)===1?'noc':'noci'} · ${escapeHtml(formatMoney(snapshot.totalCzk))}`:'Cena ubytování není uložená'}</span>${item.capacityConflict?'<em>Čekající rezervace nyní přesahuje potvrzenou dostupnost.</em>':''}</section>
      <section><small>SHOW &amp; SHINE</small><b>${escapeHtml(item.showShine||'Ne')}</b><span>Zájem o účast v soutěži</span></section>
      <section><small>PLATBA</small><b>${escapeHtml(paymentLabel(payment.status))}</b><span>${escapeHtml(reservationDifference(item))}</span></section>
      <section><small>ODESLÁNO</small><b>${escapeHtml(formatDate(item.submittedAt))}</b><span>Aktualizováno ${escapeHtml(formatDate(item.updatedAt))}</span></section>
      <section><small>POSOUZENO</small><b>${escapeHtml(formatDate(item.reviewedAt))}</b><span>Interně: ${escapeHtml(item.reviewNote||'Bez interní poznámky')}</span>${item.memberComment?`<span>Pro člena: ${escapeHtml(item.memberComment)}</span>`:''}</section>
    </div>
    <h3 class="admin-drawer-section-title">Finance</h3>
    <section class="admin-payment-editor">${payment.testMode?'<div class="payment-test-warning">TESTOVACÍ PLATBA – NEPLAŤTE</div>':''}<div class="admin-payment-editor-grid"><div><span class="admin-kicker">Finance</span><h3>${escapeHtml(payment.overdue&&payment.remainingCzk>0?'Platba po splatnosti':reservationDifference(item))}</h3><dl><div><dt>Cena rezervace</dt><dd>${escapeHtml(formatMoney(payment.amountDueCzk))}</dd></div><div><dt>Evidovaně uhrazeno</dt><dd>${escapeHtml(formatMoney(payment.amountPaidCzk))}</dd></div><div><dt>${payment.status==='overpaid'?'Přeplatek':payment.status==='underpaid'?'Doplatek':'Bilance'}</dt><dd>${escapeHtml(payment.status==='overpaid'?formatMoney(payment.overpaymentCzk):formatMoney(payment.remainingCzk))}</dd></div><div><dt>VS</dt><dd>${escapeHtml(payment.variableSymbol||'—')}</dd></div><div><dt>Účet</dt><dd>${escapeHtml(payment.accountDisplay||'—')}</dd></div><div><dt>Splatnost</dt><dd>${escapeHtml(formatDate(payment.deadline,false))}</dd></div></dl><label><span>SKUTEČNĚ UHRAZENO (KČ)</span><input data-payment-amount max="10000000" min="0" step="1" type="number" value="${numeric(payment.amountPaidCzk)}"/></label><div class="admin-payment-actions"><button class="admin-button admin-button--primary" data-payment-save type="button">Uložit platbu <span>→</span></button><button class="admin-button" data-payment-full type="button">Označit plně uhrazeno</button></div></div>${qr?`<div class="admin-payment-qr"><div>${qr}</div><small>${escapeHtml(payment.message||'')}</small></div>`:''}</div></section>
    <div class="admin-reservation-drawer-notes"><div><small>POZNÁMKA ČLENA</small><p>${escapeHtml(item.note||'Bez poznámky člena.')}</p></div></div>
    ${reservationRequestMarkup(item)}
    ${reservationHistoryMarkup(item)}
    <h3 class="admin-drawer-section-title">Admin akce</h3>
    <div class="admin-review admin-reservation-drawer-review"><label><span>Interní poznámka</span><input maxlength="1000" data-review-note placeholder="Vidí pouze Admin" value="${escapeHtml(item.reviewNote||'')}"/></label><label><span>Zpráva pro člena</span><textarea maxlength="1000" rows="3" data-reservation-member-comment placeholder="Zobrazí se členovi u rezervace">${escapeHtml(item.memberComment||'')}</textarea></label><div class="admin-review-actions">${reservationActions(item)}</div></div>
  </article>`;
  if(protectedEditor){
    // Patch only read-only regions. Inputs, their selection/focus, the article and
    // drawer scroll container keep their identity; the full render is queued.
    const panel=editor.closest('.admin-reservation-drawer-panel'),top=panel.scrollTop;
    const template=document.createElement('template');template.innerHTML=markup;
    const next=template.content.firstElementChild;
    for(const selector of ['header','.admin-reservation-drawer-grid','.admin-payment-editor h3','.admin-payment-editor dl','.admin-payment-qr','.admin-reservation-drawer-notes','.admin-reservation-history']){
      const live=editor.querySelector(selector),fresh=next.querySelector(selector);
      if(live&&fresh&&live.innerHTML!==fresh.innerHTML){
        // Keep a loaded private image/blob when the media context did not change.
        const image=live.querySelector('[data-reservation-car-photo]'),replacement=fresh.querySelector('[data-reservation-car-photo]');
        if(image&&replacement&&image.dataset.mediaKey===JSON.stringify(item.reviewContext?.selectedCarPhoto))replacement.replaceWith(image);
        const notices=selector==='header'?[...live.querySelectorAll('[data-operation-status],[data-render-status]')]:[];
        live.replaceChildren(...fresh.childNodes,...notices);
      }
    }
    const actions=editor.querySelector('.admin-review-actions');
    for(const button of actions.querySelectorAll('[data-review-action]'))if(button.dataset.reviewAction===item.status)button.remove();
    for(const button of next.querySelectorAll('.admin-review-actions button'))if(!actions.querySelector('[data-review-action="'+button.dataset.reviewAction+'"]'))actions.append(button);
    if(['saving','outcome_unknown','conflict'].includes(editor.dataset.operationState))actions.querySelectorAll('button').forEach(button=>button.disabled=true);
    const photo=editor.querySelector('[data-reservation-car-photo]');
    if(photo){showReservationMedia(photo,item.reviewContext?.selectedCarPhoto);photo.dataset.mediaKey=JSON.stringify(item.reviewContext?.selectedCarPhoto)}
    panel.scrollTop=top;return false;
  }
  forgetAdminEditor(editor);$('[data-reservation-drawer-content]').innerHTML=markup;
  bindAccommodationVisualFallbacks($('[data-reservation-drawer-content]'));
  showReservationMedia($('[data-reservation-car-photo]'),item.reviewContext?.selectedCarPhoto);
  const photo=$('[data-reservation-car-photo]');if(photo)photo.dataset.mediaKey=JSON.stringify(item.reviewContext?.selectedCarPhoto);
}

export function openReservationDrawer(id,source){
  if(!reservationById(id))return;
  if(adminState.selectedReservationId!==id)forgetAdminEditor($('[data-reservation-drawer-content] article'));
  adminState.reservationDetail=reservationById(id);adminState.selectedReservationId=id;reservationDrawerReturnFocus=source||document.activeElement;renderReservationDrawer();
  $('[data-reservation-drawer]').hidden=false;document.body.classList.add('admin-overlay-open');
  $('[data-reservation-drawer-close]:not(.admin-reservation-drawer-backdrop)')?.focus();
  if(!adminState.restoringRoute)window.dispatchEvent(new CustomEvent('admin:detailopened'));
}

export function closeReservationDrawer(){
  forgetAdminEditor($('[data-reservation-drawer-content] article'));clearReservationMedia();
  const wasOpen=adminState.selectedReservationId;
  const drawer=$('[data-reservation-drawer]');if(drawer)drawer.hidden=true;adminState.selectedReservationId=null;document.body.classList.remove('admin-overlay-open');
  if(reservationDrawerReturnFocus?.isConnected)reservationDrawerReturnFocus.focus();reservationDrawerReturnFocus=null;
  if(wasOpen&&!adminState.restoringRoute)window.dispatchEvent(new CustomEvent('admin:detailclosed'));
}

function paymentRow(item){
  const member=item.member||{},payment=itemPayment(item),difference=reservationDifference(item),attention=payment.overdue&&payment.remainingCzk>0?'Po splatnosti':paymentLabel(payment.status);
  return `<tr data-reservation-open="${escapeHtml(item.id)}" tabindex="0"><td><strong>${canonicalMemberLink(item.memberId||member.id,reservationMemberTitle(item))}</strong><small>${escapeHtml(member.email||member.name||'Bez kontaktu')}</small></td><td>${escapeHtml(payment.variableSymbol||'—')}</td><td class="admin-table-money">${escapeHtml(formatMoney(payment.amountDueCzk))}</td><td class="admin-table-money">${escapeHtml(formatMoney(payment.amountPaidCzk))}</td><td class="admin-table-money"><strong>${escapeHtml(difference)}</strong></td><td><i class="admin-badge admin-payment--${escapeHtml(payment.status)}">${escapeHtml(attention)}</i></td><td>${escapeHtml(formatDate(payment.deadline,false))}</td><td><button aria-label="Otevřít platbu ${escapeHtml(reservationMemberTitle(item))}" class="admin-table-detail" data-reservation-open="${escapeHtml(item.id)}" type="button">Detail →</button></td></tr>`;
}

function renderPaymentTabs(){
  $$('[data-payment-filter]').forEach(button=>{
    const filter=button.dataset.paymentFilter,count=adminState.reservationCounts?.[filter]??adminState.reservationItems.filter(item=>paymentMatchesFilter(item,filter)).length;
    const counter=$(`[data-payment-filter-count="${filter}"]`,button);if(counter)counter.textContent=count;
    const active=filter===adminState.paymentFilter;button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  });
}

function renderPaymentList(){
  const payments=filterAdminPayments(adminState.reservationItems,{filter:adminState.paymentFilter,query:adminState.paymentSearch});
  const count=$('[data-payment-count]');if(count)count.textContent=`${recordsLabel(payments.length)} z ${adminState.reservationPagination?.total??adminState.reservationItems.length}`;
  const list=$('[data-payment-list]');if(!list)return;
  if(!payments.length){list.innerHTML=`<div class="admin-empty">Filtru ${escapeHtml(paymentFilterLabels[adminState.paymentFilter].toLowerCase())} a hledání neodpovídá žádná platba.</div>`;return}
  list.innerHTML=`<div class="admin-table-scroll"><table class="admin-data-table admin-payment-table"><thead><tr><th>Člen</th><th>VS</th><th>Předepsáno</th><th>Uhrazeno</th><th>Rozdíl</th><th>Stav</th><th>Splatnost</th><th></th></tr></thead><tbody>${payments.map(paymentRow).join('')}</tbody></table></div>`;
}

export function renderReservations(payload){adminState.reservationPagination=payload.pagination||null;adminState.reservationCounts=payload.counts||null;renderListPagination(adminState.activeAdminView==='payments'?'payments':'reservations',payload.pagination);adminState.reservationItems=Array.isArray(payload.reservations)?payload.reservations.map(item=>acceptReservation(item)).filter(Boolean):[];renderReservationTabs();renderReservationViewMode();renderReservationList();renderPaymentTabs();renderPaymentList();renderAttentionCounts();if(adminState.selectedReservationId)renderReservationDrawer()}

export function setReservationFilter(filter){
  if(RESERVATION_DETAIL_FILTERS.includes(filter)){adminState.reservationFilter='all';adminState.reservationDetailFilters=new Set([filter]);adminState.reservationFiltersOpen=true}
  else if(RESERVATION_PRIMARY_FILTERS.includes(filter))adminState.reservationFilter=filter;else return;
  listChanged();
  renderReservationTabs();renderReservationList();
}

export function toggleReservationFilters(){adminState.reservationFiltersOpen=!adminState.reservationFiltersOpen;renderReservationTabs()}
export function toggleReservationDetailFilter(value){if(adminState.reservationDetailFilters.has(value))adminState.reservationDetailFilters.delete(value);else adminState.reservationDetailFilters.add(value);listChanged();renderReservationTabs();renderReservationList()}
export function clearReservationDetailFilters(){adminState.reservationDetailFilters.clear();listChanged();renderReservationTabs();renderReservationList()}
export function setReservationViewMode(mode){if(RESERVATION_VIEW_MODES.includes(mode)){adminState.reservationViewMode=mode;rememberSessionChoice('e36UnitedAdmin.reservationViewMode',mode);renderReservationViewMode();renderReservationList()}}
export function setReservationSearch(value){adminState.reservationSearch=value;listChanged({search:true});renderReservationList()}

export function setPaymentFilter(filter){
  if(!paymentFilterLabels[filter])return;
  adminState.paymentFilter=filter;listChanged();renderPaymentTabs();renderPaymentList();
}
export function setPaymentSearch(value){adminState.paymentSearch=value;listChanged({search:true});renderPaymentList()}

export async function updateReservation(card,status,reloadEventData){
  const button=card.querySelector(`[data-review-action="${status}"]`);const note=$('[data-review-note]',card)?.value||'',memberComment=$('[data-reservation-member-comment]',card)?.value||'';const reservationId=card.dataset.reservationId;
  if(button)button.disabled=true;
  try{
    await adminCommand(`/api/admin/reservations/${encodeURIComponent(reservationId)}`,{method:'PATCH',body:{status,reviewNote:note,memberComment},editor:card,submitted:{':reviewNote':note,':reservationMemberComment':memberComment},onConfirmed:commandResult(reservationId)});
    const messages={pending:'Rezervace byla vrácena k posouzení.',approved:'Rezervace byla schválena.',rejected:'Rezervace byla zamítnuta.'};toast(messages[status]||'Stav rezervace byl změněn.');
    // The confirmed command receipt already invalidates this context once.
    // Do not abort/restart that authoritative refresh with a second context load.
  }
  catch(error){if(error.status===403){setDenied();return}toast(error.message||'Rezervaci se nepodařilo změnit.')}finally{if(button)button.disabled=false}
}

export async function reviewReservationRequest(card,decision){
  const request=card.querySelector('[data-reservation-request-id]'),button=request?.querySelector(`[data-request-decision="${decision}"]`),reservationId=card.dataset.reservationId,requestId=request?.dataset.reservationRequestId;
  if(!requestId||!['approved','rejected'].includes(decision))return;
  const adminComment=$('[data-request-admin-comment]',request)?.value||'';
  request.querySelectorAll('[data-request-decision]').forEach(control=>control.disabled=true);
  try{
    await adminCommand(`/api/admin/reservations/${encodeURIComponent(reservationId)}/requests/${encodeURIComponent(requestId)}`,{method:'PATCH',body:{decision,adminComment},editor:card,submitted:{':requestAdminComment':adminComment},onConfirmed:requestCommandResult(reservationId,requestId,request)});
    toast(decision==='approved'?'Žádost byla schválena.':'Žádost byla zamítnuta; původní rezervace zůstala beze změny.');
  }catch(error){if(error.status===403){setDenied();return}toast(error.message||'Rozhodnutí o žádosti se nepodařilo uložit.')}finally{if(button?.isConnected)request.querySelectorAll('[data-request-decision]').forEach(control=>control.disabled=false)}
}

export async function updateReservationPayment(card,markFull=false,reloadEventData){
  const reservationId=card.dataset.reservationId,item=reservationById(reservationId),payment=itemPayment(item),input=$('[data-payment-amount]',card);
  const amountPaidCzk=markFull?numeric(payment.amountDueCzk):Number(input?.value);
  if(!Number.isInteger(amountPaidCzk)||amountPaidCzk<0||amountPaidCzk>10000000){toast('Zadej celou uhrazenou částku od 0 do 10 000 000 Kč.');input?.focus();return}
  $$('[data-payment-save], [data-payment-full]',card).forEach(button=>button.disabled=true);
  try{
    await adminCommand(`/api/admin/reservations/${encodeURIComponent(reservationId)}/payment`,{method:'PATCH',body:{amountPaidCzk},editor:card,submitted:{':paymentAmount':String(amountPaidCzk)},onConfirmed:commandResult(reservationId)});
    toast(markFull?'Platba byla označena jako plně uhrazená.':'Uhrazená částka byla uložena.');
  }catch(error){if(error.status===403){setDenied();return}toast(error.message||'Platbu se nepodařilo uložit.')}
  finally{$$('[data-payment-save], [data-payment-full]',card).forEach(button=>button.disabled=false)}
}
