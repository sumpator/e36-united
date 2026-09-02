import { deriveMemberHeroState } from '../member-portal-state.js?v=20260828-member-club';
import { initPortalNavigation } from '../portal-navigation.js?v=20260825-mobile1';
import { $, $$ } from './ui.js?v=20260902-phase3';

export function createMemberShell({
  renderApp,
  getData,
  getMemberSince,
  getAttended,
  getPrivateCarPhotoUrl,
  isAuthenticated,
  onGarageHeroAction,
}) {
  const menuBtn=$('.menu-btn'),nav=$('.nav-links');
  let memberHeroPhotoId='';

  function closeMainMenu(){document.body.classList.remove('menu-open');menuBtn?.setAttribute('aria-expanded','false');nav?.classList.remove('open')}
  function setMode(text){
    $$('[data-mode-badge]').forEach(element=>element.textContent=text);
    const sync=$('[data-sync-state]');if(sync)sync.textContent=text;
    $$('[data-demo-hint]').forEach(element=>element.hidden=text.includes('LIVE'));
  }
  function setMainMobileMemberNavigation(authenticated){const mobileNavigation=$('[data-member-main-mobile-nav]');if(mobileNavigation)mobileNavigation.hidden=!authenticated;if(!authenticated)closeMainMenu()}
  function showAuth(){
    document.body.classList.remove('member-authenticated');
    setMainMobileMemberNavigation(false);
    const authView=$('[data-auth-view]'),appView=$('[data-app-view]'),statusView=$('[data-auth-status-view]');
    if(statusView)statusView.hidden=true;
    if(authView)authView.hidden=false;
    if(appView)appView.hidden=true;
  }
  function showAuthStatus({title='Ověřuji přihlášení.',copy='Počkám na potvrzený stav Firebase session.',retry=false}={}){
    document.body.classList.remove('member-authenticated');
    setMainMobileMemberNavigation(false);
    const authView=$('[data-auth-view]'),appView=$('[data-app-view]'),statusView=$('[data-auth-status-view]');
    if(authView)authView.hidden=true;
    if(appView)appView.hidden=true;
    if(statusView){statusView.hidden=false;$('[data-auth-status-title]',statusView).textContent=title;$('[data-auth-status-copy]',statusView).textContent=copy;const button=$('[data-auth-retry]',statusView);if(button)button.hidden=!retry}
  }
  function showApp(){
    document.body.classList.add('member-authenticated');
    setMainMobileMemberNavigation(true);
    const authView=$('[data-auth-view]'),appView=$('[data-app-view]'),statusView=$('[data-auth-status-view]');
    if(statusView)statusView.hidden=true;
    if(authView)authView.hidden=true;
    if(appView)appView.hidden=false;
    renderApp();
  }
  function activateAuthTab(name){
    $$('[data-auth-tab]').forEach(element=>element.classList.toggle('is-active',element.dataset.authTab===name));
    $$('[data-auth-form]').forEach(form=>form.classList.toggle('is-active',form.dataset.authForm===name));
  }
  function resetAuthForms(){
    $$('[data-auth-form]').forEach(form=>form.reset());
    activateAuthTab('login');
  }
  function openSection(id){
    if(['history','rewards'].includes(id))id='club';
    $$('.member-nav-item[data-member-section]').forEach(button=>button.classList.toggle('is-active',button.dataset.memberSection===id));
    $$('[data-main-member-section]').forEach(button=>button.classList.toggle('is-active',button.dataset.mainMemberSection===id));
    $$('[data-member-panel]').forEach(panel=>panel.classList.toggle('is-active',panel.dataset.memberPanel===id));
    memberPortalNavigation?.sync(id);if(innerWidth<700)window.scrollTo({top:82,behavior:'smooth'});
  }

  $$('.member-nav-item[data-member-section]').forEach(button=>button.addEventListener('click',()=>openSection(button.dataset.memberSection)));
  $$('[data-jump]').forEach(button=>button.addEventListener('click',()=>openSection(button.dataset.jump)));
  const memberPortalNavigation=initPortalNavigation({root:$('[data-portal-nav="member"]'),onSelect:openSection});
  $('[data-member-hero-cta]')?.addEventListener('click',()=>{openSection('garage');onGarageHeroAction()});

  function renderMemberHero(){
    const data=getData(),profile=data.profile||{},nickname=profile.nickname||profile.name?.split(' ')[0]||'Driver';
    const nicknameElement=$('[data-member-nickname]');if(nicknameElement)nicknameElement.textContent=nickname;
    const hero=$('[data-member-hero]'),media=$('[data-member-hero-media]'),carCopy=$('[data-member-hero-car]'),cta=$('[data-member-hero-cta]'),sinceCopy=$('[data-member-hero-since]');if(!hero||!media||!carCopy||!cta)return;
    const view=deriveMemberHeroState({cars:data.cars,memberSince:getMemberSince()}),car=view.car,attendedCopy=$('[data-member-hero-attended]');if(sinceCopy)sinceCopy.textContent=`UNITED OD ${view.since||'—'}`;if(attendedCopy)attendedCopy.textContent=`${getAttended()}× UNITED`;
    media.replaceChildren();memberHeroPhotoId='';
    hero.dataset.heroState=view.state;carCopy.textContent=view.carText;cta.textContent=view.cta;cta.hidden=!view.cta;if(!car||!view.photoId)return;
    const photoId=view.photoId;memberHeroPhotoId=photoId;
    const img=document.createElement('img');img.alt='';img.decoding='async';media.append(img);
    void (async()=>{
      try{const url=await getPrivateCarPhotoUrl(photoId);if(memberHeroPhotoId!==photoId||!img.isConnected)return;img.src=url;await img.decode().catch(()=>{});if(memberHeroPhotoId===photoId)hero.dataset.heroState='photo'}
      catch(error){if(memberHeroPhotoId===photoId){hero.dataset.heroState='no-photo';media.replaceChildren();cta.textContent='Přidat fotku auta →';cta.hidden=false}console.warn('Member hero photo unavailable',photoId,error)}
    })();
  }

  function bindMainNavigation(){
    if(menuBtn&&nav)menuBtn.addEventListener('click',()=>{const open=document.body.classList.toggle('menu-open');menuBtn.setAttribute('aria-expanded',String(open));nav.classList.toggle('open',open)});
    $('[data-member-entry]')?.addEventListener('click',event=>{if(!isAuthenticated())return;event.preventDefault();openSection('overview');closeMainMenu()});
    $$('[data-main-member-section]').forEach(button=>button.addEventListener('click',()=>{openSection(button.dataset.mainMemberSection);closeMainMenu()}));
  }

  return {activateAuthTab,bindMainNavigation,closeMainMenu,memberPortalNavigation,openSection,renderMemberHero,resetAuthForms,setMode,showApp,showAuth,showAuthStatus};
}
