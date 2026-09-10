import { allowAdminNavigation } from './editors.js?v=20260910-admin-compact-r1';
import { initPortalNavigation } from '../portal-navigation.js?v=20260910-admin-compact-r1';
import { ADMIN_VIEW_IDS } from '../admin-view-model.js?v=20260910-admin-compact-r1';
import {ADMIN_AREAS,VIEW_LABELS,areaFor} from './destinations.js?v=20260910-admin-compact-r1';
import { adminState } from './state.js?v=20260910-admin-compact-r1';
import { $, $$, rememberSessionChoice } from './ui.js?v=20260910-admin-compact-r1';

const adminCollapseStorageKey='e36UnitedAdmin.collapsedSections.v1';
const adminCollapsePreferences=readAdminCollapsePreferences();
let adminPortalNavigation=null;
let closeOverlays=()=>{};
let closeDeniedOverlays=()=>{};
let setCommunity=()=>{};

export function setView(name){
  $('[data-auth-view]').hidden=name!=='auth';
  $('[data-denied-view]').hidden=name!=='denied';
  $('[data-admin-view]').hidden=name!=='admin';
  if(name==='admin')requestAnimationFrame(()=>setAdminView(adminState.activeAdminView,{focus:false}));
}

export function setLoading(active){adminState.loading=active;$('[data-loading]').hidden=!active;$$('[data-refresh], [data-review-action], [data-gallery-action], [data-history-action], [data-accommodation-save], [data-event-settings-form] button').forEach(button=>button.disabled=active);const selector=$('[data-event-select]');if(selector)selector.disabled=active||adminState.events.length<2}
export function setDenied(){if(!adminState.denied){adminState.denied=true;window.dispatchEvent(new CustomEvent('admin:accesslost'))}closeDeniedOverlays();setView('denied')}

function readAdminCollapsePreferences(){
  try{
    const value=JSON.parse(localStorage.getItem(adminCollapseStorageKey)||'{}');
    return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  }catch{return{}}
}
function hasAdminCollapsePreference(section){return Object.prototype.hasOwnProperty.call(adminCollapsePreferences,section)}
export function setAdminSectionCollapsed(section,collapsed,{persist=false,animate=true}={}){
  const container=$(`[data-admin-collapsible="${section}"]`);
  const button=$(`[data-admin-collapse-toggle="${section}"]`,container||document);
  const body=button?.getAttribute('aria-controls')?document.getElementById(button.getAttribute('aria-controls')):null;
  if(!container||!button||!body)return;
  body.getAnimations?.().forEach(animation=>animation.cancel());
  if(!animate){container.classList.toggle('is-collapsed',collapsed);body.style.maxHeight=collapsed?'0px':'none'}
  else if(collapsed){
    body.style.maxHeight=`${body.scrollHeight}px`;body.offsetHeight;
    container.classList.add('is-collapsed');body.style.maxHeight='0px';
  }else{
    container.classList.remove('is-collapsed');body.style.maxHeight='0px';body.offsetHeight;
    body.style.maxHeight=`${body.scrollHeight}px`;
    body.addEventListener('transitionend',()=>{if(!container.classList.contains('is-collapsed'))body.style.maxHeight='none'},{once:true});
  }
  button.setAttribute('aria-expanded',String(!collapsed));
  const label=$('span',button);if(label)label.textContent=collapsed?'Rozbalit':'Sbalit';
  body.setAttribute('aria-hidden',String(collapsed));
  if(persist){
    adminCollapsePreferences[section]=collapsed;
    try{localStorage.setItem(adminCollapseStorageKey,JSON.stringify(adminCollapsePreferences))}catch{}
  }
}
function initializeAdminCollapsibles(){
  $$('[data-admin-collapsible]').forEach(container=>{
    const section=container.dataset.adminCollapsible;
    const collapsed=hasAdminCollapsePreference(section)?!!adminCollapsePreferences[section]:container.dataset.defaultCollapsed==='true';
    setAdminSectionCollapsed(section,collapsed,{animate:false});
  });
}

export function setAdminView(view,{focus=true}={}){
  if(view==='united-club')view='members';
  const nextView=['club','photos'].includes(view)?'gallery':ADMIN_VIEW_IDS.includes(view)?view:'dashboard';
  const nextMode=view==='club'?'history':view==='photos'?'community':adminState.galleryMode;
  const changed=nextView!==adminState.activeAdminView||nextView==='gallery'&&nextMode!==adminState.galleryMode;
  if(changed&&!allowAdminNavigation())return false;
  if(changed)window.dispatchEvent(new CustomEvent('admin:beforenavigation'));
  if(nextView==='gallery')setCommunity(nextMode);
  adminState.activeAdminView=nextView;rememberSessionChoice('e36UnitedAdmin.activeView',nextView);
  let queueNotice=$('[data-member-queue-notice]');
  if(!queueNotice){queueNotice=document.createElement('p');queueNotice.dataset.memberQueueNotice='';queueNotice.innerHTML='Čekající žádosti vybraného člena. <button type="button" data-member-queue-clear>Zobrazit všechny členy ve frontě</button>';}
  queueNotice.hidden=!adminState.queueMember||!['gallery','reservations'].includes(nextView);
  $(`[data-admin-panel="${nextView}"]`)?.prepend(queueNotice);
  $$('[data-admin-panel]').forEach(panel=>{const active=panel.dataset.adminPanel===(nextView==='united-club'?'members':nextView);panel.hidden=!active;panel.classList.toggle('is-active',active);panel.setAttribute('aria-hidden',String(!active))});
  const membersHeading=$('[data-admin-panel="members"] h2');if(membersHeading)membersHeading.textContent=nextView==='united-club'?'United Club · členové':'Členové';
  $$('[data-admin-jump]').forEach(button=>{const active=button.dataset.adminJump===nextView;button.classList.toggle('is-active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});
  const area=areaFor(nextView),secondary=$('[data-admin-secondary]');
  if(secondary&&secondary.dataset.area!==area){secondary.dataset.area=area;secondary.innerHTML=area==='reservations'?ADMIN_AREAS[area].views.map(v=>`<button type="button" data-admin-jump="${v}">${VIEW_LABELS[v]}</button>`).join(''):'';}
  secondary?.querySelectorAll('button').forEach(button=>button.setAttribute('aria-current',String(button.dataset.adminJump===(nextView==='gallery'?(adminState.galleryMode==='history'?'club':'photos'):nextView))==='true'?'page':'false'));
  adminPortalNavigation?.sync(area);
  if(area==='community')setCommunityExpanded(true);
  $$('[data-community-links] [data-admin-jump]').forEach(button=>{const active=button.dataset.adminJump===(nextView==='gallery'?(nextMode==='history'?'club':'photos'):nextView);button.classList.toggle('is-active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});
  if(changed){const wasRestoring=adminState.restoringRoute;adminState.restoringRoute=true;closeOverlays();adminState.restoringRoute=wasRestoring;window.dispatchEvent(new CustomEvent('admin:viewchange',{detail:{view:nextView}}));window.scrollTo({top:0,behavior:'auto'})}
  if(focus){const heading=$(`[data-admin-panel="${nextView}"] h2`);if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})}}
}

export function initializeAdminShell({onCloseOverlays=()=>{},onDenied=()=>{},onCommunityMode=()=>{}}={}){
  closeOverlays=onCloseOverlays;
  closeDeniedOverlays=onDenied;
  setCommunity=onCommunityMode;
  adminPortalNavigation=initPortalNavigation({root:$('[data-portal-nav="admin"]'),toggleMenu:true,onSelect:area=>{adminState.queueMember=null;return setAdminView(ADMIN_AREAS[area]?.views[0]||'dashboard')}});
  $$('[data-community-toggle]').forEach(button=>button.addEventListener('click',()=>{
    if(button.closest('[data-portal-tablist]')&&window.matchMedia('(max-width:1050px)').matches){setCommunityExpanded(true);adminPortalNavigation.open({opener:button});}
    else setCommunityExpanded(button.getAttribute('aria-expanded')!=='true');
  }));
  $('[data-portal-sheet]').addEventListener('click',event=>{if(event.target.closest('[data-admin-jump]'))queueMicrotask(()=>adminPortalNavigation.close({restoreFocus:false}))});
  $('[data-portal-tablist]').addEventListener('click',event=>{const control=event.target.closest('[data-portal-target]');if(control)setAdminView(ADMIN_AREAS[control.dataset.portalTarget]?.views[0]||'dashboard')});
  initializeAdminCollapsibles();
}

function setCommunityExpanded(expanded){
  $$('[data-community-toggle]').forEach(b=>b.setAttribute('aria-expanded',String(expanded)));
  $$('[data-community-links]').forEach(node=>node.hidden=!expanded);
}
