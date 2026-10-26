import test from 'node:test';
import assert from 'node:assert/strict';
import {createSmtp2goAdapter} from '../worker/domains/mailing/provider/smtp2go.js';
import {deliverTransactionalEmails} from '../worker/domains/mailing/transactional.js';
import {TRANSACTIONAL_TYPES,renderTransactionalEmail} from '../worker/domains/mailing/transactional-template.js';
import {transactionalExample} from '../worker/domains/mailing/transactional-routes.js';
import {merchRuntime} from './helpers/merch-runtime.mjs';
import {mailingRuntime,contact,draft,confirmation} from './helpers/mailing-runtime.mjs';
import {prepareCampaign} from '../worker/domains/mailing/preparation.js';
import {sendCampaign} from '../worker/domains/mailing/delivery.js';

const keys={SMTP2GO_API_KEY:'isolated-campaign',SMTP2GO_TRANSACTIONAL_API_KEY:'isolated-transactional'};
function provider(calls){return async(url,options)=>{
 const path=new URL(url).pathname,body=JSON.parse(options.body);calls.push({path,body,key:options.headers['X-Smtp2go-Api-Key']});
 if(path==='/v3/domain/view')return Response.json({data:{domains:[{domain:{fulldomain:'e36united.cz',dkim_verified:true,rpath_verified:true},trackers:[{fulldomain:'link.e36united.cz',cname_verified:true,enabled:true}]}]}});
 if(path==='/v3/stats/email_cycle')return Response.json({data:{cycle_used:0,cycle_remaining:100,cycle_max:100}});
 assert.equal(path,'/v3/email/batch');return Response.json({request_id:'isolated-request',data:body.emails.map((_,i)=>({email_id:'isolated-'+i}))});
}}

test('provider purpose selects distinct credentials for the same existing batch transport',async()=>{
 const calls=[],email={sender:'E36 United <info@e36united.cz>',to:['member@example.invalid'],subject:'Isolated',html_body:'<p>Isolated</p>',text_body:'Isolated'};
 await createSmtp2goAdapter(keys,{fetchImpl:provider(calls)}).sendBatch([email]);
 await createSmtp2goAdapter(keys,{purpose:'transactional',fetchImpl:provider(calls)}).sendBatch([email]);
 assert.deepEqual(calls.map(c=>c.key),[keys.SMTP2GO_API_KEY,keys.SMTP2GO_TRANSACTIONAL_API_KEY]);assert.deepEqual(calls.map(c=>c.body),[{emails:[email]},{emails:[email]}]);
 assert.throws(()=>createSmtp2goAdapter(keys,{purpose:'typo'}),/invalid_mail_purpose/);
});

test('missing transactional credential never falls back to the campaign key',async()=>{
 let calls=0;const p=createSmtp2goAdapter({SMTP2GO_API_KEY:keys.SMTP2GO_API_KEY},{purpose:'transactional',fetchImpl:async()=>{calls++;throw Error('Unexpected network')}});
 assert.equal((await p.checkReadiness()).state,'not_configured');await assert.rejects(p.sendBatch([{}]),/provider_not_configured/);assert.equal(calls,0);
});

test('rejected transactional key never tries another credential',async()=>{
 const calls=[];const p=createSmtp2goAdapter(keys,{purpose:'transactional',fetchImpl:async(_,options)=>{calls.push(options.headers['X-Smtp2go-Api-Key']);return new Response(null,{status:401})}});
 await assert.rejects(p.sendBatch([{}]),/provider_invalid_key/);assert.deepEqual(calls,[keys.SMTP2GO_TRANSACTIONAL_API_KEY]);
});

test('real transactional order intent uses its dedicated key and retains queued mail when absent',async t=>{
 const r=await merchRuntime();t.after(r.close);r.db.exec('UPDATE transactional_email_control SET enabled=1 WHERE id=1');Object.assign(r.env,{SMTP2GO_API_KEY:keys.SMTP2GO_API_KEY});
 const order=await r.order(),row=r.db.prepare("SELECT * FROM email_outbox WHERE entity_id=? AND template_key='merch_confirmation'").get(order.id),calls=[],previous=globalThis.fetch;
 globalThis.fetch=provider(calls);
 try{
  assert.equal((await deliverTransactionalEmails(r.env,{id:row.id})).processed,0);assert.equal(calls.length,0);
  assert.equal(r.db.prepare('SELECT status,attempts FROM email_outbox WHERE id=?').get(row.id).status,'queued');
  assert.equal(r.db.prepare('SELECT attempts FROM email_outbox WHERE id=?').get(row.id).attempts,0);
  r.env.SMTP2GO_TRANSACTIONAL_API_KEY=keys.SMTP2GO_TRANSACTIONAL_API_KEY;
  await deliverTransactionalEmails(r.env,{id:row.id});await deliverTransactionalEmails(r.env,{id:row.id});assert.equal(calls.length,1);assert.equal(calls[0].key,keys.SMTP2GO_TRANSACTIONAL_API_KEY);
  const email=calls[0].body.emails[0];assert.deepEqual(email.to,['member@example.invalid']);assert.ok(email.html_body&&email.text_body);assert.doesNotMatch(email.html_body,/%%UNSUBSCRIBE%%|>unsubscribe</i);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM merch_orders').get().n,1);assert.equal(r.db.prepare('SELECT status FROM email_outbox WHERE id=?').get(row.id).status,'sent');
 }finally{globalThis.fetch=previous}
});

test('real campaign retains the original key, one Czech unsubscribe tag and consent filtering',async t=>{
 const r=mailingRuntime();t.after(r.close);Object.assign(r.env,keys);contact(r.db,'yes');contact(r.db,'opted-out','unsubscribed');contact(r.db,'no-consent','eligible','no');
 const c=await draft(r.env),row=await prepareCampaign(r.env,c.id,confirmation(c,1)),calls=[],previous=globalThis.fetch;globalThis.fetch=provider(calls);
 try{
  await sendCampaign(r.env,c.id,{preparationId:row.preparation_id,recipientCount:row.recipient_count});assert.equal(calls.length,3);assert.ok(calls.every(c=>c.key===keys.SMTP2GO_API_KEY));
  const email=calls.at(-1).body.emails[0];assert.deepEqual(email.to,['yes@example.invalid']);assert.match(email.html_body,/>Odhlásit odběr</);assert.equal([...email.html_body.matchAll(/href="%%UNSUBSCRIBE%%"/g)].length,1);
  assert.match(email.text_body,/Odhlásit odběr: %%UNSUBSCRIBE%%/);assert.equal([...email.text_body.matchAll(/%%UNSUBSCRIBE%%/g)].length,1);assert.equal(calls.at(-1).body.emails.length,1);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM mailing_campaign_recipients').get().n,1);
 }finally{globalThis.fetch=previous}
});

test('all business templates contain contact footer, never a newsletter unsubscribe tag',()=>{
 for(const kind of Object.keys(TRANSACTIONAL_TYPES)){
  const m=renderTransactionalEmail(kind,transactionalExample(kind));assert.match(m.html,/mailto:info@e36united.cz/);assert.match(m.text,/info@e36united.cz/);assert.doesNotMatch(m.html,/%%UNSUBSCRIBE%%|>unsubscribe</i);
 }
});
