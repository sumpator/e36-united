import {renderListPagination} from '../../lists.js?v=20260909-admin-command';
import { apiRequest } from '../../api.js?v=20260909-admin-command';
import { $, escapeHtml, formatDate, numeric, toast } from '../../ui.js?v=20260909-admin-command';
import { activeMailingCampaignId, initializeMailingEditor, markMailingEditorSaved, openMailingEditorDraft, resetMailingEditor } from './editor.js?v=20260909-admin-command';
import { initializeMailingDelivery, openMailingDelivery, resetMailingDelivery } from './delivery.js?v=20260909-admin-command';
import { defaultMailingSegment } from './segments.js?v=20260909-admin-command';

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
  if(!campaigns.length){target.innerHTML='<div class="admin-empty">Zatím neexistuje žádný koncept kampaně. Editor výše je připravený s E36 starterem.</div>';return}
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
  const chosen=campaigns.find(campaign=>campaign.id===(selectId||activeMailingCampaignId()));
  if(chosen){openMailingEditorDraft(chosen,{campaignId:chosen.id});renderMailingCampaigns({campaigns})}
  else if(!activeMailingCampaignId())openMailingEditorDraft(config);
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

async function newDraft(){openMailingEditorDraft(await editorConfig());renderMailingCampaigns({campaigns})}

export function initializeMailingCampaigns(options={}){
  if(initialized)return;initialized=true;getSegment=options.getSegment||getSegment;onSaved=options.onSaved||onSaved;
  initializeMailingDelivery({onChange:id=>loadMailingCampaigns({selectId:id})});
  initializeMailingEditor({onSave:saveMailingCampaign,onOpen:openMailingDelivery});
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-mailing-campaign-new]')){newDraft().catch(error=>toast(error.message||'Nový koncept se nepodařilo připravit.'));return}
    const open=event.target.closest('[data-mailing-campaign-open]');if(!open)return;
    const campaign=campaigns.find(item=>item.id===open.dataset.mailingCampaignOpen);if(campaign){openMailingEditorDraft(campaign,{campaignId:campaign.id});renderMailingCampaigns({campaigns});$('[data-mailing-editor]').scrollIntoView({behavior:'smooth',block:'start'})}
  });
}

export function resetMailingCampaigns(){campaignSequence++;campaignPage=1;campaignPagination=null;starter=null;campaigns=[];resetMailingEditor();resetMailingDelivery();const list=$('[data-mailing-campaign-list]');if(list)list.innerHTML=''}
