import { deriveOverviewState } from '../../member-portal-state.js?v=20260828-member-club';
import { $, esc } from '../ui.js?v=20260902-phase3';

export function createMemberOverview({
  getData,
  getMemberSince,
  getVerified,
  getPoints,
  formatAmount,
  renderAchievementIcon,
}) {
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
  }

  return {renderActionCenter,renderFeaturedAchievements,renderMemberCard,renderPoints};
}
