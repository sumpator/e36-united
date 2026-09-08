import test from 'node:test';
import {adminBudget} from './helpers/admin-budget-model.mjs';
import assert from 'node:assert/strict';
import {adminGrowth} from './helpers/admin-growth.mjs';
import {getAdminMember,listAdminMembers,resolveAdminMemberQr,adminMemberMedia} from '../worker/admin/members.js';
import {getAdminSummary} from '../worker/admin/summary.js';
import {requireAdmin} from '../worker/auth/admin.js';
import * as domains from '../worker/domains.js';
import {getAdminFunnel} from '../worker/domains/planner/funnel.js';
import {routeAdminMailing} from '../worker/domains/mailing/index.js';
const origin='https://e36united.cz',url=path=>new URL(path,origin);
test('growth workload executes all periodic/member/search projections, inspects plans and has zero read-induced writes',async()=>{
 const r=adminGrowth(),env={...r.env,ADMIN_READ:true};const counts={};for(const table of ['members','events','reservations','cars','car_photos','gallery_submissions','united_history_claims','united_points_ledger','mailing_campaign_recipients','admin_operation_receipts'])counts[table]=r.db.prepare('SELECT COUNT(*) n FROM '+table).get().n;
 assert.equal(counts.members,500);assert.equal(counts.reservations,900);assert.equal(counts.car_photos+counts.gallery_submissions,1500);assert.equal(counts.united_history_claims,1000);assert.equal(counts.united_points_ledger,5000);
 r.db.prepare('INSERT INTO member_qr_identities(member_id,token) VALUES(?,?)').run('m','a'.repeat(48));const changesBefore=r.db.prepare('SELECT total_changes() n').get().n;
 const cases=[['summary',()=>getAdminSummary(env,url('/?eventId=e'),origin)],['reservation-list',()=>domains.getAdminReservations(env,url('/?eventId=e'),origin)],['reservation-detail',()=>domains.getAdminReservations(env,url('/?eventId=e&id=r'),origin)],['accommodation',()=>domains.getAdminAccommodation(env,url('/?eventId=e'),origin)],['gallery',()=>domains.getAdminGallery(env,origin,url('/?status=pending'))],['history-review',()=>domains.getAdminHistoryClaims(env,url('/'),origin)],['events',()=>domains.getAdminEvents(env,origin)],['funnel',()=>getAdminFunnel(env,url('/?eventId=e'),origin)],['member-list',()=>listAdminMembers(env,url('/'),origin)],['member-search',()=>listAdminMembers(env,url('/?q=BMW'),origin)],['member-qr-resolve',()=>resolveAdminMemberQr(new Request(origin,{method:'POST',body:JSON.stringify({payload:'E36U1:'+'a'.repeat(48)})}),env,origin)],['member-media',()=>adminMemberMedia(env,'m','cars','c','p',origin)],...['','reservations','garage','photos','club','history','points','mailing','qr'].map(tab=>['member-'+(tab||'header'),()=>getAdminMember(env,url('/?eventId=e'),'m',tab,origin)]),...['overview','contacts','campaigns','campaigns/camp/delivery'].map(path=>['mailing-'+path,()=>routeAdminMailing({request:new Request(origin+'/api/admin/mailing/'+path),env,url:url('/api/admin/mailing/'+path),auth:{uid:'a'},origin})])];
 const report=[];
 for(const[name,run]of cases){r.queries.length=0;const started=performance.now();await requireAdmin(env,{uid:'a'});const response=await run();assert.equal(response.status,200,name);const body=await response.text();const plans=r.queries.map(({sql,args})=>({plan:r.db.prepare('EXPLAIN QUERY PLAN '+sql).all(...args).map(p=>p.detail),sql:sql.replace(/\s+/g,' ').trim()}));assert.ok(plans.length>0);assert.ok(plans.every(p=>p.plan.length));report.push({name,statements:plans.length,bytes:Buffer.byteLength(body),localMs:Math.round((performance.now()-started)*100)/100,plans,scans:plans.flatMap(p=>p.plan).filter(p=>p.startsWith('SCAN ')),searches:plans.flatMap(p=>p.plan).filter(p=>p.startsWith('SEARCH '))});}
 assert.equal(r.writes,0);assert.equal(r.mediaReads,1);assert.equal(r.db.prepare('SELECT total_changes() n').get().n,changesBefore);assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);
 console.log('GROWTH_QUERY_REPORT '+JSON.stringify({counts,queries:report,models:[1,3,6].flatMap(n=>[2,12,24].map(h=>adminBudget(n,h)))}));r.db.close();
});
