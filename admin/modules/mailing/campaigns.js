import { apiRequest } from '../../api.js?v=20260903-mailing-a';
import { $, escapeHtml, formatDate, numeric } from '../../ui.js?v=20260903-phase5';
import { defaultMailingSegment } from './segments.js?v=20260903-mailing-a';

const statusLabels={draft:'Koncept',prepared:'Připravená',sent:'Odeslaná',archived:'Archiv'};

export function renderMailingCampaigns(payload={}){
  const campaigns=Array.isArray(payload.campaigns)?payload.campaigns:[];
  const target=$('[data-mailing-campaign-list]');
  if(!campaigns.length){target.innerHTML='<div class="admin-empty">Zatím neexistuje žádný koncept kampaně.</div>';return}
  target.innerHTML=campaigns.map(campaign=>`<article class="admin-mailing-campaign"><div><span class="admin-kicker">${escapeHtml(statusLabels[campaign.status]||campaign.status)}</span><h3>${escapeHtml(campaign.internalName)}</h3><p>${escapeHtml(campaign.subject||'Předmět zatím není vyplněný')}</p></div><dl><div><dt>Příjemci při uložení</dt><dd>${numeric(campaign.recipientCount)}</dd></div><div><dt>Aktualizováno</dt><dd>${escapeHtml(formatDate(campaign.updatedAt))}</dd></div></dl></article>`).join('');
}

export async function loadMailingCampaigns(){const payload=await apiRequest('/api/admin/mailing/campaigns');renderMailingCampaigns(payload);return payload}

export async function createMailingCampaign(form,segment=defaultMailingSegment){
  const data=new FormData(form);
  const payload=await apiRequest('/api/admin/mailing/campaigns',{method:'POST',body:{internalName:String(data.get('internalName')||''),subject:String(data.get('subject')||''),preheader:String(data.get('preheader')||''),segment,status:'draft'}});
  form.reset();
  await loadMailingCampaigns();
  return payload;
}
