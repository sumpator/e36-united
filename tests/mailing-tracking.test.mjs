import test from 'node:test';
import assert from 'node:assert/strict';
import {mailingRuntime,contact,draft,confirmation,providerMock} from './helpers/mailing-runtime.mjs';
import {prepareCampaign,campaignRow} from '../worker/domains/mailing/preparation.js';
import {syncCampaign,testCampaign} from '../worker/domains/mailing/delivery.js';
import {handleBrevoWebhook,deliveryTracking} from '../worker/domains/mailing/tracking.js';
import {routeRequest} from '../worker/router.js';
import {routeAdminMailing} from '../worker/domains/mailing/index.js';

const secret='synthetic-webhook-test-secret',stamp=1788768000;
const event=(type='delivered',more={})=>({id:123,camp_id:22,email:'one@example.invalid',event:type,ts_event:stamp,ts_sent:stamp-60,...more});
const request=(body,header=secret)=>new Request('https://api.e36united.cz/api/mailing/brevo-webhook',{method:'POST',headers:{'Content-Type':'application/json',...(header?{'X-E36-Brevo-Secret':header}:{})},body:JSON.stringify(body)});
async function prepared(){const r=mailingRuntime();r.env.BREVO_WEBHOOK_SECRET=secret;contact(r.db);const c=await draft(r.env);await prepareCampaign(r.env,c.id,confirmation(c));await syncCampaign(r.env,c.id,providerMock());return {...r,c}}
const row=r=>r.db.prepare('SELECT * FROM mailing_campaign_recipients WHERE campaign_id=?').get(r.c.id);
async function record(r,payload){const response=await handleBrevoWebhook(request(payload),r.env);assert.equal(response.status,200);return response.json()}

test('public webhook fails closed with absent config, wrong or missing secret before D1 access',async()=>{
  for(const [env,header,status] of [[{},secret,503],[{BREVO_WEBHOOK_SECRET:secret},'',401],[{BREVO_WEBHOOK_SECRET:secret},'wrong',401]]){
    const response=await handleBrevoWebhook(request(event(),header),env);assert.equal(response.status,status);
    assert.equal(JSON.stringify(await response.json()).includes(secret),false);
  }
});
test('exact public webhook POST bypasses Firebase / Origin but retains its own secret authentication',async()=>{
  const r=await prepared(),req=request(event());
  const response=await routeRequest({request:req,env:r.env,url:new URL(req.url),origin:''});assert.equal(response.status,200);assert.ok(row(r).delivered_at);
  const invalid=request(event(),'wrong');assert.equal((await routeRequest({request:invalid,env:r.env,url:new URL(invalid.url),origin:''})).status,401);r.close();
});
for(const [input,projection,column] of [['sent','sent','sent_at'],['delivered','delivered','delivered_at'],['opened','prepared','last_opened_at'],['proxy_open','prepared','last_opened_at'],['click','prepared','last_clicked_at'],['soft_bounce','soft_bounce',null],['soft_bounced','soft_bounce',null],['hard_bounce','hard_bounce',null],['unsubscribe','unsubscribed',null],['unsubscribed','unsubscribed',null],['blocked','blocked',null],['spam','blocked',null]])test(`${input} webhook records normalized event and recipient projection`,async()=>{
  const r=await prepared();await record(r,event(input,input==='click'?{URL:'https://e36united.cz/news'}:{}));
  assert.equal(row(r).delivery_status,projection);if(column)assert.equal(row(r)[column],new Date(stamp*1000).toISOString());
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM mailing_delivery_events').get().n,1);assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);r.close();
});
test('repeated opens and clicks are idempotent and metrics count unique recipients across distinct events',async()=>{
  const r=await prepared();
  const events=[event('opened'),event('opened',{ts_event:stamp+1}),event('click',{URL:'https://e36united.cz/a'}),event('click',{URL:'https://e36united.cz/b'})];
  for(const e of events)await record(r,e);
  const before=r.db.prepare('SELECT * FROM mailing_delivery_events ORDER BY id').all(),beforeProjection=row(r);
  for(const e of events)await record(r,{...e,id:999,tag:'retry metadata ignored'});
  assert.deepEqual(r.db.prepare('SELECT * FROM mailing_delivery_events ORDER BY id').all(),before);assert.deepEqual(row(r),beforeProjection);
  const stats=await deliveryTracking(r.env,r.c.id);assert.equal(stats.counts.opened,1);assert.equal(stats.counts.clicked,1);assert.equal(before.length,4);r.close();
});
test('marketing webhook configuration ID is not mistaken for a global event ID',async()=>{
  const r=await prepared();await record(r,[event('delivered'),event('opened'),event('click',{URL:'https://e36united.cz/'})]);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM mailing_delivery_events').get().n,3);r.close();
});
test('unknown campaign has no writes; unknown recipient is audited without suppression or metric inflation',async()=>{
  const r=await prepared();assert.equal((await record(r,event('unsubscribe',{camp_id:999}))).ignored,1);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM mailing_delivery_events').get().n,0);
  contact(r.db,'outsider');await record(r,event('unsubscribe',{email:'outsider@example.invalid'}));
  assert.equal(r.db.prepare('SELECT recipient_id FROM mailing_delivery_events').get().recipient_id,null);
  assert.equal(r.db.prepare("SELECT suppression_status FROM mailing_contacts WHERE id='outsider'").get().suppression_status,'eligible');
  assert.equal((await deliveryTracking(r.env,r.c.id)).counts.unsubscribed,0);r.close();
});
test('test-only provider campaign events cannot enter live delivery history',async()=>{
  const r=mailingRuntime();r.env.BREVO_WEBHOOK_SECRET=secret;const c=await draft(r.env);await testCampaign(r.env,c.id,['test@example.invalid'],providerMock());
  assert.equal((await record(r,event('opened'))).ignored,1);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM mailing_delivery_events').get().n,0);r.close();
});
test('malformed JSON, invalid URLs, unknown events and invalid batches produce no writes',async()=>{
  const r=await prepared();
  for(const payload of [null,[],[event(),event('bad')],event('constructor'),event('__proto__'),event('click',{URL:'javascript:alert(1)'}),event('opened',{email:'bad'}),event('opened',{ts_event:null,ts:null}),event('opened',{camp_id:-1})]){
    assert.equal((await handleBrevoWebhook(request(payload),r.env)).status,400);
  }
  const bad=new Request(request(event()),{body:'{invalid'});assert.equal((await handleBrevoWebhook(bad,r.env)).status,400);
  assert.equal((await handleBrevoWebhook(request(event('opened',{extra:'x'.repeat(66000)})),r.env)).status,400);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM mailing_delivery_events').get().n,0);r.close();
});
for(const [type,suppression,deliverability] of [['unsubscribe','unsubscribed','deliverable'],['hard_bounce','hard_bounce','hard_bounce'],['spam','blocked','blocked'],['soft_bounce','eligible','deliverable']])test(`${type} correctly determines future preparation eligibility without altering Member data`,async()=>{
  const r=await prepared();await record(r,event(type));
  const stored=r.db.prepare("SELECT * FROM mailing_contacts WHERE id='one'").get();assert.equal(stored.suppression_status,suppression);assert.equal(stored.deliverability_status,deliverability);
  const c=await draft(r.env);
  if(type==='soft_bounce')await prepareCampaign(r.env,c.id,confirmation(c));else await assert.rejects(prepareCampaign(r.env,c.id,confirmation(c,0)),/no_eligible_recipients/);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM members').get().n,1);r.close();
});
test('out-of-order events preserve terminal suppression, latest timestamps and unique bounce metrics',async()=>{
  const r=await prepared();await record(r,event('unsubscribe',{ts_event:stamp+5}));await record(r,event('spam',{ts_event:stamp+3}));await record(r,event('hard_bounce',{ts_event:stamp+2}));await record(r,event('delivered'));await record(r,event('opened',{ts_event:stamp+10}));await record(r,event('opened',{ts_event:stamp+1}));
  assert.equal(row(r).delivery_status,'unsubscribed');assert.equal(row(r).last_opened_at,new Date((stamp+10)*1000).toISOString());
  const c=r.db.prepare("SELECT suppression_status,deliverability_status FROM mailing_contacts WHERE id='one'").get();assert.equal(c.suppression_status,'unsubscribed');assert.equal(c.deliverability_status,'blocked');
  const stats=await deliveryTracking(r.env,r.c.id);assert.equal(stats.counts.bounced,1);assert.equal(stats.counts.delivered,1);assert.equal(stats.counts.unsubscribed,1);r.close();
});
test('recipient/suppression projection failure rolls back the event and provider retry can recover',async()=>{
  const r=await prepared();r.db.exec("CREATE TRIGGER fail_suppress BEFORE UPDATE ON mailing_contacts BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
  assert.equal((await handleBrevoWebhook(request(event('unsubscribe')),r.env)).status,503);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM mailing_delivery_events').get().n,0);assert.equal(row(r).delivery_status,'prepared');
  r.db.exec('DROP TRIGGER fail_suppress');await record(r,event('unsubscribe'));assert.equal(row(r).delivery_status,'unsubscribed');r.close();
});
test('Admin delivery detail includes exact frozen preview and safe unique tracking with no provider request',async()=>{
  const r=await prepared();await record(r,event('delivered'));
  const req=new Request(`https://api.e36united.cz/api/admin/mailing/campaigns/${r.c.id}/delivery`);
  const response=await routeAdminMailing({request:req,env:r.env,url:new URL(req.url),auth:{uid:'admin'},origin:'https://e36united.cz'});
  const payload=await response.json();assert.equal(response.status,200);assert.equal(payload.tracking.counts.delivered,1);assert.equal(payload.frozenPreview.html,(await campaignRow(r.env,r.c.id)).prepared_html);assert.equal(JSON.stringify(payload).includes(secret),false);r.close();
});
