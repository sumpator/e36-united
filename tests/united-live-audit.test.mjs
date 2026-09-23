// Regressions converted from the completed LIVE audit.
// Only in-memory SQLite and VM dependencies; no network or production bindings.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { memberRuntime } from './helpers/admin-member-runtime.mjs';
import { getAdminLive, getMemberLive, startLiveEntry, saveJudgeScore, resolveLiveQr, setLivePresence, controlLive } from '../worker/domains/live.js';
import { createAdminApiClient } from '../admin/request-client.js';

const origin='https://e36united.cz', admin={uid:'a'};
const req=body=>new Request(origin+'/api/audit',{method:'POST',body:JSON.stringify(body)});
const source=readFileSync(new URL('../admin/modules/live.js',import.meta.url),'utf8');
function harness(payload){
  const document=new EventTarget(),window=new EventTarget();
  const root={innerHTML:'',querySelectorAll:()=>[],replaceChildren(){this.innerHTML=''}};
  document.querySelector=selector=>selector==='[data-admin-live-body]'?root:null;
  document.querySelectorAll=()=>[];document.body={classList:{toggle(){}}};
  const logs=[];
  const context=vm.createContext({document,window,console:{error:(...v)=>logs.push(v),warn:(...v)=>logs.push(v)},
    adminState:{selectedEventId:'e',currentUser:{uid:'a'},activeAdminView:'dashboard'},
    apiRequest:async path=>path==='/api/live'?{event:{id:'e'},me:{memberId:'a'},judgeHistory:[]}:payload,
    escapeHtml:String,toast(){},navigator:{onLine:true},setTimeout,clearTimeout,cancelAnimationFrame(){},
    requestAnimationFrame:fn=>fn(),localStorage:{getItem:()=>null},URL});
  vm.runInContext(source.replace(/^import .*;\r?\n/gm,'').replace('export function initializeAdminLive','function initializeAdminLive')+'\nglobalThis.factory=initializeAdminLive;',context);
  return{app:context.factory({setAdminView:()=>true}),document,window,root,logs};
}
function prepared(){
  const r=memberRuntime();
  r.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'; UPDATE cars SET body='Sedan' WHERE id='c'; UPDATE reservations SET car_id='c',show_shine='Ano' WHERE id='r'; INSERT INTO event_member_presence(event_id,member_id,present,confirmed_by) VALUES('e','m',1,'a'); INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category,presented_at) VALUES('entry','e','show_shine','m','c',NULL,CURRENT_TIMESTAMP); INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id,version) VALUES('e','show_shine','live','entry',3)");
  return r;
}

test('LIVE regression actual Admin load renders populated and empty states',async()=>{
  const r=prepared();try{
    const payload=await (await getAdminLive(r.env,new URL(origin+'/api/admin/live?eventId=e'),origin)).json();
    const fixed=harness(payload);
    assert.equal((await fixed.app.load()).event.id,'e');
    assert.equal(fixed.logs.length,0);
    assert.match(fixed.root.innerHTML,/Aktuální auto zatím nemá kategorii/);
    payload.states.show_shine.entry=null;
    assert.equal((await harness(payload).app.load()).event.id,'e');
  }finally{r.db.close()}
});

test('LIVE regression shell dispatch is intercepted once by Admin LIVE entry listener',()=>{
  const h=harness({event:{id:'e'},states:{}});
  const shell=readFileSync(new URL('../admin/shell.js',import.meta.url),'utf8');
  const dispatch=shell.match(/window\.dispatchEvent\(request\);/)[0];
  const request=new Event('admin:liveentryrequest',{cancelable:true});
  vm.runInNewContext(dispatch,{window:h.window,request});
  assert.equal(request.defaultPrevented,true);
  assert.match(source,/window\.addEventListener\('admin:liveentryrequest'/);
});

test('LIVE regression active legacy entry acquires its explicit category without losing scores',async()=>{
  const r=prepared();try{
    await saveJudgeScore(req({scores:{overall:8,condition:9,cohesion:7,originality:8},submitted:true}),r.env,admin,'entry',origin);
    const saved=r.db.prepare('SELECT * FROM live_judge_scores').all();
    const response=await startLiveEntry(req({discipline:'show_shine',memberId:'m',carId:'c',category:'Sedan',expectedVersion:3}),r.env,admin,'e',origin);
    assert.equal(response.status,200);assert.equal((await response.json()).replayed,true);
    assert.equal(r.db.prepare("SELECT category FROM live_entries WHERE id='entry'").get().category,'Sedan');
    assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_category_state').get().n,1);
    assert.deepEqual(r.db.prepare('SELECT * FROM live_judge_scores').all(),saved);
    const closed=await controlLive(req({action:'close_category',category:'Sedan',expectedCategoryVersion:2}),r.env,admin,'e','show_shine',origin);
    assert.equal(closed.status,200);
  }finally{r.db.close()}
});

test('LIVE regression judge write and overwrite persist across reads without assignment, payment or checkin',async()=>{
  const r=prepared();try{
    for(const value of [7,9]){
      const response=await saveJudgeScore(req({scores:{overall:value,condition:8,cohesion:8,originality:8},submitted:true,note:'isolated'}),r.env,admin,'entry',origin);
      assert.equal(response.status,200);
    }
    assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_judge_scores').get().n,1);
    const reloaded=await (await getMemberLive(r.env,admin,origin)).json();
    assert.equal(reloaded.me.judge,true);assert.equal(reloaded.me.reservation,null);
    assert.equal(reloaded.judgeHistory[0].scores.overall,9);assert.equal(reloaded.judgeHistory[0].submitted,true);
    assert.deepEqual((await (await getMemberLive(r.env,{uid:'n'},origin)).json()).judgeHistory,[]);
  }finally{r.db.close()}
});

test('LIVE regression business 403 does not revoke Admin, authorization 403 does',async()=>{
  let denied=0,code='own_car_score';const user={uid:'a',getIdToken:async()=>'isolated-test-token'};
  const client=createAdminApiClient({baseUrl:origin,getContext:()=>({user,generation:1,eventId:'e'}),
    fetchRequest:async()=>Response.json({error:code},{status:403}),onDenied:()=>denied++});
  await assert.rejects(client.request('/api/live/judge/scores/entry',{method:'PUT',body:{}}),/own_car_score/);
  assert.equal(denied,0);code='admin_forbidden';
  await assert.rejects(client.request('/api/admin/live'),/admin_forbidden/);assert.equal(denied,1);
});

test('LIVE regression QR resolve is read-only; only explicit presence command writes',async()=>{
  const r=prepared();try{
    const token='a'.repeat(48);r.db.prepare('INSERT INTO member_qr_identities(member_id,token) VALUES(?,?)').run('m',token);
    r.db.exec('DELETE FROM event_member_presence');
    const before=r.writes;
    const resolved=await (await resolveLiveQr(req({payload:'E36U1:'+token}),r.env,'e',origin)).json();
    assert.equal(resolved.member.memberId,'m');assert.equal(resolved.member.present,false);assert.equal(r.writes,before);
    assert.equal((await resolveLiveQr(req({payload:'EU-MEMBER'}),r.env,'e',origin)).status,400);
    assert.equal((await setLivePresence(req({present:true}),r.env,admin,'e','m',origin)).status,200);
    assert.equal((await (await resolveLiveQr(req({payload:'E36U1:'+token}),r.env,'e',origin)).json()).member.present,true);
  }finally{r.db.close()}
});

test('LIVE regression score updates advance revision without changing current auto or judge count',async()=>{
  const r=prepared();try{
    const read=async()=> (await getAdminLive(r.env,new URL(origin+'/api/admin/live?eventId=e'),origin)).json();
    const before=await read();
    await saveJudgeScore(req({scores:{overall:8,condition:8,cohesion:8,originality:8},submitted:true}),r.env,admin,'entry',origin);
    const after=await read();
    assert.equal(JSON.stringify(before.states),JSON.stringify(after.states));
    assert.equal(before.results.show_shine[0].jury.judges,0);
    assert.equal(after.results.show_shine[0].jury.judges,1);
    assert.ok(after.revision>before.revision);
    await saveJudgeScore(req({scores:{overall:9,condition:8,cohesion:8,originality:8},submitted:true}),r.env,admin,'entry',origin);
    const edited=await read();assert.ok(edited.revision>after.revision);assert.equal(edited.results.show_shine[0].jury.judges,1);
    assert.match(source,/JSON.stringify\(\[state.revision,state.states\|\|\{\}\]\)/);
  }finally{r.db.close()}
});

test('LIVE regression fresh post-write GET does not share a pre-write GET in the actual Admin client',async()=>{
  let release,startedResolve,reads=0;const started=new Promise(resolve=>startedResolve=resolve);
  const user={uid:'a',getIdToken:async()=>'isolated-test-token'};
  const client=createAdminApiClient({baseUrl:origin,getContext:()=>({user,generation:1,eventId:'e'}),
    fetchRequest:async(url,options)=>{
      if(options.method==='PUT')return Response.json({ok:true});
      if(++reads>1)return Response.json({score:9});
      startedResolve();return new Promise(resolve=>{release=()=>resolve(Response.json({score:7}))});
    }});
  const prior=client.request('/api/live');await started;
  await client.request('/api/live/judge/scores/entry',{method:'PUT',body:{score:9}});
  const post=client.request('/api/live',{fresh:true});assert.notEqual(post,prior);
  assert.equal((await post).score,9);release();assert.equal((await prior).score,7);
});
