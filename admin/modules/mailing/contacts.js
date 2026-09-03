import { apiRequest } from '../../api.js?v=20260903-mailing-b';
import { $, escapeHtml, numeric } from '../../ui.js?v=20260903-phase5';

const eligibilityLabels={eligible:'Způsobilý',ineligible:'Bez souhlasu',review_required:'Nutná kontrola',suppressed:'Potlačený'};
const suppressionLabels={eligible:'Bez potlačení',unsubscribed:'Odhlášený',hard_bounce:'Hard bounce',blocked:'Blokovaný',manually_suppressed:'Ručně potlačený'};
const contactsLabel=count=>`${count} ${count===1?'kontakt':count>1&&count<5?'kontakty':'kontaktů'}`;

function sourceLabel(contact){
  const labels=(contact.sources||[]).map(source=>{
    if(source.type==='current_member')return 'Member';
    if(source.type==='event_registration')return `Registrace${source.year?` ${source.year}`:''}`;
    if(source.type==='historical_import')return `Historie${source.year?` ${source.year}`:''}`;
    return 'Ručně';
  });
  return [...new Set(labels)].join(' · ')||'Bez zdroje';
}

function contactRow(contact){
  const identity=contact.nickname||contact.name||contact.email;
  const kind=contact.memberId?'Member':contact.legacyOnly?'Historický':'Kontakt';
  return `<tr><td><strong>${escapeHtml(identity)}</strong><small>${escapeHtml(contact.name&&contact.nickname?contact.name:'')}</small></td><td>${escapeHtml(contact.email)}</td><td><i class="admin-badge admin-mailing-kind">${escapeHtml(kind)}</i><small>${escapeHtml(sourceLabel(contact))}</small></td><td><i class="admin-badge admin-mailing-eligibility--${escapeHtml(contact.eligibility?.status||'review_required')}">${escapeHtml(eligibilityLabels[contact.eligibility?.status]||contact.eligibility?.status||'—')}</i><small>${escapeHtml(suppressionLabels[contact.suppressionStatus]||contact.suppressionStatus||'—')}</small></td><td>${numeric(contact.participationCount)}× United</td></tr>`;
}

export function renderMailingContacts(payload={}){
  const contacts=Array.isArray(payload.contacts)?payload.contacts:[];
  const pagination=payload.pagination||{};
  $('[data-mailing-contact-count]').textContent=contactsLabel(numeric(pagination.total));
  const target=$('[data-mailing-contact-list]');
  if(!contacts.length){target.innerHTML='<div class="admin-empty">Tomuto filtru neodpovídají žádné kontakty.</div>';return}
  target.innerHTML=`<div class="admin-table-scroll"><table class="admin-data-table admin-mailing-table"><thead><tr><th>Kontakt</th><th>E-mail</th><th>Vztah / zdroj</th><th>Způsobilost</th><th>Účast</th></tr></thead><tbody>${contacts.map(contactRow).join('')}</tbody></table></div>`;
}

export async function loadMailingContacts(form=$('[data-mailing-contact-form]')){
  const data=new FormData(form),params=new URLSearchParams({scope:String(data.get('scope')||'relevant'),eligibility:String(data.get('eligibility')||'all'),q:String(data.get('q')||''),pageSize:'50'});
  const payload=await apiRequest(`/api/admin/mailing/contacts?${params}`);
  renderMailingContacts(payload);
  return payload;
}
