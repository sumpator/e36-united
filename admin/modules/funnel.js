import { apiRequest } from '../api.js?v=20260908-admin-safe1';
import { adminState } from '../state.js?v=20260908-admin-safe1';
import { $, escapeHtml as esc, formatDate, numeric } from '../ui.js?v=20260908-admin-safe1';

let sequence=0;
function planSummary(row){
  let plan={};try{plan=JSON.parse(row.payload_json||'{}')}catch{}
  return [plan.arrival,plan.departure,plan.accommodation,`${numeric(plan.crew)} osob`].filter(Boolean).join(' · ');
}
export async function refreshAdminFunnel(){
  const root=$('[data-admin-funnel]');if(!root)return;
  const current=++sequence,eventId=adminState.selectedEventId;
  root.setAttribute('aria-busy','true');
  try{
    const payload=await apiRequest(`/api/admin/funnel${eventId?`?eventId=${encodeURIComponent(eventId)}`:''}`);
    if(current!==sequence||eventId!==adminState.selectedEventId||!adminState.currentUser)return;
    const counts=payload.counts||{},details=payload.details||{};
    const metrics=[['members','Členské účty','Všechny existující D1 profily, bez ohledu na event.'],['incomplete','Nedokončené registrace','Nově sledovaná Firebase identita bez úspěšného profilu. Globálně.'],['created','Vytvořené plány','Unikátní zaznamenané plány pro vybraný event.'],['claimed','Otevřené / přiřazené','Plán otevřený v Můj United a přiřazený k účtu.'],['unclaimed','Nepřiřazené plány','Zaznamenané plány bez otevření v Můj United.'],['converted','S rezervací','Plány propojené s úspěšně uloženou rezervací.'],['claimedWithoutReservation','Přiřazené bez rezervace','Otevřené plány, které zatím nemají zaznamenanou konverzi.']];
    const list=(name,title,rows,identity)=>`<details><summary>${esc(title)} · posledních nejvýše 50</summary>${rows.length?`<ul>${rows.map(row=>`<li>${identity?`<b>${esc(row.email||row.name||'Účet již není dostupný')}</b> · `:''}${esc(formatDate(row.firebase_account_seen_at||row.created_at))}${name==='incomplete'?' · profil nedokončen':` · ${esc(planSummary(row))}`}</li>`).join('')}</ul>`:'<p>Žádné zaznamenané položky.</p>'}</details>`;
    root.dataset.freshness='fresh';root.innerHTML=`<h2>Registrace / Planner funnel</h2><p>Plány: United ${esc(adminState.events.find(event=>event.id===eventId)?.year||'—')}. Účty a registrace: všechny eventy. Sledování až od nasazení tohoto vydání; staré anonymní plány nelze dopočítat.</p><div class="admin-funnel-metrics">${metrics.map(([key,label,definition])=>`<article title="${esc(definition)}"><b data-funnel-count="${key}">${numeric(counts[key])}</b><span>${esc(label)}</span><small>${esc(definition)}</small></article>`).join('')}</div>${list('incomplete','Nedokončené registrace',details.incomplete||[],true)}${list('claimed','Přiřazené plány bez rezervace',details.claimedWithoutReservation||[],true)}${list('anonymous','Anonymní nepřiřazené plány',details.unclaimed||[],false)}`;
  }catch{
    if(current===sequence){root.dataset.freshness='stale';let warning=root.querySelector('[data-funnel-error]');if(!warning){warning=document.createElement('p');warning.dataset.funnelError='';root.append(warning)}warning.textContent='Funnel teď nelze načíst · poslední data mohou být zastaralá. ';const retry=document.createElement('button');retry.textContent='Zkusit znovu';retry.type='button';retry.onclick=()=>void refreshAdminFunnel();warning.append(retry)}
  }finally{if(current===sequence)root.removeAttribute('aria-busy')}
}
