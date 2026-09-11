import { escapeHtml } from '../../ui.js?v=20260911-member-rows-r3';
const labels={recipients:'Příjemci',sent:'Odesláno',delivered:'Doručeno',opened:'Otevřeno',clicked:'Kliknuto',bounced:'Nedoručeno / blokováno',unsubscribed:'Odhlášeno'};
const states={prepared:'Připraveno',sent:'Odesláno',delivered:'Doručeno',soft_bounce:'Dočasně nedoručeno',hard_bounce:'Trvale nedoručeno',blocked:'Blokováno / spam',unsubscribed:'Odhlášeno'};
export function renderMailingTracking(target,tracking){
  if(!target||!tracking)return;
  target.innerHTML=`<div class="admin-mailing-kpis">${Object.entries(labels).map(([key,label])=>`<article><span>${label}</span><strong data-delivery-metric="${key}">${Number(tracking.counts?.[key]||0)}</strong></article>`).join('')}</div>
    <p>Unikátní příjemci, nikoli počet událostí. Otevření je orientační (ochrana soukromí / proxy). Odesláno znamená přijetí ke zpracování, ne potvrzené doručení.</p>
    <details><summary>Detail doručení příjemců</summary><p>Zobrazeno nejvýše ${Number(tracking.detailLimit||500)} příjemců.</p>
      ${(tracking.recipients||[]).map(row=>`<article class="admin-mailing-campaign"><p><strong>${escapeHtml(row.email)}</strong> · ${escapeHtml(row.name||'')} · ${escapeHtml(states[row.status]||row.status)}</p><p>Doručeno: ${escapeHtml(row.deliveredAt||'—')} · Otevření: ${escapeHtml(row.openedAt||'—')} · Kliknutí: ${escapeHtml(row.clickedAt||'—')}</p></article>`).join('')||'<p>Zatím bez příjemců.</p>'}</details>`;
}
