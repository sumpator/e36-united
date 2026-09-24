import {esc} from '../../merch/order-view.js?v=20260924-workspace1';
const sellerLabels={name:'Název prodávajícího',street:'Ulice',city:'Obec',postalCode:'PSČ',ico:'IČO',taxStatus:'Daňový status',email:'Kontaktní e-mail',phone:'Telefon'};
const docs={terms:'Obchodní podmínky',shipping:'Doprava a platba',returns:'Reklamace a odstoupení',privacy:'Osobní údaje'};
export function layoutMerchSettings(form,catalog){
 const intro=form.previousElementSibling;intro.replaceChildren();intro.className='portal-settings-missing';
 for(const missing of catalog.missing){
  let field,label=missing;
  if(missing.startsWith('Prodávající: ')){const key=missing.slice(13);field='seller-'+key;label=sellerLabels[key]||'Údaje prodávajícího';}
  else if(missing.startsWith('Dokument: ')){const key=missing.slice(10);field='doc-'+key;label=docs[key]||'Dokument';}
  else field={'Informace o dodání':'delivery','Ověřený účet registrací':'bankEventId','Potvrzené pravidlo členské slevy':'discount','Schválená verze obchodních podmínek':'legalApproved','Nedoplněný návrh obchodních dokumentů':'doc-terms'}[missing];
  const link=document.createElement('button');link.type='button';link.className='shop-button';link.textContent=label;link.onclick=()=>{const input=form.elements.namedItem(field);if(!input)return;const detail=input.closest('details');if(detail){detail.open=true;detail.querySelector('.portal-tabs button')?.click();}input.focus();input.scrollIntoView({block:'center'});};intro.append(link);
 }
 const groups=[['Stav objednávání',['paused']],['Prodávající a kontakty',Object.keys(sellerLabels).map(key=>'seller-'+key)],['Doprava a předání',['shipping','pickup','delivery','hours']],['Platby a členské výhody',['discount','bankEventId']],['Dokumenty',['termsVersion','legalApproved']]];
 const grid=document.createElement('div');grid.className='portal-settings-grid';
 for(const[title,names]of groups){const section=document.createElement('section');section.className='portal-card';section.innerHTML=`<h3>${title}</h3><div class="portal-fields"></div>`;const fields=section.lastElementChild;for(const name of names){const input=form.elements.namedItem(name);if(!input)continue;const label=input.closest('label'),next=label.nextElementSibling;fields.append(label);if(next?.tagName==='P')section.append(next);}if(title==='Dokumenty'){
   for(const[key,title]of Object.entries(docs)){const label=form.elements.namedItem('doc-'+key).closest('label'),detail=document.createElement('details');detail.className='portal-document';detail.innerHTML=`<summary>${esc(title)} · ${catalog.settings.legalApproved?'Schválená verze':'Koncept'} <small>${esc(catalog.settings.termsVersion||'Bez verze')}</small></summary><div class="portal-tabs"><button type="button" aria-pressed="true">Úpravy</button><button type="button" aria-pressed="false">Náhled</button></div>`;const preview=document.createElement('pre');preview.className='merch-document';preview.hidden=true;detail.append(label,preview);detail.querySelectorAll('button').forEach((button,index)=>button.onclick=()=>{preview.textContent=label.querySelector('textarea').value;preview.hidden=index===0;label.hidden=index===1;detail.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));});section.append(detail);}
   section.append(form.querySelector('button[type=button]'));
  }grid.append(section);}
 form.querySelectorAll(':scope>h3').forEach(node=>node.remove());form.prepend(grid);form.classList.add('portal-settings-form');
}
