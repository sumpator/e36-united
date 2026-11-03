import {adminState} from './state.js?v=20260930-arrivals2';
import {mobileShortcuts,MOBILE_ADMIN_TARGETS} from './dashboard-model.js?v=20261103-mobile1';
import {VIEW_LABELS} from './destinations.js?v=20260930-arrivals2';
import {commandIcon} from './command-icons.js?v=20261014-admin1';
import {commandBadges,BADGE_SCOPE} from './command-model.js?v=20261103-mobile1';

// Presentation only: every destination still goes through setAdminView and its router/guards.
export function initializeAdminMobileShell({select}){
  const root=document.querySelector('[data-portal-nav="admin"]'),header=document.querySelector('.admin-header .nav');
  const opener=root.querySelector('[data-portal-menu-open]'),sheet=root.querySelector('[data-portal-sheet]');
  const previous=sheet.querySelector('[data-portal-sheet-dialog]'),dialog=document.createElement('dialog');
  for(const attr of previous.attributes)dialog.setAttribute(attr.name,attr.value);
  dialog.append(...previous.childNodes);previous.replaceWith(dialog);
  const title=document.createElement('span');title.className='admin-mobile-title';header.append(title);
  opener.setAttribute('aria-label','Otevřít menu administrace');header.append(opener);
  const search=document.querySelector('[data-member-search-form]'),searchButton=document.createElement('button');
  searchButton.type='button';searchButton.className='admin-mobile-search-toggle';searchButton.setAttribute('aria-label','Vyhledat člena');searchButton.setAttribute('aria-expanded','false');searchButton.innerHTML=commandIcon('members');opener.before(searchButton);
  const context=document.createElement('div');context.className='admin-mobile-context';document.querySelector('.admin-workspace').prepend(context);
  const year=document.querySelector('[data-event-select]').closest('label'),yearHome=document.createComment('Desktop event selector');year.before(yearHome);
  const account=document.querySelector('.admin-header .admin-hero-actions'),accountHome=document.createComment('Desktop account');account.before(accountHome);
  const menuAccount=document.createElement('details');menuAccount.className='admin-mobile-account';menuAccount.innerHTML='<summary>Účet a obnova dat</summary>';dialog.append(menuAccount);
  const edit=document.createElement('button');edit.type='button';edit.dataset.adminEditShortcuts='';edit.textContent='Upravit spodní menu';edit.className='admin-edit-shortcuts';dialog.querySelector('.portal-nav-sheet-head').after(edit);
  const bar=document.createElement('nav');bar.className='admin-mobile-bar';bar.setAttribute('aria-label','Spodní zkratky administrace');document.querySelector('[data-admin-view]').append(bar);
  let returnFocus=null,key='',searchOpen=false;
  const media=matchMedia('(max-width:1050px)');
  const resolved=id=>({settings:'event',photos:'gallery',club:'gallery'}[id]||id);
  const current=()=>adminState.activeAdminView==='gallery'?(adminState.galleryMode==='history'?'club':'photos'):adminState.activeAdminView;
  function close({restoreFocus=true}={}){if(dialog.open)dialog.close();sheet.hidden=true;opener.setAttribute('aria-expanded','false');document.body.classList.remove('portal-sheet-open');if(restoreFocus&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});returnFocus=null;blocked();}
  function open(){if(!media.matches)return;returnFocus=opener;sheet.hidden=false;dialog.showModal();opener.setAttribute('aria-expanded','true');document.body.classList.add('portal-sheet-open');dialog.querySelector('[data-portal-sheet-close]').focus();blocked();}
  function blocked(){const modal=[...document.querySelectorAll('dialog[open],[aria-modal="true"]')].some(node=>node.getClientRects().length>0);bar.inert=modal;const hidden=String(modal);if(bar.getAttribute('aria-hidden')!==hidden)bar.setAttribute('aria-hidden',hidden);}
  function sync(){
    const active=current(),logged=!!adminState.currentUser&&!adminState.denied&&!document.querySelector('[data-admin-view]').hidden;
    title.hidden=!logged;const label=active==='club'?'Historie & S&S':active==='photos'?'Fotky':VIEW_LABELS[adminState.activeAdminView]||MOBILE_ADMIN_TARGETS[active]||'Admin';if(title.textContent!==label)title.textContent=label;
    opener.hidden=!logged;searchButton.hidden=!logged;bar.hidden=!logged||adminState.activeAdminView==='live';
    edit.disabled=!adminState.dashboardPreferences;
    const chosen=mobileShortcuts(adminState.dashboardPreferences?.mobileShortcuts),nextKey=JSON.stringify([adminState.currentUser?.uid,chosen]);
    if(key!==nextKey){key=nextKey;bar.innerHTML=chosen.map(id=>`<button type="button" data-mobile-admin-target="${id}">${commandIcon(({settings:'settings',photos:'photos',club:'history',accommodation:'reservation-summary',arrivals:'car',preliminary:'reservations'})[id]||id)}<span>${MOBILE_ADMIN_TARGETS[id]}</span><b data-mobile-badge="${id}" hidden></b></button>`).join('');bar.style.setProperty('--shortcut-count',chosen.length);}
    const badges=commandBadges(adminState.summary);for(const button of bar.querySelectorAll('button')){const id=button.dataset.mobileAdminTarget,isActive=(id==='settings'?'event':id)===active;button.classList.toggle('is-active',isActive);if(isActive)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');const badge=button.querySelector('b'),count=badges[id==='club'?'history':id];badge.hidden=!Number.isFinite(count)||count===0;const text=Number.isFinite(count)?String(count):'';if(badge.textContent!==text)badge.textContent=text;button.title=BADGE_SCOPE[id==='club'?'history':id]||MOBILE_ADMIN_TARGETS[id];}
    for(const control of dialog.querySelectorAll('[data-portal-target],[data-admin-jump]')){const id=control.dataset.adminJump||control.dataset.portalTarget,isActive=(id==='settings'?'event':id)===active;control.classList.toggle('is-active',isActive);if(isActive)control.setAttribute('aria-current','page');else control.removeAttribute('aria-current');}
    if(media.matches){if(account.parentElement!==menuAccount)menuAccount.append(account);const scoped=['dashboard','arrivals','reservations','preliminary','accommodation','event'].includes(adminState.activeAdminView)||adminState.activeAdminView==='payments'&&adminState.paymentKind!=='merch';context.hidden=!scoped;if(scoped&&year.parentElement!==context)context.append(year);else if(!scoped&&year.parentElement!==header)yearHome.after(year);}
    else{if(year.parentElement!==header)yearHome.after(year);if(account.parentElement!==header)accountHome.after(account);context.hidden=true;close({restoreFocus:false});}
    blocked();
  }
  function choose(id){
    const target=resolved(id);if(target==='live'&&dialog.open)close();
    const result=select(id==='photos'||id==='club'?id:target);
    if(result===false){if(target==='live'&&document.querySelector('[data-admin-live-entry]:not([hidden])'))close({restoreFocus:false});return;}
    close({restoreFocus:false});searchOpen=false;header.classList.remove('admin-search-open');searchButton.setAttribute('aria-expanded','false');
    const heading=document.querySelector(`[data-admin-panel="${target}"] h2`);if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}sync();
  }
  opener.addEventListener('click',()=>dialog.open?close():open());
  dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
  dialog.addEventListener('click',event=>{if(event.target.closest('[data-portal-sheet-close]')){close();return}const control=event.target.closest('[data-portal-target],[data-admin-jump]');if(control){event.preventDefault();event.stopPropagation();choose(control.dataset.adminJump||control.dataset.portalTarget);return}if(event.target===dialog){const b=dialog.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)close()}});
  bar.addEventListener('click',event=>{const id=event.target.closest('[data-mobile-admin-target]')?.dataset.mobileAdminTarget;if(id&&!bar.inert)choose(id)});
  searchButton.addEventListener('click',()=>{searchOpen=!searchOpen;header.classList.toggle('admin-search-open',searchOpen);searchButton.setAttribute('aria-expanded',String(searchOpen));if(searchOpen)search.querySelector('input').focus();else searchButton.focus()});
  document.addEventListener('keydown',event=>{if(media.matches&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&!dialog.open){event.preventDefault();searchOpen=true;header.classList.add('admin-search-open');searchButton.setAttribute('aria-expanded','true');search.querySelector('input').focus();}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&searchOpen&&!dialog.open){searchOpen=false;header.classList.remove('admin-search-open');searchButton.setAttribute('aria-expanded','false');searchButton.focus()}});
  for(const event of ['admin:viewchange','admin:preferenceschange','admin:shellrender','admin:paymentkind'])window.addEventListener(event,sync);
  window.addEventListener('admin:closemenu',()=>close({restoreFocus:false}));
  window.addEventListener('admin:accesslost',()=>{close({restoreFocus:false});sync()});
  media.addEventListener('change',()=>{sync();if(media.matches)window.dispatchEvent(new Event('admin:dashboardready'));});
  const observer=new MutationObserver(records=>{if(records.some(r=>r.type==='attributes'))blocked()});observer.observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden','open','aria-hidden','class']});
  const viewport=window.visualViewport;let fullHeight=viewport?.height||innerHeight;
  viewport?.addEventListener('resize',()=>{const editing=document.activeElement?.matches('input,textarea,select');if(!editing)fullHeight=viewport.height;document.body.classList.toggle('admin-keyboard-open',!!editing&&fullHeight-viewport.height>120)});
  sync();return{sync,open,close};
}
