import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {memberRuntime} from './helpers/admin-member-runtime.mjs';
import {getMember,saveMemberLivePreference,bootstrapMember} from '../worker/domains/members.js';
import {isProtectedMemberRoute} from '../worker/router.js';
import {reservationPaymentAction} from '../member/reservation-status.js';
const origin='https://e36united.cz',auth={uid:'m',email:'member@example.invalid',emailVerified:false};
const request=body=>new Request(origin+'/api/me/live-preference',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
test('LIVE migration preserves every existing row and defaults all profiles to off',()=>{
 const r=memberRuntime();try{
  const migration=readFileSync(new URL('../db/migrations/2026-10-31-member-live-preference.sql',import.meta.url),'utf8');
  const base=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8').replace(/-- Per-member visibility[\s\S]*?INSERT INTO schema_migrations\(id,description\) VALUES\('2026-10-31-member-live-preference'[^\n]*\n/,'');
  const old=memberRuntime({schema:base});try{const tables=old.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(x=>x.name),before=new Map(tables.map(t=>[t,old.db.prepare(`SELECT * FROM "${t}"`).all()]));old.db.exec(migration);
   for(const table of tables){const rows=old.db.prepare(`SELECT * FROM "${table}"`).all();if(table==='members')for(const row of rows){assert.equal(row.show_program_live,0);delete row.show_program_live}if(table==='schema_migrations')rows.splice(rows.findIndex(x=>x.id==='2026-10-31-member-live-preference'),1);assert.deepEqual(rows,before.get(table),table)}
   assert.deepEqual(old.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(old.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.throws(()=>old.db.exec(migration),/duplicate column/);
  }finally{old.db.close()}
 }finally{r.db.close()}
});
test('profile LIVE opt-in is isolated, persisted and not overwritten by normal profile updates',async()=>{
 const r=memberRuntime();try{
  assert.equal((await(await getMember(r.env,auth,origin)).json()).member.showProgramLive,false);
  assert.equal((await saveMemberLivePreference(request({showProgramLive:true}),r.env,auth,origin)).status,200);
  assert.equal((await(await getMember(r.env,auth,origin)).json()).member.showProgramLive,true);assert.equal(r.db.prepare("SELECT show_program_live FROM members WHERE id='n'").get().show_program_live,0);
  await bootstrapMember(new Request(origin+'/api/bootstrap',{method:'POST',body:JSON.stringify({name:'Updated Name',nickname:'Member'})}),r.env,auth,origin);assert.equal((await(await getMember(r.env,auth,origin)).json()).member.showProgramLive,true);
  assert.equal((await saveMemberLivePreference(request({showProgramLive:false}),r.env,auth,origin)).status,200);assert.equal(r.db.prepare("SELECT show_program_live FROM members WHERE id='m'").get().show_program_live,0);
 }finally{r.db.close()}
});
test('preference endpoint requires active authenticated ownership and strict boolean input',async()=>{
 const r=memberRuntime();try{assert.equal(isProtectedMemberRoute('PUT','/api/me/live-preference'),true);
  for(const body of [{showProgramLive:1},{showProgramLive:'true'},{showProgramLive:true,memberId:'n'},{}])assert.equal((await saveMemberLivePreference(request(body),r.env,auth,origin)).status,400);
  r.db.prepare("UPDATE members SET status='blocked' WHERE id='m'").run();assert.equal((await saveMemberLivePreference(request({showProgramLive:true}),r.env,auth,origin)).status,403);assert.equal((await saveMemberLivePreference(request({showProgramLive:true}),r.env,{uid:'missing'},origin)).status,403);
  assert.equal(r.db.prepare("SELECT sum(show_program_live) n FROM members").get().n,0);
 }finally{r.db.close()}
});
test('reservation payment CTA never requests a non-actionable or Merch balance',()=>{
 const p={status:'unpaid',remainingCzk:600,actionable:true,configurationReady:true},r={status:'approved',payment:p};assert.equal(reservationPaymentAction(r,n=>n+' Kč'),'Doplatit 600 Kč');
 for(const extra of [{status:'pending'},{status:'cancelled'},{changePending:true},{cancellationPending:true},{payment:{...p,awaitingApproval:true}},{payment:{...p,actionable:false}}])assert.equal(reservationPaymentAction({...r,...extra},String),'Zkontrolovat platby');
 assert.equal(reservationPaymentAction({...r,payment:{...p,status:'paid',remainingCzk:0}},String),'Zaplaceno · detail platby');assert.equal(reservationPaymentAction({...r,payment:{...p,status:'overpaid',remainingCzk:0}},String),'Přeplatek · detail platby');
});
