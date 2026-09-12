import { adminCommand, editorProtected, adminEditorDirty } from '../editors.js?v=20260912-reservation-detail-ux-r1';
import { accommodationVisualMarkup, bindAccommodationVisualFallbacks } from '../../accommodation-visual.js?v=20260912-reservation-detail-ux-r1';
import { selectImageFiles } from '../../image-upload.js?v=20260912-reservation-detail-ux-r1';
import { apiBaseUrl, apiRequest, apiUpload } from '../api.js?v=20260912-reservation-detail-ux-r1';
import { adminState } from '../state.js?v=20260912-reservation-detail-ux-r1';
import { setDenied } from '../shell.js?v=20260912-reservation-detail-ux-r1';
import { $, escapeHtml, formatMoney, numeric, toast } from '../ui.js?v=20260912-reservation-detail-ux-r1';

const accommodationPhotoSelections=new Map();
const accommodationGallerySelections=new Map();
export function resetAccommodationMedia(){for(const selection of [...accommodationPhotoSelections.values(),...accommodationGallerySelections.values()])URL.revokeObjectURL(selection.url);accommodationPhotoSelections.clear();accommodationGallerySelections.clear();document.querySelectorAll('[data-local-file]').forEach(node=>delete node.dataset.localFile)}
window.addEventListener('admin:discardfiles',resetAccommodationMedia);
let previewDialog;
document.addEventListener('click',event=>{
  const button=event.target.closest('[data-accommodation-preview]');if(!button)return;
  if(!previewDialog){previewDialog=document.createElement('dialog');previewDialog.className='admin-accommodation-image-dialog';previewDialog.setAttribute('aria-label','Náhled ubytování');previewDialog.innerHTML='<button type="button">Zavřít náhled ×</button><img alt=""/>';previewDialog.querySelector('button').onclick=()=>previewDialog.close();document.body.append(previewDialog);}
  const source=button.querySelector('img'),image=previewDialog.querySelector('img');image.src=source.currentSrc||source.src;image.alt=source.alt;previewDialog.showModal();
});
window.addEventListener('admin:accesslost',()=>previewDialog?.close());

function accommodationAvailability(item){
  if(item.inventoryMode==='unlimited')return '<strong>bez omezení</strong><small>kapacita se neblokuje</small>';
  const soldOut=numeric(item.freeUnits)===0;
  return `<strong>${numeric(item.approvedUnits)} / ${numeric(item.unitsTotal)} potvrzeno</strong><small class="${soldOut?'is-sold-out':''}">${soldOut?'0 volných':`${numeric(item.freeUnits)} volné`}</small><small class="admin-accommodation-pending">+ ${numeric(item.pendingUnits)} pending</small>`;
}

function accommodationCard(item){
  const inactive=item.active?'':' is-inactive',photos=Array.isArray(item.photos)?item.photos:[],cover=photos.find(photo=>photo.role==='cover'),additional=photos.filter(photo=>photo.role!=='cover'),hasPhoto=!!cover,photoCount=photos.length,atLimit=photoCount>=5,conflict=numeric(item.pendingConflictUnits);
  const additionalMarkup=additional.length?additional.map((photo,index)=>`<article class="admin-accommodation-gallery-item" data-accommodation-gallery-photo="${escapeHtml(photo.id)}"><img alt="${escapeHtml(item.name)} – doplňková fotografie ${index+1}" loading="lazy" src="${escapeHtml(apiBaseUrl+photo.imageUrl)}"/><div><b>Doplňková ${index+1}</b><small>Pořadí ${index+2} z ${photoCount}</small></div><div class="admin-accommodation-gallery-order"><button aria-label="Posunout fotografii nahoru" data-accommodation-gallery-move="up" ${index===0?'disabled':''} type="button">↑</button><button aria-label="Posunout fotografii dolů" data-accommodation-gallery-move="down" ${index===additional.length-1?'disabled':''} type="button">↓</button><button class="is-danger" data-accommodation-gallery-remove type="button">Odebrat</button></div></article>`).join(''):'<p class="admin-accommodation-gallery-empty">Zatím bez doplňkových fotografií.</p>';
  return `<article class="admin-accommodation-card${inactive}" data-accommodation-id="${escapeHtml(item.id)}">
    <button type="button" class="admin-accommodation-preview" aria-label="Zvětšit náhled: ${escapeHtml(item.name)}" data-accommodation-preview>${accommodationVisualMarkup(item,{apiBaseUrl,className:'admin-accommodation-visual'})}</button>
    <div class="admin-accommodation-head"><div><span class="admin-kicker">${item.kind==='cabin'?'CHATKA':'STAN'}${item.active?'':' · NEAKTIVNÍ'}</span><h3>${escapeHtml(item.name)}</h3></div><div class="admin-accommodation-availability">${accommodationAvailability(item)}</div></div>
    <div class="admin-accommodation-summary"><span>max. <b>${numeric(item.capacityPerUnit)}</b> osob / jednotku</span><span><b>${escapeHtml(formatMoney(item.unitPriceCzk))}</b> / jednotku / noc</span><span><b>${escapeHtml(formatMoney(item.personPriceCzk))}</b> / osobu</span></div>
    ${conflict?`<p class="admin-capacity-warning"><b>${conflict} pending</b> ${conflict===1?'požadavek již nebude možné schválit':'požadavky již nebude možné schválit'} bez uvolnění kapacity.</p>`:''}
    <div class="admin-accommodation-photo">
      <div><span class="admin-kicker">HLAVNÍ FOTOGRAFIE</span><p>${hasPhoto?'Cover je první fotografií galerie. Jeho nahrazení se projeví ve všech rozhraních.':additional.length?'Cover chybí; jako náhled se používá první doplňková fotografie.':'Používá se generovaný přehled z aktuálních parametrů.'}</p></div>
      <label class="admin-photo-picker"><input accept="image/jpeg,image/png,image/webp" data-accommodation-photo-input hidden type="file"/><span>${hasPhoto?'Vybrat náhradu':'Vybrat fotografii'}</span><small>JPG, PNG nebo WebP · max. 8 MB</small></label>
      <div class="admin-accommodation-photo-preview" data-accommodation-photo-preview hidden></div>
      <div class="admin-accommodation-photo-actions"><button class="admin-button admin-button--primary" data-accommodation-photo-upload disabled type="button">${hasPhoto?'Nahradit fotografii':'Nahrát fotografii'}</button>${hasPhoto?'<button class="admin-button" data-accommodation-photo-remove type="button">Odebrat vlastní foto</button>':''}</div>
    </div>
    <section class="admin-accommodation-gallery" aria-label="Fotografie ubytování">
      <div class="admin-accommodation-gallery-head"><div><span class="admin-kicker">FOTOGRAFIE UBYTOVÁNÍ</span><p>Cover a doplňkové fotografie v pořadí pro Planner.</p></div><strong>${photoCount} / 5</strong></div>
      <div class="admin-accommodation-gallery-list">${additionalMarkup}</div>
      <div class="admin-accommodation-gallery-upload">
        <label class="admin-photo-picker${atLimit?' is-disabled':''}"><input accept="image/jpeg,image/png,image/webp" data-accommodation-gallery-input ${atLimit?'disabled':''} hidden type="file"/><span>${atLimit?'Limit pěti fotografií je naplněn':'Vybrat další fotografii'}</span><small>JPG, PNG nebo WebP · max. 8 MB</small></label>
        <div class="admin-accommodation-photo-preview" data-accommodation-gallery-preview hidden></div>
        <button class="admin-button admin-button--primary" data-accommodation-gallery-upload disabled type="button">Nahrát další fotografii</button>
        <p aria-live="polite" class="admin-accommodation-gallery-status" data-accommodation-gallery-status>${atLimit?'Pro další upload nejdřív odeber jednu doplňkovou fotografii.':''}</p>
      </div>
    </section>
    <details><summary>Upravit konfiguraci</summary>
      <form class="admin-config-form" data-accommodation-edit-form>
        <label class="admin-field admin-field--wide"><span>Název</span><input maxlength="80" name="name" required value="${escapeHtml(item.name)}"/></label>
        <label class="admin-field"><span>Druh</span><select name="kind"><option value="cabin" ${item.kind==='cabin'?'selected':''}>Chatka</option><option value="tent" ${item.kind==='tent'?'selected':''}>Stan</option></select></label>
        <label class="admin-field"><span>Kapacita</span><select name="inventoryMode"><option value="limited" ${item.inventoryMode==='limited'?'selected':''}>Omezená</option><option value="unlimited" ${item.inventoryMode==='unlimited'?'selected':''}>Bez omezení</option></select></label>
        <label class="admin-field"><span>Počet jednotek</span><input min="0" name="unitsTotal" required type="number" value="${numeric(item.unitsTotal)}"/></label>
        <label class="admin-field"><span>Max. osob / jednotku</span><input max="8" min="1" name="capacityPerUnit" required type="number" value="${numeric(item.capacityPerUnit)}"/></label>
        <label class="admin-field"><span>Cena / jednotku / noc (Kč)</span><input min="0" name="unitPriceCzk" required type="number" value="${numeric(item.unitPriceCzk)}"/></label>
        <label class="admin-field"><span>Cena / osobu (Kč)</span><input min="0" name="personPriceCzk" required type="number" value="${numeric(item.personPriceCzk)}"/></label>
        <label class="admin-field"><span>Povlečení / osobu (Kč)</span><input min="0" name="beddingFeePerPersonCzk" required type="number" value="${numeric(item.beddingFeePerPersonCzk)}"/></label>
        <label class="admin-field"><span>Taxa / osobu / noc (Kč)</span><input min="0" name="cityTaxPerPersonPerNightCzk" required type="number" value="${numeric(item.cityTaxPerPersonPerNightCzk)}"/></label>
        <label class="admin-check"><input name="active" type="checkbox" ${item.active?'checked':''}/><span>Aktivní nabídka</span></label>
        <button class="admin-button" data-accommodation-save type="submit">Uložit změny</button>
      </form>
    </details>
  </article>`;
}

export function renderAccommodation(payload){
  const createForm=$('[data-accommodation-create-form]');if(createForm)createForm.inert=false;
  const protectedCards=[...document.querySelectorAll('[data-accommodation-id]')].some(card=>editorProtected(card,payload.options?.find(item=>item.id===card.dataset.accommodationId)?.revision,()=>renderAccommodation(payload)));
  if(protectedCards||accommodationPhotoSelections.size){adminState.accommodationItems=payload.options||[];return false}
  for(const selection of accommodationPhotoSelections.values())URL.revokeObjectURL(selection.url);accommodationPhotoSelections.clear();
  adminState.accommodationItems=Array.isArray(payload.options)?payload.options:[];
  $('[data-accommodation-option-count]').textContent=`${adminState.accommodationItems.length} ${adminState.accommodationItems.length===1?'možnost':'možností'}`;
  const list=$('[data-accommodation-list]');
  list.innerHTML=adminState.accommodationItems.length?adminState.accommodationItems.map(accommodationCard).join(''):'<div class="admin-empty">Pro tento event zatím nejsou nastavené žádné typy ubytování.</div>';
  bindAccommodationVisualFallbacks(list);
}

function accommodationFormPayload(form){
  const data=new FormData(form);
  return {
    name:String(data.get('name')||'').trim(),kind:String(data.get('kind')||''),inventoryMode:String(data.get('inventoryMode')||''),
    unitsTotal:Number(data.get('unitsTotal')),capacityPerUnit:Number(data.get('capacityPerUnit')),unitPriceCzk:Number(data.get('unitPriceCzk')),
    personPriceCzk:Number(data.get('personPriceCzk')),beddingFeePerPersonCzk:Number(data.get('beddingFeePerPersonCzk')),
    cityTaxPerPersonPerNightCzk:Number(data.get('cityTaxPerPersonPerNightCzk')),active:data.get('active')==='on',
  };
}

export async function saveAccommodation(form,optionId='',reloadEventData){
  const button=$('button[type="submit"]',form);if(button)button.disabled=true;
  try{
    const body=accommodationFormPayload(form);if(!optionId)body.eventId=adminState.selectedEventId;
    await adminCommand(optionId?`/api/admin/accommodation/${encodeURIComponent(optionId)}`:'/api/admin/accommodation',{method:optionId?'PATCH':'POST',body,editor:form});
    toast(optionId?'Ubytování bylo upraveno.':'Ubytování bylo přidáno.');
    if(!optionId&&!adminEditorDirty(form)){form.reset();form.elements.unitsTotal.value=0;form.elements.capacityPerUnit.value=4;form.elements.active.checked=true;form.closest('details').open=false}
    await reloadEventData();
  }catch(error){if(error.status===403){setDenied();return}toast(error.message||'Ubytování se nepodařilo uložit.')}finally{if(button)button.disabled=false}
}

export function previewAccommodationPhoto(input){
  const card=input.closest('[data-accommodation-id]'),optionId=card?.dataset.accommodationId;if(!optionId)return;
  const selected=selectImageFiles(input.files,{maxFiles:1,maxBytes:8*1024*1024});
  if(selected.invalidType||selected.tooLarge||!selected.files.length){input.value='';toast(selected.tooLarge?'Fotografie může mít maximálně 8 MB.':'Vyber fotografii JPG, PNG nebo WebP.');return}
  const previous=accommodationPhotoSelections.get(optionId);if(previous)URL.revokeObjectURL(previous.url);
  card.dataset.localFile='true';const file=selected.files[0],url=URL.createObjectURL(file);accommodationPhotoSelections.set(optionId,{file,url});
  const preview=$('[data-accommodation-photo-preview]',card);preview.hidden=false;preview.innerHTML=`<img alt="Lokální náhled nové fotografie" src="${escapeHtml(url)}"/><span>${escapeHtml(file.name)}</span>`;
  $('[data-accommodation-photo-upload]',card).disabled=false;
}

export async function uploadAccommodationPhoto(card,reloadEventData){
  const optionId=card?.dataset.accommodationId,selection=accommodationPhotoSelections.get(optionId);if(!optionId||!selection)return;
  const button=$('[data-accommodation-photo-upload]',card);button.disabled=true;
  try{await apiUpload(`/api/admin/accommodation/${encodeURIComponent(optionId)}/photo`,selection.file);toast('Fotografie ubytování byla uložena.');URL.revokeObjectURL(selection.url);accommodationPhotoSelections.delete(optionId);delete card.dataset.localFile;await reloadEventData()}
  catch(error){if(error.status===403){setDenied();return}toast(error.status&&error.status<500?error.message:'Výsledek nahrání zatím nelze ověřit. Obnov detail před případným opakováním.');button.disabled=false}
}

export async function removeAccommodationPhoto(card,reloadEventData){
  const optionId=card?.dataset.accommodationId;if(!optionId)return;
  const button=$('[data-accommodation-photo-remove]',card);button.disabled=true;
  try{await apiRequest(`/api/admin/accommodation/${encodeURIComponent(optionId)}/photo`,{method:'DELETE'});toast('Vlastní fotografie byla odebrána.');await reloadEventData()}
  catch(error){if(error.status===403){setDenied();return}toast(error.status&&error.status<500?error.message:'Výsledek odebrání zatím nelze ověřit. Obnov detail před případným opakováním.');button.disabled=false}
}

export function previewAccommodationGalleryPhoto(input){
  const card=input.closest('[data-accommodation-id]'),optionId=card?.dataset.accommodationId;if(!optionId)return;
  const selected=selectImageFiles(input.files,{maxFiles:1,maxBytes:8*1024*1024});
  const status=$('[data-accommodation-gallery-status]',card);
  if(selected.invalidType||selected.tooLarge||!selected.files.length){input.value='';if(status)status.textContent=selected.tooLarge?'Fotografie může mít maximálně 8 MB.':'Vyber fotografii JPG, PNG nebo WebP.';return}
  const previous=accommodationGallerySelections.get(optionId);if(previous)URL.revokeObjectURL(previous.url);
  const file=selected.files[0],url=URL.createObjectURL(file);accommodationGallerySelections.set(optionId,{file,url});card.dataset.localFile='true';
  const preview=$('[data-accommodation-gallery-preview]',card);preview.hidden=false;preview.innerHTML=`<img alt="Lokální náhled doplňkové fotografie" src="${escapeHtml(url)}"/><span>${escapeHtml(file.name)}</span>`;
  $('[data-accommodation-gallery-upload]',card).disabled=false;if(status)status.textContent='Fotografie je připravena k nahrání.';
}

export async function uploadAccommodationGalleryPhoto(card,reloadEventData){
  const optionId=card?.dataset.accommodationId,selection=accommodationGallerySelections.get(optionId);if(!optionId||!selection)return;
  const button=$('[data-accommodation-gallery-upload]',card),status=$('[data-accommodation-gallery-status]',card);button.disabled=true;if(status)status.textContent='Nahrávám fotografii…';
  try{await apiUpload(`/api/admin/accommodation/${encodeURIComponent(optionId)}/photos`,selection.file,{method:'POST'});if(status)status.textContent='Fotografie byla nahrána.';toast('Doplňková fotografie byla uložena.');URL.revokeObjectURL(selection.url);accommodationGallerySelections.delete(optionId);delete card.dataset.localFile;await reloadEventData()}
  catch(error){if(error.status===403){setDenied();return}if(status)status.textContent=error.message||'Fotografii se nepodařilo nahrát.';toast(error.status&&error.status<500?error.message:'Výsledek nahrání zatím nelze ověřit. Obnov detail před případným opakováním.');button.disabled=false}
}

export async function removeAccommodationGalleryPhoto(button,reloadEventData){
  const card=button.closest('[data-accommodation-id]'),photo=button.closest('[data-accommodation-gallery-photo]'),optionId=card?.dataset.accommodationId,photoId=photo?.dataset.accommodationGalleryPhoto;if(!optionId||!photoId)return;
  button.disabled=true;
  try{await apiRequest(`/api/admin/accommodation/${encodeURIComponent(optionId)}/photos/${encodeURIComponent(photoId)}`,{method:'DELETE'});toast('Doplňková fotografie byla odebrána.');await reloadEventData()}
  catch(error){if(error.status===403){setDenied();return}toast(error.message||'Fotografii se nepodařilo odebrat.');button.disabled=false}
}

export async function moveAccommodationGalleryPhoto(button,reloadEventData){
  const card=button.closest('[data-accommodation-id]'),photo=button.closest('[data-accommodation-gallery-photo]'),optionId=card?.dataset.accommodationId,photoId=photo?.dataset.accommodationGalleryPhoto,direction=button.dataset.accommodationGalleryMove;if(!optionId||!photoId||!direction)return;
  button.disabled=true;
  try{await apiRequest(`/api/admin/accommodation/${encodeURIComponent(optionId)}/photos/${encodeURIComponent(photoId)}`,{method:'PATCH',body:{direction}});toast('Pořadí fotografií bylo změněno.');await reloadEventData()}
  catch(error){if(error.status===403){setDenied();return}toast(error.message||'Pořadí se nepodařilo změnit.');button.disabled=false}
}
