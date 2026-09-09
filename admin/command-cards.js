import { escapeHtml as esc } from './ui.js?v=20260909-admin-command';
import { showValue } from './dashboard-data.js';
import { canonicalMemberLink } from './member-detail.js?v=20260909-admin-command';
const number = v => esc(showValue(v)),
  money = v => esc(showValue(v, 'Kč'));
const labels = {
  pending: 'Čeká na schválení',
  approved: 'Schváleno',
  rejected: 'Zamítnuto',
  cancelled: 'Zrušeno',
  draft: 'Koncept'
};
export function commandCard(id, state, button, chartMarkup) {
  const o = state.summary?.overview,
    p = o?.payments;
  if (id === 'approvals') return `<p class="dashboard-definition">Přehled položek čekajících na kontrolu a schválení.</p><div class="command-approvals">${[['pending', 'Rezervace', o?.statuses?.pending, 'Vybraný ročník · ke schválení', '▣'], ['photos', 'Fotky', o?.gallery?.pending, 'Globální komunitní galerie · bez Garage', '▧'], ['history', 'Historie United / S&S', o?.history?.pending, 'Globálně · unikátní žádosti, ne důkazní fotky', '◷']].map(([target, label, value, scope, icon]) => `<section><span class="command-card-icon" aria-hidden="true">${icon}</span><h4>${label}</h4><strong>${number(value)}</strong><small>${scope}</small>${button(target, 'Otevřít frontu →')}</section>`).join('')}</div><p data-command-clear role="status"></p>`;
  if (id === 'reservation-summary') return `<div class="command-stats"><div><strong data-kpi-reservations>${number(o?.reservations)}</strong><small>aktivních rezervací</small></div><div><strong data-kpi-people>${number(o?.people)}</strong><small>plánovaných osob</small></div></div><p class="dashboard-definition">Pending + approved. Potvrzené fyzické jednotky / kapacita; čekající poptávka zvlášť.</p>${(o?.accommodation?.options || []).map(v => `<div class="command-capacity"><span>${esc(v.name)}</span><b>${number(v.confirmedUnits)} / ${v.inventoryMode === 'unlimited' ? 'bez limitu' : number(v.unitsTotal)}</b>${v.inventoryMode !== 'unlimited' && v.unitsTotal > 0 ? `<meter min="0" max="${v.unitsTotal}" value="${v.confirmedUnits}">${number(v.confirmedUnits)}</meter>` : ''}<small>Čekající: ${number(v.pendingUnits)} jednotek</small></div>`).join('')}<p class="command-no-accommodation">Bez ubytování: ${number(o?.accommodation?.none)} rezervací</p>${button('accommodation', 'Detail ubytování →')}`;
  if (id === 'payment-summary') return `<p class="dashboard-definition">Vybraný ročník. Schválení rezervace neznamená zaplacení.</p><div class="command-payments">${[['recorded', 'Evidovaně uhrazeno', p?.amountPaidCzk, 'Všechny stavy', 'green'], ['outstanding', 'Zbývá uhradit', p?.amountRemainingCzk, 'Aktivní závazky', 'amber'], ['overdue', 'Po splatnosti', p?.overdue, 'Počet případů, nikoli Kč', 'red'], ['overpaid', 'Přeplatky', p?.overpaymentCzk, 'Všechny stavy', 'blue']].map(([target, label, value, scope, color]) => `<section class="command-money ${color}"><small>${label}</small><strong ${target === 'recorded' ? 'data-kpi-recorded' : ''}>${target === 'overdue' ? number(value) : money(value)}</strong><small>${scope}</small>${button(target, 'Zobrazit →')}</section>`).join('')}</div>`;
  if (id === 'recent') {
    const data = state.dashboardAnalytics?.recent;
    if (!Array.isArray(data)) return '<p>Poslední rezervace nelze ověřit. Server neposkytuje tento přesně řazený přehled; je nutná kompatibilní verze API.</p>';
    return `<p class="dashboard-definition">Pět nejnověji vytvořených rezervací vybraného ročníku · všechny stavy · created_at / UTC.</p>${data.length ? `<div class="dashboard-table-scroll"><table><thead><tr><th>Vytvořeno (UTC)</th><th>Člen</th><th>Auto</th><th>Ubytování</th><th>Osoby</th><th>Uložený platební stav</th><th>Rezervace</th><th>Detail</th></tr></thead><tbody>${data.map(r => `<tr><td>${esc(r.createdAt || '—')}</td><td>${canonicalMemberLink(r.memberId, r.memberName)}</td><td>${esc(r.carModel || '—')}</td><td>${esc(r.accommodation || 'Bez ubytování')}</td><td>${number(r.crew)}</td><td>${esc(r.paymentStatus || '—')}</td><td><span class="admin-badge admin-badge--${esc(r.status)}">${esc(labels[r.status] || r.status)}</span></td><td><button type="button" data-command-reservation="${esc(r.id)}">Otevřít →</button></td></tr>`).join('')}</tbody></table></div>` : '<p>Žádné uložené rezervace v tomto ročníku.</p>'}${button('reservations', 'Zobrazit všechny rezervace →')}`;
  }
  if (id === 'mailing') {
    const m = state.dashboardMailing?.overview;
    return m ? `<p>Globální uložené kontakty a koncepty. Bez kontroly providera nebo odesílání.</p><div class="command-stats"><div><strong>${number(m.totalContacts)}</strong><small>kontaktů</small></div><div><strong>${number(m.campaignDrafts)}</strong><small>konceptů</small></div></div>` : '<p>Uložený Mailing přehled není dostupný.</p>';
  }
  return '';
}
