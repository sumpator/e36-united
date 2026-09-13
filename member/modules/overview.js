import { deriveOverviewState } from '../../member-portal-state.js?v=20260828-member-club';
import { $, esc } from '../ui.js?v=20260902-phase3';

export function createMemberOverview({
  getData,
  getMemberSince,
  getVerified,
  getPoints,
  formatAmount,
  renderAchievementIcon,
  getMemberIdentity,
  openSection,
}) {
  let onboardingContext={reservation:null,registrationOpen:false};
  let onboardingModalIdentity='';
  let onboardingModalRestoreFocus=null;
  let onboardingBound=false;
  function renderMemberCard(){
    const data=getData(),p=data.profile||{},nickname=p.nickname||p.name?.split(' ')[0]||'Driver';
    const nameEl=$('[data-card-name]');if(nameEl)nameEl.textContent=(p.name||'United Member').toUpperCase();const summaryName=$('[data-summary-name]');if(summaryName)summaryName.textContent=p.name||'United Member';
    const code=p.memberCode?String(p.memberCode).replace(/^EU-?/i,'').slice(-6):String((p.email||nickname).split('').reduce((total,character)=>total+character.charCodeAt(0),0)%900+100);
    const idEl=$('[data-card-id]');if(idEl)idEl.textContent=code;
    const summaryCode=$('[data-summary-member-code]');if(summaryCode)summaryCode.textContent=p.memberCode||`EU${code}`;
    const car=data.cars.find(item=>item.primary)||data.cars[0];const carEl=$('[data-card-car]');if(carEl)carEl.textContent=car?`${car.body} · ${car.model}${car.nickname?' · '+car.nickname:''}`:'BMW E36 · Garáž čeká na první auto';
    const sinceEl=$('[data-member-since]'),attendanceEl=$('[data-attendance-count]'),ratingEl=$('[data-member-rating]');if(sinceEl)sinceEl.textContent=getMemberSince()||'—';if(attendanceEl)attendanceEl.textContent=getVerified();if(ratingEl)ratingEl.textContent=data.club?.rating?.name||'316i';
  }

  function renderPoints(){
    const data=getData(),points=getPoints(),threshold=Number(data.club?.rewardThreshold||12),overview=$('[data-overview-points]'),overviewFill=$('[data-overview-points-fill]');
    if(overview)overview.textContent=points;
    if(overviewFill)overviewFill.style.width=`${Math.min(100,points/threshold*100)}%`;
  }

  function achievementTierClass(achievement={}){
    const tier=String(achievement.tier||'').toLowerCase(),isTop3=achievement.type==='show-shine'&&String(achievement.id||'').startsWith('sns-top3-'),isPhotoTier=achievement.type==='community'&&achievement.name==='BMW PROSPEKT';
    return (isTop3||isPhotoTier)&&['bronze','silver','gold'].includes(tier)?`is-tier-${tier}`:'';
  }

  function renderFeaturedAchievements(){
    const featuredItems=(getData().club?.featuredAchievements||[]).slice(0,4),featured=$('[data-featured-achievements]');
    if(featured)featured.innerHTML=featuredItems.length?featuredItems.map(achievement=>{const tierClass=achievementTierClass(achievement);return `<button aria-expanded="false" class="featured-achievement ${tierClass}" data-achievement-id="${esc(achievement.id)}" type="button"><i>${renderAchievementIcon(achievement)}</i><span><b>${esc(achievement.name)}</b>${tierClass?`<small class="featured-achievement-tier">${esc(achievement.tier)}</small>`:''}</span></button>`}).join(''):'<span class="featured-achievement-empty">První Achievement čeká na odemčení.</span>';
  }

  function renderActionCenter({reservation,registrationOpen,plannerWaiting,plannerUnavailable,event,plannerEventYear}){
    const eventYear=reservation?.year&&reservation.year!=='NEXT'?reservation.year:(event?.year||plannerWaiting&&plannerEventYear||new Date().getFullYear());
    const card=$('[data-reservation-overview-card]'),empty=$('[data-action-center-empty]'),emptyCopy=$('[data-action-center-empty-copy]'),eventElement=$('[data-reservation-overview-event]'),label=$('[data-reservation-overview-label]'),copy=$('[data-reservation-overview-copy]'),action=$('[data-reservation-overview-action]');
    const view=deriveOverviewState({reservation,registrationOpen,plannerWaiting,plannerUnavailable,eventYear:event?eventYear:null,formatAmount});if(card){card.hidden=!view.active;card.dataset.jump=view.target||'reservation'}if(empty)empty.hidden=view.active;if(emptyCopy)emptyCopy.textContent=view.emptyCopy;
    if(eventElement)eventElement.textContent=`UNITED ${eventYear}`;
    if(label)label.textContent=view.label;if(copy)copy.textContent=view.copy;if(action)action.innerHTML=view.action?`${view.action} <b>→</b>`:'';
    onboardingContext={reservation,registrationOpen};renderOnboarding();
  }

  function setStep(button, state, complete, disabled=false){
    if(!button)return;
    button.classList.toggle('is-complete',complete);button.disabled=disabled;
    const copy=button.querySelector('em');if(copy)copy.textContent=state;
  }
  function onboardingState(){
    const data=getData(),{reservation,registrationOpen}=onboardingContext;
    const profileReady=data.club?.profileCompletion?.requiredFields!==false&&!!data.profile?.name;
    const hasCar=Array.isArray(data.cars)&&data.cars.length>0;
    return {data,reservation,registrationOpen,profileReady,hasCar,complete:profileReady&&hasCar&&(!registrationOpen||!!reservation)};
  }
  function renderOnboardingCard(root,state){
    if(!root)return;
    const {data,reservation,registrationOpen,profileReady,complete}=state;
    root.classList.toggle('is-complete',complete);
    const kicker=root.querySelector('header span'),title=root.querySelector('header h2');
    if(kicker)kicker.textContent=complete?'Děkujeme, že jsi UNITED':'TVŮJ UNITED ZAČÍNÁ TADY';
    if(title)title.innerHTML=complete?'Profil máš kompletní.':'Vstup do komunity.<br><em>Doplň svou stopu.</em>';
    setStep(root.querySelector('[data-onboarding-profile]'),profileReady?'Profil je založený ✓':'Dokončit profil →',profileReady);
    setStep(root.querySelector('[data-onboarding-reservation]'),reservation?'Rezervace je připravená ✓':registrationOpen?'Otevřít registraci →':'Registrace je teď uzavřená',!!reservation,!reservation&&!registrationOpen);
    const states=new Map([
      ['garage',data.cars.length>0],
      ['club',(data.club?.history||[]).some(item=>item.attendance?.status==='approved')],
      ['photos',Number(data.club?.approvedPhotoCount||0)>0],
    ]);
    root.querySelectorAll('.united-onboarding-club [data-jump]').forEach(button=>button.classList.toggle('is-complete',states.get(button.dataset.jump)===true));
  }
  function onboardingStorageKey(identity){return `e36UnitedOnboardingIntroV1:${identity}`}
  function introWasSeen(identity){try{return localStorage.getItem(onboardingStorageKey(identity))==='closed'}catch{return false}}
  function markIntroSeen(identity){if(!identity)return;try{localStorage.setItem(onboardingStorageKey(identity),'closed')}catch{}}
  function closeOnboardingIntro({remember=true}={}){
    const modal=$('[data-onboarding-intro-modal]');if(!modal||modal.hidden)return;
    if(remember)markIntroSeen(onboardingModalIdentity);modal.hidden=true;document.body.classList.remove('onboarding-intro-open');
    if(onboardingModalRestoreFocus?.isConnected)onboardingModalRestoreFocus.focus();onboardingModalRestoreFocus=null;onboardingModalIdentity='';
  }
  function showOnboardingIntro(state){
    const identity=String(getMemberIdentity?.()||'');const modal=$('[data-onboarding-intro-modal]'),content=$('[data-onboarding-intro-content]');
    if(!identity||state.complete||introWasSeen(identity)||!modal||!content||!modal.hidden)return;
    const card=$('[data-united-onboarding]').cloneNode(true);card.removeAttribute('data-united-onboarding');card.dataset.onboardingIntroCard='';
    onboardingModalIdentity=identity;onboardingModalRestoreFocus=document.activeElement;content.replaceChildren(card);
    modal.hidden=false;document.body.classList.add('onboarding-intro-open');modal.querySelector('[data-onboarding-intro-close]')?.focus();
  }
  function bindOnboarding(){
    if(onboardingBound)return;onboardingBound=true;const modal=$('[data-onboarding-intro-modal]');
    modal?.addEventListener('click',event=>{const jump=event.target.closest('[data-jump]');if(jump){closeOnboardingIntro();openSection?.(jump.dataset.jump);return}if(event.target.closest('[data-onboarding-intro-close]'))closeOnboardingIntro()});
    document.addEventListener('keydown',event=>{if(!modal||modal.hidden)return;if(event.key==='Escape'){event.preventDefault();closeOnboardingIntro();return}if(event.key!=='Tab')return;const focusable=[...modal.querySelectorAll('button:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(item=>item.getClientRects().length);if(!focusable.length)return;const first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}});
  }
  function renderOnboarding(){
    bindOnboarding();const state=onboardingState(),root=$('[data-united-onboarding]');renderOnboardingCard(root,state);
    const modal=$('[data-onboarding-intro-modal]'),content=$('[data-onboarding-intro-content]');if(modal&&!modal.hidden&&content){const card=root.cloneNode(true);card.removeAttribute('data-united-onboarding');card.dataset.onboardingIntroCard='';content.replaceChildren(card);if(state.complete)closeOnboardingIntro()}
    queueMicrotask(()=>showOnboardingIntro(state));
  }

  return {refreshOnboarding:renderOnboarding,renderActionCenter,renderFeaturedAchievements,renderMemberCard,renderPoints,resetOnboarding:()=>closeOnboardingIntro({remember:false})};
}
