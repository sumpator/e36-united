import test from 'node:test';
import assert from 'node:assert/strict';
import { mailingRuntime,contact,draft,confirmation } from './helpers/mailing-runtime.mjs';
import { prepareCampaign,campaignRow,frozenRecipients } from '../worker/domains/mailing/preparation.js';
import { sendCampaign,testCampaign } from '../worker/domains/mailing/delivery.js';
import { createSmtp2goAdapter,SMTP2GO_REQUEST_BUDGET } from '../worker/domains/mailing/provider/smtp2go.js';

function transport(env){
  env.SMTP2GO_API_KEY='fixture-only';const state={calls:[],domain:'verified',quota:10000,batch:'ok'};
  state.adapter=()=>createSmtp2goAdapter(env,{timeoutMs:10,fetchImpl:async(url,options)=>{
    const path=new URL(url).pathname,body=JSON.parse(options.body);state.calls.push({url,path,body,headers:options.headers,redirect:options.redirect});
    if(path==='/v3/domain/view')return Response.json({request_id:'domain',data:{domains:state.domain==='missing'?[]:[{domain:{fulldomain:'e36united.cz',dkim_verified:state.domain==='verified',rpath_verified:state.domain==='verified'},trackers:[{fulldomain:'link.e36united.cz',cname_verified:true,enabled:true}]}]}});
    if(path==='/v3/stats/email_cycle')return Response.json({request_id:'quota',data:{cycle_start:'2026-09-01',cycle_end:'2026-09-30',cycle_used:2,cycle_remaining:state.quota,cycle_max:10000}});
    if(path==='/v3/email/batch'){
      if(state.batch==='timeout')return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('fixture'))));
      if(state.batch==='http400')return Response.json({data:{error:'fixture'}},{status:400});
      const data=body.emails.map((_,i)=>({email_id:`provider-${i+1}`}));if(state.batch==='partial')data.pop();if(state.batch==='missing')data[0]={};
      return Response.json({request_id:'batch-request',data});
    }
    if(path.startsWith('/v3/webhook/'))return Response.json({request_id:'hook',data:{id:7}});
    throw Error(`unexpected ${path}`);
  }});
  return state;
}
async function prepared(count=1){const r=mailingRuntime();for(let i=0;i<count;i++)contact(r.db,`person${i}`);contact(r.db,'suppressed','unsubscribed');const c=await draft(r.env),row=await prepareCampaign(r.env,c.id,confirmation(c,count));return {...r,c,row,provider:transport(r.env)}}
const confirm=r=>({preparationId:r.row.preparation_id,recipientCount:r.row.recipient_count});

for(const count of [1,50,200])test(`SMTP2GO live batch ${count}: constant three provider requests and ordered recipient IDs`,async()=>{
  const r=await prepared(count),p=r.provider;try{
    const frozen=await frozenRecipients(r.env,r.c.id);await sendCampaign(r.env,r.c.id,confirm(r),p.adapter());
    assert.equal(p.calls.length,3);assert.deepEqual(p.calls.map(c=>c.path),['/v3/domain/view','/v3/stats/email_cycle','/v3/email/batch']);
    const payload=p.calls[2].body;assert.equal(payload.emails.length,count);
    for(let i=0;i<count;i++){
      const email=payload.emails[i];assert.deepEqual(email.to,[frozen[i].normalized_email]);assert.equal(email.sender,'E36 United <info@e36united.cz>');
      assert.equal(email.html_body,r.row.prepared_html);assert.ok(email.text_body.length);assert.deepEqual(email.custom_headers,[
        {header:'Reply-To',value:'info@e36united.cz'},{header:'X-E36-Campaign-Id',value:r.c.id},{header:'X-E36-Recipient-Id',value:frozen[i].id},{header:'X-E36-Mail-Type',value:'campaign'}]);
    }
    const rows=r.db.prepare('SELECT provider_email_id FROM mailing_campaign_recipients ORDER BY normalized_email').all();
    assert.deepEqual(rows.map(x=>x.provider_email_id),frozen.map((_,i)=>`provider-${i+1}`));
    const row=await campaignRow(r.env,r.c.id);assert.equal(row.status,'sent');assert.equal(row.provider,'smtp2go');assert.equal(row.provider_request_id,'batch-request');
  }finally{r.close()}
});

test('readiness covers absent key, missing/unverified/verified domain and quota without exposing the key',async()=>{
  let calls=0;const absent=createSmtp2goAdapter({}, {fetchImpl:async()=>{calls++;throw Error()}});assert.equal((await absent.checkReadiness()).state,'not_configured');assert.equal(calls,0);
  const r=mailingRuntime(),p=transport(r.env);try{
    p.domain='missing';assert.equal((await p.adapter().checkReadiness()).state,'domain_missing');
    p.domain='unverified';assert.equal((await p.adapter().checkReadiness()).state,'domain_unverified');
    p.domain='verified';const ready=await p.adapter().checkReadiness();assert.equal(ready.state,'ready');assert.equal(ready.monthlyRemaining,10000);assert.equal(ready.trackingVerified,true);
    assert.equal(JSON.stringify(ready).includes('fixture-only'),false);assert.ok(p.calls.every(c=>c.headers['X-Smtp2go-Api-Key']==='fixture-only'));
    assert.ok(p.calls.every(c=>c.redirect==='manual'));
  }finally{r.close()}
});

test('readiness converts invalid auth, timeout and malformed responses into safe api_error state',async()=>{
  for(const [fetchImpl,code] of [[async()=>new Response(null,{status:401}),'provider_invalid_key'],[async(_,o)=>new Promise((_,reject)=>o.signal.addEventListener('abort',()=>reject(Error()))),'provider_timeout'],[async()=>Response.json({data:{}}),'provider_malformed']]){
    const p=createSmtp2goAdapter({SMTP2GO_API_KEY:'fixture'},{timeoutMs:5,fetchImpl}),state=await p.checkReadiness();assert.equal(state.state,'api_error');assert.equal(state.error,code);
  }
});

test('test send batches private one-recipient messages and persists no contact, recipient or campaign delivery state',async()=>{
  const r=mailingRuntime(),p=transport(r.env);try{const c=await draft(r.env);await testCampaign(r.env,c.id,['One@Example.invalid','two@example.invalid'],p.adapter());
    assert.equal(p.calls.length,3);const emails=p.calls[2].body.emails;assert.deepEqual(emails.map(x=>x.to),[['one@example.invalid'],['two@example.invalid']]);assert.ok(emails.every(x=>x.custom_headers.at(-1).value==='test'));
    assert.equal(r.db.prepare('SELECT COUNT(*) n FROM mailing_contacts').get().n,0);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM mailing_campaign_recipients').get().n,0);assert.equal((await campaignRow(r.env,c.id)).status,'draft');
  }finally{r.close()}
});

for(const mode of ['partial','missing'])test(`${mode} batch response is ambiguous, maps no IDs and locks against duplicate send`,async()=>{
  const r=await prepared(2),p=r.provider;try{p.batch=mode;await assert.rejects(sendCampaign(r.env,r.c.id,confirm(r),p.adapter()),/provider_batch_ambiguous/);
    assert.equal(r.db.prepare('SELECT COUNT(*) n FROM mailing_campaign_recipients WHERE provider_email_id IS NOT NULL').get().n,0);assert.ok((await campaignRow(r.env,r.c.id)).delivery_lock);
    await assert.rejects(sendCampaign(r.env,r.c.id,confirm(r),p.adapter()),/campaign_busy/);assert.equal(p.calls.filter(c=>c.path==='/v3/email/batch').length,1);
  }finally{r.close()}
});

test('ambiguous timeout stays locked; confirmed provider rejection releases for an explicit retry',async()=>{
  let r=await prepared(),p=r.provider;try{p.batch='timeout';await assert.rejects(sendCampaign(r.env,r.c.id,confirm(r),p.adapter()),/provider_timeout/);assert.ok((await campaignRow(r.env,r.c.id)).delivery_lock)}finally{r.close()}
  r=await prepared();p=r.provider;try{p.batch='http400';await assert.rejects(sendCampaign(r.env,r.c.id,confirm(r),p.adapter()),/provider_rejected/);assert.equal((await campaignRow(r.env,r.c.id)).delivery_lock,null);
    p.batch='ok';assert.equal((await sendCampaign(r.env,r.c.id,confirm(r),p.adapter())).status,'sent');assert.equal(p.calls.filter(c=>c.path==='/v3/email/batch').length,2);
  }finally{r.close()}
});

test('application and provider quota reject before batch; duplicate and sent campaigns never send twice',async()=>{
  const r=await prepared(2),p=r.provider;try{r.env.MAILING_DAILY_SEND_LIMIT='1';await assert.rejects(sendCampaign(r.env,r.c.id,confirm(r),p.adapter()),e=>e.code==='send_limit_exceeded'&&e.details.count===2&&e.details.limit===1);assert.equal(p.calls.length,0);
    r.env.MAILING_DAILY_SEND_LIMIT='200';p.quota=1;await assert.rejects(sendCampaign(r.env,r.c.id,confirm(r),p.adapter()),/provider_quota/);assert.equal(p.calls.filter(c=>c.path==='/v3/email/batch').length,0);
    p.quota=10;const results=await Promise.allSettled([sendCampaign(r.env,r.c.id,confirm(r),p.adapter()),sendCampaign(r.env,r.c.id,confirm(r),p.adapter())]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(p.calls.filter(c=>c.path==='/v3/email/batch').length,1);
    await assert.rejects(sendCampaign(r.env,r.c.id,confirm(r),p.adapter()),/campaign_not_prepared/);
  }finally{r.close()}
});

test('adapter has a small hard request ceiling and uses the EU API base',async()=>{
  let calls=0;const p=createSmtp2goAdapter({SMTP2GO_API_KEY:'fixture'},{fetchImpl:async url=>{calls++;assert.match(url,/^https:\/\/eu-api\.smtp2go\.com\/v3\//);return Response.json({data:{domains:[]}})}});
  assert.equal(SMTP2GO_REQUEST_BUDGET,8);for(let i=0;i<8;i++)await p.checkDomain();await assert.rejects(p.checkDomain(),/provider_request_budget/);assert.equal(calls,8);
});
