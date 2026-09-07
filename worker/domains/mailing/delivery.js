import { createSmtp2goAdapter, senderConfig } from './provider/smtp2go.js';
import { MailingDeliveryError } from './delivery-errors.js';
import { campaignRow, frozenRecipients, renderDraft, validDeliveryEmail } from './preparation.js';
import { loadMailingContacts } from './contacts.js';

export function dailySendLimit(env) {
  if (env.MAILING_DAILY_SEND_LIMIT == null || env.MAILING_DAILY_SEND_LIMIT === '') return 200;
  const n=Number(env.MAILING_DAILY_SEND_LIMIT);return Number.isSafeInteger(n)&&n>0?n:0;
}
function textFromHtml(html){return String(html).replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')
  .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#39;/gi,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim()}
export function emailPayload(env,row,recipient,{test=false}={}){
  const sender=senderConfig(env),html=test?renderDraft(row).html:row.prepared_html;
  return {sender:sender.sender,to:[recipient.normalized_email],subject:test?row.subject:row.prepared_subject,html_body:html,text_body:textFromHtml(html),
    custom_headers:[{header:'Reply-To',value:sender.replyTo},{header:'X-E36-Campaign-Id',value:String(row.id)},
      {header:'X-E36-Recipient-Id',value:String(recipient.id)},{header:'X-E36-Mail-Type',value:test?'test':'campaign'}]};
}
async function requireReady(provider,recipientCount=0){
  const status=await provider.checkReadiness();
  if(!status.ready)throw new MailingDeliveryError(status.error||status.state||'provider_unavailable',503);
  if(recipientCount&&Number.isSafeInteger(status.monthlyRemaining)&&status.monthlyRemaining<recipientCount)throw new MailingDeliveryError('provider_quota',409,{count:recipientCount,remaining:status.monthlyRemaining});
  return status;
}
async function lock(env,row,operation,extra='',values=[]){
  const token=crypto.randomUUID(),now=new Date().toISOString();
  const eligibility=operation==='test'?'':`AND NOT EXISTS (SELECT 1 FROM mailing_campaign_recipients r LEFT JOIN mailing_contacts c ON c.id=r.contact_id
    WHERE r.campaign_id=mailing_campaigns.id AND (c.id IS NULL OR c.mailing_consent_status<>'yes' OR c.suppression_status<>'eligible' OR c.deliverability_status IN ('hard_bounce','blocked'))) `;
  const result=await env.DB.prepare(`UPDATE mailing_campaigns SET delivery_lock=?,delivery_operation=?,delivery_operation_at=?,delivery_error=NULL
    WHERE id=? AND status=? AND delivery_lock IS NULL ${eligibility} ${extra}`).bind(token,operation,now,row.id,row.status,...values).run();
  if(!result.meta?.changes){if(operation!=='test')await validatePrepared(env,await campaignRow(env,row.id));throw new MailingDeliveryError(operation==='send'?'send_limit_exceeded':'campaign_busy')}
  return token;
}
async function release(env,id,token){await env.DB.prepare('UPDATE mailing_campaigns SET delivery_lock=NULL,delivery_operation=NULL WHERE id=? AND delivery_lock=?').bind(id,token).run()}
async function failOperation(env,id,token,error){
  await env.DB.prepare(`UPDATE mailing_campaigns SET delivery_error=?,provider_status=?,delivery_lock=CASE WHEN ? THEN NULL ELSE delivery_lock END,
    delivery_operation=CASE WHEN ? THEN NULL ELSE delivery_operation END WHERE id=? AND delivery_lock=?`)
    .bind(error.code||'provider_unavailable',error.definiteRejection?'rejected':'needs_reconciliation',error.definiteRejection?1:0,error.definiteRejection?1:0,id,token).run();
}
async function validatePrepared(env,row){
  if(row.status!=='prepared')throw new MailingDeliveryError('campaign_not_prepared');
  if(row.delivery_lock)throw new MailingDeliveryError('campaign_busy');
  const recipients=await frozenRecipients(env,row.id),limit=dailySendLimit(env);
  if(!recipients.length||recipients.length!==row.recipient_count||!row.prepared_html||!row.preparation_id)throw new MailingDeliveryError('no_eligible_recipients');
  if(row.recipient_count>limit)throw new MailingDeliveryError('send_limit_exceeded',409,{count:row.recipient_count,limit});
  if(JSON.parse(row.prepared_content_json).blocks.some(b=>b.type==='survey'))throw new MailingDeliveryError('survey_delivery_not_ready');
  const contacts=await loadMailingContacts(env);
  if(recipients.some(r=>!contacts.some(c=>c.persistedContactId===r.contact_id&&c.eligibility.status==='eligible')))throw new MailingDeliveryError('recipients_no_longer_eligible');
  return recipients;
}
export async function sendCampaign(env,id,confirmation,provider=createSmtp2goAdapter(env)){
  const row=await campaignRow(env,id),recipients=await validatePrepared(env,row);
  if(confirmation?.preparationId!==row.preparation_id||confirmation?.recipientCount!==row.recipient_count)throw new MailingDeliveryError('confirmation_required');
  await requireReady(provider,recipients.length);
  const limit=dailySendLimit(env),token=await lock(env,row,'send',`AND preparation_id=? AND ? >= recipient_count + COALESCE((SELECT SUM(recipient_count)
    FROM mailing_campaigns WHERE id<>? AND (substr(sent_at,1,10)=? OR (delivery_operation='send' AND delivery_lock IS NOT NULL))),0)`,
    [row.preparation_id,limit,id,new Date().toISOString().slice(0,10)]);
  try{
    const accepted=await provider.sendBatch(recipients.map(recipient=>emailPayload(env,row,recipient)));
    const now=new Date().toISOString(),updates=recipients.map((recipient,index)=>env.DB.prepare(`UPDATE mailing_campaign_recipients SET provider_email_id=?,sent_at=COALESCE(sent_at,?),
      delivery_status=CASE WHEN delivery_status='prepared' THEN 'sent' ELSE delivery_status END,updated_at=? WHERE id=? AND campaign_id=? AND provider_email_id IS NULL`)
      .bind(accepted.emailIds[index],now,now,recipient.id,id));
    const results=await env.DB.batch([env.DB.prepare(`UPDATE mailing_campaigns SET status='sent',sent_at=?,provider='smtp2go',provider_request_id=?,provider_status='accepted',
      delivery_lock=NULL,delivery_operation=NULL,updated_at=? WHERE id=? AND delivery_lock=?`).bind(now,accepted.requestId,now,id,token),...updates]);
    if(!results[0]?.meta?.changes||results.slice(1).some(result=>!result.meta?.changes))throw new MailingDeliveryError('provider_batch_ambiguous',502);
  }catch(error){await failOperation(env,id,token,error);throw error}
  return campaignRow(env,id);
}
export async function testCampaign(env,id,addresses,provider=createSmtp2goAdapter(env)){
  const row=await campaignRow(env,id);
  if(row.status!=='draft')throw new MailingDeliveryError('campaign_not_draft');
  if(!Array.isArray(addresses)||addresses.length<1||addresses.length>5||addresses.some(e=>!validDeliveryEmail(e)))throw new MailingDeliveryError('invalid_test_addresses',400);
  const emailTo=[...new Set(addresses.map(e=>e.trim().toLowerCase()))];await requireReady(provider,emailTo.length);
  const token=await lock(env,row,'test','AND subject=? AND preheader=? AND content_json=?',[row.subject,row.preheader,row.content_json]);
  try{await provider.sendTest(emailTo.map((email,index)=>emailPayload(env,row,{id:`test-${index+1}`,normalized_email:email},{test:true})));await release(env,id,token)}
  catch(error){await failOperation(env,id,token,error);throw error}
  return {accepted:true};
}
