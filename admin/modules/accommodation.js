import { accommodationVisualMarkup, bindAccommodationVisualFallbacks } from '../../accommodation-visual.js?v=20260827-accommodation1';
import { selectImageFiles } from '../../image-upload.js?v=20260827-accommodation1';
import { apiBaseUrl, apiRequest, apiUpload } from '../api.js?v=20260903-phase5';
import { adminState } from '../state.js?v=20260903-phase5';
import { setDenied } from '../shell.js?v=20260903-phase5';
import { $, escapeHtml, formatMoney, numeric, toast } from '../ui.js?v=20260903-phase5';

const accommodationPhotoSelections=new Map();

function accommodationAvailability(item){
  if(item.inventoryMode==='unlimited')return '<strong>bez omezení</strong><small>kapacita se neblokuje</small>';
  const soldOut=numeric(item.freeUnits)===0;
  return `<strong>${numeric(item.approvedUnits)} / ${numeric(item.unitsTotal)} potvrzeno</strong><small class="${soldOut?'is-sold-out':''}">${soldOut?'0 volných':`${numeric(item.freeUnits)} volné`}</small><small class="admin-accommodation-pending">+ ${numeric(item.pendingUnits)} pending</small>`;
}

function accommodationCard(item){
  const inactive=item.active?'':' is-inactive',hasPhoto=item.visual?.hasCustomPhoto===true,conflict=numeric(item.pendingConflictUnits);
  return `<article class="admin-accommodation-card${inactive}" data-accommodation-id="${escapeHtml(item.id)}">
    ${accommodationVisualMarkup(item,{apiBaseUrl,className:'admin-accommodation-visual'})}
    <div class="admin-accommodation-head"><div><span class="admin-kicker">${item.kind==='cabin'?'CHATKA':'STAN'}${item.active?'':' · NEAKTIVNÍ'}</span><h3>${escapeHtml(item.name)}</h3></div><div class="admin-accommodation-availability">${accommodationAvailability(item)}</div></div>
    <div class="admin-accommodation-summary"><span>max. <b>${numeric(item.capacityPerUnit)}</b> osob / jednotku</span><span><b>${escapeHtml(formatMoney(item.unitPriceCzk))}</b> / jednotku / noc</span><span><b>${escapeHtml(formatMoney(item.personPriceCzk))}</b> / osobu</span></div>
    ${conflict?`<p class="admin-capacity-warning"><b>${conflict} pending</b> ${conflict===1?'požadavek již nebude možné schválit':'požadavky již nebude možné schválit'} bez uvolnění kapacity.</p>`:''}
    <div class="admin-accommodation-photo">
      <div><span class="admin-kicker">VIZUÁL UBYTOVÁNÍ</span><p>${hasPhoto?'Používá se vlastní fotografie. Její nahrazení se projeví ve všech rozhraních.':'Používá se generovaný přehled z aktuálních parametrů.'}</p></div>
      <label class="admin-photo-picker"><input accept="image/jpeg,image/png,image/webp" data-accommodation-photo-input hidden type="file"/><span>${hasPhoto?'Vybrat náhradu':'Vybrat fotografii'}</span><small>JPG, PNG nebo WebP · max. 8 MB</small></label>
      <div class="admin-accommodation-photo-preview" data-accommodation-photo-preview hidden></div>
      <div class="admin-accommodation-photo-actions"><button class="admin-button admin-button--primary" data-accommodation-photo-upload disabled type="button">${hasPhoto?'Nahradit fotografii':'Nahrát fotografii'}</button>${hasPhoto?'<button class="admin-button" data-accommodation-photo-remove type="button">Odebrat vlastní foto</button>':''}</div>
    </div>
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
    await apiRequest(optionId?`/api/admin/accommodation/${encodeURIComponent(optionId)}`:'/api/admin/accommodation',{method:optionId?'PATCH':'POST',body});
    toast(optionId?'Ubytování bylo upraveno.':'Ubytování bylo přidáno.');
    if(!optionId){form.reset();form.elements.unitsTotal.value=0;form.elements.capacityPerUnit.value=4;form.elements.active.checked=true;form.closest('details').open=false}
    await reloadEventData();
  }catch(error){if(error.status===403){setDenied();return}toast(error.message||'Ubytování se nepodařilo uložit.')}finally{if(button)button.disabled=false}
}

export function previewAccommodationPhoto(input){
  const card=input.closest('[data-accommodation-id]'),optionId=card?.dataset.accommodationId;if(!optionId)return;
  const selected=selectImageFiles(input.files,{maxFiles:1,maxBytes:8*1024*1024});
  if(selected.invalidType||selected.tooLarge||!selected.files.length){input.value='';toast(selected.tooLarge?'Fotografie může mít maximálně 8 MB.':'Vyber fotografii JPG, PNG nebo WebP.');return}
  const previous=accommodationPhotoSelections.get(optionId);if(previous)URL.revokeObjectURL(previous.url);
  const file=selected.files[0],url=URL.createObjectURL(file);accommodationPhotoSelections.set(optionId,{file,url});
  const preview=$('[data-accommodation-photo-preview]',card);preview.hidden=false;preview.innerHTML=`<img alt="Lokální náhled nové fotografie" src="${escapeHtml(url)}"/><span>${escapeHtml(file.name)}</span>`;
  $('[data-accommodation-photo-upload]',card).disabled=false;
}

export async function uploadAccommodationPhoto(card,reloadEventData){
  const optionId=card?.dataset.accommodationId,selection=accommodationPhotoSelections.get(optionId);if(!optionId||!selection)return;
  const button=$('[data-accommodation-photo-upload]',card);button.disabled=true;
  try{await apiUpload(`/api/admin/accommodation/${encodeURIComponent(optionId)}/photo`,selection.file);toast('Fotografie ubytování byla uložena.');await reloadEventData()}
  catch(error){if(error.status===403){setDenied();return}toast(error.message||'Fotografii se nepodařilo uložit.');button.disabled=false}
}

export async function removeAccommodationPhoto(card,reloadEventData){
  const optionId=card?.dataset.accommodationId;if(!optionId)return;
  const button=$('[data-accommodation-photo-remove]',card);button.disabled=true;
  try{await apiRequest(`/api/admin/accommodation/${encodeURIComponent(optionId)}/photo`,{method:'DELETE'});toast('Vlastní fotografie byla odebrána.');await reloadEventData()}
  catch(error){if(error.status===403){setDenied();return}toast(error.message||'Fotografii se nepodařilo odebrat.');button.disabled=false}
}
