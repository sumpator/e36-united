import assert from 'node:assert/strict';
import {adminGrowth} from './admin-growth.mjs';
import {getAdminMember,listAdminMembers,resolveAdminMemberQr,adminMemberMedia} from '../../worker/admin/members.js';
import {getAdminSummary} from '../../worker/admin/summary.js';
import {requireAdmin} from '../../worker/auth/admin.js';
import * as domains from '../../worker/domains.js';
import {getAdminFunnel} from '../../worker/domains/planner/funnel.js';
import {routeAdminMailing} from '../../worker/domains/mailing/index.js';
import {runAdminCommand,getAdminOperation} from '../../worker/admin/commands.js';

// Exactly the Stage 2 growth population; no remote resources or provider requests.
export async function captureAdminBudget(){
  const runtime=adminGrowth(),env={...runtime.env,ADMIN_READ:true};
  const origin='https://example.invalid',url=path=>new URL(path,origin);
  runtime.db.prepare('INSERT INTO member_qr_identities(member_id,token) VALUES(?,?)').run('m','a'.repeat(48));
  const changesBefore=runtime.db.prepare('SELECT total_changes() n').get().n;
  const pending=runtime.db.prepare("SELECT id FROM reservations WHERE event_id='e' AND status='pending' ORDER BY id LIMIT 1").get().id;
  const cases=[
    ['summary',()=>getAdminSummary(env,url('/?eventId=e'),origin)],
    ['reservation-list',()=>domains.getAdminReservations(env,url('/?eventId=e'),origin)],
    ['reservation-detail',()=>domains.getAdminReservations(env,url('/?eventId=e&id=r'),origin)],
    ['reservation-pending-detail',()=>domains.getAdminReservations(env,url('/?eventId=e&id='+pending),origin)],
    ['reservation-detail-only',()=>domains.getAdminReservations(env,url('/?eventId=e&id=r&projection=detail'),origin)],
    ['reservation-pending-detail-only',()=>domains.getAdminReservations(env,url('/?eventId=e&id='+pending+'&projection=detail'),origin)],
    ['accommodation',()=>domains.getAdminAccommodation(env,url('/?eventId=e'),origin)],
    ['gallery',()=>domains.getAdminGallery(env,origin,url('/?status=pending'))],
    ['history-review',()=>domains.getAdminHistoryClaims(env,url('/'),origin)],
    ['events',()=>domains.getAdminEvents(env,origin)],
    ['funnel',()=>getAdminFunnel(env,url('/?eventId=e'),origin)],
    ['member-list',()=>listAdminMembers(env,url('/'),origin)],
    ['member-search',()=>listAdminMembers(env,url('/?q=BMW'),origin)],
    ['member-search-miss',()=>listAdminMembers(env,url('/?q=not-present'),origin)],
    ['member-search-last-page',()=>listAdminMembers(env,url('/?q=BMW&page=25'),origin)],
    ['member-qr-resolve',()=>resolveAdminMemberQr(new Request(origin,{method:'POST',body:JSON.stringify({payload:'E36U1:'+'a'.repeat(48)})}),env,origin)],
    ['member-media',()=>adminMemberMedia(env,'m','cars','c','p',origin)],
    ...['','reservations','garage','photos','club','history','points','mailing','qr'].map(tab=>['member-'+(tab||'header'),()=>getAdminMember(env,url('/?eventId=e'),'m',tab,origin)]),
    ...['overview','contacts','campaigns','campaigns/camp/delivery'].map(path=>['mailing-'+path,()=>routeAdminMailing({request:new Request(origin+'/api/admin/mailing/'+path),env,url:url('/api/admin/mailing/'+path),auth:{uid:'a'},origin})]),
  ];
  const report=[];
  for(const [name,run] of cases){
    runtime.queries.length=0;await requireAdmin(env,{uid:'a'});
    const response=await run();assert.equal(response.status,200,name);
    const body=await response.text();
    report.push({name,bytes:Buffer.byteLength(body),body,queries:runtime.queries.map(({sql,args})=>({sql,args,
      plan:runtime.db.prepare('EXPLAIN QUERY PLAN '+sql).all(...args).map(p=>p.detail),
      bytecode:runtime.db.prepare('EXPLAIN '+sql).all(...args),
    }))});
  }
  assert.equal(runtime.writes,0);
  assert.equal(runtime.db.prepare('SELECT total_changes() n').get().n,changesBefore);
  assert.deepEqual(runtime.db.prepare('PRAGMA foreign_key_check').all(),[]);
  return {runtime,report};
}

export async function captureAdminBudgetOperation(){
  const r=adminGrowth(),origin='https://example.invalid',auth={uid:'a'};
  const revision=r.db.prepare("SELECT revision FROM admin_resource_versions WHERE resource_type='reservation' AND resource_id='r'").get().revision;
  const request=new Request(origin+'/api/admin/reservations/r/payment',{method:'PATCH',headers:{'Content-Type':'application/json','If-Match':String(revision),'Idempotency-Key':'budget-payment'},body:JSON.stringify({amountPaidCzk:400})});
  r.queries.length=0;await requireAdmin(r.env,auth);
  const result=await runAdminCommand(request,r.env,auth,'payment','r',origin,guarded=>domains.patchAdminReservationPayment(request,guarded,auth,'r',origin));
  assert.equal(result.status,200);
  const operation=r.queries.map(({sql,args})=>({sql,args,plan:r.db.prepare('EXPLAIN QUERY PLAN '+sql).all(...args).map(p=>p.detail)}));
  r.queries.length=0;await requireAdmin(r.env,auth);
  assert.equal((await getAdminOperation(r.env,auth,'budget-payment',origin)).status,200);
  const receipt=r.queries.map(({sql,args})=>({sql,args,plan:r.db.prepare('EXPLAIN QUERY PLAN '+sql).all(...args).map(p=>p.detail)}));
  const writes=r.writes;r.db.close();return {operation,receipt,localChanges:writes,rowsRead:null,note:'Actual isolated local explicit payment + outcome query; DML row reads are an allowance, not scanstatus measurement.'};
}
