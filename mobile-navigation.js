import {navigationIcon} from './navigation-icons.js?v=20261030-history1';
// One mobile menu, with native dialog focus containment and a Back history entry.
export function initMobileNavigation({member=false,onSelect,beforeOpen=()=>true}={}){
 const header=document.querySelector('.site-header'),trigger=header?.querySelector('.menu-btn');
 if(!header||!trigger)return null;

 // Account state updates its existing label span instead of replacing the icon.
 header.querySelectorAll('.nav-links .nav-member').forEach(link=>{if(link.querySelector('.nav-member-label'))return;const label=document.createElement('span');label.className='nav-member-label';label.textContent=link.textContent;link.replaceChildren(label)});
 header.querySelectorAll('.nav-links a').forEach(link=>{if(link.querySelector('svg'))return;const href=link.getAttribute('href')||'',name=href.includes('galerie')?'gallery':href.includes('merch')?'merch':href.includes('o-nas')?'about':href.includes('program')?'program':href.includes('show')?'showshine':href.includes('planer')?'planer':href.includes('member')?'account':'web';link.insertAdjacentHTML('afterbegin',navigationIcon(name))});
 const dialog=document.createElement('dialog');dialog.className='united-mobile-menu';dialog.setAttribute('aria-label',member?'Sekce Můj United':'Navigace webu');
 dialog.innerHTML='<div class="mobile-menu-head"><strong>Menu UNITED</strong><button type="button" aria-label="Zavřít menu" data-menu-close>×</button></div><nav aria-label="Všechny sekce"></nav>';
 document.body.append(dialog);
 let opener=null,pending=null,closing=false,menuEntry=null,actionEpoch=0;
 function forgetMenuEntry(){if(history.state?.unitedMobileMenu){const state={...history.state};delete state.unitedMobileMenu;history.replaceState(state,'')}}
 // A dialog does not survive reload. Neither can its transient history ownership.
 forgetMenuEntry();
 const bottom=member?document.createElement('nav'):null;
 if(bottom){bottom.className='member-bottom-nav';bottom.setAttribute('aria-label','Členská navigace');bottom.innerHTML=[['overview','Přehled'],['reservation','Rezervace'],['payments','Platby']].map(([id,label])=>`<button type="button" data-mobile-section="${id}"><i aria-hidden="true">${navigationIcon(id)}</i><span>${label}</span></button>`).join('')+`<button type="button" data-mobile-menu><i aria-hidden="true">${navigationIcon('menu')}</i><span>Menu</span></button>`;document.querySelector('[data-app-view]')?.append(bottom);bottom.addEventListener('click',event=>{const button=event.target.closest('button');if(button?.dataset.mobileSection)onSelect(button.dataset.mobileSection);else if(button)open(button)});}
 else{const original=header.querySelector('.nav-member');if(original){const link=original.cloneNode(true);link.classList.add('mobile-auth-link');header.querySelector('.nav')?.insertBefore(link,trigger);}}
 function sync(section){bottom?.querySelectorAll('button').forEach(button=>{const active=button.dataset.mobileSection===section||button.hasAttribute('data-mobile-menu')&&!['overview','reservation','payments'].includes(section);button.classList.toggle('is-active',active);active?button.setAttribute('aria-current','page'):button.removeAttribute('aria-current')});}
 function finish(){if(!dialog.open)return;dialog.close();document.body.classList.remove('united-menu-open');trigger.setAttribute('aria-expanded','false');bottom?.querySelector('[data-mobile-menu]')?.setAttribute('aria-expanded','false');const action=pending,returnFocus=opener,epoch=actionEpoch;pending=null;closing=false;menuEntry=null;requestAnimationFrame(()=>{if(epoch!==actionEpoch)return;if(action)action();else if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true})});}
 function close(action=null){if(!dialog.open||closing)return;pending=action;closing=true;if(history.state?.unitedMobileMenu===menuEntry)history.back();else finish();}
 function cloneMemberBlock(source){
  const clone=source.cloneNode(true);
  clone.querySelectorAll('[data-member-section]').forEach(button=>{button.dataset.mobileSection=button.dataset.memberSection;button.removeAttribute('data-member-section');button.removeAttribute('data-portal-target')});
  if(clone.hasAttribute('data-member-section')){clone.dataset.mobileSection=clone.dataset.memberSection;clone.removeAttribute('data-member-section');clone.removeAttribute('data-portal-target')}
  clone.querySelectorAll('[data-live-nav-copy],[data-reservation-nav-status]').forEach(node=>{node.removeAttribute('data-live-nav-copy');node.removeAttribute('data-reservation-nav-status')});
  return clone;
 }
 function syncIdentity(){dialog.querySelector('[data-menu-identity]')?.remove()}
 function open(button=trigger){if(dialog.open||beforeOpen()===false)return;opener=button;const target=dialog.querySelector('nav');target.replaceChildren();
  if(member&&document.body.classList.contains('member-authenticated')){document.querySelectorAll('.member-sidebar > :not(.member-nav-footer)').forEach(source=>target.append(cloneMemberBlock(source)));const publicLinks=document.createElement('div');publicLinks.className='mobile-public-links';publicLinks.setAttribute('aria-label','Veřejný web');publicLinks.innerHTML=[['index.html','web','Web'],['galerie.html','gallery','Galerie'],['merch.html','merch','Merch e-shop']].map(([href,icon,label])=>`<a href="${href}" aria-label="${label} · veřejný web"><i aria-hidden="true">${navigationIcon(icon)}</i><span>${label}</span></a>`).join('');target.append(publicLinks);const footer=document.createElement('div');footer.className='mobile-member-footer';const live=document.querySelector('.member-sidebar [data-member-section=live]');if(live&&!live.hidden)footer.append(cloneMemberBlock(live));const logout=document.createElement('button');logout.type='button';logout.className='mobile-member-logout';logout.textContent='Odhlásit se';logout.dataset.menuLogout='';footer.append(logout);target.append(footer);}
  else{header.querySelectorAll('.nav-links a:not(.nav-cta)').forEach(source=>{const clone=source.cloneNode(true);clone.removeAttribute('id');target.append(clone)});}
  actionEpoch++;menuEntry=crypto.randomUUID();history.pushState({...history.state,unitedMobileMenu:menuEntry},'');dialog.showModal();syncIdentity();document.body.classList.add('united-menu-open');trigger.setAttribute('aria-expanded','true');bottom?.querySelector('[data-mobile-menu]')?.setAttribute('aria-expanded','true');dialog.querySelector('[data-menu-close]').focus();
 }
 trigger.addEventListener('click',()=>open());
 dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
 dialog.addEventListener('click',event=>{if(event.target===dialog||event.target.closest('[data-menu-close]'))return close();if(event.target.closest('[data-menu-hero-cta]'))return close(()=>document.querySelector('[data-member-hero-cta]')?.click());if(event.target.closest('[data-menu-logout]'))return close(()=>document.querySelector('.member-sidebar-logout[data-logout]')?.click());const button=event.target.closest('[data-mobile-section]');if(button)return close(()=>onSelect(button.dataset.mobileSection));const link=event.target.closest('a');if(link){event.preventDefault();close(()=>location.assign(link.href));}});
 window.addEventListener('popstate',()=>{if(dialog.open&&history.state?.unitedMobileMenu!==menuEntry)finish();else if(!dialog.open){actionEpoch++;forgetMenuEntry()}});
 const viewport=()=>{const keyboard=!!window.visualViewport&&innerHeight-visualViewport.height>150&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'');document.body.classList.toggle('member-keyboard-open',keyboard);if(innerWidth>1050&&dialog.open)close()};
 window.visualViewport?.addEventListener('resize',viewport);window.addEventListener('resize',viewport);
 window.addEventListener('member:sectionchange',event=>{if(!event.detail.fromHistory)actionEpoch++;sync(event.detail.section)});
 window.addEventListener('member:identitychange',syncIdentity);
 return {sync,close,reset(){actionEpoch++;pending=null;forgetMenuEntry();finish();dialog.querySelector('nav').replaceChildren()}};
}
