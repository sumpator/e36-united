import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {memberRuntime} from './helpers/admin-member-runtime.mjs';
import {getAdminPreferences,saveAdminPreferences,getAdminDashboard} from '../worker/admin/dashboard.js';
import {getAdminOperation} from '../worker/admin/commands.js';
import {getAdminSummary} from '../worker/admin/summary.js';
import {getAdminReservations} from '../worker/domains/reservations/index.js';
import {factoryPreferences,validatePreferences} from '../admin/dashboard-model.js';
import {adminRoute} from '../admin/navigation.js';
import {cleanDrill,QUICK_LINK_IDS} from '../admin/destinations.js';
import {chartModel,trendModel,attentionModel} from '../admin/dashboard-data.js';
const origin='https://e36united.cz',url=path=>new URL(path,origin),data=async response=>(await response).json();
function runtime(){
 const r=memberRuntime(),batch=r.env.DB.batch;let tail=Promise.resolve();
 r.env.DB.batch=statements=>{const next=tail.then(()=>batch(statements));tail=next.catch(()=>{});return next};return r;
}
function save(r,value,key='one',revision=0,uid='a'){
 return saveAdminPreferences(new Request(url('/api/admin/preferences'),{method:'PUT',headers:{'If-Match':String(revision),'Idempotency-Key':key},body:JSON.stringify(value)}),r.env,{uid},origin);
}
test('dashboard factories have four Preparation KPIs, independent compositions and safe forward-compatible preferences',()=>{
 const p=factoryPreferences();assert.equal(validatePreferences(p),true);
 assert.deepEqual(p.compositions.preparation.widgets.slice(0,4).map(w=>w.id),['reservations','people','recorded','outstanding']);
 for(const c of Object.values(p.compositions)){assert.ok(!c.widgets.some(w=>w.id==='planner'));assert.ok(c.quickLinks.length<=4)}
 p.compositions.onsite.widgets.push({id:'future-widget',size:'wide'},{id:'constructor',size:'wide'});assert.ok(validatePreferences(p));
 p.compositions.onsite.quickLinks=['https://untrusted.invalid'];assert.equal(validatePreferences(p),false);
 assert.equal(validatePreferences({...factoryPreferences(),selectedEvent:'old'}),false);
 assert.deepEqual(cleanDrill({option:"x' OR 1=1",from:'2026-99-99',scope:'unknown'}),{});
 assert.ok(!QUICK_LINK_IDS.includes('scanner'));
 for(const section of ['constructor','__proto__','unknown'])assert.equal(adminRoute('?section='+section).section,'dashboard');
});
test('preference reads never create rows; exact migration preserves existing fixture and old clients fail closed',async()=>{
 const r=runtime(),changes=r.db.prepare('SELECT total_changes() n').get().n;
 const p=await data(getAdminPreferences(r.env,{uid:'a'},origin));assert.equal(p.stored,false);assert.equal(p.revision,0);
 assert.equal(r.db.prepare('SELECT total_changes() n').get().n,changes);
 assert.equal((await saveAdminPreferences(new Request(url('/api/admin/preferences'),{method:'PUT',body:'{}'}),r.env,{uid:'a'},origin)).status,428);
 const migration=readFileSync(new URL('../db/migrations/2026-09-08-admin-preferences.sql',import.meta.url),'utf8').trim();
 assert.ok(readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8').includes(migration));
 const members=r.db.prepare('SELECT * FROM members ORDER BY id').all();
 r.db.exec("DROP TABLE admin_preferences; DELETE FROM schema_migrations WHERE id='2026-09-08-admin-preferences'");r.db.exec(migration);
 assert.deepEqual(r.db.prepare('SELECT * FROM members ORDER BY id').all(),members);
 assert.throws(()=>r.db.exec(migration),/already exists/);assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(r.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');r.db.close();
});
test('first-save race has one winner; preference identity, revision, replay and lost-outcome recovery reuse safe commands',async()=>{
 const r=runtime(),one=factoryPreferences(),two=factoryPreferences();two.compositions.preparation.quickLinks=['members'];
 assert.deepEqual((await Promise.all([save(r,one,'one'),save(r,two,'two')])).map(r=>r.status).sort(),[200,409]);
 const first=await data(getAdminPreferences(r.env,{uid:'a'},origin));assert.equal(first.revision,1);
 assert.equal((await save(r,one,'one')).status,200);assert.equal((await save(r,two,'one')).status,409);
 assert.equal((await data(getAdminOperation(r.env,{uid:'a'},'one',origin))).operation.state,'confirmed');
 assert.equal((await data(getAdminOperation(r.env,{uid:'m'},'one',origin))).operation.state,'outcome_unknown');
 assert.equal((await data(getAdminPreferences(r.env,{uid:'m'},origin))).stored,false);
 assert.equal((await save(r,two,'member-own',0,'m')).status,200); // Handler ownership; active-Admin routing is tested separately.
 assert.deepEqual((await data(getAdminPreferences(r.env,{uid:'a'},origin))).preferences,one);
 assert.equal((await save(r,two,'newer',first.revision)).status,200);
 assert.equal((await save(r,one,'stale',first.revision)).status,409);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM admin_operation_receipts').get().n,3);r.db.close();
});
test('invalid preference payload produces no version, receipt or preference write',async()=>{
 const r=runtime();assert.equal((await save(r,{schemaVersion:2})).status,400);
 assert.equal(r.db.prepare("SELECT COUNT(*) n FROM admin_resource_versions WHERE resource_type='preferences'").get().n,0);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM admin_preferences').get().n,0);
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM admin_operation_receipts').get().n,0);r.db.close();
});
test('trend uses genuine UTC creation buckets; 7/30 ranges retain cumulative base and missing dates are explicit',async()=>{
 const r=runtime();r.db.exec("UPDATE reservations SET created_at='2026-08-01 12:00:00',submitted_at='2026-09-01',updated_at='2026-09-08' WHERE id='r'");
 const payload=await data(getAdminDashboard(r.env,url('/?eventId=e'),origin,new Date('2026-09-08T12:00:00Z')));
 assert.deepEqual(payload.days,[{day:'2026-08-01',count:1}]);
 assert.equal(trendModel(payload,'7').rows.length,7);assert.ok(trendModel(payload,'7').rows.every(r=>r.value===1&&r.added===0));
 assert.equal(trendModel(payload,'30').rows.length,30);assert.equal(trendModel(payload).rows[0].value,1);
 assert.equal(trendModel({...payload,days:[]}).rows.length,0);
 assert.equal(trendModel({...payload,missingDateCount:2}).missing,2);
 assert.equal((await getAdminDashboard(r.env,url('/?eventId=missing'),origin)).status,404);
 assert.equal(r.writes,0);r.db.close();
});
test('graphs and exact drill-down independently reconcile inactive cash, obligations, statuses and declared participation',async()=>{
 const r=runtime();r.db.exec("UPDATE reservations SET attendance_type='full_weekend',show_shine='Ano' WHERE id='r'; INSERT INTO reservations(id,member_id,event_id,status,crew,amount_due_czk,amount_paid_czk,created_at) VALUES('cancelled','a','e','cancelled',5,0,400,'2026-08-01'),('pending','n','e','pending',4,1000,1300,'2026-09-07')");
 const summary=await data(getAdminSummary(r.env,url('/?eventId=e'),origin));
 const finance=chartModel('finance',summary);assert.deepEqual(finance.rows.map(r=>r.value),[2000,1200,800,1900,400,700]);
 const statuses=chartModel('statuses',summary);assert.deepEqual(statuses.rows.map(r=>r.value),[1,1,0,1,0]);
 const list=async scope=>(await data(getAdminReservations({...r.env,ADMIN_READ:true},url('/?eventId=e&scope='+scope),origin))).reservations.map(r=>r.id).sort();
 assert.deepEqual(await list('outstanding'),['r']);assert.deepEqual(await list('inactivePaid'),['cancelled']);
 assert.deepEqual(await list('overpaid'),['cancelled','pending']);assert.deepEqual(await list('active'),['pending','r']);
 assert.deepEqual(await list('draft'),[]);
 const range=await data(getAdminReservations({...r.env,ADMIN_READ:true},url('/?eventId=e&from=2026-09-07&to=2026-09-07'),origin));assert.deepEqual(range.reservations.map(r=>r.id),['pending']);
 const attendance=await data(getAdminReservations({...r.env,ADMIN_READ:true},url('/?eventId=e&attendance=full_weekend&sns=Ano'),origin));assert.deepEqual(attendance.reservations.map(r=>r.id),['r']);
 assert.equal(r.writes,0);r.db.close();
});
test('Attention cannot infer global all-clear from missing, stale or partial data; categories are not unique people',()=>{
 const summary={overview:{statuses:{pending:0},payments:{overdue:0,overpaid:0}},attention:{gallery:0,history:0}},analytics={attention:{awaiting:0}};
 assert.equal(attentionModel(summary,analytics,{summaryFresh:true,analyticsFresh:true}).allClear,true);
 for(const [s,a,flags]of [[summary,null,{summaryFresh:true,analyticsFresh:true}],[summary,analytics,{summaryFresh:false,analyticsFresh:true}],[{},analytics,{summaryFresh:true,analyticsFresh:true}]]){
   assert.equal(attentionModel(s,a,flags).allClear,false);
 }
 summary.attention.history=1;assert.equal(attentionModel(summary,analytics,{summaryFresh:true,analyticsFresh:true}).allClear,false);
});

test('incremental budget uses the unchanged growth fixture and current executed SQL, separate from accepted Stage 2',async()=>{
 const {captureDashboardBudget,dashboardBudget}=await import('./helpers/admin-dashboard-budget.mjs');
 const profile=JSON.parse(readFileSync(new URL('../docs/admin-stage3-budget.json',import.meta.url),'utf8'));
 const {runtime:r,report}=await captureDashboardBudget();
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM members').get().n,500);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM reservations').get().n,900);
 for(const actual of report){const saved=profile.report.find(e=>e.name===actual.name);assert.ok(saved);assert.deepEqual(actual.queries.map(q=>[q.sql,q.args]),saved.queries.map(q=>[q.sql,q.args]));assert.match(saved.queries[0].sql,/FROM members/);assert.ok(saved.estimatedRows>0);}
 const value=dashboardBudget(profile);assert.equal(value.rows.find(r=>r.resource==='analytics').calls,36);assert.equal(value.rows.find(r=>r.resource==='analytics').perCall,1505);assert.equal(value.withRetries,Math.ceil(value.total*1.1));
 assert.equal(profile.explicit.localChanges,6);assert.equal(r.writes,0);r.db.close();
});

test('occupancy and exact filters retain confirmed/pending unit populations and unlimited/missing denominators',async()=>{
 const r=runtime();r.db.exec("INSERT INTO event_accommodation_options(id,event_id,name,kind,inventory_mode,units_total,capacity_per_unit) VALUES('cab','e','Chatka','cabin','limited',8,4),('tent','e','Stan','tent','unlimited',0,2); INSERT INTO reservation_accommodation(reservation_id,option_id,people_count,unit_count,option_name,kind,unit_price_czk,person_price_czk,bedding_fee_per_person_czk,city_tax_per_person_per_night_czk,nights,base_total_czk,person_total_czk,bedding_total_czk,city_tax_total_czk,total_czk) VALUES('r','cab',2,1,'Chatka','cabin',0,0,0,0,2,0,0,0,0,0)");
 const summary=await data(getAdminSummary(r.env,url('/?eventId=e'),origin)),rows=chartModel('occupancy',summary).rows;
 assert.deepEqual(rows.map(r=>[r.label,r.value,r.pending,r.capacity,r.unlimited]),[['Chatka',1,0,8,false],['Stan',0,0,null,true]]);
 const get=async q=>(await data(getAdminReservations({...r.env,ADMIN_READ:true},url('/?eventId=e&option=cab&occupancy='+q),origin))).reservations;
 assert.deepEqual((await get('approved')).map(r=>r.id),['r']);assert.deepEqual(await get('pending'),[]);
 assert.deepEqual(cleanDrill(),{});assert.equal(r.writes,0);r.db.close();
});
