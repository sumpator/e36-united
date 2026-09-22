import {adminState} from '../state.js?v=20260922-live1';
import {apiRequest} from '../api.js?v=20260922-live1';
import {$,escapeHtml as esc,toast} from '../ui.js?v=20260922-live1';
import {ADMIN_REFRESH} from '../refresh-policy.js?v=20260922-live1';
let page=1,payload=null,refresh=()=>{},busy=false;
export function clearPreliminary(){
  page=1;payload=null;
  const content=$('[data-admin-preliminary-content]');if(content)content.replaceChildren();
  const count=$('[data-admin-preliminary-count]');if(count)count.textContent='—';
  const state=$('[data-admin-preliminary-setting-state]');if(state)state.textContent='—';
}
export function preliminaryContext(){return `${adminState.activeAdminView}:${page}`;}
export function preliminaryTasks(){
  if(adminState.activeAdminView!=='preliminary'||adminState.memberId)return [];
  return [['preliminary-reservations',`/api/admin/preliminary-reservations?eventId=${encodeURIComponent(adminState.selectedEventId)}&page=${page}`,renderPreliminary,ADMIN_REFRESH.heavyListMs]];
}
function renderPreliminary(value){
  if(value.eventId!==adminState.selectedEventId||adminState.denied)return;
  payload=value;$('[data-admin-preliminary-count]').textContent=String(value.total);
  const state=$('[data-admin-preliminary-setting-state]'),setting=$('[data-preliminary-setting]');if(state)state.textContent=value.settings.enabled?'Povolený':'Vypnutý';if(setting)setting.textContent=value.settings.enabled?'Vypnout příjem':'Povolit příjem';
  const statusLabel=status=>({active:'Aktivní',cancelled:'Zrušená',converted:'Převedená na registraci'}[status]||status||'Aktivní');
  const stayLabel=arrival=>arrival==='Pátek'?'Pátek–neděle · 2 noci':arrival==='Sobota'?'Sobota–neděle · 1 noc':'Jen na otočku · bez noclehu';
  const dateLabel=value=>{const date=new Date(value);return Number.isNaN(date.valueOf())?String(value||'—'):date.toLocaleString('cs-CZ',{dateStyle:'short',timeStyle:'short'})};
  $('[data-admin-preliminary-content]').innerHTML=`${value.items.length?value.items.map(item=>{const p=item.preferences||{},member=item.member||{},car=p.carId?`Auto ${p.carId}`:'Auto neuvedeno';return `<details class="admin-preliminary-card"><summary><span><strong>${esc(member.nickname||member.name||member.email)}</strong><small>${esc(member.email)}</small></span><b>${esc(statusLabel(item.status))}</b></summary><div class="admin-preliminary-card-grid"><p><small>AUTO</small><strong>${esc(car)}</strong></p><p><small>POSÁDKA</small><strong>${Number(p.crew||0)} osob</strong></p><p><small>POBYT</small><strong>${esc(stayLabel(p.arrival))}</strong></p><p><small>UBYTOVÁNÍ</small><strong>${esc(p.accommodation==='Bez ubytování'?'Bez ubytování':`${p.accommodation||'—'} · ${p.accommodationUnits||0} osob`)}</strong></p><p><small>POSLEDNÍ ÚPRAVA</small><strong>${esc(dateLabel(item.updatedAt))}</strong></p></div><dl><dt>Údaje posádky</dt><dd>${esc((p.crewDetails||[]).join(', ')||'Bez dalších údajů')}</dd><dt>Show &amp; Shine</dt><dd>${esc(p.showShine||'—')}</dd><dt>Poznámka</dt><dd>${esc(p.note||'—')}</dd></dl></details>`}).join(''):'<p class="admin-preliminary-empty">Zatím žádné předběžné registrace.</p>'}
    <nav class="admin-preliminary-pagination" aria-label="Stránky předběžných registrací"><button type="button" data-preliminary-page="${page-1}" ${page<=1?'disabled':''}>Předchozí</button><span>${page} / ${Math.max(1,Math.ceil(value.total/20))}</span><button type="button" data-preliminary-page="${page+1}" ${page*20>=value.total?'disabled':''}>Další</button></nav>`;
}
export function initializePreliminary(onRefresh){
  refresh=onRefresh;
  $('[data-admin-preliminary-content]')?.addEventListener('click',async event=>{
    const next=event.target.closest('[data-preliminary-page]');if(next){page=Number(next.dataset.preliminaryPage);await refresh();return;}
  });
  $('[data-preliminary-setting]')?.addEventListener('click',async event=>{
    const button=event.currentTarget;if(busy||!payload||adminState.denied)return;
    const eventId=adminState.selectedEventId,generation=adminState.sessionGeneration;if(payload.eventId!==eventId)return;
    busy=true;button.disabled=true;
    try{await apiRequest(`/api/admin/events/${encodeURIComponent(eventId)}/preliminary-settings`,{method:'PUT',body:{enabled:!payload.settings.enabled,revision:payload.settings.revision}});
      if(generation===adminState.sessionGeneration&&eventId===adminState.selectedEventId&&!adminState.denied)await refresh();
    }catch(error){if(generation===adminState.sessionGeneration)toast(error.message||'Nastavení se nepodařilo uložit.');}
    finally{busy=false;if(button.isConnected)button.disabled=false;}
  });
}
