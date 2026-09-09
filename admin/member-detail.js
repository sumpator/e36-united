import {adminState} from './state.js?v=20260909-admin-command-r2';
import {$,escapeHtml as esc,formatMoney} from './ui.js?v=20260909-admin-command-r2';
import {apiRequest} from './api.js?v=20260909-admin-command-r2';
import {ADMIN_REFRESH} from './refresh-policy.js?v=20260909-admin-command-r2';
import qrcode from '../vendor/qrcode-generator.mjs?v=20260909-admin-command-r2';

export const MEMBER_TABS=Object.freeze({event:'Event',reservations:'Rezervace / finance',garage:'Garage',photos:'Fotky',club:'United Club',history:'Historie / S&S',points:'Points',mailing:'Mailing',qr:'QR identita'});
export function canonicalMemberLink(id,label='Člen'){
  return /^[a-z0-9_-]{1,128}$/i.test(id||'')?`<button type="button" class="admin-member-link" data-member-open="${esc(id)}">${esc(label)}</button>`:esc(label);
}
export function memberQrSvg(payload){
  if(!/^E36U1:[a-f0-9]{48}$/.test(payload||''))return '';
  const qr=qrcode(0,'M');qr.addData(payload,'Byte');qr.make();return qr.createSvgTag({cellSize:6,margin:24,scalable:true});
}
let initialized=false,opener=null,searchTimer=null,searchSequence=0,searchController=null,searchFlight=null,observer=null,mediaGeneration=0;
let renderedTab=null;
const searchCache=new Map(),media=new Map(),mediaControllers=new Set();
const routeChange=()=>window.dispatchEvent(new CustomEvent('admin:membercontext'));
const currentKey=()=>[adminState.sessionGeneration,adminState.selectedEventId,adminState.memberId||'',adminState.memberTab||'event',adminState.memberPage||1].join('|');
export function memberContextKey(){return currentKey()+':'+(adminState.membersPage||1)}
export function openMember(id,source,{tab='event',route=true}={}){
  if(!/^[a-z0-9_-]{1,128}$/i.test(id||'')||!adminState.currentUser||adminState.denied)return;
  if(route)window.dispatchEvent(new CustomEvent('admin:beforenavigation'));
  if($('[data-member-load-error]'))$('[data-member-load-error]').hidden=true;
  if(adminState.memberId!==id){document.querySelectorAll('[data-member-dialog] [data-domain-status]').forEach(node=>node.remove());delete adminState.resourceStates['member-header'];delete adminState.resourceStates['member-tab'];releaseMemberMedia();$('[data-member-identity]').textContent='Načítám člena…';$('[data-member-event]').replaceChildren();$('[data-member-tab-content]').replaceChildren();}
  opener=source||opener||document.activeElement;adminState.memberId=id;adminState.memberTab=MEMBER_TABS[tab]?tab:'event';adminState.memberPage=1;
  const dialog=$('[data-member-dialog]');if(!dialog.open)dialog.showModal();syncTabs();
  if(route)window.dispatchEvent(new CustomEvent('admin:memberopened'));routeChange();
}
export function closeMember({route=true}={}){
  const dialog=$('[data-member-dialog]');if(!adminState.memberId&&!dialog?.open)return;
  adminState.memberId=null;adminState.memberTab='event';adminState.memberPage=1;dialog?.close();releaseMemberMedia();
  for(const selector of ['[data-member-identity]','[data-member-event]','[data-member-tab-content]'])$(selector)?.replaceChildren();
  if(opener?.isConnected)opener.focus({preventScroll:true});opener=null;
  window.dispatchEvent(new CustomEvent('admin:memberhidden'));if(route)window.dispatchEvent(new CustomEvent('admin:memberclosed'));routeChange();
}
function syncTabs(){document.querySelectorAll('[data-member-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.memberTab===adminState.memberTab)));$('[data-member-event]').hidden=adminState.memberTab!=='event';$('[data-member-tab-content]').hidden=adminState.memberTab==='event'}
function pagination(payload,kind){const p=payload.pagination;if(!p)return '';return `<nav class="admin-member-pagination" aria-label="Stránkování"><button type="button" data-member-page-kind="${kind}" data-member-page="${p.page-1}" ${p.page<=1?'disabled':''}>Předchozí</button><span>Celkem ${p.total} · ${p.page}/${p.totalPages}</span><button type="button" data-member-page-kind="${kind}" data-member-page="${p.page+1}" ${p.page>=p.totalPages?'disabled':''}>Další</button></nav>`}
function rows(items,render){return items?.length?items.map(render).join(''):'<p>Žádné záznamy v tomto rozsahu.</p>'}
function reservation(item){return `<article class="admin-member-card"><h3>${esc(item.title||item.year||'Rezervace')}</h3><p>${esc(item.status)} · ${esc(item.crew)} osob · ${esc(item.attendanceType||'')} · ${esc(item.accommodation||'')} · ${esc(item.carModel||'')} · S&S ${esc(item.showShine||'—')}</p><p>Příjezd: ${esc(item.arrival||'—')} · Pobyt: ${esc(item.stayName||item.accommodation||'—')} · ${esc(item.stayPeople??'—')} osob / ${esc(item.stayUnits??item.accommodationUnits??'—')} jednotek / ${esc(item.stayNights??'—')} nocí</p><p>Zdroj: uložená rezervace a její částky v Kč. Uložený platební stav: ${esc(item.storedPaymentStatus||'—')} · Uhrazeno dne: ${esc(item.paidAt||'—')}</p><dl><dt>Předpis</dt><dd>${esc(formatMoney(item.amountDueCzk))}</dd><dt>Evidovaně uhrazeno</dt><dd>${esc(formatMoney(item.amountPaidCzk))}</dd><dt>Nedoplatek</dt><dd>${esc(formatMoney(Math.max(0,item.amountDueCzk-item.amountPaidCzk)))}</dd><dt>Přeplatek</dt><dd>${esc(formatMoney(Math.max(0,item.amountPaidCzk-item.amountDueCzk)))}</dd><dt>VS (uložené)</dt><dd>${esc(item.variableSymbol||'—')}</dd></dl><button type="button" data-member-reservation="${esc(item.id)}" data-member-event-id="${esc(item.eventId)}">Otevřít existující editor rezervace / platby</button></article>`}
function photo(item){return `<button type="button" class="admin-member-photo" data-member-image="${esc(item.mediaPath)}"><img alt="Soukromá fotografie člena" width="180" height="120" loading="lazy" data-member-media="${esc(item.mediaPath)}" data-media-version="${esc(item.version||'')}"/><span>Otevřít fotografii</span></button>`}
export function renderMemberHeader(payload){
 const m=payload.member;$('[data-member-identity]').innerHTML=`<h2 id="admin-member-heading">${esc(m.nickname||m.name)}</h2><p>${esc(m.name)} · ${esc(m.memberCode)} · ${esc(m.status)} · ${esc(m.role)}</p><p>${esc(m.email)} · ${esc(m.phone||'Bez telefonu')}</p><small>${esc(payload.event?.title||'Bez vybraného eventu')}</small>`;
 $('[data-member-event]').innerHTML=rows(payload.reservations,reservation);syncTabs();
}
export function renderMembers(payload){$('[data-member-list]').innerHTML=rows(payload.members,m=>`<article class="admin-member-card">${canonicalMemberLink(m.memberId,m.nickname||m.name)}<p>${esc(m.memberCode)} · ${esc(m.name)} · ${esc(m.status)}</p><small>${esc(m.email)}</small></article>`)+pagination(payload,'list')}
export function renderMemberTab(payload){
 const tab=payload.context.tab;const signature=currentKey()+':'+(payload.dataVersion||JSON.stringify(payload));if(renderedTab===signature)return;renderedTab=signature;let html='';
 if(tab==='reservations')html=rows(payload.items,reservation);
 if(tab==='garage')html=rows(payload.items,c=>`<article class="admin-member-card"><h3>${esc(c.nickname||c.model)}</h3><p>${esc(c.model)} · ${esc(c.body||'')} · ${esc(c.year||'')} · ${esc(c.color||'')} ${c.primaryCar?'· Hlavní auto':''}</p>${(c.photos||[]).map(photo).join('')}</article>`);
 if(tab==='photos')html=rows(payload.items,p=>`<article class="admin-member-card">${photo(p)}<p>${esc(p.caption||'')} · ${esc(p.status)}</p><small>${esc(p.reviewNote||'')}</small></article>`);
 if(tab==='history')html=rows(payload.items,h=>`<article class="admin-member-card"><h3>United ${esc(h.year)}</h3><p>Účast: ${esc(h.attendanceStatus)} · S&S: ${esc(h.snsStatus)} · ${esc(h.category||'')} ${esc(h.placement||'')}</p><p>${esc(h.attendanceNote||'')} ${esc(h.snsNote||'')}</p>${(h.photos||[]).map(photo).join('')}<button type="button" data-member-history="${esc(h.eventId)}">Otevřít existující moderaci historie</button></article>`);
 if(tab==='points')html=rows(payload.items,p=>`<article class="admin-member-card"><strong>${esc(p.delta)} Points</strong><p>${esc(p.reason)}</p><small>${esc(p.createdAt)}</small></article>`);
 if(tab==='club')html=`<p>Dostupné Points: ${esc(payload.points.available)} · Celkem získáno: ${esc(payload.points.lifetime)}</p><h3>${esc(payload.rating.name)}</h3>`+rows(payload.achievements,a=>`<article class="admin-member-card"><strong>${esc(a.name)} · ${esc(a.tier)}</strong><p>${esc(a.condition)}</p></article>`);
 if(tab==='mailing')html=(payload.contact?`<p>Uložené propojení: ${esc(payload.contact.email)}</p><p>Souhlas: ${esc(payload.contact.mailingConsent)} · ${esc(payload.contact.suppressionStatus)} · ${esc(payload.contact.deliverabilityStatus)}</p>`:'<p>Žádný uložený propojený kontakt. Shoda e-mailu sama o sobě není vazba.</p>')+rows(payload.items,p=>`<article class="admin-member-card"><strong>${esc(p.campaign)}</strong><p>${esc(p.deliveryStatus)} · ${esc(p.sentAt||'Neodesláno')}</p></article>`);
 if(tab==='qr')html=payload.payload?`<div class="admin-member-qr" aria-label="Členská QR identita">${memberQrSvg(payload.payload)}</div><p>Identifikace člena, nikoli vstupenka nebo potvrzení platby. Bez oprávnění ke změnám.</p>`:'<p>QR identita dosud nebyla explicitně provisionována. Tento pohled ji nevytváří.</p>';
 $('[data-member-tab-content]').innerHTML=html+pagination(payload,'tab');hydrateMemberMedia();
}
export function memberRefreshTasks(){
 if(adminState.memberId){const base='/api/admin/members/'+encodeURIComponent(adminState.memberId),suffix='?eventId='+encodeURIComponent(adminState.selectedEventId)+'&page='+(adminState.memberPage||1);const tasks=[['member-header',base+'?eventId='+encodeURIComponent(adminState.selectedEventId),renderMemberHeader,ADMIN_REFRESH.operationalMs]];
  if(adminState.memberTab!=='event')tasks.push(['member-tab',base+'/'+adminState.memberTab+suffix,renderMemberTab,['club','history','points','mailing','qr'].includes(adminState.memberTab)?ADMIN_REFRESH.analyticsMs:ADMIN_REFRESH.operationalMs]);return tasks}
 if(['members','united-club'].includes(adminState.activeAdminView))return [['members','/api/admin/members?page='+(adminState.membersPage||1),renderMembers,ADMIN_REFRESH.operationalMs]];
 return [];
}
function releaseMemberMedia(){renderedTab=null;mediaGeneration++;observer?.disconnect();for(const c of mediaControllers)c.abort();mediaControllers.clear();for(const item of media.values())if(item.url)URL.revokeObjectURL(item.url);media.clear();$('[data-member-image-dialog]')?.close();$('[data-member-full-image]')?.removeAttribute('src')}
async function loadMedia(path,version){
 const key=path+'|'+version,existing=media.get(key);if(existing)return existing.promise;
 const generation=mediaGeneration,context=currentKey(),controller=new AbortController();mediaControllers.add(controller);
 const item={url:null,promise:null};media.set(key,item);
 item.promise=apiRequest(path,{consume:'blob',signal:controller.signal}).then(blob=>{if(generation!==mediaGeneration||context!==currentKey()){if(media.get(key)===item)media.delete(key);return null;}item.url=URL.createObjectURL(blob);return item.url}).catch(()=>{media.delete(key);return null}).finally(()=>mediaControllers.delete(controller));return item.promise;
}
function hydrateMemberMedia(){
 observer?.disconnect();const active=new Set([...document.querySelectorAll('[data-member-media]')].map(n=>n.dataset.memberMedia+'|'+n.dataset.mediaVersion));for(const[key,item]of media)if(!active.has(key)){if(item.url)URL.revokeObjectURL(item.url);media.delete(key)}
 observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){const img=entry.target;observer.unobserve(img);void loadMedia(img.dataset.memberMedia,img.dataset.mediaVersion).then(url=>{if(url&&img.isConnected)img.src=url;else if(img.isConnected)img.alt='Fotografie teď není dostupná'})}},{root:$('[data-member-dialog]')});document.querySelectorAll('[data-member-media]').forEach(img=>observer.observe(img));
}
export function clearMemberPrivateState(){closeMember({route:false});searchSequence++;clearTimeout(searchTimer);searchController?.abort();searchCache.clear();searchFlight=null;adminState.membersPage=1;$('[data-member-search]').value='';$('[data-member-suggestions]').replaceChildren();$('[data-member-list]').replaceChildren()}
async function searchMembers(){
 clearTimeout(searchTimer);const q=$('[data-member-search]').value.trim();const target=$('[data-member-suggestions]');
 if(q.replace(/[^\p{L}\p{N}]/gu,'').length<2){searchSequence++;searchController?.abort();target.replaceChildren();return}
 const key=[adminState.sessionGeneration,adminState.selectedEventId,q].join('|');if(searchFlight?.key===key)return searchFlight.promise;
 searchController?.abort();const controller=new AbortController();searchController=controller;const sequence=++searchSequence,actor=adminState.currentUser,event=adminState.selectedEventId;
 const current=()=>sequence===searchSequence&&actor===adminState.currentUser&&!adminState.denied&&event===adminState.selectedEventId;
 const promise=(async()=>{try{
  if(q.startsWith('E36U')){const result=await apiRequest('/api/admin/member-qr/resolve',{method:'POST',body:{payload:q},signal:controller.signal});if(current()){target.replaceChildren();$('[data-member-search]').value='';openMember(result.memberId)}return}
  const cached=searchCache.get(key),payload=cached&&Date.now()-cached.at<ADMIN_REFRESH.searchCacheMs?cached.payload:await apiRequest('/api/admin/members?q='+encodeURIComponent(q),{signal:controller.signal});
  if(!current())return;searchCache.set(key,{payload,at:Date.now()});if(searchCache.size>20)searchCache.delete(searchCache.keys().next().value);
  target.innerHTML=rows(payload.members,m=>`<div>${canonicalMemberLink(m.memberId,m.nickname||m.name)} <small>${esc(m.memberCode)} · ${esc(m.email)}</small></div>`);
 }catch(error){if(current()&&!error.stale)target.textContent='Vyhledávání teď není dostupné. Zkus to znovu.'}finally{if(searchFlight?.key===key)searchFlight=null}})();searchFlight={key,promise};return promise;
}
export function initializeMembers({openReservation,openHistory}){
 if(initialized)return;initialized=true;adminState.memberTab='event';adminState.memberPage=1;adminState.membersPage=1;
 const search=document.createElement('form');search.className='admin-member-search';search.dataset.memberSearchForm='';search.setAttribute('role','search');search.innerHTML='<label>Najít člena / vložit členský QR <input data-member-search autocomplete="off" maxlength="100" placeholder="Jméno, e-mail, kód nebo auto (min. 2 znaky)" /></label><button type="submit">Najít</button><div data-member-suggestions aria-live="polite"></div>';$('[data-admin-view]').prepend(search);
 const dialog=document.createElement('dialog');dialog.dataset.memberDialog='';dialog.className='admin-member-dialog';dialog.setAttribute('aria-labelledby','admin-member-heading');dialog.innerHTML='<header><button type="button" data-member-close>Zpět / Zavřít</button><div data-member-identity></div><p data-member-freshness role="status"></p><nav role="tablist" aria-label="Detail člena">'+Object.entries(MEMBER_TABS).map(([key,label])=>`<button type="button" role="tab" data-member-tab="${key}">${label}</button>`).join('')+'</nav></header><section data-member-event></section><section data-member-tab-content></section>';document.body.append(dialog);
 const image=document.createElement('dialog');image.dataset.memberImageDialog='';image.className='admin-member-image-dialog';image.innerHTML='<button type="button" data-member-image-close>Zavřít fotografii</button><img data-member-full-image alt="Soukromá fotografie člena v plné velikosti" />';document.body.append(image);
 dialog.addEventListener('cancel',event=>{event.preventDefault();closeMember()});dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMember()}});
 image.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();image.close()}});
 search.addEventListener('submit',event=>{event.preventDefault();void searchMembers()});$('[data-member-search]').addEventListener('input',()=>{clearTimeout(searchTimer);searchSequence++;searchController?.abort();searchFlight=null;searchTimer=setTimeout(()=>void searchMembers(),ADMIN_REFRESH.searchDebounceMs)});
 document.addEventListener('click',event=>{
  const member=event.target.closest('[data-member-open],[data-member-qr-open]');if(member){event.preventDefault();event.stopImmediatePropagation();$('[data-member-suggestions]').replaceChildren();openMember(member.dataset.memberOpen||member.dataset.memberQrOpen,member,{tab:member.hasAttribute('data-member-qr-open')?'qr':member.dataset.memberOpenTab||(adminState.activeAdminView==='united-club'?'club':'event')});return}
  if(event.target.closest('[data-member-close]')){closeMember();return}
  const tab=event.target.closest('[data-member-tab]');if(tab){if(adminState.memberTab===tab.dataset.memberTab)return;renderedTab=null;$('[data-member-dialog] [data-domain-status="member-tab"]')?.remove();delete adminState.resourceStates['member-tab'];adminState.memberTab=tab.dataset.memberTab;adminState.memberPage=1;syncTabs();$('[data-member-tab-content]').textContent='Načítám sekci…';window.dispatchEvent(new CustomEvent('admin:membertab'));routeChange();return}
  const page=event.target.closest('[data-member-page]');if(page){adminState[page.dataset.memberPageKind==='list'?'membersPage':'memberPage']=Number(page.dataset.memberPage);routeChange();return}
  const res=event.target.closest('[data-member-reservation]');if(res){openReservation(res.dataset.memberReservation,res.dataset.memberEventId);return}
  if(event.target.closest('[data-member-history]')){openHistory();return}
  const preview=event.target.closest('[data-member-image]');if(preview){const img=preview.querySelector('img'),generation=mediaGeneration;void loadMedia(img.dataset.memberMedia,img.dataset.mediaVersion).then(url=>{if(url&&generation===mediaGeneration&&adminState.memberId){$('[data-member-full-image]').src=url;image.showModal()}});return}
  if(event.target.closest('[data-member-image-close]'))image.close();
 },true);
 window.addEventListener('admin:invalidate',()=>searchCache.clear());window.addEventListener('admin:eventchanged',()=>{searchSequence++;searchController?.abort();searchCache.clear();$('[data-member-suggestions]').replaceChildren()});
}
