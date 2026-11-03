// Move existing controls, never rebuild a form, change a filter or create a second query.
export function initializeMobileAgendas(){
  const media=matchMedia('(max-width:1050px)'),moves=new Map();
  const plans=[
    ['[data-payment-tabs]',':scope > button','Filtry plateb',true],
    ['.admin-history-filterbar',':scope > label:not(.admin-search),:scope > [data-history-clear]','Filtry historie'],
    ['[data-mailing-contact-form]',':scope > label:not(:has([name=q]))','Filtry kontaktů'],
    ['[data-transactional-filters]',':scope > label:not(:has([name=q])),:scope > details','Filtry automatických zpráv'],
    ['[data-merch-search-form]',':scope > select','Filtry objednávek'],
    ['[data-sraz-payments]',':scope > .booking-collapse-body','Souhrn závazku a částek',false,true],
  ];
  function update(){for(const {box,summary,controls,label,summaryOnly} of moves.values()){
    if(summaryOnly)continue;let count=0;for(const node of controls){for(const input of [node,...node.querySelectorAll('select,input')]){if(input.matches('select,input:not([type=checkbox]):not([type=hidden])')&&!['','all','relevant'].includes(input.value))count++;if(input.matches('button[aria-selected=true][data-payment-filter]:not([data-payment-filter=all])'))count++;}}
    const text=`${label}${count?' · '+count:''}`;if(summary.textContent!==text)summary.textContent=text;box.dataset.activeFilters=String(count);
  }}
  function mount(){
    if(!media.matches){for(const {box,places} of moves.values()){for(const {node,anchor} of places){anchor.replaceWith(node)}box.remove();}moves.clear();return;}
    for(const [selector,children,label,buttons=false,summaryOnly=false] of plans){const root=document.querySelector(selector);if(!root||moves.has(selector))continue;const controls=[...root.querySelectorAll(children)];if(!controls.length)continue;
      const box=document.createElement('details');box.className='admin-mobile-filters';box.dataset.mobileFilters=selector;const summary=document.createElement('summary');summary.textContent=label;box.append(summary);controls[0].before(box);const places=controls.map(node=>{const anchor=document.createComment('Desktop control position');node.before(anchor);box.append(node);return{node,anchor}});
      if(buttons){const clear=document.createElement('button');clear.type='button';clear.textContent='Zrušit omezení';clear.addEventListener('click',()=>box.querySelector('[data-payment-filter=all]')?.click());box.append(clear);}
      else if(!summaryOnly&&!box.querySelector('[data-history-clear]')){
        const clear=document.createElement('button');clear.type='button';clear.textContent='Zrušit omezení';
        clear.addEventListener('click',()=>{for(const node of controls)for(const input of [node,...node.querySelectorAll('select,input')]){
          if(input.matches('select'))input.value=input.name==='scope'?'relevant':input.querySelector('option[value="all"]')?'all':'';
          else if(input.matches('input:not([type=hidden])'))input.value='';
        }root.requestSubmit();update();});box.append(clear);
      }
      moves.set(selector,{box,summary,controls,label,places,summaryOnly});
    }
    // Keep the test-mode warning outside the optional financial summary.
    const warning=document.querySelector('[data-admin-payment-test]'),payments=document.querySelector('[data-admin-panel=payments]');
    if(warning&&payments&&!warning.hasAttribute('data-mobile-position')){const anchor=document.createComment('Payment warning position');warning.before(anchor);warning.dataset.mobilePosition='';(payments.querySelector('[data-sraz-payments]')||payments).prepend(warning);warning._mobileAnchor=anchor;}
    update();
  }
  media.addEventListener('change',()=>{if(!media.matches){const warning=document.querySelector('[data-admin-payment-test]');if(warning?._mobileAnchor){warning._mobileAnchor.replaceWith(warning);delete warning._mobileAnchor;delete warning.dataset.mobilePosition}}mount()});
  document.addEventListener('change',update);document.addEventListener('input',update);document.addEventListener('click',()=>queueMicrotask(update));
  window.addEventListener('admin:viewchange',mount);
  mount();
}
