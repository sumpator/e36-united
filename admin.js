import { firebaseConfig } from './firebase-config.js?v=20260823-auth2';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

import { apiRequest } from './admin/api.js?v=20260903-mailing-a';
import { adminState, resetAdminDomainState, resetAdminFiltersForEvent, resetAdminFiltersForLogin } from './admin/state.js?v=20260903-mailing-a';
import { initializeAdminShell, setAdminSectionCollapsed, setAdminView, setDenied, setLoading, setView } from './admin/shell.js?v=20260903-mailing-a';
import { $, toast } from './admin/ui.js?v=20260903-phase5';
import { renderEventSelector, renderOverview, saveEventSettings } from './admin/modules/dashboard-events.js?v=20260903-phase5';
import { previewAccommodationPhoto, removeAccommodationPhoto, renderAccommodation, saveAccommodation, uploadAccommodationPhoto } from './admin/modules/accommodation.js?v=20260903-phase5';
import { clearReservationDetailFilters, closeReservationDrawer, openReservationDrawer, renderReservations, setPaymentFilter, setPaymentSearch, setReservationFilter, setReservationSearch, setReservationViewMode, toggleReservationDetailFilter, toggleReservationFilters, updateReservation, updateReservationPayment } from './admin/modules/reservations-payments.js?v=20260903-phase5';
import { changeHistoryPage, clearHistoryFilters, closeGalleryLightbox, closeHistoryEvidence, historyRequestPath, hydrateOpenHistoryCard, openGalleryLightbox, openHistoryEvidence, releaseGalleryMedia, releaseHistoryEvidence, renderGallery, renderHistoryClaims, reviewHistoryClaim, setGalleryFilter, setGalleryMode, setHistoryClaimType, setHistoryFilter, setHistorySearch, setHistoryYear, updateGallery } from './admin/modules/moderation.js?v=20260903-phase5';
import { initializeMailingCenter, resetMailingCenter } from './admin/modules/mailing/index.js?v=20260903-mailing-a';

const app=initializeApp(firebaseConfig);
const auth=getAuth(app);
await setPersistence(auth,browserLocalPersistence);

function closeAdminOverlays(){closeReservationDrawer();closeGalleryLightbox();closeHistoryEvidence()}
function closeDeniedOverlays(){closeGalleryLightbox();closeReservationDrawer()}
function scopedPath(path){return `${path}?eventId=${encodeURIComponent(adminState.selectedEventId)}`}

async function loadEventData(){
  if(adminState.loading||!adminState.selectedEventId)return;setLoading(true);
  try{
    const [overview,reservations,accommodation]=await Promise.all([apiRequest(scopedPath('/api/admin/overview')),apiRequest(scopedPath('/api/admin/reservations')),apiRequest(scopedPath('/api/admin/accommodation'))]);
    renderOverview(overview);renderReservations(reservations);renderAccommodation(accommodation);renderEventSelector();setView('admin');
  }catch(error){if(error.status===403){setDenied();return}toast(error.message||'Data vybraného eventu se nepodařilo načíst.')}finally{setLoading(false)}
}

async function loadAdminData({reloadGallery=true}={}){
  if(adminState.loading)return;setLoading(true);
  try{
    const eventsPayload=await apiRequest('/api/admin/events');
    adminState.events=Array.isArray(eventsPayload.events)?eventsPayload.events:[];
    if(!adminState.events.some(event=>event.id===adminState.selectedEventId))adminState.selectedEventId=(adminState.events.find(event=>event.isCurrent)||adminState.events[0]||{}).id||'';
    renderEventSelector();
    if(!adminState.selectedEventId){const [gallery,history]=await Promise.all([reloadGallery?apiRequest('/api/admin/gallery'):null,apiRequest(historyRequestPath(1))]);renderOverview({event:null,overview:{history:history.counts}});renderReservations({reservations:[]});renderAccommodation({options:[]});if(gallery)renderGallery(gallery);renderHistoryClaims(history);setGalleryMode(adminState.galleryMode);setView('admin');return}
    const [overview,reservations,accommodation,gallery,history]=await Promise.all([apiRequest(scopedPath('/api/admin/overview')),apiRequest(scopedPath('/api/admin/reservations')),apiRequest(scopedPath('/api/admin/accommodation')),reloadGallery?apiRequest('/api/admin/gallery'):null,apiRequest(historyRequestPath(1))]);
    renderOverview(overview);renderReservations(reservations);renderAccommodation(accommodation);if(gallery)renderGallery(gallery);renderHistoryClaims(history);setGalleryMode(adminState.galleryMode);setView('admin');
  }catch(error){if(error.status===403){setDenied();return}toast(error.message||'Admin data se nepodařilo načíst.')}finally{setLoading(false)}
}

initializeAdminShell({onCloseOverlays:closeAdminOverlays,onDenied:closeDeniedOverlays});
initializeMailingCenter();

$('[data-login-form]').addEventListener('submit',async event=>{
  event.preventDefault();const button=$('button[type="submit"]',event.currentTarget);const form=new FormData(event.currentTarget);button.disabled=true;$('[data-auth-status]').textContent='';
  try{await signInWithEmailAndPassword(auth,String(form.get('email')||'').trim(),String(form.get('password')||''))}
  catch(error){$('[data-auth-status]').textContent=error.code==='auth/invalid-credential'?'Neplatný e-mail nebo heslo.':'Přihlášení se nepodařilo.'}finally{button.disabled=false}
});

$('[data-event-select]').addEventListener('change',event=>{
  if(!adminState.events.some(item=>item.id===event.target.value))return;
  adminState.selectedEventId=event.target.value;resetAdminFiltersForEvent();
  const reservationSearchInput=$('[data-reservation-search]');if(reservationSearchInput)reservationSearchInput.value='';
  const paymentSearchInput=$('[data-payment-search]');if(paymentSearchInput)paymentSearchInput.value='';
  loadEventData();
});

document.addEventListener('submit',event=>{
  const settings=event.target.closest('[data-event-settings-form]');
  if(settings){event.preventDefault();saveEventSettings(settings,loadAdminData);return}
  const createForm=event.target.closest('[data-accommodation-create-form]');
  if(createForm){event.preventDefault();saveAccommodation(createForm,'',loadEventData);return}
  const editForm=event.target.closest('[data-accommodation-edit-form]');
  if(editForm){event.preventDefault();const card=editForm.closest('[data-accommodation-id]');if(card)saveAccommodation(editForm,card.dataset.accommodationId,loadEventData)}
});

document.addEventListener('click',event=>{
  const logout=event.target.closest('[data-logout]');if(logout){signOut(auth);return}
  const refresh=event.target.closest('[data-refresh]');if(refresh){loadAdminData();return}
  const collapse=event.target.closest('[data-admin-collapse-toggle]');if(collapse){const section=collapse.dataset.adminCollapseToggle;setAdminSectionCollapsed(section,collapse.getAttribute('aria-expanded')==='true',{persist:true});return}
  const jump=event.target.closest('[data-admin-jump]');if(jump){setAdminView(jump.dataset.adminJump);return}
  const filter=event.target.closest('[data-reservation-filter]');if(filter){setReservationFilter(filter.dataset.reservationFilter);return}
  if(event.target.closest('[data-reservation-filter-toggle]')){toggleReservationFilters();return}
  const detailFilter=event.target.closest('[data-reservation-detail-filter]');if(detailFilter){toggleReservationDetailFilter(detailFilter.dataset.reservationDetailFilter);return}
  if(event.target.closest('[data-reservation-filter-clear]')){clearReservationDetailFilters();return}
  const reservationMode=event.target.closest('[data-reservation-mode]');if(reservationMode){setReservationViewMode(reservationMode.dataset.reservationMode);return}
  const paymentFilterButton=event.target.closest('[data-payment-filter]');if(paymentFilterButton){setPaymentFilter(paymentFilterButton.dataset.paymentFilter);return}
  const attention=event.target.closest('[data-attention-target]');if(attention){const target=attention.dataset.attentionTarget;if(target==='reservations')setReservationFilter(attention.dataset.attentionFilter);if(target==='payments')setPaymentFilter(attention.dataset.attentionFilter);if(target==='gallery'){setGalleryFilter(attention.dataset.attentionFilter);setGalleryMode(attention.dataset.galleryModeTarget||'community')}setAdminView(target);return}
  const pending=event.target.closest('[data-open-pending]');if(pending){setReservationFilter('pending');setAdminView('reservations');return}
  const galleryPending=event.target.closest('[data-open-gallery-pending]');if(galleryPending){setGalleryMode('community');setGalleryFilter('pending');setAdminView('gallery');return}
  const galleryModeButton=event.target.closest('[data-gallery-mode]');if(galleryModeButton){setGalleryMode(galleryModeButton.dataset.galleryMode);return}
  const galleryFilterButton=event.target.closest('[data-gallery-filter]');if(galleryFilterButton){setGalleryFilter(galleryFilterButton.dataset.galleryFilter);return}
  const historyFilterButton=event.target.closest('[data-history-filter]');if(historyFilterButton){setHistoryFilter(historyFilterButton.dataset.historyFilter);return}
  if(event.target.closest('[data-history-clear]')){clearHistoryFilters();return}
  const historyPageButton=event.target.closest('[data-history-page]');if(historyPageButton){changeHistoryPage(historyPageButton.dataset.historyPage);return}
  const reservationOpen=event.target.closest('[data-reservation-open]');if(reservationOpen){openReservationDrawer(reservationOpen.dataset.reservationOpen,reservationOpen);return}
  if(event.target.closest('[data-reservation-drawer-close]')){closeReservationDrawer();return}
  const paymentSave=event.target.closest('[data-payment-save]');if(paymentSave){const card=paymentSave.closest('[data-reservation-id]');if(card)updateReservationPayment(card,false,loadEventData);return}
  const paymentFull=event.target.closest('[data-payment-full]');if(paymentFull){const card=paymentFull.closest('[data-reservation-id]');if(card)updateReservationPayment(card,true,loadEventData);return}
  const preview=event.target.closest('[data-gallery-preview]');if(preview){openGalleryLightbox(preview.dataset.galleryPreview,preview);return}
  if(event.target.closest('[data-gallery-lightbox-close]')){closeGalleryLightbox();return}
  const galleryAction=event.target.closest('[data-gallery-action]');if(galleryAction){const card=galleryAction.closest('[data-gallery-id]');if(card)updateGallery(card,galleryAction.dataset.galleryAction);return}
  const historyEvidence=event.target.closest('[data-history-evidence]');if(historyEvidence){openHistoryEvidence(historyEvidence.dataset.historyEvidence,historyEvidence);return}
  if(event.target.closest('[data-history-evidence-close]')){closeHistoryEvidence();return}
  const historyAction=event.target.closest('[data-history-action]');if(historyAction){const card=historyAction.closest('[data-history-id]');if(card)reviewHistoryClaim(card,historyAction.dataset.historyComponent,historyAction.dataset.historyAction);return}
  const photoUpload=event.target.closest('[data-accommodation-photo-upload]');if(photoUpload){uploadAccommodationPhoto(photoUpload.closest('[data-accommodation-id]'),loadEventData);return}
  const photoRemove=event.target.closest('[data-accommodation-photo-remove]');if(photoRemove){removeAccommodationPhoto(photoRemove.closest('[data-accommodation-id]'),loadEventData);return}
  const action=event.target.closest('[data-review-action]');if(action){const card=action.closest('[data-reservation-id]');if(card)updateReservation(card,action.dataset.reviewAction,loadEventData)}
});

document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!$('[data-reservation-drawer]').hidden){closeReservationDrawer();return}
  if(event.key==='Escape'&&!$('[data-gallery-lightbox]').hidden){closeGalleryLightbox();return}
  if(event.key==='Escape'&&!$('[data-history-evidence-lightbox]').hidden){closeHistoryEvidence();return}
  if((event.key==='Enter'||event.key===' ')&&event.target.matches('tr[data-reservation-open]')){event.preventDefault();openReservationDrawer(event.target.dataset.reservationOpen,event.target);return}
  if((event.key==='Enter'||event.key===' ')&&event.target.closest('[data-open-pending]')){event.preventDefault();setReservationFilter('pending');setAdminView('reservations')}
  if((event.key==='Enter'||event.key===' ')&&event.target.closest('[data-open-gallery-pending]')){event.preventDefault();setGalleryFilter('pending');setAdminView('gallery')}
});

$('[data-reservation-search]')?.addEventListener('input',event=>setReservationSearch(event.target.value));
$('[data-payment-search]')?.addEventListener('input',event=>setPaymentSearch(event.target.value));
$('[data-history-search]')?.addEventListener('input',event=>setHistorySearch(event.target.value));
document.addEventListener('change',event=>{
  if(event.target.matches('[data-accommodation-photo-input]')){previewAccommodationPhoto(event.target);return}
  if(event.target.matches('[data-history-year]')){setHistoryYear(event.target.value);return}
  if(event.target.matches('[data-history-type]'))setHistoryClaimType(event.target.value);
});
document.addEventListener('toggle',event=>hydrateOpenHistoryCard(event.target),true);

onAuthStateChanged(auth,user=>{
  adminState.currentUser=user;
  if(!user){closeGalleryLightbox();closeHistoryEvidence();closeReservationDrawer();releaseGalleryMedia();releaseHistoryEvidence();resetAdminDomainState();resetMailingCenter();setView('auth');$('[data-admin-account]').textContent='';return}
  resetAdminFiltersForLogin();
  $('[data-admin-account]').textContent=user.email||user.uid;
  loadAdminData();
});
