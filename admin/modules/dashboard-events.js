import { adminCommand, editorProtected, changedFields, forgetAdminEditor } from '../editors.js?v=20260912-reservation-detail-ux-r1';
import { adminActionCountState, adminModerationCounts, paymentNeedsAttention, reservationMatchesFilter } from '../../admin-view-model.js?v=20260912-reservation-detail-ux-r1';
import { apiRequest } from '../api.js?v=20260912-reservation-detail-ux-r1';
import { adminState } from '../state.js?v=20260912-reservation-detail-ux-r1';
import { setDenied } from '../shell.js?v=20260912-reservation-detail-ux-r1';
import { $, $$, escapeHtml, formatDate, formatMoney, numeric, toast } from '../ui.js?v=20260912-reservation-detail-ux-r1';


export function renderEventSelector(){
  const select=$('[data-event-select]');
  const options=adminState.events.map(event=>`<option value="${escapeHtml(event.id)}">United ${numeric(event.year)}${event.isCurrent?' · AKTUÁLNÍ':''}</option>`).join('');
  if(select.innerHTML!==options)select.innerHTML=options;
  select.value=adminState.selectedEventId;
  select.disabled=adminState.loading||adminState.events.length<2;
}

export function selectedEvent(){return adminState.events.find(event=>event.id===adminState.selectedEventId)||null}

export function renderEventSettings(event){
  const form=$('[data-event-settings-form]');
  if(!form||!event||editorProtected(form,event.revision,()=>renderEventSettings(event)))return;
  if(form.dataset.hydratedEvent===event.id&&form.dataset.hydratedRevision===String(event.revision??0))return;
  forgetAdminEditor(form);
  form.inert=false;form.dataset.hydratedEvent=event.id;form.dataset.hydratedRevision=String(event.revision??0);
  const year=$('[data-event-settings-year]');if(year)year.textContent=event.year||'—';
  form.elements.registrationStatus.value=event.registrationStatus||'closed';
  form.elements.reservationCapacity.value=numeric(event.reservationCapacity);
  form.elements.fullWeekendNights.value=numeric(event.fullWeekendNights);
  form.elements.saturdayOnlyNights.value=numeric(event.saturdayOnlyNights);
  form.elements.bookingCommitmentCzk.value=numeric(event.bookingCommitmentCzk);
  form.elements.bookingDueAt.value=event.bookingDueAt||'';
  form.elements.bookingPaidCzk.value=numeric(event.bookingPaidCzk);
  form.elements.eventEndAt.value=event.eventEndAt||'';
  form.elements.venueName.value=event.venueName||'';
  form.elements.isCurrent.checked=!!event.isCurrent;
  form.elements.isCurrent.disabled=!!event.isCurrent;
}

export function renderOverview(payload){
  const event=payload.event;
  const overview=payload.overview||{};
  const statuses=overview.statuses||{};
  const attendance=overview.attendance||{};
  const show=overview.showShine||{};
  const accommodation=overview.accommodation||{};
  const payments=overview.payments||{};
  const gallery=overview.gallery||{};
  const history=overview.history||{};
  adminState.summary=payload;
  adminState.historyCounts={...adminState.historyCounts,...history};
  $('[data-event-year]').textContent=event?.year||'—';
  $('[data-event-state]').textContent=event?`${event.isCurrent?'Aktuální event · ':''}Rezervace: ${event.registrationStatus==='open'?'otevřené':'uzavřené'}`:'Žádný event v databázi';
  const current=adminState.events.find(item=>item.isCurrent);
  $('[data-settings-context]').textContent=`Upravuješ vybraný ročník United ${event?.year||'—'}. Veřejný CURRENT: United ${current?.year||'—'}. Přepnutí vybraného ročníku nemění veřejný event.`;
  renderEventSettings(event);
  const accommodationCapacity=accommodation.hasUnlimited?0:numeric(accommodation.limitedUnitsTotal);
  const commitment=numeric(event?.bookingCommitmentCzk);
  const collected=numeric(payments.amountPaidCzk);
  const paid=numeric(event?.bookingPaidCzk);
  $('[data-booking-commitment]').textContent=formatMoney(commitment);$('[data-booking-due]').textContent=formatDate(event?.bookingDueAt,false);
  $('[data-booking-capacity]').textContent=accommodationCapacity||'—';$('[data-booking-reserved]').textContent=numeric(accommodation.units);
  $('[data-booking-collected]').textContent=formatMoney(collected);$('[data-booking-paid]').textContent=formatMoney(paid);
  $('[data-booking-gap]').textContent=formatMoney(Math.max(0,commitment-collected));
  $('[data-payment-total-due]').textContent=formatMoney(payments.amountDueCzk);$('[data-payment-total-paid]').textContent=formatMoney(payments.amountPaidCzk);$('[data-payment-total-remaining]').textContent=formatMoney(payments.amountRemainingCzk);
  $('[data-payment-count-unpaid]').textContent=numeric(payments.unpaid);$('[data-payment-count-underpaid]').textContent=numeric(payments.underpaid);$('[data-payment-count-paid]').textContent=numeric(payments.paid);$('[data-payment-count-overpaid]').textContent=numeric(payments.overpaid);$('[data-payment-count-overdue]').textContent=numeric(payments.overdue);
  const extra=$('[data-payment-extra]');if(extra)extra.textContent=`Přeplatky: ${formatMoney(payments.overpaymentCzk)} · Úhrady mimo aktivní rezervace: ${formatMoney(payments.inactivePaidCzk)}.`;
  const testWarning=$('[data-admin-payment-test]');if(testWarning)testWarning.hidden=!event?.paymentTestMode;
  renderAttentionCounts();
}

export function renderAttentionCounts(){
  const pendingReservations=adminState.summary?.attention?.reservations;
  if(pendingReservations==null){$$('[data-attention-reservations], [data-attention-payments], [data-attention-gallery], [data-attention-history]').forEach(node=>node.textContent='—');return}
  const paymentAttention=adminState.summary.attention.payments;
  const moderation=adminModerationCounts({communityPending:adminState.summary.attention.gallery,historyPending:adminState.summary.attention.history});
  const reservationAttention=$('[data-attention-reservations]');if(reservationAttention)reservationAttention.textContent=pendingReservations;
  const paymentAttentionElement=$('[data-attention-payments]');if(paymentAttentionElement)paymentAttentionElement.textContent=paymentAttention;
  const galleryAttention=$('[data-attention-gallery]');if(galleryAttention)galleryAttention.textContent=moderation.community;
  const historyAttention=$('[data-attention-history]');if(historyAttention)historyAttention.textContent=moderation.history;
  const paymentNav=$('[data-payment-nav-count]');if(paymentNav)paymentNav.textContent=paymentAttention;
  renderActionCount('[data-gallery-mode-count="community"]',moderation.community);
  renderActionCount('[data-gallery-mode-count="history"]',moderation.history);
  renderActionCount('[data-gallery-nav-count]',moderation.total);
}

function renderActionCount(selector,count){
  const state=adminActionCountState(count);
  $$(selector).forEach(badge=>{badge.textContent=state.label;badge.hidden=state.hidden});
}

let attentionRequestPending=false;
export async function refreshHistoryAttention(){
  if(!adminState.currentUser||attentionRequestPending)return;
  attentionRequestPending=true;const user=adminState.currentUser;
  try{
    const payload=await apiRequest('/api/admin/attention');
    if(adminState.currentUser!==user)return;
    adminState.historyCounts={...adminState.historyCounts,...payload.history};
    renderAttentionCounts();
  }catch(error){if(error.status===403)setDenied()}
  finally{attentionRequestPending=false}
}

export async function saveEventSettings(form,reloadAdminData){
  const event=selectedEvent();if(!event)return;
  const data=new FormData(form);
  const switchingCurrent=!event.isCurrent&&form.elements.isCurrent.checked;
  if(switchingCurrent&&!window.confirm(`Nastavit United ${numeric(event.year)} jako aktuální event? Změna okamžitě ovlivní veřejný Weekend Planner a členské rezervace.`)){form.elements.isCurrent.checked=false;return}
  const body={
    venueName:String(data.get('venueName')||''),
    registrationStatus:String(data.get('registrationStatus')||''),reservationCapacity:Number(data.get('reservationCapacity')),
    fullWeekendNights:Number(data.get('fullWeekendNights')),saturdayOnlyNights:Number(data.get('saturdayOnlyNights')),
    bookingCommitmentCzk:Number(data.get('bookingCommitmentCzk')),bookingDueAt:String(data.get('bookingDueAt')||''),bookingPaidCzk:Number(data.get('bookingPaidCzk')),eventEndAt:String(data.get('eventEndAt')||''),
  };
  if(switchingCurrent)body.isCurrent=true;
  const button=$('button[type="submit"]',form);if(button)button.disabled=true;
  try{await adminCommand(`/api/admin/events/${encodeURIComponent(event.id)}`,{method:'PATCH',body:changedFields(form,body),editor:form});toast('Nastavení eventu bylo uloženo.');await reloadAdminData({reloadGallery:false})}
  catch(error){if(error.status===403){setDenied();return}toast(error.message||'Nastavení eventu se nepodařilo uložit.')}finally{if(button)button.disabled=false}
}
