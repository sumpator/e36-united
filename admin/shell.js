import { initPortalNavigation } from '../portal-navigation.js?v=20260825-mobile1';
import { ADMIN_VIEW_IDS } from '../admin-view-model.js?v=20260903-mailing-b';
import { adminState } from './state.js?v=20260903-mailing-b';
import { $, $$, rememberSessionChoice } from './ui.js?v=20260903-phase5';

const adminCollapseStorageKey='e36UnitedAdmin.collapsedSections.v1';
const adminCollapsePreferences=readAdminCollapsePreferences();
let adminPortalNavigation=null;
let closeOverlays=()=>{};
let closeDeniedOverlays=()=>{};

export function setView(name){
  $('[data-auth-view]').hidden=name!=='auth';
  $('[data-denied-view]').hidden=name!=='denied';
  $('[data-admin-view]').hidden=name!=='admin';
  if(name==='admin')requestAnimationFrame(()=>setAdminView(adminState.activeAdminView,{focus:false}));
}

export function setLoading(active){adminState.loading=active;$('[data-loading]').hidden=!active;$$('[data-refresh], [data-review-action], [data-gallery-action], [data-history-action], [data-accommodation-save], [data-event-settings-form] button').forEach(button=>button.disabled=active);const selector=$('[data-event-select]');if(selector)selector.disabled=active||adminState.events.length<2}
export function setDenied(){closeDeniedOverlays();setView('denied')}

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
  const nextView=ADMIN_VIEW_IDS.includes(view)?view:'dashboard';
  adminState.activeAdminView=nextView;rememberSessionChoice('e36UnitedAdmin.activeView',nextView);
  $$('[data-admin-panel]').forEach(panel=>{const active=panel.dataset.adminPanel===nextView;panel.hidden=!active;panel.classList.toggle('is-active',active);panel.setAttribute('aria-hidden',String(!active))});
  $$('[data-admin-jump]').forEach(button=>{const active=button.dataset.adminJump===nextView;button.classList.toggle('is-active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});
  adminPortalNavigation?.sync(nextView);
  window.dispatchEvent(new CustomEvent('admin:viewchange',{detail:{view:nextView}}));
  closeOverlays();
  window.scrollTo({top:0,behavior:'auto'});
  if(focus){const heading=$(`[data-admin-panel="${nextView}"] h2`);if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})}}
}

export function initializeAdminShell({onCloseOverlays=()=>{},onDenied=()=>{}}={}){
  closeOverlays=onCloseOverlays;
  closeDeniedOverlays=onDenied;
  adminPortalNavigation=initPortalNavigation({root:$('[data-portal-nav="admin"]'),onSelect:view=>setAdminView(view)});
  initializeAdminCollapsibles();
}
