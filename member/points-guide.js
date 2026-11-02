import {merchBenefit,loadMerchBenefitSettings} from '../merch/benefit.js?v=20261101-auth1';
export const pictogram=body=>`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const achievementIcon=type=>type==='show-shine'?pictogram('<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M12 12v6m-3 2h6"/>'):type==='community'?pictogram('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-4L5 19"/>'):type==='history'?pictogram('<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>'):pictogram('<path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-5"/>');

export function initPointsGuide({onNavigate,beforeOpen}={}){
  let dialog=document.querySelector('#points-guide'),opener=null;
  if(!dialog){dialog=document.createElement('dialog');dialog.id='points-guide';dialog.className='points-guide-dialog';dialog.setAttribute('aria-labelledby','points-guide-title');dialog.innerHTML='<header><div><span class="member-kicker">UNITED POINTS</span><h2 id="points-guide-title"></h2></div><button class="member-secondary" data-points-guide-close type="button" aria-label="Zavřít přehled bodů">×</button></header><div data-points-guide-content></div>';document.body.append(dialog)}
  function close(restore=true){if(!dialog.open)return;dialog.close();document.body.classList.remove('points-guide-open');if(restore&&opener?.isConnected)opener.focus({preventScroll:true})}
  const action=(target,label)=>onNavigate?'<button class="member-secondary" type="button" data-points-guide-target="'+target+'">'+label+' →</button>':'<a class="member-secondary" href="member.html?section='+(target==='history'?'club&clubTab=history':target)+'">'+label+' →</a>';
  function open(trigger,benefit=false){
    beforeOpen?.();opener=trigger;
    const milestones='<section class="points-guide-reward" data-points-guide-reward><span>ČLENSKÁ VÝHODA</span><h3>Načítám aktuální výhodu…</h3><p></p></section>';
    const rows=[
      ['history','history','Účasti na United','Za každý ověřený sraz +1 bod. Při 3. a 5. účasti jednorázově +3 body navíc.','+1 / sraz','Chci si doplnit účast na United'],
      ['community','photos','Fotky do galerie','Za 5 schválených fotek +1 bod, za 25 další +1 a za 50 další +3. Po 50 fotkách další body nepřibývají.','+1 / +1 / +3','Chci nahrát fotky'],
      ['profile','account','Kompletní profil','Vyplněné údaje, zkontrolovaná historie, alespoň jedno auto a 5 schválených komunitních fotek. Newsletter není podmínkou.','+1 jednou','Chci si upravit profil'],
      ['show-shine','history','Show & Shine','1. / 2. / 3. místo: +3 / +2 / +1 bod. Nejlepší zvuk výfuku a Nejlepší auto srazu: po +1 bodu.','+1 až +3','Chci doplnit své umístění']
    ];
    dialog.classList.toggle('points-guide-dialog--rows',!benefit);
    dialog.querySelector('.member-kicker').textContent=benefit?'UNITED CLUB · VÝHODY':'UNITED CLUB · BODY A VÝHODY';
    dialog.querySelector('h2').textContent=benefit?'Co za body získám?':'Jak získáš body?';
    dialog.querySelector('[data-points-guide-content]').innerHTML=benefit?milestones+'<div class="points-benefit-copy"><p>Další body sazbu slevy nenásobí. Body se nákupem neodečítají.</p><a class="member-secondary" href="member.html?section=club">Můj United Club →</a></div>':'<p class="points-guide-intro">Vyber si, čím začneš.</p><p class="points-guide-benefit" data-points-guide-benefit hidden></p><div class="points-guide-rows">'+rows.map(([icon,target,title,copy,badge,label])=>'<article><i>'+achievementIcon(icon)+'</i><div><div class="points-guide-row-title"><h3>'+title+'</h3><span>'+badge+'</span></div><p>'+copy+'</p>'+action(target,label)+'</div></article>').join('')+'</div><p class="points-guide-footnote">Body získáš za ověřené aktivity. Účasti a fotografie schvaluje United tým.</p>';
    const reward=dialog.querySelector('[data-points-guide-reward]'),strip=dialog.querySelector('[data-points-guide-benefit]');
    void loadMerchBenefitSettings().then(settings=>{if(!(reward||strip)?.isConnected)return;const view=merchBenefit(settings);if(strip){strip.hidden=!view.active;strip.textContent=view.active?view.threshold+' bodů = sleva '+view.percent+' % na merch':'';return}reward.querySelector('h3').textContent=view.title;reward.querySelector('p').textContent=view.copy+(view.paused?' Objednávání je zatím pozastavené.':'')}).catch(()=>{if(reward?.isConnected)reward.querySelector('h3').textContent='Výhodu se nepodařilo načíst.'});
    /* The same authoritative reward panel is shared by both guide views. */
    dialog.showModal();dialog.scrollTop=0;document.body.classList.add('points-guide-open');dialog.querySelector('[data-points-guide-close]').focus();
  }
  document.addEventListener('click',event=>{const trigger=event.target.closest('[data-points-guide-open],[data-points-benefit-open]');if(trigger)open(trigger,trigger.hasAttribute('data-points-benefit-open'))});
  dialog.addEventListener('click',event=>{if(event.target===dialog||event.target.closest('[data-points-guide-close]'))return close();const action=event.target.closest('[data-points-guide-target]');if(action){const target=action.dataset.pointsGuideTarget;close(false);onNavigate?.(target);const panel=document.querySelector('[data-member-panel="'+(target==='history'?'club':target)+'"]');const heading=panel?.querySelector('h2,h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true})}}if(event.target.closest('a'))close(false)});
  dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
  window.addEventListener('member:sectionchange',()=>close(false));
  return {close};
}
