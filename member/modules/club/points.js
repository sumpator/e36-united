import { $, $$, esc } from '../../ui.js?v=20260902-phase3';

export const pictogram=body=>`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const achievementIcon=type=>type==='show-shine'?pictogram('<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M12 12v6m-3 2h6"/>'):type==='community'?pictogram('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-4L5 19"/>'):type==='history'?pictogram('<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>'):pictogram('<path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-5"/>');

export function createMemberPoints({getData,renderOverviewPoints,renderFeaturedAchievements}){
  const memberHelpContent={
    since:{kicker:'UNITED OD',title:'Začátek tvé United stopy',intro:'Nejstarší ročník, který máš ve své ověřené historii účastí.'},
    verified:{kicker:'OVĚŘENÉ UNITED',title:'Potvrzené účasti',intro:'Počítají se jen ročníky ověřené United týmem.'},
    points:{kicker:'UNITED POINTS',title:'Aktuální zůstatek',intro:'Body získáváš za ověřené United aktivity. Aktivní metr má limit 12 bodů.'},
    rating:{kicker:'MEMBER RATING',title:'Tvoje členská úroveň',intro:'Rating roste podle všech bodů, které jsi kdy získal: od 316i až po M POWER.'},
    verification:{kicker:'MOJE STOPA',title:'Proč ověření?',intro:'Účast můžeš přidat hned. Body a související Achievements se započítají až po potvrzení United týmem.'},
    'points-system':{kicker:'UNITED POINTS',title:'Jak fungují body?',intro:'Body odměňují ověřenou účast a přínos komunitě.',sections:[{label:'ODMĚNA',rows:[['12 bodů','United Merch reward','U']]}]},
    'earn-attendance':{kicker:'ÚČAST NA SRAZU',title:'Ověřené United',sections:[{label:'BODY ZA ÚČAST',rows:[['Každý ověřený sraz','+1 bod','•'],['3 ověřené srazy','+3 body navíc','3'],['5 ověřených srazů','+3 body navíc','5']]}]},
    'earn-showshine':{kicker:'SHOW & SHINE',title:'Ověřené umístění',sections:[{label:'UMÍSTĚNÍ',rows:[['3. místo','+1 bod','3'],['2. místo','+2 body','2'],['1. místo','+3 body','1']]},{label:'BONUSY',rows:[['Best of the Best','+1 bod','◆'],['Nej zvuk výfuku','+1 bod','◈']]}]},
    'earn-photos':{kicker:'NAHRÁVÁNÍ FOTEK',title:'Schválené komunitní fotky',sections:[{label:'MILNÍKY',rows:[['5 schválených fotek','+1 bod','5'],['25 schválených fotek','+1 bod','25'],['50 schválených fotek','+3 body','50']]}],note:'Po 50 schválených fotkách už další United Points nepřibývají.'},
    'earn-profile':{kicker:'DOPLNĚNÍ PROFILU',title:'+1 bod za kompletní profil',sections:[{label:'PODMÍNKY',rows:[['Kompletní registrace','','✓'],['Zkontrolovaná historie','','✓'],['Alespoň 1 auto v Garage','','✓'],['5 schválených komunitních fotek','','✓']]}],note:'Newsletter není podmínkou.'},
  };
  const memberHelpPopover=$('[data-member-help-popover]');
  const achievementPopover=$('[data-achievement-popover]');
  let memberHelpTrigger=null,achievementTrigger=null,contextPositionFrame=0,bound=false;

  function contextRowsMarkup(content={}){
    return `${content.intro?`<p class="context-popover-intro">${esc(content.intro)}</p>`:''}${(content.sections||[]).map(section=>`<section class="context-popover-section"><small>${esc(section.label)}</small><div class="context-popover-rows">${section.rows.map(([label,value,icon])=>`<div><span><i aria-hidden="true">${esc(icon||'•')}</i><b>${esc(label)}</b></span>${value?`<strong>${esc(value)}</strong>`:''}</div>`).join('')}</div></section>`).join('')}${content.note?`<p class="context-popover-note">${esc(content.note)}</p>`:''}`;
  }
  function positionContextPopover(popover,trigger,preferredWidth=370){
    if(!popover||!trigger||popover.hidden)return;const mobile=matchMedia('(max-width:700px)').matches;popover.classList.toggle('is-mobile-sheet',mobile);popover.style.removeProperty('--context-left');popover.style.removeProperty('--context-top');popover.style.removeProperty('--context-arrow-left');popover.style.removeProperty('--context-width');delete popover.dataset.placement;if(mobile)return;
    const margin=12,gap=10,rect=trigger.getBoundingClientRect(),width=Math.min(preferredWidth,innerWidth-margin*2);popover.style.setProperty('--context-width',`${width}px`);popover.style.visibility='hidden';const height=popover.offsetHeight;let placement='below',top=rect.bottom+gap;if(top+height>innerHeight-margin&&rect.top-height-gap>=margin){placement='above';top=rect.top-height-gap}else top=Math.min(top,innerHeight-height-margin);const left=Math.max(margin,Math.min(innerWidth-width-margin,rect.left+rect.width/2-width/2)),arrow=Math.max(18,Math.min(width-18,rect.left+rect.width/2-left));popover.style.setProperty('--context-left',`${left}px`);popover.style.setProperty('--context-top',`${Math.max(margin,top)}px`);popover.style.setProperty('--context-arrow-left',`${arrow}px`);popover.dataset.placement=placement;popover.style.visibility='';
  }
  function refreshContextPopoverPosition(){cancelAnimationFrame(contextPositionFrame);contextPositionFrame=requestAnimationFrame(()=>{if(!memberHelpPopover?.hidden&&memberHelpTrigger)positionContextPopover(memberHelpPopover,memberHelpTrigger,370);if(!achievementPopover?.hidden&&achievementTrigger)positionContextPopover(achievementPopover,achievementTrigger,330)})}
  function closeMemberHelp({restoreFocus=false}={}){
    if(!memberHelpPopover||memberHelpPopover.hidden)return;
    memberHelpPopover.hidden=true;memberHelpPopover.classList.remove('is-mobile-sheet');
    $$('[data-member-help][aria-expanded]').forEach(button=>button.setAttribute('aria-expanded','false'));
    const trigger=memberHelpTrigger;memberHelpTrigger=null;if(restoreFocus)trigger?.focus();
  }
  function openMemberHelp(button){
    const content=memberHelpContent[button.dataset.memberHelp];if(!content||!memberHelpPopover)return;
    const same=memberHelpTrigger===button&&!memberHelpPopover.hidden;closeMemberHelp();if(same)return;
    closeAchievementDetail();memberHelpTrigger=button;button.setAttribute('aria-expanded','true');$('[data-member-help-kicker]',memberHelpPopover).textContent=content.kicker;$('[data-member-help-title]',memberHelpPopover).textContent=content.title;$('[data-member-help-content]',memberHelpPopover).innerHTML=contextRowsMarkup(content);memberHelpPopover.hidden=false;positionContextPopover(memberHelpPopover,button,370);
  }
  function closeAchievementDetail({restoreFocus=false}={}){
    if(!achievementPopover||achievementPopover.hidden)return;achievementPopover.hidden=true;achievementPopover.classList.remove('is-mobile-sheet');
    $$('[data-achievement-id][aria-expanded]').forEach(button=>button.setAttribute('aria-expanded','false'));
    const trigger=achievementTrigger;achievementTrigger=null;if(restoreFocus)trigger?.focus();
  }
  function openAchievementDetail(button){
    if(!achievementPopover)return;const data=getData(),all=[...(data.club?.achievements||[]),...(data.club?.featuredAchievements||[])],achievement=all.find(item=>String(item.id)===String(button.dataset.achievementId));if(!achievement)return;
    const same=achievementTrigger===button&&!achievementPopover.hidden;closeAchievementDetail();if(same)return;
    closeMemberHelp();achievementTrigger=button;button.setAttribute('aria-expanded','true');
    $('[data-achievement-icon]',achievementPopover).innerHTML=achievementIcon(achievement.type);
    const year=achievement.eventYear||String(achievement.id||achievement.name||'').match(/20\d{2}/)?.[0]||'';$('[data-achievement-tier]',achievementPopover).textContent=[year,achievement.tier||'ACHIEVEMENT'].filter(Boolean).join(' · ');
    $('[data-achievement-title]',achievementPopover).textContent=achievement.name;
    $('[data-achievement-condition]',achievementPopover).textContent=achievement.condition;
    const pointsEl=$('[data-achievement-points]',achievementPopover),reward=$('[data-achievement-reward]',achievementPopover);reward.hidden=!achievement.points;pointsEl.textContent=achievement.points?`+${achievement.points} ${pointWord(achievement.points)}`:'';achievementPopover.hidden=false;positionContextPopover(achievementPopover,button,330);
  }

  function attended(d=getData()){return (d.club?.history||[]).filter(item=>item.attendance?.status==='approved').length}
  function verified(d=getData()){return attended(d)}
  function memberSince(d=getData()){return d.club?.memberSince||null}
  function pointWord(value){const absolute=Math.abs(Number(value)||0);return absolute===1?'bod':absolute>=2&&absolute<=4?'body':'bodů'}
  function formatPoints(value){return `${value} ${pointWord(value)}`}
  function pointsRemainingVerb(value){const absolute=Math.abs(Number(value)||0);return absolute>=2&&absolute<=4?'zbývají':'zbývá'}
  function points(d=getData()){return Number(d.club?.points?.available||0)}
  function lifetimePoints(d=getData()){return Number(d.club?.points?.lifetime||0)}

  function renderPoints(){const data=getData();renderOverviewPoints();const p=points(),threshold=Number(data.club?.rewardThreshold||12),value=$('[data-points]'),track=$('[data-points-track]'),copy=$('[data-points-copy]');if(value)value.textContent=p;if(track)track.innerHTML=Array.from({length:threshold},(_,i)=>`<i class="${i<p?'is-on':''}"></i>`).join('');if(copy)copy.textContent=p>=threshold?`${p} bodů. United Merch reward je odemčený.`:`Ještě ${threshold-p} bodů a odemykáš United Merch reward.`}
  function renderAchievements(){
    const data=getData();renderFeaturedAchievements();
    const achievements=data.club?.achievements||[],catalog=$('[data-achievement-catalog]');
    if(catalog)catalog.innerHTML=achievements.length?achievements.map(achievement=>`<button aria-expanded="false" class="achievement-card is-unlocked" data-achievement-id="${esc(achievement.id)}" type="button"><span class="achievement-icon">${achievementIcon(achievement.type)}</span><div class="achievement-copy"><b>${esc(achievement.name)}</b><p>${esc(achievement.condition)}</p></div><span class="achievement-status">${esc(achievement.tier||'ODEMČENO')}</span></button>`).join(''):'<article class="achievement-empty">Ověřená historie postupně odemkne tvoji sbírku.</article>';
  }
  function renderRewards(){
    const data=getData(),p=points(),threshold=Number(data.club?.rewardThreshold||12),remaining=Math.max(0,threshold-p);
    const rewardState=$('[data-points-reward-state]'),rewardRemaining=$('[data-reward-remaining]');if(rewardState)rewardState.classList.toggle('is-unlocked',p>=threshold);if(rewardRemaining)rewardRemaining.textContent=p>=threshold?'ODMĚNA ODEMČENA':`${formatPoints(remaining)} ${pointsRemainingVerb(remaining)}`;
    const journey=$('[data-points-journey]'),journeyScore=$('[data-points-journey-score]'),journeyCopy=$('[data-points-journey-copy]'),journeyMarker=$('[data-points-journey-marker]'),progress=Math.min(100,p/threshold*100);
    if(journey){journey.setAttribute('aria-valuemax',String(threshold));journey.setAttribute('aria-valuenow',String(p));journey.setAttribute('aria-label',`United Points: ${p} z ${formatPoints(threshold)}`);journey.style.setProperty('--points-progress',`${progress}%`)}if(journeyScore)journeyScore.textContent=p;if(journeyCopy)journeyCopy.textContent=p>=threshold?'United Merch reward je odemčený.':`Do odměny ${pointsRemainingVerb(remaining)} ${formatPoints(remaining)}.`;if(journeyMarker)journeyMarker.textContent=String(p);
    const earnStrip=$('[data-earn-strip]');if(earnStrip)earnStrip.innerHTML=[
      ['earn-attendance',pictogram('<path d="M5 12.5 9.5 17 19 7.5"/>'),'01','Účast na srazu'],
      ['earn-showshine',pictogram('<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M12 12v6m-3 2h6"/>'),'02','Umístění v Show & Shine'],
      ['earn-photos',pictogram('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-4L5 19"/>'),'03','Nahrávání fotek'],
      ['earn-profile',pictogram('<path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-5"/>'),'04','Doplnění profilu'],
    ].map(([help,icon,index,label])=>`<button aria-controls="member-card-help" aria-expanded="false" class="earn-card" data-member-help="${help}" type="button"><i>${icon}</i><span><small>${index}</small><b>${label}</b></span><em>ⓘ DETAIL</em></button>`).join('');
  }
  function bind(){
    if(bound)return;bound=true;
    document.addEventListener('click',event=>{const button=event.target.closest('[data-member-help]');if(button)openMemberHelp(button)});
    $('[data-member-help-close]')?.addEventListener('click',()=>closeMemberHelp({restoreFocus:true}));
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeMemberHelp({restoreFocus:true})});
    document.addEventListener('click',event=>{if(!memberHelpPopover?.hidden&&!memberHelpPopover.contains(event.target)&&!event.target.closest('[data-member-help]'))closeMemberHelp()});
    document.addEventListener('click',event=>{const button=event.target.closest('[data-achievement-id]');if(button)openAchievementDetail(button);else if(!achievementPopover?.hidden&&!achievementPopover.contains(event.target))closeAchievementDetail()});
    $('[data-achievement-close]')?.addEventListener('click',()=>closeAchievementDetail({restoreFocus:true}));
    document.addEventListener('keydown',event=>{if(event.key==='Escape')closeAchievementDetail({restoreFocus:true})});
    window.addEventListener('resize',refreshContextPopoverPosition,{passive:true});
    window.addEventListener('scroll',refreshContextPopoverPosition,{passive:true,capture:true});
  }

  return {attended,bind,lifetimePoints,memberSince,points,renderAchievements,renderPoints,renderRewards,verified};
}
