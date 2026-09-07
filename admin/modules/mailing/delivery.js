import { apiRequest } from '../../api.js?v=20260903-mailing-b';
import { $, escapeHtml, toast } from '../../ui.js?v=20260903-phase5';
import { showFrozenMailingPreview } from './preview.js?v=20260907-mailing-c';

const providerLabels={not_configured:'Brevo není nakonfigurováno',api_connected:'API připojeno',sender_missing:'Odesílatel není připraven',domain_unverified:'Doména čeká na ověření',domain_unauthenticated:'Doména čeká na autentizaci',ready:'Připraveno k testu/odeslání'};
let selected='',sequence=0,current=null,provider=null,onChanged=async()=>{},initialized=false;
const panel=()=>$('[data-mailing-delivery]');
const button=(action,label,disabled=false)=>`<button class="admin-button" data-delivery-action="${action}" type="button"${disabled?' disabled':''}>${escapeHtml(label)}</button>`;

function render(){
  const row=current,ready=provider?.ready===true,locked=!!row?.busy;
  panel().innerHTML=`<div class="admin-mailing-card-head"><div><span class="admin-kicker">DELIVERY</span><h4>Doručení kampaně.</h4></div><strong data-delivery-status>${escapeHtml({draft:'Draft',prepared:'Připraveno',sent:'Odesláno',archived:'Archiv'}[row?.status]||'Neuložený draft')}</strong></div>
    <p data-provider-status>${escapeHtml(providerLabels[provider?.state]||'Stav Brevo není dostupný')}</p>
    <p>E36 United &lt;info@e36united.cz&gt; · ${row?.status==='draft'?'Způsobilí nyní':'Zmrazení příjemci'}: <strong data-delivery-count>${Number(row?.recipientCount||0)}</strong> · Limit: ${Number(provider?.dailyLimit||300)}/den</p>
    ${!row?'<p>Nejprve ulož koncept. Test používá uložený draft, skutečné odeslání pouze zmrazený obsah.</p>':''}
    ${locked?'<p role="alert">Operace probíhá nebo vyžaduje ruční ověření výsledku u poskytovatele. Odeslání neopakuj.</p>':''}
    ${row?.status==='draft'?`<label class="admin-field"><span>Testovací e-maily (1–5, oddělené čárkou)</span><input data-delivery-test-addresses autocomplete="off" placeholder="test1@example.invalid"/></label><p>Test neukládá adresy ani nemění příjemce. Nejprve ulož změny editoru. Brevo omezuje testy na 50 e-mailů/den.</p>${button('test','Poslat test',!ready||locked)} ${button('prepare','Připravit kampaň',locked||!row.recipientCount)}`:''}
    ${row?.status==='prepared'?`${button('unprepare','Vrátit do draftu',locked||!!row.providerListId||!!row.providerCampaignId)} ${button('provider-sync','Synchronizovat s Brevo',!ready||locked||!!row.providerSyncedAt||!provider.folderConfigured)} ${button('send',`ODESLAT ${row.recipientCount} EMAILŮ`,!ready||locked||!row.providerSyncedAt||row.recipientCount>provider.dailyLimit)}<p>Obsah i příjemci jsou neměnní. Anketa blokuje skutečné doručení do Mailing D. Návrat do draftu je možný pouze před synchronizací.</p>${!provider?.folderConfigured?'<p>Pro synchronizaci chybí konfigurace Brevo složky.</p>':''}`:''}
    <div data-delivery-tracking></div><p data-delivery-message role="status"></p>${button('refresh','Obnovit stav')}`;
}

export async function openMailingDelivery(id=''){
  selected=id;const own=++sequence;current=null;provider=null;
  panel().innerHTML='<p>Načítám stav doručení…</p>';
  try{
    const [status,detail]=await Promise.all([apiRequest('/api/admin/mailing/provider-status'),id?apiRequest(`/api/admin/mailing/campaigns/${encodeURIComponent(id)}/delivery`):null]);
    if(own!==sequence)return;
    provider=status.provider;current=detail?.campaign||null;render();
    if(detail?.frozenPreview)showFrozenMailingPreview(detail.frozenPreview);
  }catch(error){if(own===sequence)panel().innerHTML=`<p role="alert">${escapeHtml(error.message||'Stav doručení se nepodařilo načíst.')}</p>${button('refresh','Obnovit stav')}`}
}

async function act(action){
  const id=selected;
  if(action==='refresh')return openMailingDelivery(id);
  if(!current||current.busy)return;
  if($('[data-mailing-save-state]').classList.contains('is-dirty')){toast('Nejprve ulož změny editoru.');return}
  const row=current,body={};
  if(action==='test'){
    body.addresses=$('[data-delivery-test-addresses]').value.split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
    if(!body.addresses.length||body.addresses.length>5||body.addresses.some(x=>! /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(x))){$('[data-delivery-message]').textContent='Zadej 1 až 5 platných testovacích adres.';return}
    if(!window.confirm(`Poslat test uloženého draftu „${row.internalName}“ na ${body.addresses.join(', ')}?`))return;
  }
  if(action==='prepare'){
    if(!window.confirm(`Kampaň: ${row.internalName}\nPředmět: ${row.subject}\nZpůsobilí příjemci: ${row.recipientCount}\n\nPříprava zmrazí obsah a seznam příjemců.`))return;
    body.confirmation={subject:row.subject,recipientCount:row.recipientCount,updatedAt:row.updatedAt};
  }
  if(action==='send'){
    if(!window.confirm(`Kampaň: ${row.internalName}\nOdesílatel: E36 United <info@e36united.cz>\nPředmět: ${row.subject}\nZmrazení příjemci: ${row.recipientCount}\n\nODESLAT ${row.recipientCount} EMAILŮ?`))return;
    body.confirmation={preparationId:row.preparationId,recipientCount:row.recipientCount};
  }
  if(action==='unprepare'&&!window.confirm('Vrátit do draftu a vymazat zmrazený obsah i seznam příjemců?'))return;
  if(action==='provider-sync'&&!window.confirm(`Vytvořit samostatný Brevo seznam a synchronizovat ${row.recipientCount} zmrazených příjemců? Zatím bez odeslání.`))return;
  current.busy=true;panel().querySelectorAll('button').forEach(node=>node.disabled=true);
  try{
    await apiRequest(`/api/admin/mailing/campaigns/${encodeURIComponent(id)}/${action}`,{method:'POST',body});
    if(id!==selected)return;
    await onChanged(id);await openMailingDelivery(id);
    $('[data-delivery-message]').textContent=action==='test'?'Poskytovatel přijal test. Adresy nejsou uloženy.':'Operace dokončena.';
  }catch(error){
    if(id!==selected)return;
    await openMailingDelivery(id);
    const message=$('[data-delivery-message]');if(message)message.textContent=error.message||'Operace selhala. Před opakováním ověř stav.';
  }
}
export function initializeMailingDelivery({onChange}){
  onChanged=onChange;if(initialized)return;initialized=true;
  panel().addEventListener('click',event=>{const action=event.target.closest('[data-delivery-action]')?.dataset.deliveryAction;if(action)act(action).catch(()=>toast('Stav doručení se nepodařilo obnovit.'))});
}
export function resetMailingDelivery(){sequence++;selected='';current=null;provider=null;if(panel())panel().innerHTML=''}
