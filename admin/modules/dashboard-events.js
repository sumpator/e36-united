import { adminActionCountState, adminModerationCounts, paymentNeedsAttention, reservationMatchesFilter } from '../../admin-view-model.js?v=20260831-admin-badge1';
import { apiRequest } from '../api.js?v=20260903-mailing-b';
import { adminState } from '../state.js?v=20260903-mailing-b';
import { setDenied } from '../shell.js?v=20260903-mailing-b';
import { $, $$, escapeHtml, formatDate, formatMoney, numeric, toast } from '../ui.js?v=20260903-phase5';

function setBar(selector,value,total){$(selector).style.width=`${total?Math.min(100,(numeric(value)/total)*100):0}%`}

export function renderEventSelector(){
  const select=$('[data-event-select]');
  select.innerHTML=adminState.events.map(event=>`<option value="${escapeHtml(event.id)}">United ${numeric(event.year)}${event.isCurrent?' · AKTUÁLNÍ':''}</option>`).join('');
  select.value=adminState.selectedEventId;
  select.disabled=adminState.loading||adminState.events.length<2;
}

export function selectedEvent(){return adminState.events.find(event=>event.id===adminState.selectedEventId)||null}

export function renderEventSettings(event){
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
  adminState.historyCounts={...adminState.historyCounts,...history};
  $('[data-event-year]').textContent=event?.year||'—';
  $('[data-event-state]').textContent=event?`${event.isCurrent?'Aktuální event · ':''}Rezervace: ${event.registrationStatus==='open'?'otevřené':'uzavřené'}`:'Žádný event v databázi';
  renderEventSettings(event);
  $('[data-kpi-reservations]').textContent=numeric(overview.reservations);
  $('[data-kpi-people]').textContent=numeric(overview.people);
  $('[data-kpi-cars]').textContent=numeric(overview.cars);
  $('[data-kpi-pending]').textContent=numeric(statuses.pending);
  $('[data-kpi-payments]').textContent=`${numeric(payments.paid)} / ${numeric(payments.unpaid)+numeric(payments.underpaid)}`;
  $('[data-kpi-gallery-pending]').textContent=numeric(gallery.pending);
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

export function renderAttentionCounts(){
  const pendingReservations=adminState.reservationItems.filter(item=>reservationMatchesFilter(item,'action')).length;
  const paymentAttention=adminState.reservationItems.filter(paymentNeedsAttention).length;
  const moderation=adminModerationCounts({communityPending:adminState.galleryItems.filter(item=>item.status==='pending').length,historyPending:adminState.historyCounts.pending});
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

export async function saveEventSettings(form,reloadAdminData){
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
  try{await apiRequest(`/api/admin/events/${encodeURIComponent(event.id)}`,{method:'PATCH',body});toast('Nastavení eventu bylo uloženo.');await reloadAdminData({reloadGallery:false})}
  catch(error){if(error.status===403){setDenied();return}toast(error.message||'Nastavení eventu se nepodařilo uložit.')}finally{if(button)button.disabled=false}
}
