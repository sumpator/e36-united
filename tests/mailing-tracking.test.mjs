import test from 'node:test';
import assert from 'node:assert/strict';
import {mailingRuntime,contact,draft,confirmation,providerMock} from './helpers/mailing-runtime.mjs';
import {prepareCampaign,campaignRow} from '../worker/domains/mailing/preparation.js';
import {sendCampaign,testCampaign} from '../worker/domains/mailing/delivery.js';
import {handleSmtp2goWebhook,deliveryTracking} from '../worker/domains/mailing/tracking.js';
import {routeRequest} from '../worker/router.js';
import {routeAdminMailing} from '../worker/domains/mailing/index.js';

const secret='synthetic-webhook-test-secret',stamp=1788768000;
const request=(body,token=secret)=>new Request('https://api.e36united.cz/api/mailing/smtp2go-webhook',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});
async function prepared(){const r=mailingRuntime();r.env.SMTP2GO_WEBHOOK_SECRET=secret;contact(r.db);const c=await draft(r.env),p=await prepareCampaign(r.env,c.id,confirmation(c));await sendCampaign(r.env,c.id,{preparationId:p.preparation_id,recipientCount:1},providerMock());const recipient=r.db.prepare('SELECT * FROM mailing_campaign_recipients WHERE campaign_id=?').get(c.id);return {...r,c,recipient}}
const event=(r,type='delivered',more={})=>({id:`event-${type}`,email_id:r.recipient.provider_email_id,event:type,rcpt:r.recipient.normalized_email,time:stamp,
  'X-E36-Campaign-Id':r.c.id,'X-E36-Recipient-Id':r.recipient.id,'X-E36-Mail-Type':'campaign',...more});
const row=r=>r.db.prepare('SELECT * FROM mailing_campaign_recipients WHERE campaign_id=?').get(r.c.id);
async function record(r,payload){const response=await handleSmtp2goWebhook(request(payload),r.env);assert.equal(response.status,200);return response.json()}

test('public SMTP2GO webhook fails closed with absent config, wrong or missing Bearer secret before D1 access',async()=>{
  const fixture={id:'event',email_id:'email',event:'delivered',rcpt:'one@example.invalid',time:stamp};
  for(const [env,token,status] of [[{},secret,503],[{SMTP2GO_WEBHOOK_SECRET:secret},'',401],[{SMTP2GO_WEBHOOK_SECRET:secret},'wrong',401]]){
    const response=await handleSmtp2goWebhook(request(fixture,token),env);assert.equal(response.status,status);assert.equal(JSON.stringify(await response.json()).includes(secret),false);
  }
});
test('exact public SMTP2GO webhook POST bypasses Firebase / Origin but retains Bearer authentication',async()=>{
  const r=await prepared(),req=request(event(r));const response=await routeRequest({request:req,env:r.env,url:new URL(req.url),origin:''});assert.equal(response.status,200);assert.ok(row(r).delivered_at);
  const invalid=request(event(r),'wrong');assert.equal((await routeRequest({request:invalid,env:r.env,url:new URL(invalid.url),origin:''})).status,401);r.close();
});
for(const [input,more,projection,column] of [
  ['processed',{},'sent',null],['delivered',{},'delivered','delivered_at'],['open',{},'sent','last_opened_at'],['click',{url:'https://e36united.cz/news'},'sent','last_clicked_at'],
  ['bounce',{bounce:'soft'},'soft_bounce',null],['bounce',{bounce:'hard'},'hard_bounce',null],['spam',{},'blocked',null],['unsubscribe',{},'unsubscribed',null],['reject',{},'rejected',null],['resubscribe',{},'sent',null],
])test(`${input}${more.bounce?` ${more.bounce}`:''} webhook maps recipient state`,async()=>{
  const r=await prepared();await record(r,event(r,input,{id:`event-${input}-${more.bounce||'plain'}`,...more}));assert.equal(row(r).delivery_status,projection);if(column)assert.equal(row(r)[column],new Date(stamp*1000).toISOString());
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM mailing_delivery_events').get().n,1);assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);r.close();
});
test('webhook event id deduplicates retries while distinct opens/clicks retain history and unique metrics',async()=>{
  const r=await prepared(),events=[event(r,'open',{id:'open-1'}),event(r,'open',{id:'open-2',time:stamp+1}),event(r,'click',{id:'click-1',url:'https://e36united.cz/a'}),event(r,'click',{id:'click-2',url:'https://e36united.cz/b'})];
  for(const item of events)await record(r,item);const before=r.db.prepare('SELECT * FROM mailing_delivery_events ORDER BY provider_event_key').all(),projection=row(r);
  for(const item of events)await record(r,{...item,context:'retry metadata ignored'});assert.deepEqual(r.db.prepare('SELECT * FROM mailing_delivery_events ORDER BY provider_event_key').all(),before);assert.deepEqual(row(r),projection);
  const stats=await deliveryTracking(r.env,r.c.id);assert.equal(stats.counts.opened,1);assert.equal(stats.counts.clicked,1);assert.equal(before.length,4);r.close();
});
test('unknown email_id cannot select a random campaign; explicit campaign correlation can audit unresolved recipient',async()=>{
  const r=await prepared();assert.equal((await record(r,{...event(r,'unsubscribe'),id:'unknown',email_id:'unknown', 'X-E36-Campaign-Id':''})).ignored,1);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM mailing_delivery_events').get().n,0);
  contact(r.db,'outsider');await record(r,{...event(r,'unsubscribe'),id:'unresolved',email_id:'unknown',rcpt:'outsider@example.invalid','X-E36-Recipient-Id':'unknown'});
  assert.equal(r.db.prepare('SELECT recipient_id FROM mailing_delivery_events').get().recipient_id,null);assert.equal(r.db.prepare("SELECT suppression_status FROM mailing_contacts WHERE id='outsider'").get().suppression_status,'eligible');
  assert.equal((await deliveryTracking(r.env,r.c.id)).counts.unsubscribed,0);r.close();
});
test('campaign correlation safely falls back to its unique frozen normalized email',async()=>{
  const r=await prepared();const payload={...event(r,'delivered'),id:'fallback-email',email_id:'unknown','X-E36-Recipient-Id':''};
  assert.equal((await record(r,payload)).inserted,1);assert.ok(row(r).delivered_at);r.close();
});
test('test-only SMTP2GO events cannot enter live delivery history',async()=>{
  const r=mailingRuntime();r.env.SMTP2GO_WEBHOOK_SECRET=secret;const c=await draft(r.env);await testCampaign(r.env,c.id,['test@example.invalid'],providerMock());
  const result=await record({...r,c,recipient:{provider_email_id:'test-1',normalized_email:'test@example.invalid',id:'test-1'}},{id:'test-event',email_id:'test-1',event:'open',rcpt:'test@example.invalid',time:stamp,'X-E36-Campaign-Id':c.id,'X-E36-Recipient-Id':'test-1','X-E36-Mail-Type':'test'});
  assert.equal(result.ignored,1);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM mailing_delivery_events').get().n,0);r.close();
});
test('malformed JSON, invalid URLs, unknown events, bounce classes and invalid batches produce no writes',async()=>{
  const r=await prepared();for(const payload of [null,[],[event(r),event(r,'bad')],event(r,'constructor'),event(r,'__proto__'),event(r,'click',{url:'javascript:alert(1)'}),event(r,'open',{rcpt:'bad'}),event(r,'open',{time:null}),event(r,'bounce',{bounce:'unknown'}),event(r,'open',{id:''})])assert.equal((await handleSmtp2goWebhook(request(payload),r.env)).status,400);
  const bad=new Request(request(event(r)),{body:'{invalid'});assert.equal((await handleSmtp2goWebhook(bad,r.env)).status,400);assert.equal((await handleSmtp2goWebhook(request({...event(r,'open'),extra:'x'.repeat(66000)}),r.env)).status,400);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM mailing_delivery_events').get().n,0);r.close();
});
for(const [type,more,suppression,deliverability] of [['unsubscribe',{},'unsubscribed','deliverable'],['bounce',{bounce:'hard'},'hard_bounce','hard_bounce'],['spam',{},'blocked','blocked'],['bounce',{bounce:'soft'},'eligible','deliverable'],['reject',{},'eligible','deliverable'],['resubscribe',{},'eligible','deliverable']])test(`${type}/${more.bounce||''} applies only justified permanent suppression`,async()=>{
  const r=await prepared();await record(r,event(r,type,{id:`suppression-${type}-${more.bounce||''}`,...more}));const stored=r.db.prepare("SELECT * FROM mailing_contacts WHERE id='one'").get();assert.equal(stored.suppression_status,suppression);assert.equal(stored.deliverability_status,deliverability);
  const c=await draft(r.env);if(['bounce','reject','resubscribe'].includes(type)&&more.bounce!=='hard')await prepareCampaign(r.env,c.id,confirmation(c));else await assert.rejects(prepareCampaign(r.env,c.id,confirmation(c,0)),/no_eligible_recipients/);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM members').get().n,1);r.close();
});
test('out-of-order events preserve terminal suppression, latest timestamps and unique bounce metrics',async()=>{
  const r=await prepared();for(const item of [event(r,'unsubscribe',{id:'u',time:stamp+5}),event(r,'spam',{id:'s',time:stamp+3}),event(r,'bounce',{id:'h',bounce:'hard',time:stamp+2}),event(r,'delivered',{id:'d'}),event(r,'open',{id:'o2',time:stamp+10}),event(r,'open',{id:'o1',time:stamp+1})])await record(r,item);
  assert.equal(row(r).delivery_status,'unsubscribed');assert.equal(row(r).last_opened_at,new Date((stamp+10)*1000).toISOString());const c=r.db.prepare("SELECT suppression_status,deliverability_status FROM mailing_contacts WHERE id='one'").get();assert.equal(c.suppression_status,'unsubscribed');assert.equal(c.deliverability_status,'blocked');
  const stats=await deliveryTracking(r.env,r.c.id);assert.equal(stats.counts.bounced,1);assert.equal(stats.counts.delivered,1);assert.equal(stats.counts.unsubscribed,1);r.close();
});
test('recipient/suppression projection failure rolls back event and exact provider retry recovers',async()=>{
  const r=await prepared();r.db.exec("CREATE TRIGGER fail_suppress BEFORE UPDATE ON mailing_contacts BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");assert.equal((await handleSmtp2goWebhook(request(event(r,'unsubscribe')),r.env)).status,503);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM mailing_delivery_events').get().n,0);assert.equal(row(r).delivery_status,'sent');r.db.exec('DROP TRIGGER fail_suppress');await record(r,event(r,'unsubscribe'));assert.equal(row(r).delivery_status,'unsubscribed');r.close();
});
test('Admin delivery detail includes frozen preview and safe unique tracking with no provider request',async()=>{
  const r=await prepared();await record(r,event(r,'delivered'));const req=new Request(`https://api.e36united.cz/api/admin/mailing/campaigns/${r.c.id}/delivery`),response=await routeAdminMailing({request:req,env:r.env,url:new URL(req.url),auth:{uid:'admin'},origin:'https://e36united.cz'});
  const payload=await response.json();assert.equal(response.status,200);assert.equal(payload.tracking.counts.delivered,1);assert.equal(payload.frozenPreview.html,(await campaignRow(r.env,r.c.id)).prepared_html);assert.equal(JSON.stringify(payload).includes(secret),false);r.close();
});
