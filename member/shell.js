import { deriveMemberHeroState } from '../member-portal-state.js?v=20261031-compose1';
import { initPortalNavigation } from '../portal-navigation.js?v=20260924-merch2';
import { $, $$ } from './ui.js?v=20260924-merch2';
import { accountAuthMode, memberSection, requestedMemberSection } from './deep-links.js?v=20261028-entry1';
import { initMobileNavigation } from '../mobile-navigation.js?v=20261031-polish1';

export function createMemberShell({
  renderApp,
  getData,
  getMemberSince,
  getAttended,
  getPrivateCarPhotoUrl,
  isAuthenticated,
  onGarageHeroAction,
  beforePortalAction,
  onLiveEntry,
  onSectionChange,
}) {
  const menuBtn=$('.menu-btn'),nav=$('.nav-links');
  const hero=$('[data-member-hero]'),heroHome=hero?.parentElement,heroNext=hero?.nextSibling;
  const mobileHeader=matchMedia('(max-width:1050px)');
  function placeIdentity(){if(!hero)return;if(mobileHeader.matches)$('.member-agenda-head')?.append(hero);else if(heroHome)heroHome.insertBefore(hero,heroNext?.parentElement===heroHome?heroNext:null)}
  mobileHeader.addEventListener('change',placeIdentity);placeIdentity();
  let memberHeroPhotoId='',liveModeActive=false,currentSection=null;
  const mobileNavigation=initMobileNavigation({member:true,onSelect:id=>openSection(id),beforeOpen:()=>beforePortalAction?.()});

  function closeMainMenu(){document.body.classList.remove('menu-open');menuBtn?.setAttribute('aria-expanded','false');nav?.classList.remove('open')}
  function setMode(text){
    $$('[data-mode-badge]').forEach(element=>element.textContent=text);
    const sync=$('[data-sync-state]');if(sync)sync.textContent=text;
    $$('[data-demo-hint]').forEach(element=>element.hidden=text.includes('LIVE'));
  }
  function setMainMobileMemberNavigation(authenticated){const mobileNavigation=$('[data-member-main-mobile-nav]');if(mobileNavigation)mobileNavigation.hidden=!authenticated;if(!authenticated)closeMainMenu()}
  function showAuth(){
    document.body.classList.remove('member-authenticated');
    mobileNavigation?.reset();
    setMainMobileMemberNavigation(false);
    const authView=$('[data-auth-view]'),appView=$('[data-app-view]'),statusView=$('[data-auth-status-view]');
    if(statusView)statusView.hidden=true;
    if(authView)authView.hidden=false;
    if(appView){appView.hidden=true;appView.inert=true;appView.setAttribute('aria-hidden','true')}
  }
  function showAuthStatus({title='Ověřuji přihlášení.',copy='Počkám na potvrzený stav Firebase session.',retry=false}={}){
    document.body.classList.remove('member-authenticated');
    mobileNavigation?.reset();
    setMainMobileMemberNavigation(false);
    const authView=$('[data-auth-view]'),appView=$('[data-app-view]'),statusView=$('[data-auth-status-view]');
    if(authView)authView.hidden=true;
    if(appView){appView.hidden=true;appView.inert=true;appView.setAttribute('aria-hidden','true')}
    if(statusView){statusView.hidden=false;$('[data-auth-status-title]',statusView).textContent=title;$('[data-auth-status-copy]',statusView).textContent=copy;const button=$('[data-auth-retry]',statusView);if(button)button.hidden=!retry}
  }
  function showApp(){
    document.body.classList.add('member-authenticated');
    setMainMobileMemberNavigation(!liveModeActive);
    const authView=$('[data-auth-view]'),appView=$('[data-app-view]'),statusView=$('[data-auth-status-view]');
    if(statusView)statusView.hidden=true;
    if(authView)authView.hidden=true;
    if(appView){appView.hidden=liveModeActive;appView.inert=liveModeActive;appView.setAttribute('aria-hidden',String(liveModeActive))}
    renderApp();
  }
  function activateAuthTab(name){
    const url=new URL(location.href);url.searchParams.set('mode',name);history.replaceState(history.state,'',url);
    $$('[data-auth-tab]').forEach(element=>element.classList.toggle('is-active',element.dataset.authTab===name));
    $$('[data-auth-form]').forEach(form=>form.classList.toggle('is-active',form.dataset.authForm===name));
  }
  function resetAuthForms(){
    $$('[data-auth-form]').forEach(form=>form.reset());
    activateAuthTab(accountAuthMode(''));
  }
  function setLiveMode(active){
    const appView=$('[data-app-view]'),liveView=$('[data-member-live-mode]');
    liveModeActive=active;
    document.body.classList.toggle('member-live-mode-active',active);
    setMainMobileMemberNavigation(!active&&isAuthenticated());
    if(liveView){liveView.hidden=!active;liveView.inert=!active;liveView.setAttribute('aria-hidden',String(!active))}
    if(appView){appView.hidden=active;appView.inert=active;appView.setAttribute('aria-hidden',String(active))}
    if(active)closeMainMenu();
  }
  function openSection(id,{liveConfirmed=false,fromHistory=false}={}){
    if(beforePortalAction?.()===false)return false;
    id=memberSection(id);
    if(id==='live'&&!liveConfirmed){void onLiveEntry?.();return false}
    onSectionChange?.(id);
    const url=new URL(window.location.href);url.searchParams.set('section',id);url.searchParams.delete('panel');
    if(id!=='club'){url.searchParams.delete('profile');url.searchParams.delete('members');url.searchParams.delete('clubTab');if(['#points','#history','#achievements'].includes(url.hash))url.hash=''}
    const previousSection=currentSection,changed=currentSection!==id,wasInitialized=currentSection!==null;
    if(!fromHistory){if(changed&&wasInitialized)window.history.pushState(null,'',url);else window.history.replaceState(window.history.state,'',url)}
    currentSection=id;document.body.dataset.memberSection=id;
    const titles={overview:'Přehled',reservation:'Rezervace na sraz & ubytování',live:'Program LIVE',garage:'Garáž',payments:'Platby',club:'United Club',photos:'Moje fotky',merch:'Moje objednávky',account:'Účet'};
    const greeting=$('[data-member-greeting]'),sectionTitle=$('[data-member-section-title]');
    $$('[data-agenda-action]').forEach(action=>action.hidden=action.dataset.agendaAction!==id);
    const clubStats=$('[data-club-statistics]');if(clubStats)clubStats.hidden=id!=='club';
    const clubAction=$('[data-club-heading-action]');if(clubAction)clubAction.hidden=id!=='club';
    const description=$('[data-member-agenda-description]');if(description)description.textContent=({overview:'Tvoje účast na jednom místě.',reservation:'Účast, auto a volitelné ubytování.',garage:'Tvoje auta na United.',payments:'Platby za sraz a Merch na jednom místě.',club:'Tvoje ověřené aktivity, historie a členské výhody.',photos:'Tvoje fotografie a stav jejich schválení.',account:'Osobní údaje a nastavení účtu.',merch:'Tvoje objednávky a jejich historie.',live:'Program a soutěže vybraného ročníku.'})[id]||'';
    {if(greeting){greeting.hidden=id!=='overview';greeting.textContent=id==='overview'?'Přehled':'';}if(sectionTitle){sectionTitle.hidden=id==='overview';sectionTitle.textContent=id==='overview'?'':titles[id]||''}}
    mobileNavigation?.sync(id);
    $$('.member-nav-item[data-member-section]').forEach(button=>{button.classList.toggle('is-active',button.dataset.memberSection===id);if(button.dataset.memberSection===id)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current')});
    $$('[data-main-member-section]').forEach(button=>button.classList.toggle('is-active',button.dataset.mainMemberSection===id));
    $$('[data-member-panel]').forEach(panel=>panel.classList.toggle('is-active',panel.dataset.memberPanel===id));
    window.dispatchEvent(new CustomEvent('member:sectionchange',{detail:{section:id,previousSection,fromHistory}}));
    memberPortalNavigation?.sync(id,{scroll:false});
    if(changed)requestAnimationFrame(()=>{const panel=$(`[data-member-panel="${id}"]`);if(!panel)return;const title=$('[data-member-page-title]');if(title){title.tabIndex=-1;title.focus({preventScroll:true})}if(wasInitialized)$('[data-member-page-title]').scrollIntoView({block:'start',behavior:'instant'})});return true;
  }
  window.addEventListener('popstate',()=>{if(!history.state?.unitedMobileMenu&&!document.querySelector('.united-mobile-menu[open]'))openSection(requestedMemberSection(location.search),{fromHistory:true})});
  function focusReservationEntry(){
    requestAnimationFrame(()=>requestAnimationFrame(()=>{const modalTitle=$('[data-member-planner-modal]:not([hidden]) [data-member-planner-title]'),target=modalTitle||$('[data-reservation-section-entry]');if(!target)return;if(!modalTitle)target.scrollIntoView({behavior:'smooth',block:'start'});target.focus({preventScroll:true})}));
  }

  $$('.member-nav-item[data-member-section]').forEach(button=>button.addEventListener('click',()=>openSection(button.dataset.memberSection)));
  $$('[data-jump]').forEach(button=>button.addEventListener('click',()=>{if(button.dataset.jump==='payments'){const url=new URL(location.href);url.searchParams.set('payment','sraz');history.replaceState(history.state,'',url)}if(openSection(button.dataset.jump)!==false&&button.hasAttribute('data-reservation-form-jump'))focusReservationEntry()}));
  $('.member-nav-shop')?.addEventListener('click',event=>{if(beforePortalAction?.()===false)event.preventDefault()});
  const memberPortalNavigation=initPortalNavigation({root:$('[data-portal-nav="member"]'),onSelect:openSection});
  $('[data-member-hero-cta]')?.addEventListener('click',()=>{openSection('garage');onGarageHeroAction()});

  function renderMemberHero(){
    const data=getData(),profile=data.profile||{},nickname=profile.nickname||profile.name?.split(' ')[0]||'Driver';
    const nicknameElement=$('[data-member-nickname]');if(nicknameElement)nicknameElement.textContent=nickname;
    const hero=$('[data-member-hero]'),media=$('[data-member-hero-media]'),carCopy=$('[data-member-hero-car]'),cta=$('[data-member-hero-cta]');if(!hero||!media||!carCopy||!cta)return;
    const view=deriveMemberHeroState({cars:data.cars,memberSince:getMemberSince()}),car=view.car;
    media.replaceChildren();memberHeroPhotoId='';
    hero.dataset.heroState=view.state;carCopy.textContent=view.carText;cta.textContent=view.cta;cta.hidden=!view.cta;window.dispatchEvent(new Event('member:identitychange'));if(!car||!view.photoId)return;
    const photoId=view.photoId;memberHeroPhotoId=photoId;
    const img=document.createElement('img');img.alt='';img.decoding='async';media.append(img);
    void (async()=>{
      try{const url=await getPrivateCarPhotoUrl(photoId);if(memberHeroPhotoId!==photoId||!img.isConnected)return;img.src=url;await img.decode().catch(()=>{});if(memberHeroPhotoId===photoId){hero.dataset.heroState='photo';window.dispatchEvent(new Event('member:identitychange'))}}
      catch(error){if(memberHeroPhotoId===photoId){hero.dataset.heroState='no-photo';media.replaceChildren();cta.textContent='Přidat fotku auta →';cta.hidden=false;window.dispatchEvent(new Event('member:identitychange'))}console.warn('Member hero photo unavailable',photoId,error)}
    })();
  }

  function bindMainNavigation(){
    // The mobile menu is owned by initMobileNavigation.
    $('[data-member-entry]')?.addEventListener('click',event=>{if(!isAuthenticated())return;event.preventDefault();openSection('overview');closeMainMenu()});
    $$('[data-main-member-section]').forEach(button=>button.addEventListener('click',()=>{openSection(button.dataset.mainMemberSection);closeMainMenu()}));
  }

  return {activateAuthTab,bindMainNavigation,closeMainMenu,memberPortalNavigation,openSection,renderMemberHero,resetAuthForms,setLiveMode,setMode,showApp,showAuth,showAuthStatus};
}
