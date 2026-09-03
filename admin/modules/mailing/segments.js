import { apiRequest } from '../../api.js?v=20260903-mailing-a';
import { $, escapeHtml, numeric } from '../../ui.js?v=20260903-phase5';

export const defaultMailingSegment=Object.freeze({match:'all',rules:[{type:'mailing_eligible'}],exclusions:[]});
const recipientsLabel=count=>`${count} ${count===1?'příjemce':count>1&&count<5?'příjemci':'příjemců'}`;

export function mailingSegmentFromForm(form){
  const data=new FormData(form),rules=data.getAll('rule').map(type=>({type:String(type)}));
  if(data.get('historicalYearEnabled'))rules.push({type:'historical_event_year',value:Number(data.get('historicalYear'))});
  if(data.get('tagEnabled'))rules.push({type:'tag',value:String(data.get('tag')||'')});
  const exclusion=String(data.get('exclusion')||'');
  return {match:data.get('match')==='any'?'any':'all',rules:rules.length?rules:[{type:'mailing_eligible'}],exclusions:exclusion?[{type:exclusion}]:[]};
}

function sourceSummary(contact){
  const years=(contact.eventYears||[]).join(', ');
  return contact.memberId?`Member${years?` · United ${years}`:''}`:`Historický${years?` · United ${years}`:''}`;
}

export function renderMailingSegmentPreview(payload={}){
  const recipients=Array.isArray(payload.recipients)?payload.recipients:[];
  $('[data-mailing-recipient-count]').textContent=recipientsLabel(numeric(payload.count));
  const target=$('[data-mailing-recipient-list]');
  if(!recipients.length){target.innerHTML='<div class="admin-empty">Segment nyní neobsahuje žádné příjemce.</div>';return}
  target.innerHTML=`<div class="admin-table-scroll"><table class="admin-data-table admin-mailing-table"><thead><tr><th>Příjemce</th><th>E-mail</th><th>Vztah</th><th>Stav</th></tr></thead><tbody>${recipients.map(contact=>`<tr><td><strong>${escapeHtml(contact.nickname||contact.name||contact.email)}</strong></td><td>${escapeHtml(contact.email)}</td><td>${escapeHtml(sourceSummary(contact))}</td><td><i class="admin-badge admin-mailing-eligibility--${escapeHtml(contact.eligibility?.status||'review_required')}">${escapeHtml(contact.eligibility?.status||'review_required')}</i></td></tr>`).join('')}</tbody></table></div>`;
}

export async function previewMailingSegment(form){
  const segment=mailingSegmentFromForm(form);
  const payload=await apiRequest('/api/admin/mailing/segments/preview',{method:'POST',body:{segment}});
  renderMailingSegmentPreview(payload);
  return {segment,payload};
}
