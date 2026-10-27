import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {privatePollRuntime,POLL,ORIGIN} from './helpers/private-poll-runtime.mjs';
import {hashPollToken} from '../worker/domains/private-polls.js';

test('GET/HEAD, invalid links and prefetch do not write; public capability leaks no recipient',async()=>{
 const r=await privatePollRuntime();try{
  const before=r.db.prepare('SELECT total_changes() n').get().n;const original=r.row();
  for(const method of ['GET','HEAD'])assert.equal((await r.call({method})).status,200);
  assert.equal((await r.call({token:'invalid'})).status,404);
  assert.equal((await r.call({path:'/api/private-polls/other/response'})).status,404);
  assert.equal((await r.call({headers:{Purpose:'prefetch'}})).status,403);
  const data=await(await r.call()).json();assert(!JSON.stringify(data).includes('guest-'));assert(!JSON.stringify(data).includes(r.tokens[0]));assert.deepEqual(r.row(),original);assert.equal(r.db.prepare('SELECT total_changes() n').get().n,before);
  assert.equal(r.row().token_hash,await hashPollToken(r.tokens[0]));assert.notEqual(r.row().token_hash,r.tokens[0]);
 }finally{r.close()}
});
test('three choices, explicit score, replay, clear and reopen preserve one row per recipient',async()=>{
 const r=await privatePollRuntime();try{
  r.env.SMTP2GO_TRANSACTIONAL_API_KEY='isolated-no-send';const before=r.db.prepare('SELECT count(*) n FROM email_outbox').get().n;
  let version=0;
  for(const [answer,score] of [['yes',null],['yes',7],['no',null],['maybe',null],['yes',null],['yes',0],['yes',10]]){
   const body={answer,score,expectedVersion:version,operationId:crypto.randomUUID()};
   const first=await(await r.call({method:'POST',body})).json();assert.equal(first.response.version,++version);assert.equal(first.response.score,score);
   assert.deepEqual(await(await r.call({method:'POST',body})).json(),first,'lost response retry does not create another version');
   assert.deepEqual(await(await r.call()).json(),first,'reopen reads latest');
  }
  assert.equal(r.db.prepare('SELECT count(*) n FROM private_poll_invitations').get().n,2);assert.equal(r.row(1).version,0);assert.equal(r.row().version,7);
  assert.equal(r.db.prepare('SELECT count(*) n FROM email_outbox').get().n,before);assert.deepEqual(r.waits,[]);
 }finally{r.close()}
});
test('CAS prevents delayed writes and initial stale links, separates recipients and validates all inputs',async()=>{
 const r=await privatePollRuntime();try{
  const body={answer:'yes',score:null,expectedVersion:0,operationId:'first'};
  assert.equal((await r.call({method:'POST',body})).status,200);
  assert.equal((await r.call({method:'POST',body:{...body,answer:'no',operationId:'late'}})).status,409);
  assert.equal(r.row().answer,'yes');assert.equal(r.row(1).answer,null);
  for(const invalid of [{score:7,answer:'no'},{score:7.5},{score:11},{score:-1},{answer:'bogus'},{expectedVersion:-1},{operationId:''}])assert.equal((await r.call({method:'POST',body:{...body,...invalid}})).status,400);
  assert.equal((await r.call({method:'POST',body,headers:{Origin:'https://evil.invalid'}})).status,403);
  assert.equal((await r.call({method:'POST',body,headers:{Origin:''}})).status,403);
  assert.equal((await r.call({method:'POST',body,headers:{'Content-Type':'text/plain'}})).status,400);
  const parallel=await Promise.all(['yes','no'].map(answer=>r.call({method:'POST',body:{answer,score:null,expectedVersion:1,operationId:answer}})));
  assert.deepEqual(parallel.map(x=>x.status).sort(),[200,409]);assert.equal(r.row().version,2);
  r.db.prepare('UPDATE private_polls SET closed_at=? WHERE id=?').run(new Date().toISOString(),POLL);
  const closed=await r.call({method:'POST',body:{answer:'maybe',score:null,expectedVersion:2,operationId:'closed'}});assert.equal(closed.status,403);assert.equal((await closed.json()).ok,false);assert.equal(r.row().version,2);
 }finally{r.close()}
});
test('Admin authorization uses current active server role; provisioning cannot duplicate or replace a link',async()=>{
 const r=await privatePollRuntime();try{
  const path='/api/admin/private-polls/'+POLL+'/results';
  assert.equal((await r.call({path,token:''})).status,401);
  assert.equal((await r.admin('GET',path,null,'reader')).status,403);
  const result=await(await r.admin('GET',path)).json();assert.equal(result.results.length,2);assert.equal(result.results[0].recipient,'guest-0@example.invalid');assert(!JSON.stringify(result).includes('token_hash'));
  r.db.exec("UPDATE members SET status='blocked' WHERE id='admin'");assert.equal((await r.admin('GET',path)).status,403);r.db.exec("UPDATE members SET status='active' WHERE id='admin'");
  const invitation={id:'invite-0',email:'guest-0@example.invalid',name:'Synthetic guest 0',token:r.tokens[0]},endpoint='/api/admin/private-polls/'+POLL+'/invitations';
  assert.equal((await r.admin('POST',endpoint,invitation)).status,200);
  assert.equal((await r.admin('POST',endpoint,{...invitation,id:'duplicate'})).status,409);
  assert.equal((await r.admin('POST',endpoint,{...invitation,email:'foreign@example.invalid'})).status,409);
  assert.equal(r.db.prepare('SELECT count(*) n FROM private_poll_invitations').get().n,2);
 }finally{r.close()}
});
test('additive migration preserves existing schema/data, indexes, triggers and foreign keys',()=>{
 const db=new DatabaseSync(':memory:');try{
  const schema=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8').split('-- Additive, separate from members, campaigns, bookings and LIVE.')[0];db.exec(schema);
  db.exec("INSERT INTO members(id,member_code,email,name,role) VALUES('old','OLD','old@example.invalid','Existing','admin')");
  const before=db.prepare("SELECT type,name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all(),member=db.prepare("SELECT * FROM members WHERE id='old'").get();
  db.exec(readFileSync(new URL('../db/migrations/2026-10-27-private-polls.sql',import.meta.url),'utf8'));
  for(const item of before)assert.deepEqual(db.prepare('SELECT type,name,sql FROM sqlite_master WHERE name=?').get(item.name),item);
  assert.deepEqual(db.prepare("SELECT * FROM members WHERE id='old'").get(),member);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{db.close()}
});

test('real Worker router verifies Firebase signature and current Admin role before exposing results',async()=>{
 const r=await privatePollRuntime(),originalFetch=globalThis.fetch;
 try{
  const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);Object.assign(jwk,{kid:'private-poll-test-key',alg:'RS256',use:'sig'});
  globalThis.fetch=async url=>{assert.equal(String(url),'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');return new Response(JSON.stringify({keys:[jwk]}),{headers:{'Content-Type':'application/json','Cache-Control':'max-age=3600'}})};
  async function jwt(uid){const now=Math.floor(Date.now()/1000),encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url'),unsigned=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({sub:uid,aud:'e36-united',iss:'https://securetoken.google.com/e36-united',iat:now,auth_time:now,exp:now+3600});return unsigned+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(unsigned))).toString('base64url')}
  const path='/api/admin/private-polls/'+POLL+'/results',admin=await jwt('admin'),reader=await jwt('reader');
  assert.equal((await r.call({path,token:reader})).status,403);
  const response=await r.call({path,token:admin});assert.equal(response.status,200);assert.equal((await response.json()).results.length,2);
  r.db.exec("UPDATE members SET role='member' WHERE id='admin'");assert.equal((await r.call({path,token:admin})).status,403);
 }finally{globalThis.fetch=originalFetch;r.close()}
});
