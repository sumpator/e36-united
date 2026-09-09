import { refreshStoredMailingDelivery } from './delivery.js?v=20260909-admin-command';
import { renderMailingCampaigns, campaignPage } from './campaigns.js?v=20260909-admin-command';
import { apiRequest } from '../../api.js?v=20260909-admin-command';
import { adminState } from '../../state.js?v=20260909-admin-command';
import { $, $$, numeric, toast } from '../../ui.js?v=20260909-admin-command';
import { loadMailingContacts } from './contacts.js?v=20260909-admin-command';
import { initializeMailingCampaigns, loadMailingCampaigns, resetMailingCampaigns } from './campaigns.js?v=20260909-admin-command';
import { defaultMailingSegment, previewMailingSegment } from './segments.js?v=20260909-admin-command';

let initialized=false,overviewLoaded=false,overviewPromise=null,lastSegment=defaultMailingSegment;

function renderMailingOverview(payload={}){
  const overview=payload.overview||{};
  for(const [key,value] of Object.entries({total:overview.totalContacts,members:overview.currentMembers,historical:overview.historicalOnly,eligible:overview.eligible,suppressed:overview.suppressed,drafts:overview.campaignDrafts})){
    const node=$(`[data-mailing-kpi="${key}"]`);if(node)node.textContent=numeric(value);
  }
}

async function loadMailingOverview({force=false}={}){
  if(!adminState.currentUser||overviewLoaded&&!force)return;
  if(overviewPromise&&!force)return overviewPromise;
  overviewPromise=apiRequest('/api/admin/mailing/overview').then(payload=>{renderMailingOverview(payload);overviewLoaded=true;return payload}).finally(()=>{overviewPromise=null});
  return overviewPromise;
}

async function showMailingTab(name){
  const tab=['overview','contacts','segments','campaigns'].includes(name)?name:'overview';
  $$('[data-mailing-tab]').forEach(button=>{const active=button.dataset.mailingTab===tab;button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active))});
  $$('[data-mailing-area]').forEach(area=>area.hidden=area.dataset.mailingArea!==tab);
  if(tab==='overview')await loadMailingOverview();
  if(tab==='contacts')await loadMailingContacts();
  if(tab==='campaigns')await loadMailingCampaigns();
}

async function safely(action,message){try{await action()}catch(error){toast(error.message||message)}}

export async function refreshMailingCenter({signal,isCurrent}){
 const tab=$('[data-mailing-tab].is-active')?.dataset.mailingTab||'overview';
 if(tab==='overview'){
   const payload=await apiRequest('/api/admin/mailing/overview',{signal});if(isCurrent())renderMailingOverview(payload);
 }else if(tab==='campaigns'){
   const payload=await apiRequest('/api/admin/mailing/campaigns?page='+campaignPage,{signal});
   if(!isCurrent())return;renderMailingCampaigns(payload);await refreshStoredMailingDelivery({signal,isCurrent});
 }else if(tab==='contacts')await loadMailingContacts(undefined,{signal,isCurrent});
}
export function resetMailingCenter(){overviewLoaded=false;overviewPromise=null;lastSegment=defaultMailingSegment;$('[data-mailing-contact-list]').innerHTML='';$('[data-mailing-recipient-list]').innerHTML='';resetMailingCampaigns()}

export function initializeMailingCenter(){
  if(initialized)return;initialized=true;
  initializeMailingCampaigns({getSegment:()=>lastSegment,onSaved:()=>{overviewLoaded=false}});
  window.addEventListener('admin:viewchange',event=>{if(event.detail?.view==='mailing')safely(()=>showMailingTab('overview'),'Mailing přehled se nepodařilo načíst.')});
  document.addEventListener('click',event=>{const tab=event.target.closest('[data-mailing-tab]');if(tab)safely(()=>showMailingTab(tab.dataset.mailingTab),'Mailing data se nepodařilo načíst.')});
  document.addEventListener('submit',event=>{
    const contacts=event.target.closest('[data-mailing-contact-form]');if(contacts){event.preventDefault();safely(()=>loadMailingContacts(contacts),'Kontakty se nepodařilo načíst.');return}
    const segments=event.target.closest('[data-mailing-segment-form]');if(segments){event.preventDefault();safely(async()=>{const result=await previewMailingSegment(segments);lastSegment=result.segment},'Segment se nepodařilo vyhodnotit.');return}
  });
}
