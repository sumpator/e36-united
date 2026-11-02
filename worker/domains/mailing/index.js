import { readJsonObject } from "../../http/request.js";
import {uploadMailingImage} from './media.js';
import { routeMailingDelivery } from './delivery-routes.js';
import {routeTransactionalEmails} from './transactional-routes.js';
import { json } from "../../http/responses.js";
import { filterMailingContacts, loadMailingContacts } from "./contacts.js";
import { createMailingCampaign, listMailingCampaigns, updateMailingCampaign } from "./campaigns.js";
import { MailingSegmentDefinitionError, previewMailingSegment } from "./segments.js";
import {MAILING_FIELDS} from './segment-fields.js';
import {transactionalTransportState} from './transactional.js';
import {
  MAILING_BLOCK_TYPES,
  MailingContentDefinitionError,
  createMailingStarterDraft,
  renderMailingTemplate,
} from "./template.js";

function pageNumber(value, fallback = 1) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function errorResponse(error, origin) {
  if (error instanceof MailingSegmentDefinitionError || error instanceof MailingContentDefinitionError) {
    const code = error instanceof MailingSegmentDefinitionError ? "invalid_segment" : "invalid_mailing_content";
    return json({ ok: false, error: code, message: error.message }, 400, origin);
  }
  const known = {
    campaign_name_required: "Interní název kampaně je povinný.",
    invalid_campaign_status: "Neplatný stav kampaně.",
    invalid_campaign_template: "Neplatná nebo neodpovídající verze mailingové šablony.",
    mailing_delivery_not_available: "Odeslání vyžaduje přípravu a samostatné potvrzení, nikoli úpravu stavu konceptu.",
    sent_campaign_immutable: "Odeslanou kampaň nelze měnit.",
    prepared_campaign_immutable: "Připravenou kampaň nejdřív vrať do konceptu.",
    campaign_busy: "Operace kampaně běží nebo vyžaduje kontrolu poskytovatele.",
  };
  if (known[error?.message]) return json({ ok: false, error: error.message, message: known[error.message] }, 400, origin);
  throw error;
}

async function mailingOverview(env, origin) {
  const [contacts, campaigns,prepared,recent,automatic] = await Promise.all([
    loadMailingContacts(env),
    env.DB.prepare("SELECT COUNT(*) AS count FROM mailing_campaigns WHERE status = 'draft'").first(),
    env.DB.prepare("SELECT COUNT(*) count FROM mailing_campaigns WHERE status='prepared'").first(),
    env.DB.prepare('SELECT id,internal_name,status,sent_at,recipient_count FROM mailing_campaigns ORDER BY updated_at DESC LIMIT 5').all(),
    env.DB.prepare('SELECT status,COUNT(*) n FROM email_outbox WHERE tx_version=1 GROUP BY status').all(),
  ]);
  return json({
    ok: true,
    overview: {
      totalContacts: contacts.length,
      currentMembers: contacts.filter(contact => contact.memberId).length,
      historicalOnly: contacts.filter(contact => contact.legacyOnly).length,
      eligible: contacts.filter(contact => contact.eligibility.status === "eligible").length,
      suppressed: contacts.filter(contact => contact.eligibility.status === "suppressed").length,
      reviewRequired: contacts.filter(contact => contact.eligibility.status === "review_required").length,
      campaignDrafts: Number(campaigns?.count || 0),
      campaignPrepared:Number(prepared?.count||0),
      unknownConsent:contacts.filter(c=>c.mailingConsent.status==='unknown').length,
      refusedConsent:contacts.filter(c=>c.mailingConsent.status==='no').length,
      unsubscribedOrUndeliverable:contacts.filter(c=>c.suppressionStatus==='unsubscribed'||['hard_bounce','blocked'].includes(c.deliverabilityStatus)).length,
      unsubscribed:contacts.filter(c=>c.suppressionStatus==='unsubscribed').length,
      undeliverable:contacts.filter(c=>['hard_bounce','blocked'].includes(c.deliverabilityStatus)).length,
      reasons:eligibilityReasons(contacts.filter(c=>c.eligibility.status!=='eligible')),
    },
    recentCampaigns:recent.results,automatic:Object.fromEntries(automatic.results.map(r=>[r.status,r.n])),transport:await transactionalTransportState(env),
  }, 200, origin);
}

async function mailingContacts(env, url, origin,segment) {
  const page = pageNumber(url.searchParams.get("page"));
  const pageSize = Math.min(pageNumber(url.searchParams.get("pageSize"), 50), 100);
  const scope = ["relevant", "current", "historical", "all"].includes(url.searchParams.get("scope")) ? url.searchParams.get("scope") : "relevant";
  const eligibility = ["all", "eligible", "ineligible", "review_required", "suppressed"].includes(url.searchParams.get("eligibility")) ? url.searchParams.get("eligibility") : "all";
  const selection=segment?await previewMailingSegment(env,segment):null;
  const filtered = filterMailingContacts(selection?.recipients||await loadMailingContacts(env), {
    query: url.searchParams.get("q") || "",
    scope,
    eligibility,
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  return json({
    ok: true,
    contacts: filtered.slice((safePage - 1) * pageSize, safePage * pageSize).map(publicContact),
    pagination: { page: safePage, pageSize, total: filtered.length, totalPages },
    filters: { scope, eligibility, q: url.searchParams.get("q") || "" },
  }, 200, origin);
}

async function mailingSegmentPreview(request, env, origin) {
  const parsed = await readJsonObject(request, origin);
  if (parsed.response) return parsed.response;
  try {
    const { definition, recipients,excluded=[] } = await previewMailingSegment(env, parsed.body.segment || parsed.body);
    const eligible=recipients.filter(c=>c.eligibility.status==='eligible'),ineligible=recipients.filter(c=>c.eligibility.status!=='eligible'),show=parsed.body.show||'matched',query=String(parsed.body.q||'').slice(0,120),pageSize=25;
    const list=filterMailingContacts(show==='eligible'?eligible:show==='excluded'?[...excluded.map(c=>({...c,selectionExclusion:true})),...ineligible]:recipients,{query,scope:'all'}),totalPages=Math.max(1,Math.ceil(list.length/pageSize)),page=Math.min(totalPages,pageNumber(parsed.body.page));
    return json({ok:true,definition,count:recipients.length,summary:{matching:recipients.length,eligible:eligible.length,excluded:excluded.length+ineligible.length,reasons:{...eligibilityReasons(ineligible),...(excluded.length?{selection_exclusion:excluded.length}:{})}},recipients:list.slice((page-1)*pageSize,page*pageSize).map(publicContact),pagination:{page,pageSize,total:list.length,totalPages},truncated:page<totalPages},200,origin);
  } catch (error) {
    return errorResponse(error, origin);
  }
}

function publicContact(contact){const{audience,...row}=contact;return row}
function eligibilityReasons(contacts){return contacts.reduce((result,c)=>{const key=c.eligibility.reason;result[key]=(result[key]||0)+1;return result},{})}
async function segmentConfig(env,origin){
 const [events,products,tags]=await env.DB.batch([env.DB.prepare('SELECT id,year,title,is_current FROM events ORDER BY year DESC'),env.DB.prepare('SELECT id,data FROM merch_products ORDER BY id'),env.DB.prepare('SELECT DISTINCT tag FROM mailing_contact_tags ORDER BY tag')]);
 return json({ok:true,version:2,fields:MAILING_FIELDS,events:events.results,products:products.results.map(p=>{const d=JSON.parse(p.data);return{id:p.id,name:d.name,variants:d.variants.map(v=>({id:v.id,name:[v.color,...v.sizes||[]].join(' · ')}))}}),tags:tags.results.map(t=>t.tag)},200,origin);
}

async function createCampaign(request, env, auth, origin) {
  const parsed = await readJsonObject(request, origin);
  if (parsed.response) return parsed.response;
  try {
    return json({ ok: true, campaign: await createMailingCampaign(env, auth.uid, parsed.body) }, 201, origin);
  } catch (error) {
    return errorResponse(error, origin);
  }
}

async function patchCampaign(request, env, campaignId, origin) {
  const parsed = await readJsonObject(request, origin);
  if (parsed.response) return parsed.response;
  try {
    const campaign = await updateMailingCampaign(env, campaignId, parsed.body);
    if (!campaign) return json({ ok: false, error: "campaign_not_found", message: "Kampaň nebyla nalezena." }, 404, origin);
    return json({ ok: true, campaign }, 200, origin);
  } catch (error) {
    return errorResponse(error, origin);
  }
}

async function renderPreview(request, origin) {
  const parsed = await readJsonObject(request, origin);
  if (parsed.response) return parsed.response;
  try {
    return json({ ok: true, preview: renderMailingTemplate(parsed.body) }, 200, origin);
  } catch (error) {
    return errorResponse(error, origin);
  }
}

export async function routeAdminMailing({ request, env, url, auth, origin }) {
  if (!url.pathname.startsWith("/api/admin/mailing")) return null;
  if(url.pathname==='/api/admin/mailing/media'&&request.method==='POST'){
    try{return json({ok:true,...await uploadMailingImage(request,env)},201,origin)}catch(error){
      const messages={missing_image:'Vyber obrázek.',invalid_image_type:'Vyber JPEG nebo PNG.',invalid_image:'Vyber platný JPEG nebo PNG do 8 MB.',image_too_large:'Obrázek musí mít nejvýše 8 MB.'};
      if(messages[error.message])return json({ok:false,error:error.message,message:messages[error.message]},error.message==='image_too_large'?413:400,origin);throw error;
    }
  }
  const transactional=await routeTransactionalEmails({request,env,url,auth,origin});if(transactional)return transactional;
  const delivery = await routeMailingDelivery({ request, env, url, origin });
  if (delivery) return delivery;
  if (url.pathname === "/api/admin/mailing/overview" && request.method === "GET") return mailingOverview(env, origin);
  if (url.pathname === "/api/admin/mailing/contacts" && request.method === "GET") return mailingContacts(env, url, origin);
  if(url.pathname==='/api/admin/mailing/contacts/search'&&request.method==='POST'){
    const parsed=await readJsonObject(request,origin);if(parsed.response)return parsed.response;
    const target=new URL(url);for(const key of['page','pageSize','scope','eligibility','q'])if(parsed.body[key]!=null)target.searchParams.set(key,String(parsed.body[key]));
    try{return await mailingContacts(env,target,origin,parsed.body.segment)}catch(error){return errorResponse(error,origin)}
  }
  if(url.pathname==='/api/admin/mailing/segments/config'&&request.method==='GET')return segmentConfig(env,origin);
  if (url.pathname === "/api/admin/mailing/segments/preview" && request.method === "POST") return mailingSegmentPreview(request, env, origin);
  if (url.pathname === "/api/admin/mailing/editor-config" && request.method === "GET") {
    return json({ ok: true, starter: createMailingStarterDraft(), blockTypes: MAILING_BLOCK_TYPES }, 200, origin);
  }
  if (url.pathname === "/api/admin/mailing/render-preview" && request.method === "POST") return renderPreview(request, origin);
  if (url.pathname === "/api/admin/mailing/campaigns" && request.method === "GET") {
    const count=await env.DB.prepare('SELECT COUNT(*) total FROM mailing_campaigns').first();
    const pageSize=Math.min(100,pageNumber(url.searchParams.get('pageSize'),50)),total=Number(count?.total||0),totalPages=Math.max(1,Math.ceil(total/pageSize)),page=Math.min(pageNumber(url.searchParams.get('page')),totalPages);
    return json({ ok: true, campaigns: await listMailingCampaigns(env,{page,pageSize}),pagination:{page,pageSize,total,totalPages} }, 200, origin);
  }
  if (url.pathname === "/api/admin/mailing/campaigns" && request.method === "POST") return createCampaign(request, env, auth, origin);
  const campaignMatch = url.pathname.match(/^\/api\/admin\/mailing\/campaigns\/([^/]+)$/);
  if (campaignMatch && request.method === "PATCH") return patchCampaign(request, env, decodeURIComponent(campaignMatch[1]), origin);
  return json({ ok: false, error: "mailing_not_found", message: "Mailing endpoint neexistuje." }, 404, origin);
}
