// One mobile menu, with native dialog focus containment and a Back history entry.
export function initMobileNavigation({member=false,onSelect,beforeOpen=()=>true}={}){
 const header=document.querySelector('.site-header'),trigger=header?.querySelector('.menu-btn');
 if(!header||!trigger)return null;
 const icons={overview:'⌂',reservation:'▣',payments:'▤',garage:'◇',club:'★',photos:'▧',account:'◎',merch:'♧',live:'◉'};
 const dialog=document.createElement('dialog');dialog.className='united-mobile-menu';dialog.setAttribute('aria-label',member?'Sekce Můj United':'Navigace webu');
 dialog.innerHTML='<div class="mobile-menu-head"><strong>Menu UNITED</strong><button type="button" aria-label="Zavřít menu" data-menu-close>×</button></div><nav aria-label="Všechny sekce"></nav>';
 document.body.append(dialog);
 let opener=null,pending=null,closing=false;
 const bottom=member?document.createElement('nav'):null;
 if(bottom){bottom.className='member-bottom-nav';bottom.setAttribute('aria-label','Členská navigace');bottom.innerHTML=[['overview','Přehled'],['reservation','Registrace'],['payments','Platby']].map(([id,label])=>`<button type="button" data-mobile-section="${id}"><i aria-hidden="true">${icons[id]}</i><span>${label}</span></button>`).join('')+'<button type="button" data-mobile-menu><i aria-hidden="true">☰</i><span>Menu</span></button>';document.querySelector('[data-app-view]')?.append(bottom);bottom.addEventListener('click',event=>{const button=event.target.closest('button');if(button?.dataset.mobileSection)onSelect(button.dataset.mobileSection);else if(button)open(button)});}
 else{const original=header.querySelector('.nav-member');if(original){const link=original.cloneNode(true);link.classList.add('mobile-auth-link');header.querySelector('.nav')?.insertBefore(link,trigger);}}
 function sync(section){bottom?.querySelectorAll('button').forEach(button=>{const active=button.dataset.mobileSection===section||button.hasAttribute('data-mobile-menu')&&!['overview','reservation','payments'].includes(section);button.classList.toggle('is-active',active);active?button.setAttribute('aria-current','page'):button.removeAttribute('aria-current')});}
 function finish(){if(!dialog.open)return;dialog.close();document.body.classList.remove('united-menu-open');trigger.setAttribute('aria-expanded','false');bottom?.querySelector('[data-mobile-menu]')?.setAttribute('aria-expanded','false');const action=pending;pending=null;closing=false;requestAnimationFrame(()=>{if(action)action();else opener?.focus({preventScroll:true})});}
 function close(action=null){if(!dialog.open||closing)return;pending=action;closing=true;if(history.state?.unitedMobileMenu)history.back();else finish();}
 function open(button=trigger){if(dialog.open||beforeOpen()===false)return;opener=button;const target=dialog.querySelector('nav');target.replaceChildren();
  if(member&&document.body.classList.contains('member-authenticated')){document.querySelectorAll('.member-sidebar [data-member-section]').forEach(source=>{const clone=source.cloneNode(true);clone.removeAttribute('data-member-section');clone.removeAttribute('data-portal-target');clone.dataset.mobileSection=source.dataset.memberSection;clone.querySelectorAll('[data-live-nav-copy],[data-reservation-nav-status]').forEach(node=>{node.removeAttribute('data-live-nav-copy');node.removeAttribute('data-reservation-nav-status')});target.append(clone)});}
  else{header.querySelectorAll('.nav-links a:not(.nav-cta)').forEach(source=>{const clone=source.cloneNode(true);clone.removeAttribute('id');target.append(clone)});}
  history.pushState({...history.state,unitedMobileMenu:true},'');dialog.showModal();document.body.classList.add('united-menu-open');trigger.setAttribute('aria-expanded','true');bottom?.querySelector('[data-mobile-menu]')?.setAttribute('aria-expanded','true');dialog.querySelector('[data-menu-close]').focus();
 }
 trigger.addEventListener('click',()=>open());
 dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
 dialog.addEventListener('click',event=>{if(event.target===dialog||event.target.closest('[data-menu-close]'))return close();const button=event.target.closest('[data-mobile-section]');if(button)return close(()=>onSelect(button.dataset.mobileSection));const link=event.target.closest('a');if(link){event.preventDefault();close(()=>location.assign(link.href));}});
 window.addEventListener('popstate',()=>{if(dialog.open&&!history.state?.unitedMobileMenu)finish()});
 const viewport=()=>{const keyboard=!!window.visualViewport&&innerHeight-visualViewport.height>150&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'');document.body.classList.toggle('member-keyboard-open',keyboard);if(innerWidth>1050&&dialog.open)close()};
 window.visualViewport?.addEventListener('resize',viewport);window.addEventListener('resize',viewport);
 window.addEventListener('member:sectionchange',event=>sync(event.detail.section));
 return {sync,close};
}
