import test from 'node:test';
import assert from 'node:assert/strict';
import {commandBadges,commandDefaults,commandLayout} from '../admin/command-model.js';
import {factoryPreferences,validatePreferences} from '../admin/dashboard-model.js';
import {adminRoute} from '../admin/navigation.js';
import {memberRuntime} from './helpers/admin-member-runtime.mjs';
import {getAdminDashboard,ADMIN_RECENT_SQL} from '../worker/admin/dashboard.js';
import {getAdminSummary} from '../worker/admin/summary.js';
import {getAdminReservations} from '../worker/domains/reservations/index.js';
import {adminMemberMedia} from '../worker/admin/members.js';
import {readFileSync} from 'node:fs';
import {captureCommandBudget,commandIncrement} from './helpers/admin-command-budget.mjs';
const origin='https://example.invalid',url=query=>new URL('/?eventId=e&'+query,origin);

test('NEW incremental budget reproduces executed SQL, plans and unchanged growth populations',async()=>{
 const profile=JSON.parse(readFileSync(new URL('../docs/admin-command-budget.json',import.meta.url),'utf8'));
 const {runtime:r,report}=await captureCommandBudget();
 try {
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM members').get().n,500);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n,900);
  for(const actual of report){const saved=profile.report.find(row=>row.name===actual.name);assert.deepEqual(actual.queries.map(q=>[q.sql,q.args,q.plan]),saved.queries.map(q=>[q.sql,q.args,q.plan]));}
  const result=commandIncrement(profile,{memberHours:24,dashboardHours:3,detailHours:6,explicitDetails:96});
  assert.equal(result.estimated,1266660);assert.equal(result.withRetries,1393326);assert.equal(result.actualCloudflareRowsRead,null);assert.equal(r.writes,0);
 } finally {r.db.close();}
});

test('NEW factory and shared preview spans preserve schema-v1, independent layouts and unknown saved IDs',()=>{
  const p=commandDefaults();assert.ok(validatePreferences(p));
  assert.deepEqual(commandLayout(p.compositions.preparation.widgets).map(w=>[w.id,w.span]),[['approvals',8],['reservation-summary',4],['payment-summary',8],['trend',4],['recent',12]]);
  p.compositions.preparation.widgets=[];assert.equal(commandLayout(p.compositions.preparation.widgets).length,0);assert.equal(p.compositions.onsite.widgets.length,5);
  const saved=factoryPreferences();saved.compositions.preparation.widgets.push({id:'future-widget',size:'wide'});const before=JSON.stringify(saved);commandLayout(saved.compositions.preparation.widgets);assert.equal(JSON.stringify(saved),before);assert.ok(validatePreferences(saved));
});
test('NEW badges use unions, global counts, honest unknowns and known zeros rather than page lengths',()=>{
  const s={overview:{statuses:{pending:5},gallery:{pending:12},history:{pending:3}},attention:{reservations:7,payments:4}};
  assert.deepEqual(commandBadges(s),{dashboard:22,reservations:5,payments:4,photos:12,history:3,community:15});
  assert.notEqual(commandBadges(s).dashboard,5+4+15);
  assert.equal(commandBadges({}).dashboard,null);delete s.overview.gallery.pending;assert.equal(commandBadges(s).community,null);
  s.overview.gallery.pending=0;s.overview.history.pending=0;assert.equal(commandBadges(s).community,0);
});
test('old finance and club URLs keep meanings; new United Club is a separate Members destination',()=>{
  assert.equal(adminRoute('?section=finance&view=payments').section,'payments');
  assert.equal(adminRoute('?section=finance&view=accommodation').section,'accommodation');
  for(const path of ['?section=club','?section=community&view=club'])assert.deepEqual([adminRoute(path).section,adminRoute(path).galleryMode],['gallery','history']);
  assert.equal(adminRoute('?section=community&view=united-club').section,'united-club');
});
test('canonical summary counts a dual-pending history claim once, independent of its evidence',async()=>{
  const r=memberRuntime();r.db.exec("UPDATE united_history_claims SET attendance_status='pending',sns_status='pending'; UPDATE gallery_submissions SET status='pending'");
  for(let i=0;i<4;i++)r.db.prepare("INSERT INTO united_history_evidence(id,claim_id,member_id,r2_key,mime_type,size_bytes) VALUES(?,'h','m',?,'image/jpeg',100)").run('extra'+i,'synthetic/'+i);
  const s=await (await getAdminSummary(r.env,url(''),origin)).json();assert.equal(commandBadges(s).history,1);assert.equal(commandBadges(s).photos,1);assert.equal(commandBadges(s).community,2);assert.equal(r.writes,0);r.db.close();
});
test('bounded recent preview uses latest created_at across statuses, not pending/submitted ordering',async()=>{
  const r=memberRuntime();r.db.exec("UPDATE reservations SET created_at='2026-09-08',submitted_at='2020-01-01'; INSERT INTO reservations(id,member_id,event_id,status,created_at,submitted_at) VALUES('pending','n','e','pending','2020-01-01','2030-01-01'),('cancelled','a','e','cancelled','2026-09-09','2026-09-09')");
  const newer=await (await getAdminDashboard(r.env,url('presentation=command'),origin)).json();assert.deepEqual(newer.recent.map(r=>r.id),['cancelled','r','pending']);assert.equal(newer.presentation,'command-v1');
  const old=await (await getAdminDashboard(r.env,url(''),origin)).json();assert.equal(old.recent,undefined);
  const plan=r.db.prepare('EXPLAIN QUERY PLAN '+ADMIN_RECENT_SQL).all('e');assert.ok(plan.length);assert.ok(newer.recent.length<=5);assert.equal(r.writes,0);r.db.close();
});
test('reservation context exposes only selected owned photo and actual QR presence; no token or read write',async()=>{
  const r=memberRuntime(),env={...r.env,ADMIN_READ:true};r.db.exec("UPDATE reservations SET car_id='c2'; INSERT INTO car_photos(id,car_id,r2_key) VALUES('p2','c2','private/m/selected')");
  const get=async()=> (await (await getAdminReservations(env,url('id=r&projection=detail&presentation=command'),origin)).json()).reservations[0];
  let item=await get();assert.equal(item.reviewContext.qrIssued,false);assert.match(item.reviewContext.selectedCarPhoto,/\/c2\/p2$/);assert.doesNotMatch(JSON.stringify(item.reviewContext),/private\/|token|E36U1/);
  r.db.prepare('INSERT INTO member_qr_identities(member_id,token) VALUES(?,?)').run('m','a'.repeat(48));item=await get();assert.equal(item.reviewContext.qrIssued,true);
  r.db.exec("UPDATE reservations SET car_id='cn'");assert.equal((await get()).reviewContext.selectedCarPhoto,null);
  assert.equal((await adminMemberMedia(env,'m','cars','cn','pn',origin)).status,404);
  assert.equal((await (await getAdminReservations(env,url('id=r&projection=detail'),origin)).json()).reservations[0].reviewContext,undefined);
  assert.equal(r.writes,0);assert.equal(r.mediaReads,0);r.db.close();
});
