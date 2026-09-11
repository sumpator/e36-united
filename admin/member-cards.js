import {escapeHtml as esc} from './ui.js?v=20260911-finish-ui-r1';
import {apiRequest} from './api.js?v=20260911-finish-ui-r1';
import {adminState} from './state.js?v=20260911-finish-ui-r1';

export function pendingSummary(card){
 const p=card?.pending;
 if(!p||!['reservations','attendance','sns','photos'].every(k=>Number.isInteger(p[k])&&p[k]>=0))return null;
 return {total:p.reservations+p.attendance+p.sns+p.photos,target:p.reservations?'reservations':p.attendance+p.sns?'history':'photos',label:`Rezervace: ${p.reservations}; účast: ${p.attendance}; S&S: ${p.sns}; fotky: ${p.photos}`};
}
export function compactMemberIdentity(member){
 const id=member.memberId||member.id;
 return `<div class="compact-member-identity"><button type="button" class="admin-member-link" data-member-open="${esc(id)}">${esc(member.nickname||member.name||'United member')}</button><p>${esc(member.name||'Jméno neuvedeno')}</p></div>`;
}
export function compactMemberDetails(member){
 const id=member.memberId||member.id,card=member.card,pending=pendingSummary(card);
 const status={pending:'Čeká na schválení',approved:'Schválená',rejected:'Zamítnutá',cancelled:'Zrušená',draft:'Koncept'};
 return `<div class="compact-member-data"><a href="mailto:${esc(member.email||'')}">${esc(member.email||'E-mail neuveden')}</a><p class="compact-member-facts"><span>United: ${Number.isInteger(card?.attendances)?card.attendances+'×':'nenačteno'}</span><span>${card?.eventId?(card.reservationStatus===null?'Bez rezervace':status[card.reservationStatus]||'Stav nenačten'): 'Rezervace nenačtena'}</span></p>${pending?.total?`<button type="button" class="admin-badge admin-badge--pending" data-member-pending="${pending.target}" data-pending-member="${esc(id)}" title="${esc(pending.label)}" aria-label="${pending.total} čekajících žádostí. ${esc(pending.label)}">Čeká: ${pending.total} →</button>`:''}</div>`;
}
export function compactMemberPhoto(member){
 const id=member.memberId||member.id,photo=member.card?.photo;
 const safe=photo?.mediaPath?.startsWith('/api/admin/members/'+encodeURIComponent(id)+'/media/cars/');
 return `<div class="compact-member-photo" aria-hidden="true"><span>E36 UNITED</span>${safe?`<img alt="" data-card-media="${esc(photo.mediaPath)}" data-card-version="${esc(photo.version||'')}"/>`:''}</div>`;
}

// Each visible list owns its consumers. Disconnect/abort, detach, then revoke.
export function createCardMedia(){
 let generation=0,observer=null;const owned=new Map();
 function release(item){if(item.url){URL.revokeObjectURL(item.url);item.url=null}}
 function clear(){
  generation++;observer?.disconnect();observer=null;
  for(const item of owned.values()){item.controller.abort();for(const img of item.images){img.remove();img.removeAttribute('src')}if(!item.decoding)release(item)}owned.clear();
 }
 function hydrate(root){
  observer?.disconnect();const own=generation,actor=adminState.currentUser,session=adminState.sessionGeneration;
  observer=new IntersectionObserver(entries=>{for(const entry of entries){if(!entry.isIntersecting||adminState.memberId||adminState.pendingMemberRoute)continue;const img=entry.target;observer.unobserve(img);
   const path=img.dataset.cardMedia,key=path+'|'+img.dataset.cardVersion;
   let item=owned.get(key);if(!item){item={controller:new AbortController(),images:new Set(),url:null};owned.set(key,item);
    item.promise=apiRequest(path,{consume:'blob',signal:item.controller.signal}).then(async blob=>{
     const current=()=>own===generation&&actor===adminState.currentUser&&session===adminState.sessionGeneration&&!adminState.denied;
     if(!current())return null;
     item.url=URL.createObjectURL(blob);item.decoding=true;
     // Decode one off-DOM consumer before handing a URL to visible cards. On a
     // rapid Back, let that decoder finish before revoke; no timer or retry.
     const loader=new Image();loader.src=item.url;let decoded=false;
     try{await loader.decode();decoded=true}finally{loader.removeAttribute('src');item.decoding=false;if(!decoded||!current())release(item)}
     return current()?item.url:null;
    }).catch(()=>null);
   }item.images.add(img);void item.promise.then(url=>{if(url&&own===generation&&img.isConnected)img.src=url});
  }});
  root.querySelectorAll('[data-card-media]').forEach(img=>observer.observe(img));
 }
 return {clear,hydrate};
}
