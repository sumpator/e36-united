import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { mailingRuntime, contact, draft, confirmation, providerMock } from './helpers/mailing-runtime.mjs';
import { prepareCampaign, unprepareCampaign, frozenRecipients, campaignRow } from '../worker/domains/mailing/preparation.js';
import { sendCampaign, syncCampaign, testCampaign } from '../worker/domains/mailing/delivery.js';
import { updateMailingCampaign } from '../worker/domains/mailing/campaigns.js';
import { createBrevoAdapter } from '../worker/domains/mailing/provider/brevo.js';

test('exact additive C migration applies to pre-C schema and retains fixtures / foreign keys',()=>{
  const schema=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8');
  const db=new DatabaseSync(':memory:'); db.exec(schema.slice(0,schema.indexOf('-- Mailing C.'))+'COMMIT;');
  db.exec("INSERT INTO members(id,member_code,email,name) VALUES('a','A','a@example.invalid','A');");
  db.exec(readFileSync(new URL('../db/migrations/2026-09-07-production-feedback.sql',import.meta.url),'utf8'));
  db.exec("INSERT INTO mailing_campaigns(id,created_by,internal_name,subject,segment_definition_json) VALUES('existing','a','Existing draft','Existing subject','{}');");
  db.exec(readFileSync(new URL('../db/migrations/2026-09-07-mailing-delivery.sql',import.meta.url),'utf8'));
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('SELECT COUNT(*) n FROM members').get().n,1);
  const existing=db.prepare("SELECT * FROM mailing_campaigns WHERE id='existing'").get();assert.equal(existing.status,'draft');assert.equal(existing.subject,'Existing subject');assert.equal(existing.prepared_html,null);assert.equal(existing.provider_campaign_id,null);
  const canonical=new DatabaseSync(':memory:');canonical.exec(schema);
  for(const table of ['mailing_campaigns','mailing_campaign_recipients','mailing_delivery_events','events','member_onboarding','public_planner_handoffs']){
    assert.deepEqual(db.prepare(`PRAGMA table_info(${table})`).all(),canonical.prepare(`PRAGMA table_info(${table})`).all());
    assert.deepEqual(db.prepare(`PRAGMA foreign_key_list(${table})`).all(),canonical.prepare(`PRAGMA foreign_key_list(${table})`).all());
  }
  canonical.close();db.close();
});
for(const [suppression,consent,deliverability] of [['unsubscribed','yes','deliverable'],['hard_bounce','yes','deliverable'],['blocked','yes','deliverable'],['manually_suppressed','yes','deliverable'],['eligible','no','deliverable'],['eligible','unknown','deliverable'],['eligible','yes','hard_bounce']]){
  test(`prepare excludes ${suppression}/${consent}/${deliverability} even in all-contacts segment`,async()=>{
    const r=mailingRuntime();contact(r.db);contact(r.db,'excluded',suppression,consent,deliverability);
    const c=await draft(r.env);await prepareCampaign(r.env,c.id,confirmation(c));
    const recipients=await frozenRecipients(r.env,c.id);assert.equal(recipients.length,1);assert.equal(recipients[0].normalized_email,'one@example.invalid');r.close();
  });
}
test('zero eligible recipients refuses preparation without a half snapshot',async()=>{
  const r=mailingRuntime(),c=await draft(r.env);await assert.rejects(prepareCampaign(r.env,c.id,confirmation(c,0)),/no_eligible_recipients/);
  assert.equal((await campaignRow(r.env,c.id)).status,'draft');assert.deepEqual(await frozenRecipients(r.env,c.id),[]);r.close();
});
test('prepare freezes exact subject HTML recipients and source independently of later edits',async()=>{
  const r=mailingRuntime();contact(r.db);const c=await draft(r.env),p=await prepareCampaign(r.env,c.id,confirmation(c));
  const frozen=await frozenRecipients(r.env,c.id);
  await assert.rejects(updateMailingCampaign(r.env,c.id,{subject:'Changed',segment:{rules:[{type:'legacy_only'}]}}),/prepared_campaign_immutable/);
  r.db.exec("UPDATE mailing_contacts SET email='changed@example.invalid',name='Changed';");
  assert.deepEqual(await frozenRecipients(r.env,c.id),frozen);assert.equal((await campaignRow(r.env,c.id)).prepared_html,p.prepared_html);
  assert.equal(p.prepared_subject,c.subject);assert.match(p.prepared_html,/\{\{ unsubscribe \}\}/);r.close();
});
test('concurrent / repeated prepare has one winner and unprepare clears all frozen content',async()=>{
  const r=mailingRuntime();contact(r.db);const c=await draft(r.env);
  const results=await Promise.allSettled([prepareCampaign(r.env,c.id,confirmation(c)),prepareCampaign(r.env,c.id,confirmation(c))]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await frozenRecipients(r.env,c.id)).length,1);
  const row=await unprepareCampaign(r.env,c.id);assert.equal(row.status,'draft');assert.equal(row.prepared_html,null);assert.equal(row.preparation_id,null);assert.deepEqual(await frozenRecipients(r.env,c.id),[]);r.close();
});
test('sent and provider-synced campaigns cannot unprepare',async()=>{
  const r=mailingRuntime();contact(r.db);const c=await draft(r.env);await prepareCampaign(r.env,c.id,confirmation(c));
  await syncCampaign(r.env,c.id,providerMock());await assert.rejects(unprepareCampaign(r.env,c.id),/provider_already_used/);
  r.db.exec("UPDATE mailing_campaigns SET status='sent'");await assert.rejects(unprepareCampaign(r.env,c.id),/campaign_not_prepared/);r.close();
});
test('real send uses frozen exact provider payload and accepts only once / reuses campaign',async()=>{
  const r=mailingRuntime();contact(r.db);const c=await draft(r.env),p=await prepareCampaign(r.env,c.id,confirmation(c)),provider=providerMock();
  await syncCampaign(r.env,c.id,provider);await syncCampaign(r.env,c.id,provider);
  const body=provider.calls.find(x=>x[0]==='campaign')[1];assert.equal(body.htmlContent,p.prepared_html);assert.equal(body.subject,p.prepared_subject);assert.equal(body.previewText,p.prepared_preheader);
  assert.deepEqual(body.sender,{name:'E36 United',email:'info@e36united.cz'});assert.equal(body.replyTo,'info@e36united.cz');assert.deepEqual(body.recipients,{listIds:[11]});
  const confirm={preparationId:p.preparation_id,recipientCount:1};
  const results=await Promise.allSettled([sendCampaign(r.env,c.id,confirm,provider),sendCampaign(r.env,c.id,confirm,provider)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(provider.calls.filter(x=>x[0]==='send').length,1);assert.equal(provider.calls.filter(x=>x[0]==='campaign').length,1);
  assert.equal((await campaignRow(r.env,c.id)).status,'sent');await assert.rejects(sendCampaign(r.env,c.id,confirm,provider),/campaign_not_prepared/);r.close();
});
test('send rejects draft, missing frozen population, quota and surveys before provider calls',async()=>{
  const r=mailingRuntime();contact(r.db);let c=await draft(r.env);const provider=providerMock();
  await assert.rejects(sendCampaign(r.env,c.id,{},provider),/campaign_not_prepared/);
  await prepareCampaign(r.env,c.id,confirmation(c));r.env.MAILING_DAILY_SEND_LIMIT='0';
  await assert.rejects(sendCampaign(r.env,c.id,{},provider),/send_limit_exceeded/);delete r.env.MAILING_DAILY_SEND_LIMIT;
  r.db.prepare('DELETE FROM mailing_campaign_recipients WHERE campaign_id=?').run(c.id);
  await assert.rejects(sendCampaign(r.env,c.id,{},provider),/no_eligible_recipients/);
  c=await draft(r.env,{survey:true});await prepareCampaign(r.env,c.id,confirmation(c));
  await assert.rejects(syncCampaign(r.env,c.id,provider),/survey_delivery_not_ready/);assert.equal(provider.calls.length,0);r.close();
});
test('uncertain provider failure leaves prepared state locked instead of retrying sendNow',async()=>{
  const r=mailingRuntime();contact(r.db);const c=await draft(r.env),p=await prepareCampaign(r.env,c.id,confirmation(c)),provider=providerMock();await syncCampaign(r.env,c.id,provider);
  let calls=0;provider.sendNow=async()=>{calls++;throw new Error('network interrupted')};const confirm={preparationId:p.preparation_id,recipientCount:1};
  await assert.rejects(sendCampaign(r.env,c.id,confirm,provider));assert.equal((await campaignRow(r.env,c.id)).status,'prepared');
  assert.equal((await campaignRow(r.env,c.id)).provider_status,'needs_reconciliation');await assert.rejects(sendCampaign(r.env,c.id,confirm,provider),/campaign_busy/);assert.equal(calls,1);r.close();
});
test('draft test uses explicit addresses and never freezes/imports/marks sent; edits update only test campaign',async()=>{
  const r=mailingRuntime(),c=await draft(r.env,{survey:true}),provider=providerMock();
  for(const addresses of [[],['bad'],Array(6).fill('test@example.invalid')])await assert.rejects(testCampaign(r.env,c.id,addresses,provider),/invalid_test_addresses/);
  await testCampaign(r.env,c.id,['test@example.invalid'],provider);
  await updateMailingCampaign(r.env,c.id,{subject:'New subject'});await testCampaign(r.env,c.id,['test@example.invalid'],provider);
  assert.equal(provider.calls.find(x=>x[0]==='update')[2].subject,'New subject');
  assert.equal((await campaignRow(r.env,c.id)).status,'draft');assert.deepEqual(await frozenRecipients(r.env,c.id),[]);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM mailing_contacts').get().n,0);r.close();
});
test('provider absent never invokes fetch',async()=>{
  let calls=0;const p=createBrevoAdapter({}, {fetchImpl:async()=>{calls++;throw Error('internet forbidden')}});
  assert.equal((await p.checkReadiness()).state,'not_configured');await assert.rejects(p.sendNow(1),/provider_not_configured/);assert.equal(calls,0);
});
for(const [http,code] of [[400,'provider_rejected'],[401,'provider_invalid_key'],[402,'provider_quota'],[429,'provider_rate_limit'],[500,'provider_unavailable']])test(`provider ${http} is normalized without secrets`,async()=>{
  const p=createBrevoAdapter({BREVO_API_KEY:'secret-fixture'},{fetchImpl:async()=>new Response('secret-fixture raw private response',{status:http})});
  await assert.rejects(p.sendNow(1),e=>e.code===code&&!JSON.stringify(e).includes('secret-fixture'));
});
test('adapter readiness, contact upsert, test and live requests match Marketing API',async()=>{
  const calls=[];const p=createBrevoAdapter({BREVO_API_KEY:'mock-only',BREVO_LIST_FOLDER_ID:'9'},{fetchImpl:async(url,options)=>{
    calls.push({url,options,body:options.body&&JSON.parse(options.body)});
    return url.endsWith('/senders')?Response.json({senders:[{email:'info@e36united.cz',active:true}]}):url.includes('/senders/domains/')?Response.json({verified:true,authenticated:true}):options.method==='POST'&&!url.endsWith('sendNow')&&!url.endsWith('sendTest')?Response.json({id:4},{status:201}):new Response(null,{status:204});
  }});
  assert.equal((await p.checkReadiness()).state,'ready');assert.equal(await p.createDeliveryList('fixture'),4);
  await p.syncRecipients(4,[{normalized_email:'test@example.invalid',phone:'must not leak'}]);await p.createCampaign({name:'fixture'});await p.updateCampaign(4,{subject:'changed'});await p.sendTest(4,['test@example.invalid']);await p.sendNow(4);
  assert.deepEqual(calls.find(c=>c.url.endsWith('/contacts')).body,{email:'test@example.invalid',listIds:[4],updateEnabled:true});
  assert.deepEqual(calls.find(c=>c.url.endsWith('/sendTest')).body,{emailTo:['test@example.invalid']});assert.ok(calls.some(c=>c.url.endsWith('/emailCampaigns/4/sendNow')));
});
for(const [sender,verified,authenticated,state] of [[false,true,true,'sender_missing'],[true,false,false,'domain_unverified'],[true,true,false,'domain_unauthenticated']])test(`readiness reports ${state}`,async()=>{
  const p=createBrevoAdapter({BREVO_API_KEY:'mock'},{fetchImpl:async url=>Response.json(url.endsWith('/senders')?{senders:[{email:'info@e36united.cz',active:sender}]}:{verified,authenticated})});assert.equal((await p.checkReadiness()).state,state);
});
test('provider timeout and malformed response are finite and sanitized',async()=>{
  const p=createBrevoAdapter({BREVO_API_KEY:'mock'},{timeoutMs:5,fetchImpl:async(_,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted'))))});
  await assert.rejects(p.sendNow(1),/provider_timeout/);
  for(const response of [()=>new Response('{invalid'),()=>Response.json({}),()=>new Response(null,{status:204})]){
    const bad=createBrevoAdapter({BREVO_API_KEY:'mock'},{fetchImpl:async()=>response()});await assert.rejects(bad.createCampaign({name:'test'}),/provider_malformed/);
  }
});

test('failed preparation batch rolls back status and snapshot atomically',async()=>{
  const r=mailingRuntime();contact(r.db);const c=await draft(r.env);
  r.db.exec("CREATE TRIGGER fail_recipient BEFORE INSERT ON mailing_campaign_recipients BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
  await assert.rejects(prepareCampaign(r.env,c.id,confirmation(c)),/fixture failure/);
  assert.equal((await campaignRow(r.env,c.id)).status,'draft');assert.equal((await campaignRow(r.env,c.id)).prepared_html,null);assert.deepEqual(await frozenRecipients(r.env,c.id),[]);r.close();
});
test('later opt-out vetoes frozen delivery even after provider synchronization',async()=>{
  const r=mailingRuntime();contact(r.db);const c=await draft(r.env),p=await prepareCampaign(r.env,c.id,confirmation(c)),provider=providerMock();await syncCampaign(r.env,c.id,provider);
  r.db.exec("UPDATE mailing_contacts SET suppression_status='unsubscribed'");
  await assert.rejects(sendCampaign(r.env,c.id,{preparationId:p.preparation_id,recipientCount:1},provider),/recipients_no_longer_eligible/);
  assert.equal(provider.calls.some(x=>x[0]==='send'),false);assert.equal((await frozenRecipients(r.env,c.id)).length,1);r.close();
});
test('daily admission includes previously accepted campaigns and no over-limit provider send occurs',async()=>{
  const r=mailingRuntime();r.env.MAILING_DAILY_SEND_LIMIT='1';contact(r.db);
  let nextId=20;const provider=providerMock();provider.createCampaign=async()=>++nextId;
  for(let i=0;i<2;i++){
    const c=await draft(r.env),p=await prepareCampaign(r.env,c.id,confirmation(c));await syncCampaign(r.env,c.id,provider);
    const send=()=>sendCampaign(r.env,c.id,{preparationId:p.preparation_id,recipientCount:1},provider);
    if(i===0)await send();else await assert.rejects(send(),/send_limit_exceeded/);
  }
  assert.equal(provider.calls.filter(x=>x[0]==='send').length,1);r.close();
});

test('opt-out arriving during readiness is caught by atomic send admission',async()=>{
  const r=mailingRuntime();contact(r.db);const c=await draft(r.env),p=await prepareCampaign(r.env,c.id,confirmation(c)),provider=providerMock();await syncCampaign(r.env,c.id,provider);
  provider.checkReadiness=async()=>{r.db.exec("UPDATE mailing_contacts SET suppression_status='unsubscribed'");return {ready:true}};
  await assert.rejects(sendCampaign(r.env,c.id,{preparationId:p.preparation_id,recipientCount:1},provider),/recipients_no_longer_eligible/);
  assert.equal(provider.calls.some(x=>x[0]==='send'),false);r.close();
});

test('suppression arriving before the preparation transaction cannot be frozen as eligible',async()=>{
  const r=mailingRuntime();contact(r.db);const c=await draft(r.env),batch=r.env.DB.batch;
  r.env.DB.batch=statements=>{r.db.exec("UPDATE mailing_contacts SET suppression_status='unsubscribed'");return batch(statements)};
  await assert.rejects(prepareCampaign(r.env,c.id,confirmation(c)),/campaign_changed/);
  assert.equal((await campaignRow(r.env,c.id)).status,'draft');assert.deepEqual(await frozenRecipients(r.env,c.id),[]);r.close();
});
