import { readMailingBody } from './request.js';
import { validDeliveryEmail } from './preparation.js';

export const BREVO_WEBHOOK_HEADER = 'X-E36-Brevo-Secret';
const eventTypes = Object.freeze({sent:'sent',requested:'sent',delivered:'delivered',opened:'opened',proxy_open:'opened',
  click:'click',soft_bounce:'soft_bounce',soft_bounced:'soft_bounce',hard_bounce:'hard_bounce',
  blocked:'blocked',spam:'blocked',unsubscribe:'unsubscribed',unsubscribed:'unsubscribed'});
const reply = (body,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const encode = value => new TextEncoder().encode(value);
async function digest(value){return new Uint8Array(await crypto.subtle.digest('SHA-256',encode(value)))}
async function secretMatches(actual,expected){
  if(!actual||actual.length>512)return false;
  const [a,b]=await Promise.all([digest(actual),digest(expected)]);
  // Fixed-size digests; Workers provides a native constant-time comparison.
  if(typeof crypto.subtle.timingSafeEqual==='function')return crypto.subtle.timingSafeEqual(a,b);
  let difference=0;for(let i=0;i<32;i++)difference|=a[i]^b[i];return difference===0;
}
function normalizeEvent(body){
  if(!body||Array.isArray(body)||typeof body!=='object')throw Error('invalid_event');
  const original=String(body.event||'').toLowerCase(),type=Object.hasOwn(eventTypes,original)?eventTypes[original]:null;
  if(!type)throw Error('unsupported_event');
  const campaignId=Number(body.camp_id),seconds=Number(body.ts_event??body.ts);
  if(!Number.isSafeInteger(campaignId)||campaignId<=0||!validDeliveryEmail(body.email)||!Number.isSafeInteger(seconds)||seconds<=0||seconds>253402300799)throw Error('invalid_event');
  let clickedUrl=null;
  if(type==='click'){
    const value=body.URL??body.link;
    if(typeof value!=='string'||value.length>2048)throw Error('invalid_event');
    const url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw Error('invalid_event');clickedUrl=value;
  }
  return {campaignId,email:body.email.trim().toLowerCase(),type,occurredAt:new Date(seconds*1000).toISOString(),clickedUrl,
    metadata:{event:original,webhookId:String(body.id??'').slice(0,64),ts_sent:Number.isSafeInteger(Number(body.ts_sent))?Number(body.ts_sent):null}};
}
async function recordEvent(env,event){
  // Test provider IDs never resolve here; unrelated provider campaigns are ignored.
  const campaign=await env.DB.prepare("SELECT id FROM mailing_campaigns WHERE provider='brevo' AND provider_campaign_id=? AND preparation_id IS NOT NULL")
    .bind(event.campaignId).first();
  if(!campaign)return {ignored:1};
  const recipient=await env.DB.prepare('SELECT id,contact_id FROM mailing_campaign_recipients WHERE campaign_id=? AND normalized_email=?')
    .bind(campaign.id,event.email).first();
  // Brevo marketing `id` identifies the webhook, not a globally unique occurrence.
  // Identical recipient/type/second/URL events coalesce; dashboard counts remain unique recipients.
  const key=Array.from(await digest(JSON.stringify([event.campaignId,event.email,event.type,event.occurredAt,event.clickedUrl])),n=>n.toString(16).padStart(2,'0')).join('');
  const id=crypto.randomUUID(),now=new Date().toISOString();
  const statements=[env.DB.prepare(`INSERT INTO mailing_delivery_events
    (id,campaign_id,recipient_id,normalized_email,provider,provider_event_key,event_type,occurred_at,clicked_url,provider_payload_json)
    VALUES(?,?,?,?,'brevo',?,?,?,?,?) ON CONFLICT(provider,provider_event_key) DO NOTHING`)
    .bind(id,campaign.id,recipient?.id||null,event.email,key,event.type,event.occurredAt,event.clickedUrl,JSON.stringify(event.metadata))];
  if(recipient){
    const maximum=type=>`(SELECT MAX(occurred_at) FROM mailing_delivery_events WHERE recipient_id=mailing_campaign_recipients.id AND event_type='${type}')`;
    const exists=type=>`${maximum(type)} IS NOT NULL`;
    statements.push(env.DB.prepare(`UPDATE mailing_campaign_recipients SET
      sent_at=COALESCE(sent_at,${maximum('sent')}),delivered_at=${maximum('delivered')},
      last_opened_at=${maximum('opened')},last_clicked_at=${maximum('click')},updated_at=?,
      delivery_status=CASE WHEN ${exists('unsubscribed')} THEN 'unsubscribed' WHEN ${exists('blocked')} THEN 'blocked'
        WHEN ${exists('hard_bounce')} THEN 'hard_bounce'
        WHEN COALESCE(${maximum('soft_bounce')},'')>COALESCE(${maximum('delivered')},'') THEN 'soft_bounce'
        WHEN ${exists('delivered')} THEN 'delivered' WHEN sent_at IS NOT NULL OR ${exists('sent')} THEN 'sent' ELSE 'prepared' END
      WHERE id=? AND EXISTS(SELECT 1 FROM mailing_delivery_events WHERE id=?)`).bind(now,recipient.id,id));
    if(['unsubscribed','hard_bounce','blocked'].includes(event.type)&&recipient.contact_id){
      statements.push(env.DB.prepare(`UPDATE mailing_contacts SET suppression_status=CASE
        WHEN ?='unsubscribed' THEN 'unsubscribed'
        WHEN suppression_status IN ('unsubscribed','manually_suppressed') THEN suppression_status
        WHEN ?='blocked' OR suppression_status='blocked' THEN 'blocked' ELSE 'hard_bounce' END,
        deliverability_status=CASE WHEN ?='unsubscribed' THEN deliverability_status
          WHEN ?='blocked' OR deliverability_status='blocked' THEN 'blocked' ELSE 'hard_bounce' END,
        updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM mailing_delivery_events WHERE id=?)`)
        .bind(event.type,event.type,event.type,event.type,now,recipient.contact_id,id));
    }
  }
  const results=await env.DB.batch(statements);
  return {inserted:results[0]?.meta?.changes?1:0,unresolved:recipient?0:1};
}
export async function handleBrevoWebhook(request,env){
  if(!env.BREVO_WEBHOOK_SECRET)return reply({error:'webhook_not_configured'},503);
  if(!await secretMatches(request.headers.get(BREVO_WEBHOOK_HEADER),env.BREVO_WEBHOOK_SECRET))return reply({error:'webhook_unauthorized'},401);
  let events;
  try{
    const payload=await readMailingBody(request,65536),list=Array.isArray(payload)?payload:[payload];
    if(!list.length||list.length>100)throw Error('invalid_batch');
    events=list.map(normalizeEvent); // Validate complete batch before any mutation.
  }catch{return reply({error:'invalid_webhook_payload'},400)}
  try{
    const result={ok:true,inserted:0,ignored:0,unresolved:0};
    for(const event of events){const counts=await recordEvent(env,event);for(const key of ['inserted','ignored','unresolved'])result[key]+=counts[key]||0}
    return reply(result);
  }catch{
    // Atomic per-event writes; a retried partially completed batch deduplicates safely.
    return reply({error:'webhook_storage_unavailable'},503);
  }
}

export async function deliveryTracking(env,campaignId){
  const [population,events,rows]=await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) AS recipients,COALESCE(SUM(sent_at IS NOT NULL),0) AS sent FROM mailing_campaign_recipients WHERE campaign_id=?`).bind(campaignId).first(),
    env.DB.prepare(`SELECT event_type,COUNT(DISTINCT recipient_id) AS count FROM mailing_delivery_events WHERE campaign_id=? GROUP BY event_type`).bind(campaignId).all(),
    env.DB.prepare(`SELECT email,name,delivery_status AS status,sent_at AS sentAt,delivered_at AS deliveredAt,last_opened_at AS openedAt,last_clicked_at AS clickedAt
      FROM mailing_campaign_recipients WHERE campaign_id=? ORDER BY normalized_email LIMIT 500`).bind(campaignId).all(),
  ]);
  const counts=Object.fromEntries((events.results||[]).map(row=>[row.event_type,row.count]));
  const bounced=await env.DB.prepare("SELECT COUNT(DISTINCT recipient_id) AS count FROM mailing_delivery_events WHERE campaign_id=? AND event_type IN ('soft_bounce','hard_bounce','blocked')").bind(campaignId).first();
  return {counts:{...population,delivered:counts.delivered||0,opened:counts.opened||0,clicked:counts.click||0,bounced:bounced.count,unsubscribed:counts.unsubscribed||0},
    recipients:rows.results||[],detailLimit:500,openRateApproximate:true};
}
