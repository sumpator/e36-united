import { readMailingBody } from './request.js';
import { validDeliveryEmail } from './preparation.js';

const eventTypes=Object.freeze({processed:'sent',delivered:'delivered',open:'opened',click:'click',bounce:'bounce',spam:'blocked',unsubscribe:'unsubscribed',reject:'rejected',resubscribe:'resubscribed'});
const reply=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}}),encode=value=>new TextEncoder().encode(value);
async function digest(value){return new Uint8Array(await crypto.subtle.digest('SHA-256',encode(value)))}
async function secretMatches(actual,expected){
  if(!actual||actual.length>512)return false;const [a,b]=await Promise.all([digest(actual),digest(expected)]);
  if(typeof crypto.subtle.timingSafeEqual==='function')return crypto.subtle.timingSafeEqual(a,b);
  let difference=0;for(let i=0;i<32;i++)difference|=a[i]^b[i];return difference===0;
}
function header(body,name){
  const lower=name.toLowerCase(),direct=Object.entries(body).find(([key])=>key.toLowerCase()===lower)?.[1];if(direct!=null)return direct;
  if(body.headers&&typeof body.headers==='object'&&!Array.isArray(body.headers))return Object.entries(body.headers).find(([key])=>key.toLowerCase()===lower)?.[1];
  return null;
}
function eventTime(value){
  const number=Number(value);if(Number.isSafeInteger(number)&&number>0&&number<=253402300799)return new Date(number*1000).toISOString();
  if(typeof value==='string'){const ms=Date.parse(value);if(Number.isFinite(ms))return new Date(ms).toISOString()}
  throw Error('invalid_event');
}
function normalizeEvent(body){
  if(!body||Array.isArray(body)||typeof body!=='object')throw Error('invalid_event');
  const original=String(body.event||'').toLowerCase(),mapped=Object.hasOwn(eventTypes,original)?eventTypes[original]:null;if(!mapped)throw Error('unsupported_event');
  const type=original==='bounce'?(String(body.bounce||'').toLowerCase()==='hard'?'hard_bounce':String(body.bounce||'').toLowerCase()==='soft'?'soft_bounce':null):mapped;
  const providerEventKey=String(body.id||'').trim(),emailId=String(body.email_id||'').trim(),email=String(body.rcpt||'').trim().toLowerCase();
  if(!type||!providerEventKey||providerEventKey.length>200||emailId.length>200||!validDeliveryEmail(email))throw Error('invalid_event');
  let clickedUrl=null;if(type==='click'){const value=body.url??body.URL??body.link;if(typeof value!=='string'||value.length>2048)throw Error('invalid_event');const url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw Error('invalid_event');clickedUrl=value}
  return {providerEventKey,emailId,email,type,occurredAt:eventTime(body.time),clickedUrl,campaignId:String(header(body,'X-E36-Campaign-Id')||'').slice(0,100),
    recipientId:String(header(body,'X-E36-Recipient-Id')||'').slice(0,100),mailType:String(header(body,'X-E36-Mail-Type')||'').toLowerCase(),
    metadata:{event:original,bounce:original==='bounce'?String(body.bounce||'').toLowerCase():null,providerEventId:providerEventKey}};
}
async function resolveEvent(env,event){
  if(event.mailType&&event.mailType!=='campaign')return null;
  if(event.emailId){const exact=await env.DB.prepare(`SELECT r.id,r.contact_id,r.campaign_id,r.normalized_email FROM mailing_campaign_recipients r
    JOIN mailing_campaigns c ON c.id=r.campaign_id WHERE c.provider='smtp2go' AND r.provider_email_id=?`).bind(event.emailId).first();if(exact)return exact}
  if(!event.campaignId)return null;
  const campaign=await env.DB.prepare("SELECT id FROM mailing_campaigns WHERE id=? AND provider='smtp2go' AND preparation_id IS NOT NULL").bind(event.campaignId).first();
  if(!campaign)return null;
  if(event.recipientId){const correlated=await env.DB.prepare('SELECT id,contact_id,campaign_id,normalized_email FROM mailing_campaign_recipients WHERE campaign_id=? AND id=? AND normalized_email=?')
    .bind(campaign.id,event.recipientId,event.email).first();if(correlated)return correlated}
  return await env.DB.prepare('SELECT id,contact_id,campaign_id,normalized_email FROM mailing_campaign_recipients WHERE campaign_id=? AND normalized_email=?')
    .bind(campaign.id,event.email).first()||{campaign_id:campaign.id,id:null,contact_id:null,normalized_email:event.email};
}
async function recordEvent(env,event){
  const recipient=await resolveEvent(env,event);if(!recipient)return {ignored:1};
  const id=crypto.randomUUID(),now=new Date().toISOString(),statements=[env.DB.prepare(`INSERT INTO mailing_delivery_events
    (id,campaign_id,recipient_id,normalized_email,provider,provider_event_key,event_type,occurred_at,clicked_url,provider_payload_json)
    VALUES(?,?,?,?,'smtp2go',?,?,?,?,?) ON CONFLICT(provider,provider_event_key) DO NOTHING`)
    .bind(id,recipient.campaign_id,recipient.id||null,event.email,event.providerEventKey,event.type,event.occurredAt,event.clickedUrl,JSON.stringify(event.metadata))];
  if(recipient.id){
    const maximum=type=>`(SELECT MAX(occurred_at) FROM mailing_delivery_events WHERE recipient_id=mailing_campaign_recipients.id AND event_type='${type}')`,exists=type=>`${maximum(type)} IS NOT NULL`;
    statements.push(env.DB.prepare(`UPDATE mailing_campaign_recipients SET sent_at=COALESCE(sent_at,${maximum('sent')}),delivered_at=${maximum('delivered')},
      last_opened_at=${maximum('opened')},last_clicked_at=${maximum('click')},updated_at=?,delivery_status=CASE
      WHEN ${exists('unsubscribed')} THEN 'unsubscribed' WHEN ${exists('blocked')} THEN 'blocked' WHEN ${exists('hard_bounce')} THEN 'hard_bounce'
      WHEN COALESCE(${maximum('soft_bounce')},'')>COALESCE(${maximum('delivered')},'') THEN 'soft_bounce' WHEN ${exists('delivered')} THEN 'delivered'
      WHEN ${exists('rejected')} THEN 'rejected' WHEN sent_at IS NOT NULL OR ${exists('sent')} THEN 'sent' ELSE 'prepared' END
      WHERE id=? AND EXISTS(SELECT 1 FROM mailing_delivery_events WHERE id=?)`).bind(now,recipient.id,id));
    if(['unsubscribed','hard_bounce','blocked'].includes(event.type)&&recipient.contact_id)statements.push(env.DB.prepare(`UPDATE mailing_contacts SET suppression_status=CASE
      WHEN ?='unsubscribed' THEN 'unsubscribed' WHEN suppression_status IN ('unsubscribed','manually_suppressed') THEN suppression_status
      WHEN ?='blocked' OR suppression_status='blocked' THEN 'blocked' ELSE 'hard_bounce' END,
      deliverability_status=CASE WHEN ?='unsubscribed' THEN deliverability_status WHEN ?='blocked' OR deliverability_status='blocked' THEN 'blocked' ELSE 'hard_bounce' END,
      updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM mailing_delivery_events WHERE id=?)`).bind(event.type,event.type,event.type,event.type,now,recipient.contact_id,id));
  }
  const results=await env.DB.batch(statements);return {inserted:results[0]?.meta?.changes?1:0,unresolved:recipient.id?0:1};
}
export async function handleSmtp2goWebhook(request,env){
  if(!env.SMTP2GO_WEBHOOK_SECRET)return reply({error:'webhook_not_configured'},503);
  const authorization=request.headers.get('Authorization')||'',token=authorization.startsWith('Bearer ')?authorization.slice(7).trim():'';
  if(!await secretMatches(token,env.SMTP2GO_WEBHOOK_SECRET))return reply({error:'webhook_unauthorized'},401);
  let events;try{const payload=await readMailingBody(request,65536),list=Array.isArray(payload)?payload:[payload];if(!list.length||list.length>100)throw Error();events=list.map(normalizeEvent)}
  catch{return reply({error:'invalid_webhook_payload'},400)}
  try{const result={ok:true,inserted:0,ignored:0,unresolved:0};for(const event of events){const counts=await recordEvent(env,event);for(const key of ['inserted','ignored','unresolved'])result[key]+=counts[key]||0}return reply(result)}
  catch{return reply({error:'webhook_storage_unavailable'},503)}
}
export async function deliveryTracking(env,campaignId){
  const [population,events,rows]=await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS recipients,COALESCE(SUM(sent_at IS NOT NULL),0) AS sent FROM mailing_campaign_recipients WHERE campaign_id=?').bind(campaignId).first(),
    env.DB.prepare('SELECT event_type,COUNT(DISTINCT recipient_id) AS count FROM mailing_delivery_events WHERE campaign_id=? GROUP BY event_type').bind(campaignId).all(),
    env.DB.prepare(`SELECT email,name,delivery_status AS status,sent_at AS sentAt,delivered_at AS deliveredAt,last_opened_at AS openedAt,last_clicked_at AS clickedAt
      FROM mailing_campaign_recipients WHERE campaign_id=? ORDER BY normalized_email LIMIT 500`).bind(campaignId).all()]);
  const counts=Object.fromEntries((events.results||[]).map(row=>[row.event_type,row.count]));
  const bounced=await env.DB.prepare("SELECT COUNT(DISTINCT recipient_id) AS count FROM mailing_delivery_events WHERE campaign_id=? AND event_type IN ('soft_bounce','hard_bounce','blocked')").bind(campaignId).first();
  return {counts:{...population,delivered:counts.delivered||0,opened:counts.opened||0,clicked:counts.click||0,bounced:bounced.count,unsubscribed:counts.unsubscribed||0},
    recipients:rows.results||[],detailLimit:500,openRateApproximate:true};
}
