import {adminState} from '../state.js?v=20260919-preliminary-r1';
import {apiRequest} from '../api.js?v=20260919-preliminary-r1';
import {$,escapeHtml as esc,toast} from '../ui.js?v=20260919-preliminary-r1';
import {ADMIN_REFRESH} from '../refresh-policy.js?v=20260919-preliminary-r1';
let page=1,payload=null,refresh=()=>{},busy=false;
export function clearPreliminary(){
  page=1;payload=null;const panel=$('[data-admin-preliminary]');if(panel)panel.open=false;
  const content=$('[data-admin-preliminary-content]');if(content)content.replaceChildren();
  const count=$('[data-admin-preliminary-count]');if(count)count.textContent='—';
}
export function preliminaryContext(){return `${$('[data-admin-preliminary]')?.open?'open':'closed'}:${page}`;}
export function preliminaryTasks(){
  if(adminState.activeAdminView!=='reservations'||adminState.memberId||!$('[data-admin-preliminary]')?.open)return [];
  return [['preliminary-reservations',`/api/admin/preliminary-reservations?eventId=${encodeURIComponent(adminState.selectedEventId)}&page=${page}`,renderPreliminary,ADMIN_REFRESH.heavyListMs]];
}
function renderPreliminary(value){
  if(value.eventId!==adminState.selectedEventId||adminState.denied)return;
  payload=value;$('[data-admin-preliminary-count]').textContent=String(value.total);
  $('[data-admin-preliminary-content]').innerHTML=`<p>Nezávazné, nepotvrzené zájmy. Bez kapacity, plateb a QR; nejsou součástí počtů skutečných rezervací.</p>
    <p>Příjem zájmu pro tento event: <strong>${value.settings.enabled?'povolený (jen při uzavřené registraci)':'vypnutý'}</strong></p>
    <button type="button" data-preliminary-setting>${value.settings.enabled?'Vypnout':'Povolit'} předběžné rezervace</button>
    ${value.items.length?value.items.map(item=>{const p=item.preferences;return `<details><summary>${esc(item.member.nickname||item.member.name||item.member.email)} · ${esc(p.arrival)} · ${p.crew} osob</summary>
      <dl><dt>Člen</dt><dd>${esc(item.member.email)}</dd><dt>Auto (ID)</dt><dd>${esc(p.carId)}</dd><dt>Posádka</dt><dd>${esc((p.crewDetails||[]).join(', ')||'Bez dalších údajů')}</dd>
      <dt>Preferované ubytování</dt><dd>${esc(p.accommodation)} · ${esc(p.accommodationOptionId||'—')} · ${p.accommodationUnits} osob</dd><dt>Show &amp; Shine</dt><dd>${esc(p.showShine)}</dd>
      <dt>Poznámka</dt><dd>${esc(p.note||'—')}</dd><dt>Vytvořeno / změněno</dt><dd>${esc(item.createdAt)} / ${esc(item.updatedAt)}</dd></dl></details>`}).join(''):'<p>Žádné aktivní předběžné rezervace.</p>'}
    <nav aria-label="Stránky předběžných rezervací"><button type="button" data-preliminary-page="${page-1}" ${page<=1?'disabled':''}>Předchozí</button> <span>${page} / ${Math.max(1,Math.ceil(value.total/20))}</span> <button type="button" data-preliminary-page="${page+1}" ${page*20>=value.total?'disabled':''}>Další</button></nav>`;
}
export function initializePreliminary(onRefresh){
  refresh=onRefresh;
  $('[data-admin-preliminary]')?.addEventListener('toggle',()=>{if($('[data-admin-preliminary]').open)void refresh();});
  $('[data-admin-preliminary-content]')?.addEventListener('click',async event=>{
    const next=event.target.closest('[data-preliminary-page]');if(next){page=Number(next.dataset.preliminaryPage);await refresh();return;}
    const button=event.target.closest('[data-preliminary-setting]');if(!button||busy||!payload||adminState.denied)return;
    const eventId=adminState.selectedEventId,generation=adminState.sessionGeneration;if(payload.eventId!==eventId)return;
    busy=true;button.disabled=true;
    try{await apiRequest(`/api/admin/events/${encodeURIComponent(eventId)}/preliminary-settings`,{method:'PUT',body:{enabled:!payload.settings.enabled,revision:payload.settings.revision}});
      if(generation===adminState.sessionGeneration&&eventId===adminState.selectedEventId&&!adminState.denied)await refresh();
    }catch(error){if(generation===adminState.sessionGeneration)toast(error.message||'Nastavení se nepodařilo uložit.');}
    finally{busy=false;if(button.isConnected)button.disabled=false;}
  });
}
