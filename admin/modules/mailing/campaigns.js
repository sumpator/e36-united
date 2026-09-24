import {renderListPagination} from '../../lists.js?v=20260924-workspace1';
import { apiRequest } from '../../api.js?v=20260924-merch2';
import { $, escapeHtml, formatDate, numeric, toast } from '../../ui.js?v=20260924-merch2';
import { allowMailingLeave, activeMailingCampaignId, initializeMailingEditor, markMailingEditorSaved, openMailingEditorDraft, resetMailingEditor } from './editor.js?v=20260924-workspace1';
import { initializeMailingDelivery, openMailingDelivery, resetMailingDelivery } from './delivery.js?v=20260924-workspace1';
import { defaultMailingSegment } from './segments.js?v=20260924-merch2';

const statusLabels={draft:'Koncept',prepared:'Připravená',sent:'Odeslaná',archived:'Archiv'};
export let campaignPage=1;
let campaignSequence=0,campaignPagination=null;
let initialized=false,starter=null,campaigns=[],getSegment=()=>defaultMailingSegment,onSaved=()=>{};

function campaignCountLabel(count){return `${count} ${count===1?'koncept':count>1&&count<5?'koncepty':'konceptů'}`}

export function renderMailingCampaigns(payload={}){
  campaigns=Array.isArray(payload.campaigns)?payload.campaigns:[];
  if(payload.pagination)campaignPagination=payload.pagination;
  $('[data-mailing-campaign-count]').textContent=campaignCountLabel(campaignPagination?.total??campaigns.length);
  if(payload.pagination){campaignPage=payload.pagination.page;renderListPagination('campaigns',payload.pagination,page=>loadMailingCampaigns({page}))}
  const target=$('[data-mailing-campaign-list]');
  if(!campaigns.length){target.innerHTML='<div class="admin-empty">Zatím nemáš žádnou kampaň. Začni novým konceptem.</div>';return}
  target.innerHTML=campaigns.map(campaign=>`<article class="admin-mailing-campaign${campaign.id===activeMailingCampaignId()?' is-active':''}"><button data-mailing-campaign-open="${escapeHtml(campaign.id)}" type="button"><div><span class="admin-kicker">${escapeHtml(statusLabels[campaign.status]||campaign.status)}</span><h3>${escapeHtml(campaign.internalName)}</h3><p>${escapeHtml(campaign.subject||'Předmět zatím není vyplněný')}</p></div><dl><div><dt>Bloky</dt><dd>${numeric(campaign.content?.blocks?.length)}</dd></div><div><dt>Příjemci nyní</dt><dd>${numeric(campaign.recipientCount)}</dd></div><div><dt>Aktualizováno</dt><dd>${escapeHtml(formatDate(campaign.updatedAt))}</dd></div></dl></button></article>`).join('');
}

async function editorConfig(){
  if(starter)return starter;
  const payload=await apiRequest('/api/admin/mailing/editor-config');starter=payload.starter;return starter;
}

export async function loadMailingCampaigns({selectId,page=campaignPage}={}){
  const sequence=++campaignSequence;
  const [config,payload]=await Promise.all([editorConfig(),apiRequest('/api/admin/mailing/campaigns?page='+page)]);
  if(sequence!==campaignSequence)return payload;
  renderMailingCampaigns(payload);
  const chosen=selectId&&campaigns.find(campaign=>campaign.id===selectId);
  if(chosen){openMailingEditorDraft(chosen,{campaignId:chosen.id});renderMailingCampaigns({campaigns})}
  return payload;
}

async function saveMailingCampaign(draft){
  const campaignId=activeMailingCampaignId();
  const current=campaigns.find(campaign=>campaign.id===campaignId);
  const body={...draft,segment:current?.segment||getSegment(),status:'draft'};
  const payload=await apiRequest(campaignId?`/api/admin/mailing/campaigns/${encodeURIComponent(campaignId)}`:'/api/admin/mailing/campaigns',{method:campaignId?'PATCH':'POST',body});
  await loadMailingCampaigns({selectId:payload.campaign.id});markMailingEditorSaved();onSaved();toast(campaignId?'Koncept kampaně byl aktualizován.':'Koncept kampaně byl uložen.');
  return payload;
}

function showEditor(open){$('[data-mailing-editor-workspace]').hidden=!open;$('[data-mailing-campaign-overview]').hidden=open;if(open)$('[data-mailing-editor-workspace] input')?.focus();}
async function newDraft(){if(!allowMailingLeave())return;const draft=structuredClone(await editorConfig());for(const block of draft.content?.blocks||[])if(block.text==='V Mailing B jsou odpovědi pouze v náhledu. Bezpečné příjemcovské odkazy a uložení odpovědi přidá Mailing D.')block.text='Vyber odpověď, která je ti nejbližší.';openMailingEditorDraft(draft);showEditor(true);renderMailingCampaigns({campaigns})}

export function initializeMailingCampaigns(options={}){
  if(initialized)return;initialized=true;getSegment=options.getSegment||getSegment;onSaved=options.onSaved||onSaved;
  initializeMailingDelivery({onChange:id=>loadMailingCampaigns({selectId:id})});
  initializeMailingEditor({onSave:saveMailingCampaign,onOpen:openMailingDelivery});
  $('[data-mailing-back]').onclick=()=>{if(allowMailingLeave()){markMailingEditorSaved();showEditor(false);$('[data-mailing-campaign-overview] button')?.focus();}};
  $('[data-mailing-workspace-tabs]').onclick=event=>{const button=event.target.closest('[data-mailing-workspace-tab]');if(!button)return;const name=button.dataset.mailingWorkspaceTab;$('[data-mailing-editor-workspace]').dataset.mobilePane=name;$('[data-mailing-workspace-tabs]').querySelectorAll('button').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));};
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-mailing-campaign-new]')){newDraft().catch(error=>toast(error.message||'Nový koncept se nepodařilo připravit.'));return}
    const open=event.target.closest('[data-mailing-campaign-open]');if(!open)return;
    const campaign=campaigns.find(item=>item.id===open.dataset.mailingCampaignOpen);if(campaign&&allowMailingLeave()){openMailingEditorDraft(campaign,{campaignId:campaign.id});showEditor(true);renderMailingCampaigns({campaigns});$('[data-mailing-editor]').scrollIntoView({behavior:'smooth',block:'start'})}
  });
}

export function resetMailingCampaigns(){campaignSequence++;campaignPage=1;campaignPagination=null;starter=null;campaigns=[];resetMailingEditor();resetMailingDelivery();const list=$('[data-mailing-campaign-list]');if(list)list.innerHTML=''}
