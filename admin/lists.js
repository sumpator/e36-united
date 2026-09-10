import {adminState} from './state.js?v=20260910-admin-card-ux-r1';
import {allowAdminNavigation} from './editors.js?v=20260910-admin-card-ux-r1';
import {cleanDrill} from './destinations.js?v=20260910-admin-card-ux-r1';
export function reservationRequestPath(detailId=null){
 const s=adminState,payment=s.activeAdminView==='payments';
 const p=new URLSearchParams({eventId:s.selectedEventId,view:payment?'payments':'reservations',filter:payment?s.paymentFilter:s.reservationFilter,filters:[...s.reservationDetailFilters].join(','),q:payment?s.paymentSearch:s.reservationSearch,page:String(s.reservationPage),pageSize:'50'});
 for(const [key,value] of Object.entries(cleanDrill(s.dashboardDrill)))p.set(key,value);
 if(s.queueMember)p.set('queueMember',s.queueMember);
 if(detailId){p.set('id',detailId);p.set('page','1');p.set('projection','detail');p.set('presentation','command')}
 return '/api/admin/reservations?'+p;
}
export const galleryRequestPath=()=>'/api/admin/gallery?'+new URLSearchParams({status:adminState.galleryFilter,page:String(adminState.galleryPage),...(adminState.queueMember?{queueMember:adminState.queueMember}:{})});
let searchTimer=null;
export function listChanged({search=false,gallery=false}={}){
 if(gallery)adminState.galleryPage=1;else adminState.reservationPage=1;
 clearTimeout(searchTimer);
 const refresh=()=>window.dispatchEvent(new CustomEvent('admin:invalidate'));
 if(search)searchTimer=setTimeout(refresh,250);else refresh();
}
export function renderListPagination(kind,pagination,onPage=null){
 const panel=['contacts','campaigns'].includes(kind)?document.querySelector('[data-mailing-area="'+kind+'"]'):document.querySelector('[data-'+(kind==='gallery'?'gallery-community':'admin-panel="'+kind+'"')+']');
 if(!panel)return;
 let nav=panel.querySelector('[data-list-pagination]');if(!nav){nav=document.createElement('nav');nav.dataset.listPagination=kind;nav.setAttribute('aria-label','Stránkování');panel.append(nav)}
 nav.hidden=!pagination||pagination.totalPages<=1;
 if(!pagination)return;
 nav.replaceChildren();
 for(const[delta,label]of[[-1,'Předchozí'],[1,'Další']]){
   const button=document.createElement('button');button.type='button';button.className='admin-button';button.textContent=label;
   button.disabled=delta<0?pagination.page<=1:pagination.page>=pagination.totalPages;
   button.onclick=()=>{if(!allowAdminNavigation())return;if(onPage){void onPage(pagination.page+delta);return}if(kind==='gallery')adminState.galleryPage=pagination.page+delta;else adminState.reservationPage=pagination.page+delta;window.dispatchEvent(new CustomEvent('admin:invalidate'))};nav.append(button);
 }
 nav.append(' Strana '+pagination.page+' z '+pagination.totalPages+' · celkem '+pagination.total+' odpovídajících záznamů');
}
