export const pictogram=body=>`<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
export const achievementIcon=type=>type==='show-shine'?pictogram('<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M12 12v6m-3 2h6"/>'):type==='community'?pictogram('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-4L5 19"/>'):type==='history'?pictogram('<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>'):pictogram('<path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-5"/>');

export function initPointsGuide({onNavigate,beforeOpen}={}){
  let dialog=document.querySelector('#points-guide'),opener=null;
  if(!dialog){dialog=document.createElement('dialog');dialog.id='points-guide';dialog.className='points-guide-dialog';dialog.setAttribute('aria-labelledby','points-guide-title');dialog.innerHTML='<header><div><span class="member-kicker">UNITED POINTS</span><h2 id="points-guide-title"></h2></div><button class="member-secondary" data-points-guide-close type="button" aria-label="Zavřít přehled bodů">×</button></header><div data-points-guide-content></div>';document.body.append(dialog)}
  function close(restore=true){if(!dialog.open)return;dialog.close();document.body.classList.remove('points-guide-open');if(restore&&opener?.isConnected)opener.focus({preventScroll:true})}
  const action=(target,label)=>onNavigate?'<button class="member-secondary" type="button" data-points-guide-target="'+target+'">'+label+' →</button>':'<a class="member-secondary" href="member.html?section='+(target==='history'?'club':target)+'">'+label+' →</a>';
  function open(trigger,benefit=false){
    beforeOpen?.();opener=trigger;
    dialog.querySelector('h2').textContent=benefit?'Co za body získám?':'Jak získat body?';
    const milestones='<div class="points-guide-milestones" aria-label="Odměnové milníky"><b>12</b><span>→</span><b>24</b><span>→</span><b>36</b><span>→ … bodů</span></div>';
    const cards=[
      ['history','history','Doplň účast na minulých United.','Za každý ověřený sraz <strong>+1 bod</strong>.<br>Při <strong>3. a 5. účasti</strong> jednorázově <strong>+3 body navíc</strong>.','Moje účasti'],
      ['community','photos','Nahraj svoje fotky.','5 schválených fotek → <strong>+1 bod</strong><br>25 schválených fotek → další <strong>+1 bod</strong><br>50 schválených fotek → další <strong>+3 body</strong>','Nahrát fotky'],
      ['profile','account','Vyplň profil.','<strong>+1 bod jednorázově</strong> po splnění všech podmínek:<br>Kompletní registrace<br>Zkontrolovaná historie<br>Alespoň jedno auto<br>5 schválených komunitních fotek','Upravit profil']
    ];
    dialog.querySelector('[data-points-guide-content]').innerHTML=milestones+(benefit?'<div class="points-benefit-copy"><h3>Členská výhoda v Merchi</h3><p>Od 12 bodů se podle aktuálního nastavení obchodu uplatní členská sleva v rekapitulaci objednávky. Konkrétní podmínky najdeš v nabídce Merche.</p><p>Každých 12 bodů dosáhneš dalšího odměnového milníku. Neznamená to další nevyčerpanou odměnu ani násobení slevy. Body se nákupem neodečítají.</p><a class="member-secondary" href="member.html?section=club">Můj United Club →</a></div>':'<div class="points-guide-steps">'+cards.map(([icon,target,title,copy,label])=>'<article><i>'+achievementIcon(icon)+'</i><div><h3>'+title+'</h3><p>'+copy+'</p>'+action(target,label)+'</div></article>').join('')+'<article class="points-guide-contests"><i>'+achievementIcon('show-shine')+'</i><div><h3>Soutěže</h3><p>Za umístění v Show &amp; Shine získáš další body.</p><p>1. místo: <strong>+3 body</strong> · 2. místo: <strong>+2 body</strong> · 3. místo: <strong>+1 bod</strong><br>Nejlepší zvuk výfuku: <strong>+1 bod</strong><br>Nejlepší auto srazu: <strong>+1 bod</strong></p></div></article></div>');
    dialog.showModal();dialog.scrollTop=0;document.body.classList.add('points-guide-open');dialog.querySelector('[data-points-guide-close]').focus();
  }
  document.addEventListener('click',event=>{const trigger=event.target.closest('[data-points-guide-open],[data-points-benefit-open]');if(trigger)open(trigger,trigger.hasAttribute('data-points-benefit-open'))});
  dialog.addEventListener('click',event=>{if(event.target===dialog||event.target.closest('[data-points-guide-close]'))return close();const action=event.target.closest('[data-points-guide-target]');if(action){close(false);onNavigate?.(action.dataset.pointsGuideTarget)}});
  dialog.addEventListener('cancel',event=>{event.preventDefault();close()});
  window.addEventListener('member:sectionchange',()=>close(false));
  return {close};
}
