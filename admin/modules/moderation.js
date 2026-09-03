import { apiMedia, apiRequest } from '../api.js?v=20260903-mailing-b';
import { renderAttentionCounts } from './dashboard-events.js?v=20260903-phase5';
import { adminState } from '../state.js?v=20260903-mailing-b';
import { setDenied } from '../shell.js?v=20260903-mailing-b';
import { $, $$, escapeHtml, formatDate, galleryStatusLabel, numeric, photosLabel, recordsLabel, rememberSessionChoice, toast } from '../ui.js?v=20260903-phase5';

const galleryFilterLabels={pending:'Žádosti',approved:'Schválené',rejected:'Zamítnuté',all:'Všechny'};
const galleryMediaUrls=new Map();
const galleryMediaPromises=new Map();
const galleryMediaTokens=new Map();
const historyEvidenceUrls=new Map();
const historyEvidencePromises=new Map();
let historyRequestSequence=0;
let historySearchTimer=null;
let selectedGalleryId=null;
let lightboxReturnFocus=null;
let historyEvidenceReturnFocus=null;

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
    const count=filter==='all'?adminState.galleryItems.length:adminState.galleryItems.filter(item=>item.status===filter).length;
    $(`[data-gallery-filter-count="${filter}"]`,button).textContent=count;
    const active=filter===adminState.galleryFilter;
    button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  });
}
function renderGalleryCounts(){
  const pending=adminState.galleryItems.filter(item=>item.status==='pending').length;
  $('[data-kpi-gallery-pending]').textContent=pending;
  renderAttentionCounts();
}
function renderGalleryList(){
  const photos=adminState.galleryFilter==='all'?adminState.galleryItems:adminState.galleryItems.filter(item=>item.status===adminState.galleryFilter);
  const neededIds=new Set(photos.map(item=>item.id));if(selectedGalleryId)neededIds.add(selectedGalleryId);pruneGalleryMedia(neededIds);
  $('[data-gallery-count]').textContent=adminState.galleryFilter==='all'?photosLabel(photos.length):`${photosLabel(photos.length)} z ${adminState.galleryItems.length}`;
  const list=$('[data-gallery-list]');
  if(!photos.length){list.innerHTML=`<div class="admin-empty">V záložce ${escapeHtml(galleryFilterLabels[adminState.galleryFilter].toLowerCase())} nejsou žádné fotografie.</div>`;return}
  list.innerHTML=photos.map(galleryCard).join('');
  hydrateGalleryMedia(list);
}
export function renderGallery(payload){adminState.galleryItems=Array.isArray(payload.photos)?payload.photos:[];renderGalleryTabs();renderGalleryCounts();renderGalleryList()}
export function setGalleryFilter(filter){
  if(!galleryFilterLabels[filter])return;
  adminState.galleryFilter=filter;renderGalleryTabs();renderGalleryList();
}
export function setGalleryMode(mode){
  adminState.galleryMode=mode==='history'?'history':'community';
  $$('[data-gallery-mode]').forEach(button=>{const active=button.dataset.galleryMode===adminState.galleryMode;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active))});
  const community=$('[data-gallery-community]'),history=$('[data-gallery-history]');if(community)community.hidden=adminState.galleryMode!=='community';if(history)history.hidden=adminState.galleryMode!=='history';
  if(adminState.galleryMode==='history')renderHistoryClaims();else renderGalleryList();
}

function historyComponentLabel(status){return({not_claimed:'Neuvedeno',pending:'Čeká na kontrolu',approved:'Schváleno',rejected:'Zamítnuto'})[status]||status||'—'}
function historyMatchesStatus(item,filter){if(filter==='all')return true;if(filter==='pending')return item.attendance?.status==='pending'||item.showShine?.status==='pending';return item.attendance?.status===filter||item.showShine?.status===filter}
function filteredHistoryClaims(){return adminState.historyClaims}
function historyNeedsAction(item){return historyMatchesStatus(item,'pending')}
function historyTypeSummary(item){const types=['Attendance'];if(item.showShine?.competed)types.push('Show & Shine');if(item.showShine?.bestOfBest)types.push('Best of the Best');if(item.showShine?.bestExhaust)types.push('Best Exhaust');return types.join(' · ')}
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
  const member=item.member||{},pending=historyNeedsAction(item);return `<details class="admin-history-card${pending?' is-actionable':''}" data-history-id="${escapeHtml(item.id)}"><summary><div><span class="admin-kicker">UNITED ${numeric(item.eventYear)}</span><h3>${escapeHtml(member.nickname||member.name||member.email||'United member')}</h3><p>${escapeHtml([member.name,member.memberCode].filter(Boolean).join(' · '))}</p></div><div class="admin-history-card-state"><span>${escapeHtml(historyTypeSummary(item))}</span><b class="admin-badge admin-badge--${pending?'pending':'resolved'}">${pending?'Vyžaduje akci':'Bez čekající akce'}</b><time>${escapeHtml(formatDate(item.submittedAt))}</time></div></summary><div class="admin-history-card-detail"><p class="admin-history-member-email">${escapeHtml(member.email||'E-mail neuveden')}</p>${historyEvidenceGrid(item)}<div class="admin-history-decisions"><section data-history-review="attendance"><div class="admin-history-decision-head"><div><small>DOCHÁZKA</small><b>${escapeHtml(historyComponentLabel(item.attendance?.status))}</b></div><i class="admin-badge admin-badge--${escapeHtml(item.attendance?.status)}">${escapeHtml(historyComponentLabel(item.attendance?.status))}</i></div>${historyReviewControl(item,'attendance')}</section><section data-history-review="sns"><div class="admin-history-decision-head"><div><small>SHOW &amp; SHINE</small><b>${escapeHtml(showShineSummary(item))}</b></div><i class="admin-badge admin-badge--${escapeHtml(item.showShine?.status)}">${escapeHtml(historyComponentLabel(item.showShine?.status))}</i></div>${historyReviewControl(item,'sns')}</section></div></div></details>`;
}
function renderHistoryTabs(){
  $$('[data-history-filter]').forEach(button=>{const filter=button.dataset.historyFilter,count=filter==='all'?adminState.historyCounts.total:numeric(adminState.historyCounts[filter]),active=filter===adminState.historyFilter;$(`[data-history-filter-count="${filter}"]`,button).textContent=count;button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1});
}
export function renderHistoryControls(){
  const search=$('[data-history-search]');if(search&&search.value!==adminState.historySearch)search.value=adminState.historySearch;
  const type=$('[data-history-type]');if(type)type.value=adminState.historyClaimType;
  const year=$('[data-history-year]');if(year){const selected=adminState.historyYear||'';year.innerHTML=`<option value="">Nejnovější relevantní</option><option value="all">Všechny ročníky</option>${adminState.historyYears.map(item=>`<option value="${numeric(item.year)}">${numeric(item.year)} (${numeric(item.total)})</option>`).join('')}`;year.value=selected;if(year.value!==selected)year.value='all'}
  $('[data-history-summary="pending"]').textContent=numeric(adminState.historyCounts.pending);
  $('[data-history-summary="older"]').textContent=numeric(adminState.historyCounts.olderPending);
  const current=$('[data-history-current-summary]');if(current){current.hidden=adminState.historyCounts.latestPendingYear==null;$('[data-history-summary-year]',current).textContent=adminState.historyCounts.latestPendingYear||'—';$('[data-history-summary="current"]',current).textContent=numeric(adminState.historyCounts.latestYearPending)}
}
function renderHistoryPagination(){
  const nav=$('[data-history-pagination]');if(!nav)return;nav.hidden=adminState.historyPagination.totalPages<=1;$('[data-history-page-label]',nav).textContent=`Strana ${adminState.historyPagination.page} z ${adminState.historyPagination.totalPages}`;const previous=$('[data-history-page="previous"]',nav),next=$('[data-history-page="next"]',nav);previous.disabled=adminState.historyPagination.page<=1;next.disabled=adminState.historyPagination.page>=adminState.historyPagination.totalPages;
}
export function renderHistoryClaims(payload=null){
  if(payload){releaseHistoryEvidence();adminState.historyClaims=Array.isArray(payload.claims)?payload.claims:[];adminState.historyCounts={...adminState.historyCounts,...(payload.counts||{})};adminState.historyYears=Array.isArray(payload.facets?.years)?payload.facets.years:[];adminState.historyPagination={...adminState.historyPagination,...(payload.pagination||{})};if(payload.filters){adminState.historyFilter=payload.filters.status||adminState.historyFilter;adminState.historyClaimType=payload.filters.type||adminState.historyClaimType;adminState.historyYear=payload.filters.year||'all';adminState.historySearch=payload.filters.q??adminState.historySearch;rememberHistoryFilters()}}
  renderHistoryTabs();renderHistoryControls();renderHistoryPagination();renderAttentionCounts();const items=filteredHistoryClaims(),list=$('[data-history-list]');if(!list)return;$('[data-gallery-count]').textContent=`${recordsLabel(items.length)} z ${adminState.historyPagination.total}`;
  if(!items.length){list.innerHTML='<div class="admin-empty">Tomuto filtru neodpovídá žádná historická žádost.</div>';return}list.innerHTML=items.map(historyClaimCard).join('');
}
function rememberHistoryFilters(){rememberSessionChoice('e36UnitedAdmin.historyStatus',adminState.historyFilter);rememberSessionChoice('e36UnitedAdmin.historyYear',adminState.historyYear);rememberSessionChoice('e36UnitedAdmin.historyType',adminState.historyClaimType);rememberSessionChoice('e36UnitedAdmin.historySearch',adminState.historySearch)}
export function historyRequestPath(page=1){const params=new URLSearchParams({status:adminState.historyFilter,type:adminState.historyClaimType,page:String(page),pageSize:String(adminState.historyPagination.pageSize)});if(adminState.historyYear)params.set('year',adminState.historyYear);if(adminState.historySearch.trim())params.set('q',adminState.historySearch.trim());return `/api/admin/history/claims?${params}`}

async function historyEvidenceUrl(id){
  if(historyEvidenceUrls.has(id))return historyEvidenceUrls.get(id);if(historyEvidencePromises.has(id))return historyEvidencePromises.get(id);
  const promise=apiMedia(`/api/admin/history/evidence/${encodeURIComponent(id)}`).then(blob=>{const url=URL.createObjectURL(blob);historyEvidenceUrls.set(id,url);return url}).finally(()=>historyEvidencePromises.delete(id));historyEvidencePromises.set(id,promise);return promise;
}
export function hydrateHistoryEvidence(root=document){$$('[data-history-evidence-media]',root).forEach(async image=>{try{image.src=await historyEvidenceUrl(image.dataset.historyEvidenceMedia)}catch{image.alt='Důkaz se nepodařilo načíst.'}})}
export function releaseHistoryEvidence(){for(const url of historyEvidenceUrls.values())URL.revokeObjectURL(url);historyEvidenceUrls.clear();historyEvidencePromises.clear()}
export async function openHistoryEvidence(id,trigger=null){
  const modal=$('[data-history-evidence-lightbox]'),image=$('[data-history-evidence-full]'),claim=adminState.historyClaims.find(item=>item.evidence?.some(photo=>String(photo.id)===String(id))),evidence=claim?.evidence?.find(photo=>String(photo.id)===String(id));if(!modal||!image||!claim||!evidence)return;
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
export function closeHistoryEvidence(){const modal=$('[data-history-evidence-lightbox]');if(modal)modal.hidden=true;document.body.classList.remove('admin-lightbox-open');const trigger=historyEvidenceReturnFocus;historyEvidenceReturnFocus=null;trigger?.focus?.()}
export async function loadHistoryClaims({page=1}={}){const sequence=++historyRequestSequence,payload=await apiRequest(historyRequestPath(page));if(sequence!==historyRequestSequence)return payload;renderHistoryClaims(payload);return payload}
export function refreshHistoryClaims(page=1){loadHistoryClaims({page}).catch(error=>{if(error.status===403){setDenied();return}toast(error.message||'Historické žádosti se nepodařilo načíst.')})}
export async function reviewHistoryClaim(container,component,status){
  const claimId=container.dataset.historyId,review=$(`[data-history-review="${component}"]`,container),note=$('[data-history-review-note]',review)?.value.trim()||'';if(status==='rejected'&&!note){toast('Při zamítnutí je důvod povinný.');$('[data-history-review-note]',review)?.focus();return}
  $$('[data-history-action]',review).forEach(button=>button.disabled=true);try{await apiRequest(`/api/admin/history/claims/${encodeURIComponent(claimId)}/${component}`,{method:'PATCH',body:{status,reviewNote:note}});toast(component==='attendance'?'Rozhodnutí o docházce bylo uloženo.':'Rozhodnutí o Show & Shine bylo uloženo.');await loadHistoryClaims({page:adminState.historyPagination.page})}catch(error){if(error.status===403){setDenied();return}toast(error.message||'Rozhodnutí se nepodařilo uložit.')}finally{$$('[data-history-action]',review).forEach(button=>button.disabled=false)}
}

async function galleryMediaUrl(id){
  if(galleryMediaUrls.has(id))return galleryMediaUrls.get(id);
  if(galleryMediaPromises.has(id))return galleryMediaPromises.get(id);
  const token={};galleryMediaTokens.set(id,token);
  const promise=apiMedia(`/api/admin/gallery/media/${encodeURIComponent(id)}`).then(blob=>{
    if(galleryMediaTokens.get(id)!==token||!adminState.currentUser)throw new Error('Náhled už není potřeba.');
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
export function releaseGalleryMedia(){pruneGalleryMedia(new Set())}

function renderGalleryLightbox(){
  const item=adminState.galleryItems.find(photo=>photo.id===selectedGalleryId);
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
export function openGalleryLightbox(id,source){
  if(!adminState.galleryItems.some(item=>item.id===id))return;
  selectedGalleryId=id;lightboxReturnFocus=source||document.activeElement;renderGalleryLightbox();
  $('[data-gallery-lightbox]').hidden=false;document.body.classList.add('admin-lightbox-open');
  $('[data-gallery-lightbox-close]:not(.admin-gallery-lightbox-backdrop)')?.focus();
}
export function closeGalleryLightbox(){
  const closingId=selectedGalleryId;const lightbox=$('[data-gallery-lightbox]');if(lightbox)lightbox.hidden=true;
  document.body.classList.remove('admin-lightbox-open');selectedGalleryId=null;
  if(closingId){const visible=adminState.galleryFilter==='all'||adminState.galleryItems.some(item=>item.id===closingId&&item.status===adminState.galleryFilter);if(!visible)releaseGalleryMediaId(closingId)}
  if(lightboxReturnFocus?.isConnected)lightboxReturnFocus.focus();lightboxReturnFocus=null;
}
export async function updateGallery(container,status){
  const submissionId=container.dataset.galleryId;const currentItem=adminState.galleryItems.find(photo=>photo.id===submissionId);const noteField=$('[data-gallery-review-note]',container);const note=noteField?noteField.value:(currentItem?.reviewNote||'');
  $$('[data-gallery-action]',container).forEach(button=>button.disabled=true);
  try{
    await apiRequest(`/api/admin/gallery/${encodeURIComponent(submissionId)}`,{method:'PATCH',body:{status,reviewNote:note}});
    const item=adminState.galleryItems.find(photo=>photo.id===submissionId);if(item){item.status=status;item.reviewNote=note}
    renderGalleryTabs();renderGalleryCounts();renderGalleryList();if(selectedGalleryId===submissionId)renderGalleryLightbox();
    const messages={pending:'Fotografie byla vrácena k posouzení.',approved:'Fotografie byla schválena.',rejected:'Fotografie byla zamítnuta.'};toast(messages[status]||'Stav fotografie byl změněn.');
  }catch(error){if(error.status===403){setDenied();return}toast(error.message||'Fotografii se nepodařilo změnit.')}finally{$$('[data-gallery-action]',container).forEach(button=>button.disabled=false)}
}

export function setHistoryFilter(filter){adminState.historyFilter=filter;rememberHistoryFilters();refreshHistoryClaims(1)}
export function clearHistoryFilters(){adminState.historyFilter='pending';adminState.historyYear='';adminState.historyClaimType='all';adminState.historySearch='';rememberHistoryFilters();renderHistoryControls();refreshHistoryClaims(1)}
export function changeHistoryPage(direction){const next=direction==='next'?adminState.historyPagination.page+1:adminState.historyPagination.page-1;refreshHistoryClaims(next)}
export function setHistorySearch(value){adminState.historySearch=value;rememberHistoryFilters();clearTimeout(historySearchTimer);historySearchTimer=setTimeout(()=>refreshHistoryClaims(1),250)}
export function setHistoryYear(value){adminState.historyYear=value;rememberHistoryFilters();refreshHistoryClaims(1)}
export function setHistoryClaimType(value){adminState.historyClaimType=value;rememberHistoryFilters();refreshHistoryClaims(1)}
export function hydrateOpenHistoryCard(target){const card=target.closest?.('details[data-history-id]');if(card?.open)hydrateHistoryEvidence(card)}
