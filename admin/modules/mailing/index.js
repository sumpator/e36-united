import { refreshStoredMailingDelivery } from './delivery.js?v=20261103-mobile1';
import { renderMailingCampaigns, campaignPage } from './campaigns.js?v=20261103-mobile1';
import { apiRequest } from '../../api.js?v=20260930-arrivals2';
import { adminState } from '../../state.js?v=20260930-arrivals2';
import { $, $$, numeric, toast } from '../../ui.js?v=20260924-merch2';
import {loadMailingContacts,resetMailingContacts,setMailingContactSelection,getMailingContactSelection,eligibilityReason} from './contacts.js?v=20261102-mailing2';
import { initializeMailingCampaigns, loadMailingCampaigns, resetMailingCampaigns } from './campaigns.js?v=20261103-mobile1';
import { defaultMailingSegment,openMailingSelection,resetMailingSelection } from './segments.js?v=20261102-mailing2';
import {initializeTransactionalEmails,loadTransactionalEmails,resetTransactionalEmails} from './transactional.js?v=20261102-mailing2';

let initialized=false,overviewLoaded=false,overviewPromise=null,lastSegment=defaultMailingSegment;

function renderMailingOverview(payload={}){
  const overview=payload.overview||{};
  for(const [key,value] of Object.entries({total:overview.totalContacts,eligible:overview.eligible,unknown:overview.unknownConsent,suppressed:overview.unsubscribedOrUndeliverable,drafts:overview.campaignDrafts,prepared:overview.campaignPrepared})){
    const node=$(`[data-mailing-kpi="${key}"]`);if(node)node.textContent=numeric(value);
  }
  const reasons=$('[data-mailing-overview-reasons]');if(reasons)reasons.textContent=overview.eligible===0?'Nikomu nelze nyní poslat kampaň. '+Object.entries(overview.reasons||{}).map(([key,n])=>eligibilityReason(key)+': '+n).join(' · ')+'. Člen může dobrovolně zvolit odběr v nastavení účtu. Členství samo souhlas nezakládá.':'';
  const transport=$('[data-mailing-overview-transport]');if(transport)transport.textContent='Automatické odesílání: '+(payload.transport?.enabled?'zapnuté':'vypnuté')+' · Čeká: '+numeric(payload.automatic?.queued)+' · Chyby: '+numeric(payload.automatic?.failed)+' · Nejasné: '+numeric(payload.automatic?.uncertain);
  const recent=$('[data-mailing-recent]');if(recent){recent.replaceChildren();for(const c of payload.recentCampaigns||[]){const p=document.createElement('p');p.textContent=c.internal_name+' · '+({draft:'Koncept',prepared:'Připravená',sent:'Odeslaná',archived:'Archiv'}[c.status]||c.status);recent.append(p)}}
}

async function loadMailingOverview({force=false}={}){
  if(!adminState.currentUser||overviewLoaded&&!force)return;
  if(overviewPromise&&!force)return overviewPromise;
  overviewPromise=apiRequest('/api/admin/mailing/overview').then(payload=>{renderMailingOverview(payload);overviewLoaded=true;return payload}).finally(()=>{overviewPromise=null});
  return overviewPromise;
}

async function showMailingTab(name){
  const tab=['overview','campaigns','contacts','transactional'].includes(name)?name:'overview';
  $$('[data-mailing-tab]').forEach(button=>{const active=button.dataset.mailingTab===tab;button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active))});
  $$('[data-mailing-area]').forEach(area=>area.hidden=area.dataset.mailingArea!==tab);
  if(tab==='overview')await loadMailingOverview();
  if(tab==='contacts')await loadMailingContacts();
  if(tab==='campaigns')await loadMailingCampaigns();
  if(tab==='transactional')await loadTransactionalEmails();
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
 else if(tab==='transactional')await loadTransactionalEmails({signal,isCurrent});
}
export function resetMailingCenter(){overviewLoaded=false;overviewPromise=null;lastSegment=defaultMailingSegment;$('[data-mailing-contact-list]').innerHTML='';resetMailingContacts();resetMailingSelection();resetMailingCampaigns();resetTransactionalEmails()}

export function initializeMailingCenter(){
  if(initialized)return;initialized=true;
  initializeTransactionalEmails();
  initializeMailingCampaigns({getSegment:()=>lastSegment,onSaved:()=>{overviewLoaded=false}});
  window.addEventListener('admin:viewchange',event=>{if(event.detail?.view==='mailing')safely(()=>showMailingTab('campaigns'),'Mailing přehled se nepodařilo načíst.')});
  document.addEventListener('click',event=>{
    const check=event.target.closest('[data-mailing-provider-check]');if(check){check.disabled=true;safely(async()=>{try{const {provider:p}=await apiRequest('/api/admin/mailing/provider-status');$('[data-mailing-provider-overview]').textContent=(p.ready?'SMTP2GO připraveno':'SMTP2GO není připraveno')+' · Měsíčně zbývá: '+(p.monthlyRemaining??'neověřeno')+' · Aplikační limit: '+(p.dailyLimit??200)+'/den'}finally{check.disabled=false}},'Stav poskytovatele není dostupný.');return}
if(event.target.closest('[data-contacts-selection]'))openMailingSelection({segment:getMailingContactSelection()||defaultMailingSegment,trigger:event.target.closest('button'),onApply:value=>{lastSegment=value;setMailingContactSelection(value);const form=$('[data-mailing-contact-form]');form.reset();form.elements.scope.value='all';safely(()=>loadMailingContacts(undefined,{page:1}),'Kontakty se nepodařilo načíst.')}}).catch(e=>toast(e.message));const tab=event.target.closest('[data-mailing-tab]');if(tab)safely(()=>showMailingTab(tab.dataset.mailingTab),'Mailing data se nepodařilo načíst.')});
  document.addEventListener('submit',event=>{
    const contacts=event.target.closest('[data-mailing-contact-form]');if(contacts){event.preventDefault();safely(()=>loadMailingContacts(contacts,{page:1}),'Kontakty se nepodařilo načíst.');return}
  });
}
