import {adminState} from './state.js?v=20260910-admin-compact-r1';
import {$,escapeHtml as esc} from './ui.js?v=20260910-admin-compact-r1';
import {apiRequest} from './api.js?v=20260910-admin-compact-r1';
import {ADMIN_REFRESH} from './refresh-policy.js?v=20260910-admin-compact-r1';
import qrcode from '../vendor/qrcode-generator.mjs?v=20260910-admin-compact-r1';
import {MEMBER_TABS,memberIdentity,memberOverview,memberReservation,memberSection,memberEmpty} from './member-presentation.js?v=20260910-admin-compact-r1';
import {compactMemberIdentity,compactMemberPhoto,createCardMedia} from './member-cards.js?v=20260910-admin-compact-r1';
const cardsMedia=createCardMedia();
let memberListMarkup=null;
function clearCards(){cardsMedia.clear();memberListMarkup=null}
if(typeof window!=='undefined'){
 window.addEventListener('admin:accesslost',clearCards);
 window.addEventListener('admin:viewchange',()=>{if(adminState.activeAdminView!=='members')clearCards()});
 window.addEventListener('admin:eventchanged',clearCards);
}

export {MEMBER_TABS};
export function canonicalMemberLink(id,label='Člen'){
  return /^[a-z0-9_-]{1,128}$/i.test(id||'')?`<button type="button" class="admin-member-link" data-member-open="${esc(id)}">${esc(label)}</button>`:esc(label);
}
export function memberQrSvg(payload){
  if(!/^E36U1:[a-f0-9]{48}$/.test(payload||''))return '';
  const qr=qrcode(0,'M');qr.addData(payload,'Byte');qr.make();return qr.createSvgTag({cellSize:6,margin:24,scalable:true});
}
let initialized=false,opener=null,searchTimer=null,searchSequence=0,searchController=null,searchFlight=null,observer=null,mediaGeneration=0;
let renderedTab=null,headerData=null,clubData=null,projectionKey=null,overviewSignature=null;
let scrollLock=null;
// One private hero per current member context, independent of lazy tab media.
let hero=null,heroGeneration=0;
const searchCache=new Map(),media=new Map(),mediaControllers=new Set();
const routeChange=()=>window.dispatchEvent(new CustomEvent('admin:membercontext'));
const currentKey=()=>[adminState.sessionGeneration,adminState.selectedEventId,adminState.memberId||'',adminState.memberTab||'overview',adminState.memberPage||1].join('|');
function ensureProjectionContext(){const key=[adminState.sessionGeneration,adminState.selectedEventId,adminState.memberId].join('|');if(key!==projectionKey){projectionKey=key;headerData=null;clubData=null;overviewSignature=null;}}
export function renderMemberReadState(){
 if(!adminState.memberId)return;ensureProjectionContext();if(adminState.memberTab!=='overview')return;
 const html=memberOverview(headerData,clubData,{headerState:adminState.resourceStates['member-header'],clubState:adminState.resourceStates['member-tab']});
 if(html!==overviewSignature){overviewSignature=html;$('[data-member-tab-content]').innerHTML=html;}
}
export function memberContextKey(){return currentKey()+':'+(adminState.membersPage||1)}
export function openMember(id,source,{tab='overview',route=true}={}){
  if(!/^[a-z0-9_-]{1,128}$/i.test(id||'')||!adminState.currentUser||adminState.denied)return;
  if(route)window.dispatchEvent(new CustomEvent('admin:beforenavigation'));
  if($('[data-member-load-error]'))$('[data-member-load-error]').hidden=true;
  if(adminState.memberId!==id){document.querySelectorAll('[data-member-dialog] [data-domain-status]').forEach(node=>node.remove());delete adminState.resourceStates['member-header'];delete adminState.resourceStates['member-tab'];releaseMemberMedia();$('[data-member-identity]').innerHTML='<h2 id="admin-member-heading">Načítám člena…</h2>';$('[data-member-event]').replaceChildren();$('[data-member-tab-content]').replaceChildren();}
  opener=source||opener||document.activeElement;adminState.memberId=id;adminState.memberTab=Object.hasOwn(MEMBER_TABS,tab)?tab:'overview';adminState.memberPage=1;
  ensureProjectionContext();
  const dialog=$('[data-member-dialog]');if(!dialog.open){scrollLock={x:window.scrollX,y:window.scrollY};document.documentElement.classList.add('admin-member-modal-open');dialog.showModal();}syncTabs();renderMemberReadState();
  if(route)window.dispatchEvent(new CustomEvent('admin:memberopened'));routeChange();
}
export function closeMember({route=true}={}){
  const dialog=$('[data-member-dialog]');if(!adminState.memberId&&!dialog?.open)return;
  adminState.memberId=null;adminState.memberTab='overview';adminState.memberPage=1;dialog?.close();releaseMemberMedia();
  headerData=null;clubData=null;projectionKey=null;overviewSignature=null;
  document.documentElement.classList.remove('admin-member-modal-open');if(scrollLock)window.scrollTo(scrollLock.x,scrollLock.y);scrollLock=null;
  for(const selector of ['[data-member-identity]','[data-member-event]','[data-member-tab-content]'])$(selector)?.replaceChildren();
  const returnTarget=opener?.isConnected&&opener!==document.body?opener:$('[data-member-search]');returnTarget?.focus({preventScroll:true});opener=null;
  window.dispatchEvent(new CustomEvent('admin:memberhidden'));if(route)window.dispatchEvent(new CustomEvent('admin:memberclosed'));routeChange();
}
function syncTabs(){
 document.querySelectorAll('[data-member-tab]').forEach(button=>{const active=button.dataset.memberTab===adminState.memberTab;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1});
 $('[data-member-section-select]').value=adminState.memberTab;
 $('[data-member-panel]').setAttribute('aria-labelledby','member-tab-'+adminState.memberTab);
 $('[data-member-event]').hidden=adminState.memberTab!=='event';$('[data-member-tab-content]').hidden=adminState.memberTab==='event';
}
function selectMemberSection(tab){
 if(!Object.hasOwn(MEMBER_TABS,tab)||adminState.memberTab===tab)return;
 releaseMemberMedia({preserveHero:true});overviewSignature=null;$('[data-member-dialog] [data-domain-status="member-tab"]')?.remove();delete adminState.resourceStates['member-tab'];
 adminState.memberTab=tab;adminState.memberPage=1;syncTabs();$('[data-member-panel]').scrollTop=0;
 $('[data-member-tab-content]').textContent='Načítám sekci…';renderMemberReadState();window.dispatchEvent(new CustomEvent('admin:membertab'));routeChange();
}
function pagination(payload,kind){const p=payload.pagination;if(!p)return '';return `<nav class="admin-member-pagination" aria-label="Stránkování"><button type="button" data-member-page-kind="${kind}" data-member-page="${p.page-1}" ${p.page<=1?'disabled':''}>Předchozí</button><span>Celkem ${p.total} · ${p.page}/${p.totalPages}</span><button type="button" data-member-page-kind="${kind}" data-member-page="${p.page+1}" ${p.page>=p.totalPages?'disabled':''}>Další</button></nav>`}
function rows(items,render){return items?.length?items.map(render).join(''):'<p>Žádné záznamy v tomto rozsahu.</p>'}
export function renderMemberHeader(payload){
 ensureProjectionContext();headerData=payload;
 const identity=memberIdentity(payload.member,payload.heroCar);if($('[data-member-identity]').innerHTML!==identity)$('[data-member-identity]').innerHTML=identity;
 renderMemberHero(payload);
 $('[data-member-event]').innerHTML=payload.reservations?.length?payload.reservations.map(memberReservation).join(''):memberEmpty('Na tento ročník zatím nemá rezervaci.','reservations');syncTabs();renderMemberReadState();
}
export function renderMembers(payload){
 const list=$('[data-member-list]'),markup=rows(payload.members,m=>`<article class="admin-member-card compact-member-card">${compactMemberPhoto(m)}${compactMemberIdentity(m)}</article>`)+pagination(payload,'list');
 if(markup!==memberListMarkup){clearCards();list.innerHTML=markup;memberListMarkup=markup}
 if(!adminState.memberId&&!adminState.pendingMemberRoute)cardsMedia.hydrate(list);
}
export function renderMemberTab(payload){
 ensureProjectionContext();
 if(payload.context.tab==='club'){clubData=payload;if(adminState.memberTab==='overview'){renderMemberReadState();return;}}
 const signature=currentKey()+':'+(payload.dataVersion||JSON.stringify(payload));if(renderedTab===signature)return;renderedTab=signature;
 $('[data-member-tab-content]').innerHTML=memberSection(payload,memberQrSvg)+pagination(payload,'tab');hydrateMemberMedia();
}
export function memberRefreshTasks(){
 if(adminState.memberId){const base='/api/admin/members/'+encodeURIComponent(adminState.memberId),suffix='?eventId='+encodeURIComponent(adminState.selectedEventId)+'&page='+(adminState.memberPage||1);const tasks=[['member-header',base+'?eventId='+encodeURIComponent(adminState.selectedEventId),renderMemberHeader,ADMIN_REFRESH.operationalMs]];
  if(adminState.memberTab!=='event'){const tab=adminState.memberTab==='overview'?'club':adminState.memberTab;tasks.push(['member-tab',base+'/'+tab+suffix,renderMemberTab,['club','history','points','mailing','qr'].includes(tab)?ADMIN_REFRESH.analyticsMs:ADMIN_REFRESH.operationalMs]);}return tasks}
 if(['members','united-club'].includes(adminState.activeAdminView))return [['members','/api/admin/members?page='+(adminState.membersPage||1)+'&presentation=cards&eventId='+encodeURIComponent(adminState.selectedEventId),renderMembers,ADMIN_REFRESH.operationalMs]];
 return [];
}
function releaseMemberMedia({preserveHero=false}={}){
 if(!preserveHero)releaseMemberHero();
 renderedTab=null;mediaGeneration++;observer?.disconnect();
 // Physically detach live consumers before revoking while WebKit may still be
 // decoding a private blob. Reattach the empty reusable preview afterwards.
 const imageDialog=$('[data-member-image-dialog]'),fullImage=$('[data-member-full-image]');
 imageDialog?.close();
 document.querySelectorAll('[data-member-dialog] [data-member-media]').forEach(img=>{img.remove();img.removeAttribute('src')});
 if(fullImage){fullImage.remove();fullImage.removeAttribute('src')}
 for(const c of mediaControllers)c.abort();mediaControllers.clear();
 for(const item of media.values())if(item.url)URL.revokeObjectURL(item.url);media.clear();
 if(fullImage&&imageDialog?.isConnected)imageDialog.append(fullImage);
}
function releaseMemberHero(){
 heroGeneration++;hero?.controller.abort();
 if(hero?.image){hero.image.removeAttribute('src');hero.image.remove();}
 if(hero?.url)URL.revokeObjectURL(hero.url);
 hero=null;$('[data-member-hero]')?.classList.remove('has-photo');
}
function renderMemberHero(payload){
 const car=payload.heroCar,photo=car?.photo,id=adminState.memberId;
 const valid=value=>typeof value==='string'&&/^[a-z0-9_-]{1,128}$/i.test(value);
 const path=valid(id)&&valid(car?.id)&&valid(photo?.id)?`/api/admin/members/${encodeURIComponent(id)}/media/cars/${encodeURIComponent(car.id)}/${encodeURIComponent(photo.id)}`:null;
 if(!path||photo.mediaPath!==path||payload.member?.memberId!==id||payload.context?.memberId!==id){releaseMemberHero();return;}
 const context=[adminState.sessionGeneration,adminState.selectedEventId,id].join('|'),key=context+'|'+path+'|'+(photo.version||'');
 if(hero?.key===key)return; // Includes failed media: do not retry every header poll.
 releaseMemberHero();const generation=heroGeneration,controller=new AbortController();
 const item={key,controller,url:null,image:null};hero=item;
 const current=()=>hero===item&&generation===heroGeneration&&context===[adminState.sessionGeneration,adminState.selectedEventId,adminState.memberId].join('|')&&adminState.currentUser&&!adminState.denied;
 void (async()=>{
  try{
   const blob=await apiRequest(path,{consume:'blob',signal:controller.signal});if(!current())return;
   const image=new Image();item.image=image;image.alt='';image.dataset.memberHeroImage='';image.hidden=true;
   item.url=URL.createObjectURL(blob);image.src=item.url;$('[data-member-hero-media]').append(image);
   await image.decode();if(!current())return;
   image.hidden=false;$('[data-member-hero]').classList.add('has-photo');
  }catch{
   if(!current())return;
   item.image?.removeAttribute('src');item.image?.remove();item.image=null;
   if(item.url)URL.revokeObjectURL(item.url);item.url=null;
   // The branded base stays visible for missing, denied or undecodable media.
  }
 })();
}
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
export function clearMemberPrivateState(){clearCards();closeMember({route:false});searchSequence++;clearTimeout(searchTimer);searchController?.abort();searchCache.clear();searchFlight=null;adminState.membersPage=1;$('[data-member-search]').value='';$('[data-member-suggestions]').replaceChildren();$('[data-member-list]').replaceChildren()}
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
// Wrap only the active native modal's tab boundary; the image modal takes precedence.
function containMemberFocus(event,dialog){
 if(event.key!=='Tab')return;
 const nodes=[...dialog.querySelectorAll('button,select,[tabindex]')].filter(n=>!n.disabled&&n.tabIndex>=0&&n.getClientRects().length);
 const target=event.shiftKey&&document.activeElement===nodes[0]?nodes.at(-1):!event.shiftKey&&document.activeElement===nodes.at(-1)?nodes[0]:null;
 if(target){event.preventDefault();target.focus();}
}
export function initializeMembers({openReservation,openHistory}){
 if(initialized)return;initialized=true;adminState.memberTab='overview';adminState.memberPage=1;adminState.membersPage=1;
 const search=document.createElement('form');search.className='admin-member-search';search.dataset.memberSearchForm='';search.setAttribute('role','search');search.innerHTML='<label>Najít člena / vložit členský QR <input data-member-search autocomplete="off" maxlength="100" placeholder="Jméno, e-mail, kód nebo auto (min. 2 znaky)" /></label><button type="submit">Najít</button><div data-member-suggestions aria-live="polite"></div>';$('[data-admin-view]').prepend(search);
 const dialog=document.createElement('dialog');dialog.dataset.memberDialog='';dialog.className='admin-member-dialog';dialog.setAttribute('aria-labelledby','admin-member-heading');dialog.innerHTML='<header data-member-hero><div data-member-hero-media aria-hidden="true"></div><div data-member-identity><h2 id="admin-member-heading">Načítám člena…</h2></div><button type="button" data-member-close aria-label="Zavřít detail člena">Zavřít ×</button><p data-member-freshness role="status"></p></header><p data-member-load-error role="status" hidden></p><div class="admin-member-layout"><nav role="tablist" aria-orientation="vertical" aria-label="Sekce člena">'+Object.entries(MEMBER_TABS).map(([key,label])=>`<button type="button" role="tab" id="member-tab-${key}" aria-controls="admin-member-panel" data-member-tab="${key}">${label}</button>`).join('')+'</nav><label class="admin-member-section-picker" for="member-section-select"><span>Sekce člena</span><select id="member-section-select" data-member-section-select>'+Object.entries(MEMBER_TABS).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')+'</select></label><div id="admin-member-panel" data-member-panel role="tabpanel" tabindex="0"><section data-member-event></section><section data-member-tab-content></section></div></div>';document.body.append(dialog);
 $('[data-member-section-select]').addEventListener('change',event=>selectMemberSection(event.target.value));
 dialog.querySelector('[role="tablist"]').addEventListener('keydown',event=>{
  const tabs=[...dialog.querySelectorAll('[data-member-tab]')],index=tabs.indexOf(document.activeElement);if(index<0)return;
  const target=event.key==='ArrowDown'?(index+1)%tabs.length:event.key==='ArrowUp'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;
  if(target!==null){event.preventDefault();tabs.forEach((node,i)=>node.tabIndex=i===target?0:-1);tabs[target].focus();}
 });
 const image=document.createElement('dialog');image.dataset.memberImageDialog='';image.className='admin-member-image-dialog';image.innerHTML='<button type="button" data-member-image-close>Zavřít fotografii</button><img data-member-full-image alt="Soukromá fotografie člena v plné velikosti" />';document.body.append(image);
 dialog.addEventListener('cancel',event=>{event.preventDefault();closeMember()});dialog.addEventListener('keydown',event=>{if(image.open)return;containMemberFocus(event,dialog);if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeMember()}});
 image.addEventListener('keydown',event=>{containMemberFocus(event,image);if(event.key==='Escape'){event.preventDefault();event.stopPropagation();image.close()}});
 search.addEventListener('submit',event=>{event.preventDefault();void searchMembers()});$('[data-member-search]').addEventListener('input',()=>{clearTimeout(searchTimer);searchSequence++;searchController?.abort();searchFlight=null;searchTimer=setTimeout(()=>void searchMembers(),ADMIN_REFRESH.searchDebounceMs)});
 document.addEventListener('click',event=>{
  const card=event.target.closest('[data-member-list] .compact-member-card');
  if(card&&!event.target.closest('button,a,input,select,textarea')){openMember(card.querySelector('[data-member-open]').dataset.memberOpen,card.querySelector('[data-member-open]'));return;}
  const member=event.target.closest('[data-member-open],[data-member-qr-open]');if(member){event.preventDefault();event.stopImmediatePropagation();$('[data-member-suggestions]').replaceChildren();openMember(member.dataset.memberOpen||member.dataset.memberQrOpen,member,{tab:member.hasAttribute('data-member-qr-open')?'qr':member.dataset.memberOpenTab||(adminState.activeAdminView==='united-club'?'club':'overview')});return}
  if(event.target.closest('[data-member-close]')){closeMember();return}
  const tab=event.target.closest('[data-member-tab],[data-member-section]');if(tab){selectMemberSection(tab.dataset.memberTab||tab.dataset.memberSection);return}
  const page=event.target.closest('[data-member-page]');if(page){adminState[page.dataset.memberPageKind==='list'?'membersPage':'memberPage']=Number(page.dataset.memberPage);routeChange();return}
  const res=event.target.closest('[data-member-reservation]');if(res){openReservation(res.dataset.memberReservation,res.dataset.memberEventId);return}
  if(event.target.closest('[data-member-history]')){openHistory();return}
  const preview=event.target.closest('[data-member-image]');if(preview){const img=preview.querySelector('img'),generation=mediaGeneration;void loadMedia(img.dataset.memberMedia,img.dataset.mediaVersion).then(url=>{if(url&&generation===mediaGeneration&&adminState.memberId){$('[data-member-full-image]').src=url;image.showModal()}});return}
  if(event.target.closest('[data-member-image-close]'))image.close();
 },true);
 window.addEventListener('admin:invalidate',()=>searchCache.clear());window.addEventListener('admin:eventchanged',()=>{searchSequence++;searchController?.abort();searchCache.clear();$('[data-member-suggestions]').replaceChildren()});
}
