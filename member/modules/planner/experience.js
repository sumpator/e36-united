const STAYS=Object.freeze([
  {arrival:'Pátek',title:'Celý víkend',meta:'Pátek → Neděle · 2 noci',short:'Pá → Ne',image:'assets/images/program/friday.webp'},
  {arrival:'Sobota',title:'Sobota → Neděle',meta:'1 noc · hlavní den + noc',short:'So → Ne',image:'assets/images/program/saturday.webp'},
  {arrival:'Jen na otočku',title:'Na otočku',meta:'Bez noclehu',short:'Bez noclehu',image:'assets/images/program/sunday.jpg'},
]);

const SHOW_SHINE=Object.freeze([
  {value:'Ano',label:'Ano!',copy:'Chci soutěžit',image:'pohary.jpg'},
  {value:'Možná',label:'Uvidíme',copy:'Rozhodnu se později',image:'assets/images/program/friday.webp'},
  {value:'Ne',label:'Jedu se podívat',copy:'Bez soutěžení',image:'assets/images/program/saturday.webp'},
]);

const personLabel=count=>count===1?'osoba':count>=2&&count<=4?'osoby':'osob';

function setValue(input,value){
  if(!input||String(input.value)===String(value))return;
  input.value=String(value);
  input.dispatchEvent(new Event('input',{bubbles:true}));
  input.dispatchEvent(new Event('change',{bubbles:true}));
}

function move(node,slot){if(node&&slot)slot.append(node)}

export function createMemberPlannerExperience(form){
  if(!form)return {sync:()=>{},setMode:()=>{}};
  const source={
    arrival:form.elements.arrival,
    sleep:form.elements.sleep,
    crew:form.elements.crew,
    showshine:form.elements.showshine,
    car:form.elements.carId,
  };
  const shell=document.createElement('section');
  shell.className='member-weekend-planner planner-shell planner-shell--v8';
  shell.dataset.memberWeekendPlanner='';
  shell.dataset.reservationEditField='';
  shell.innerHTML=`<div class="planner-workspace member-planner-workspace">
    <div class="planner-controls planner-controls--v8 member-planner-controls">
      <section class="planner-step planner-step--stay planner-main-step">
        <div class="planner-step-head"><span>01</span><b>Jak dlouho zůstaneš?</b></div>
        <div class="stay-slider member-stay-picker">
          <div class="stay-slider-current" aria-live="polite"><strong data-member-stay-title></strong><small data-member-stay-meta></small></div>
          <div class="stay-slider-options" data-member-stay-options>${STAYS.map((stay,index)=>`<button data-member-stay="${index}" type="button"><b>${stay.title.toUpperCase()}</b><small>${stay.short}</small></button>`).join('')}</div>
        </div>
        <aside class="planner-context-preview planner-context-preview--media"><img data-member-stay-image alt="Páteční komunita E36 United" loading="lazy" onerror="this.src='fallback.svg'" src="assets/images/program/friday.webp"><div class="planner-context-shade"></div><div class="planner-context-copy"><span>TVŮJ POBYT</span><strong data-member-stay-preview></strong><b data-member-night-preview></b></div></aside>
      </section>
      <section class="planner-step planner-step--sleep planner-main-step">
        <div class="planner-step-head"><span>02</span><b>Kde chceš spát?</b></div>
        <div class="choice-row choice-row--three choice-row--sleep" data-member-sleep-options>${['Chatka','Stan','Bez ubytování'].map((value,index)=>`<button class="choice" data-member-sleep="${value}" type="button"><span>${['⌂','△','→'][index]}</span>${value}</button>`).join('')}</div>
        <div class="member-planner-slot" data-member-accommodation-option-slot></div>
        <div class="member-planner-slot" data-member-accommodation-preview-slot></div>
      </section>
      <section class="planner-step planner-step--crew planner-main-step">
        <div class="planner-step-head"><span>03</span><b>Kolik vás bude?</b></div>
        <div class="people-picker people-picker--v8"><button aria-label="Ubrat osobu" data-member-crew-minus type="button">−</button><strong data-member-crew></strong><span data-member-crew-label></span><button aria-label="Přidat osobu" data-member-crew-plus type="button">+</button></div>
        <div class="member-planner-slot" data-member-partial-slot></div>
        <aside class="planner-context-preview planner-context-preview--crew"><div aria-hidden="true" class="planner-context-crew-icons" data-member-crew-icons></div><div class="planner-context-crew-number" data-member-crew-number></div><strong data-member-crew-copy></strong><small>Společně na United.</small></aside>
      </section>
      <section class="planner-step planner-step--showshine planner-main-step">
        <div class="planner-step-head"><span>04</span><b>Chceš soutěžit v Show &amp; Shine?</b></div>
        <div class="choice-row choice-row--three" data-member-show-options>${SHOW_SHINE.map(item=>`<button class="choice" data-member-show="${item.value}" type="button">${item.label}</button>`).join('')}</div>
        <aside class="planner-context-preview planner-context-preview--media"><img data-member-show-image alt="Show and Shine E36 United" loading="lazy" onerror="this.src='fallback.svg'" src="assets/images/program/saturday.webp"><div class="planner-context-shade"></div><div class="planner-context-copy"><span>SHOW &amp; SHINE</span><strong data-member-show-preview></strong><b data-member-show-copy></b></div></aside>
      </section>
      <section class="planner-step member-planner-personal planner-main-step">
        <div class="planner-step-head"><span>05</span><b>Tvoje E36 a poznámka</b></div>
        <div class="member-planner-personal-grid"><div data-member-car-slot></div><div data-member-note-slot></div></div>
      </section>
    </div>
    <aside class="weekend-preview weekend-preview--v8 member-planner-summary" aria-live="polite">
      <div class="weekend-preview-head weekend-preview-head--v8"><div><span class="micro-label">LIVE SUMMARY</span><h3>Tvůj United.</h3></div><span class="summary-sync"><i></i> live sync</span></div>
      <div class="member-planner-summary-grid">
        <article><small>POBYT</small><strong data-member-summary-stay></strong></article>
        <article><small>UBYTOVÁNÍ</small><strong data-member-summary-sleep></strong></article>
        <article><small>POSÁDKA</small><strong data-member-summary-crew></strong></article>
        <article><small>SHOW &amp; SHINE</small><strong data-member-summary-show></strong></article>
        <article class="member-planner-summary-car"><small>AUTO</small><strong data-member-summary-car></strong></article>
      </div>
      <p data-member-summary-recap></p>
    </aside>
  </div>`;

  const title=form.querySelector('.form-title');
  title?.after(shell);
  const arrivalRow=source.arrival?.closest('.reservation-form-row');
  const sleepRow=source.sleep?.closest('.reservation-form-row');
  const choicesRow=source.showshine?.closest('.reservation-form-row');
  arrivalRow?.classList.add('member-planner-source-fields');
  sleepRow?.classList.add('member-planner-source-fields');
  choicesRow?.classList.add('member-planner-source-fields');
  move(form.querySelector('[data-accommodation-option-field]'),shell.querySelector('[data-member-accommodation-option-slot]'));
  move(form.querySelector('[data-accommodation-preview]'),shell.querySelector('[data-member-accommodation-preview-slot]'));
  move(form.querySelector('.reservation-partial-stack'),shell.querySelector('[data-member-partial-slot]'));
  move(form.querySelector('[data-reservation-form-car]'),shell.querySelector('[data-member-car-slot]'));
  // Keep existing crew details in the form for saved-data round trips, outside the editor.
  const crewDetails=form.querySelector('[data-preliminary-crew]');
  if(crewDetails)crewDetails.hidden=true;
  const note=[...form.querySelectorAll(':scope > label')].find(label=>label.querySelector('[name="note"]'));
  move(note,shell.querySelector('[data-member-note-slot]'));

  function sync(){
    const stay=STAYS.find(item=>item.arrival===source.arrival?.value)||STAYS[0];
    const crew=Math.max(1,Math.min(5,Number(source.crew?.value)||1));
    const show=SHOW_SHINE.find(item=>item.value===source.showshine?.value)||SHOW_SHINE.at(-1);
    for(const [selector,item,alt] of [['[data-member-stay-image]',stay,stay.title],['[data-member-show-image]',show,show.copy]]){
      const img=shell.querySelector(selector);
      if(img.getAttribute('src')!==item.image)img.setAttribute('src',item.image);
      img.alt=alt;
    }
    shell.querySelector('[data-member-stay-title]').textContent=stay.title;
    shell.querySelector('[data-member-stay-meta]').textContent=stay.meta;
    shell.querySelector('[data-member-stay-preview]').textContent=stay.arrival==='Jen na otočku'?'Sobota / hlavní den':stay.title;
    shell.querySelector('[data-member-night-preview]').textContent=stay.arrival==='Pátek'?'2 noci':stay.arrival==='Sobota'?'1 noc':'bez noclehu';
    shell.querySelectorAll('[data-member-stay]').forEach(button=>{const active=STAYS[Number(button.dataset.memberStay)]?.arrival===stay.arrival;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));button.disabled=source.arrival?.disabled===true});
    shell.querySelectorAll('[data-member-sleep]').forEach(button=>{const active=button.dataset.memberSleep===source.sleep?.value;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));button.disabled=source.sleep?.disabled===true||stay.arrival==='Jen na otočku'});
    shell.querySelectorAll('[data-member-show]').forEach(button=>{const active=button.dataset.memberShow===show.value;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));button.disabled=source.showshine?.disabled===true});
    shell.querySelector('[data-member-crew]').textContent=crew;
    shell.querySelector('[data-member-crew-label]').textContent=personLabel(crew);
    shell.querySelector('[data-member-crew-number]').textContent=String(crew).padStart(2,'0');
    shell.querySelector('[data-member-crew-copy]').textContent=`${crew} ${personLabel(crew)}`;
    shell.querySelector('[data-member-crew-icons]').innerHTML=Array.from({length:5},(_,index)=>`<span class="planner-context-person${index<crew?'':' is-ghost'}"></span>`).join('');
    shell.querySelector('[data-member-crew-minus]').disabled=source.crew?.disabled===true||crew<=1;
    shell.querySelector('[data-member-crew-plus]').disabled=source.crew?.disabled===true||crew>=5;
    shell.querySelector('[data-member-show-preview]').textContent=show.label;
    shell.querySelector('[data-member-show-copy]').textContent=show.copy;
    shell.querySelector('[data-member-summary-stay]').textContent=stay.meta;
    shell.querySelector('[data-member-summary-sleep]').textContent=stay.arrival==='Jen na otočku'?'Bez ubytování':source.sleep?.value||'—';
    shell.querySelector('[data-member-summary-crew]').textContent=`${crew} ${personLabel(crew)}`;
    shell.querySelector('[data-member-summary-show]').textContent=show.label;
    shell.querySelector('[data-member-summary-car]').textContent=source.car?.selectedOptions?.[0]?.textContent||'Doplníš později';
    shell.querySelector('[data-member-summary-recap]').textContent=`${stay.title} · ${stay.arrival==='Jen na otočku'?'Bez ubytování':source.sleep?.value||'—'} · ${crew} ${personLabel(crew)} · Show & Shine: ${show.label}`;
  }

  shell.addEventListener('click',event=>{
    const stayButton=event.target.closest('[data-member-stay]');
    if(stayButton){setValue(source.arrival,STAYS[Number(stayButton.dataset.memberStay)]?.arrival||'Pátek');return}
    const sleepButton=event.target.closest('[data-member-sleep]');
    if(sleepButton){setValue(source.sleep,sleepButton.dataset.memberSleep);return}
    const showButton=event.target.closest('[data-member-show]');
    if(showButton){setValue(source.showshine,showButton.dataset.memberShow);return}
    if(event.target.closest('[data-member-crew-minus]')){setValue(source.crew,Math.max(1,(Number(source.crew?.value)||1)-1));return}
    if(event.target.closest('[data-member-crew-plus]'))setValue(source.crew,Math.min(5,(Number(source.crew?.value)||1)+1));
  });
  form.addEventListener('input',sync);
  form.addEventListener('change',sync);
  sync();
  return {sync,setMode:mode=>{shell.dataset.mode=mode||'';sync()}};
}
