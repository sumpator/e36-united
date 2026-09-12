import { escapeHtml as esc } from './ui.js?v=20260912-reservation-detail-ux-r1';
import { showValue } from './dashboard-data.js?v=20260912-reservation-detail-ux-r1';
import { canonicalMemberLink } from './member-detail.js?v=20260912-reservation-detail-ux-r1';
import { commandIcon } from './command-icons.js?v=20260912-reservation-detail-ux-r1';
import { formatDate } from './ui.js?v=20260912-reservation-detail-ux-r1';
export const metricInfo = text => `<details class="command-info"><summary>O údajích</summary><p>${esc(text)}</p></details>`;
export function recentPaymentLabel(row) {
  const due=row.amountDueCzk, paid=row.amountPaidCzk;
  if(Number.isFinite(due)&&Number.isFinite(paid))return paid>due?'Přeplatek':due===0?'Bez platby':paid>=due?'Uhrazeno':paid>0?'Částečně uhrazeno':'Čeká na úhradu';
  return ({unpaid:'Evidováno jako neuhrazené',paid:'Evidováno jako uhrazené',underpaid:'Evidována částečná úhrada',overpaid:'Evidován přeplatek',not_required:'Bez platby',refunded:'Vráceno'})[row.paymentStatus]||'Nelze ověřit';
}
export const reservationCount = v => Number.isFinite(v)?`${v.toLocaleString('cs-CZ')} ${v===1?'rezervace':v>1&&v<5?'rezervace':'rezervací'}`:'—';
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
    p = o?.payments,
    approval = state.summary?.attention?.reservationApprovals;
  if (id === 'approvals') return `<div class="command-approvals">${[['reservationApprovals','Rezervace',approval?.total,'čeká na rozhodnutí',approval?`Nové ${number(approval.newReservations)} · změny ${number(approval.changes)} · zrušení ${number(approval.cancellations)}`:'Vybraný ročník','reservations'],['photos','Fotky',o?.gallery?.pending,'ke schválení','Fotky do galerie · všechny ročníky','photos'],['history','Historie United / S&S',o?.history?.pending,'ke kontrole','Všechny ročníky','history']].map(([target,label,value,action,scope,icon])=>`<section><span class="command-card-icon">${commandIcon(icon)}</span><h4>${label}</h4><strong>${number(value)}</strong><span class="command-action-caption">${action}</span><small>${scope}</small>${button(target,'Zobrazit →')}</section>`).join('')}</div><p data-command-clear role="status"></p>`;
  if (id === 'reservation-summary') return `<div class="command-stats"><div><strong data-kpi-reservations>${number(o?.reservations)}</strong><small>aktivních rezervací</small></div><div><strong data-kpi-people>${number(o?.people)}</strong><small>plánovaných osob</small></div></div>${(o?.accommodation?.options||[]).map(v=>`<div class="command-capacity"><span>${esc(v.name)}</span><b>${number(v.confirmedUnits)} / ${v.inventoryMode==='unlimited'?'bez limitu':number(v.unitsTotal)}</b>${v.inventoryMode!=='unlimited'&&v.unitsTotal>0?`<meter min="0" max="${v.unitsTotal}" value="${v.confirmedUnits}">${number(v.confirmedUnits)}</meter>`:''}<small>Čeká na potvrzení: ${number(v.pendingUnits)} jednotek</small></div>`).join('')}<p class="command-no-accommodation">Bez ubytování: ${reservationCount(o?.accommodation?.none)}</p>${button('accommodation','Detail ubytování →')}${metricInfo('Aktivní rezervace zahrnují čekající a schválené. Kapacita ukazuje potvrzené ubytovací jednotky; čekající poptávka je uvedena zvlášť. Ubytování bez limitu nemá procento obsazenosti.')}`;
  if (id === 'payment-summary') return `<div class="command-payments">${[['recorded','Evidovaně uhrazeno',p?.amountPaidCzk,'Všechny evidované platby','green'],['outstanding','Zbývá uhradit',p?.amountRemainingCzk,'Aktivní rezervace','amber'],['overdue','Po splatnosti',p?.overdue,'Vybraný ročník','red'],['overpaid','Přeplatky',p?.overpaymentCzk,reservationCount(p?.overpaid),'blue']].map(([target,label,value,scope,color])=>`<section data-money-kind="${target}" class="command-money ${!Number.isFinite(value)?'unknown':value===0?'neutral':color}"><small>${label}</small><strong ${target==='recorded'?'data-kpi-recorded':''}>${target==='overdue'?reservationCount(value):money(value)}</strong><small>${scope}</small>${button(target,'Zobrazit →')}</section>`).join('')}</div>${metricInfo('Vybraný ročník. Evidované úhrady a přeplatky zahrnují všechny stavy rezervací; zbývající částky aktivní závazky. Po splatnosti je počet rezervací, ne částka. Schválení rezervace nepotvrzuje její zaplacení.')}`;
  if (id === 'recent') {
    const data = state.dashboardAnalytics?.recent;
    if (!Array.isArray(data)) return '<p>Poslední rezervace nelze ověřit. Zkus obnovit data později.</p>';
    return `<p class="dashboard-definition">Nejnovější rezervace vybraného ročníku.</p>${data.length ? `<div class="dashboard-table-scroll"><table><thead><tr><th>Vytvořeno</th><th>Člen</th><th>Auto</th><th>Ubytování</th><th>Osoby</th><th>Platba</th><th>Rezervace</th><th>Detail</th></tr></thead><tbody>${data.map(r => `<tr><td>${esc(formatDate(r.createdAt))}</td><td>${canonicalMemberLink(r.memberId, r.memberName)}</td><td>${esc(r.carModel || '—')}</td><td>${esc(r.accommodation || 'Bez ubytování')}</td><td>${number(r.crew)}</td><td>${esc(recentPaymentLabel(r))}</td><td><span class="admin-badge admin-badge--${esc(r.status)}">${esc(labels[r.status] || r.status)}</span></td><td><button type="button" data-command-reservation="${esc(r.id)}">Otevřít →</button></td></tr>`).join('')}</tbody></table></div>` : '<p>Žádné uložené rezervace v tomto ročníku.</p>'}${button('reservations', 'Zobrazit všechny rezervace →')}${metricInfo('Pět posledních vytvořených rezervací, včetně zrušených. Data jsou zobrazena v místním čase. Platba vychází z evidované částky a předpisu; u staršího přehledu je označen pouze uložený stav.')}`;
  }
  if (id === 'mailing') {
    const m = state.dashboardMailing?.overview;
    return m ? `<p>Kontakty a připravované kampaně.</p><div class="command-stats"><div><strong>${number(m.totalContacts)}</strong><small>kontaktů</small></div><div><strong>${number(m.campaignDrafts)}</strong><small>konceptů</small></div></div>` : '<p>Uložený Mailing přehled není dostupný.</p>';
  }
  return '';
}
