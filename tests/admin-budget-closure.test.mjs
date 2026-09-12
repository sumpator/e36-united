import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {spawnSync} from 'node:child_process';
import {adminGrowth} from './helpers/admin-growth.mjs';
import {captureAdminBudget} from './helpers/admin-budget-capture.mjs';
import {adminBudget} from './helpers/admin-budget-model.mjs';
import {budgetClosure,PERIODIC_PER_CONTEXT} from './helpers/admin-budget-scenario.mjs';
import {getAdminReservations,publicAdminReservation} from '../worker/domains/reservations/index.js';
import {hydrateReservationAccommodationVisual} from '../worker/domains/reservations/capacity.js';
import {reservationListQuery} from '../worker/admin/lists.js';
import {resourceDue,ADMIN_REFRESH} from '../admin/refresh-policy.js';
import {createAdminRefresh} from '../admin/refresh.js';
import {MEMBER_HERO_CAR_SQL,MEMBER_HERO_PHOTO_SQL} from '../worker/admin/members.js';
import {ADMIN_RESERVATION_APPROVALS_SQL} from '../worker/admin/summary.js';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const before=JSON.parse(read('docs/admin-budget-before.json')),after=JSON.parse(read('docs/admin-budget-after.json'));
const sql=source=>source.replace(/\s+/g,' ').trim();
const origin='https://example.invalid';

test('original budget reconciles; revised gate includes explicit actions and retries and remains failed',()=>{
  const historical=[80*6000,92*5000,152*3000,30*3000,60*5000,540*20,240*100,60*100,20*20,390*5,6000];
  assert.equal(historical.reduce((a,b)=>a+b,0)*3,5505450);
  assert.equal(adminBudget(3,12).rowsReadEstimate,5505450);
  const model=budgetClosure(after);assert.equal(model.dataRequests,5064);
  assert.equal(model.withRetries,Math.ceil(model.total*110/100));assert.equal(model.targetMet,false);
  assert.ok(model.total<budgetClosure(before,{before:true}).total);
  const command=spawnSync(process.execPath,['scripts/check-admin-budget.mjs'],{encoding:'utf8',windowsHide:true});
  assert.equal(command.status,1);assert.equal(JSON.parse(command.stdout).targetMet,false);
});

test('budget evidence describes actual current authorized SQL and never prices a missing profile as zero',async()=>{
  const {runtime,report}=await captureAdminBudget();
  for(const endpoint of report){
    const recorded=after.report.find(e=>e.name===endpoint.name);assert.ok(recorded);
    // Keep the accepted Stage 2 evidence plus its explicit gallery amendment exact.
    // The separately tested r5 header addon must be these two scoped lookups.
    const addon=endpoint.name==='member-header'?[MEMBER_HERO_CAR_SQL,MEMBER_HERO_PHOTO_SQL]:endpoint.name==='summary'?[ADMIN_RESERVATION_APPROVALS_SQL]:[];
    assert.deepEqual(endpoint.queries.map(q=>sql(q.sql)),[...recorded.queries.map(q=>sql(q.sql)),...addon.map(sql)],endpoint.name);
    if(endpoint.name==='member-header')assert.deepEqual(endpoint.queries.slice(-2).map(q=>q.args),[['m'],['c']]);
    if(endpoint.name==='summary'){
      const approval=endpoint.queries.at(-1);assert.equal(approval.args.length,2);assert.equal(approval.args[1],'e');
      assert.ok(approval.plan.some(step=>step.includes('idx_reservations_payment (event_id=?)')));
      assert.ok(approval.plan.some(step=>step.includes('reservation_requests_one_pending (reservation_id=?)')));
      assert.ok(!approval.plan.some(step=>step==='SCAN pending_request'));
    }
    assert.match(endpoint.queries[0].sql,/SELECT id, role, status\s+FROM members/);
    assert.ok(recorded.estimatedRows>=2);
    for(const q of recorded.queries)if(q.profileError){assert.equal(q.localVisits,null);assert.ok(q.localVmSteps>0);assert.ok(q.estimatedRows>=q.localVmSteps);}
  }
  assert.equal(runtime.writes,0);runtime.db.close();
});

test('reservation page fence preserves complete old payloads, totals, search, page order and cross-event option scope',async()=>{
  const r=adminGrowth(),env={...r.env,ADMIN_READ:true};
  const old=before.report.find(e=>e.name==='reservation-list').queries[2].sql;
  const pending=r.db.prepare("SELECT id FROM reservations WHERE status='pending' AND event_id='e' ORDER BY id LIMIT 1").get().id;
  // A historical allocation can refer to an option outside the selected event.
  r.db.prepare("UPDATE reservation_accommodation SET option_id='option-old' WHERE reservation_id=?").run(pending);
  const changes=r.db.prepare('SELECT total_changes() n').get().n;
  for(const suffix of ['', '&page=2','&page=6','&page=99','&filter=pending','&filter=approved','&view=payments&filter=attention','&q=Same','&q=missing','&id='+pending]){
    const url=new URL('/?eventId=e'+suffix,origin),page=reservationListQuery(url);
    const previousSql=old.replace('WHERE r.event_id = ? AND 1 ORDER BY','WHERE r.event_id = ? AND '+page.where+' ORDER BY');
    const previous=r.db.prepare(previousSql).all('e',...page.bindings,page.pageSize,(page.page-1)*page.pageSize);
    await Promise.all(previous.map(row=>hydrateReservationAccommodationVisual(env,row,new Map())));
    const result=await(await getAdminReservations(env,url,origin)).json();
    assert.deepEqual(result.reservations,previous.map(publicAdminReservation),suffix);
    const total=r.db.prepare('SELECT COUNT(*) n FROM reservations r JOIN members m ON m.id=r.member_id JOIN events e ON e.id=r.event_id WHERE r.event_id=? AND '+page.where).get('e',...page.bindings).n;
    assert.equal(result.pagination.total,total);assert.equal(result.counts.all,300);
  }
  assert.equal(r.writes,0);assert.equal(r.db.prepare('SELECT total_changes() n').get().n,changes);r.db.close();
});

test('opt-in source detail drops only unused facets, keeps exact record and never enables a broad list shortcut',async()=>{
  const r=adminGrowth(),env={...r.env,ADMIN_READ:true};
  const get=async suffix=>(await(await getAdminReservations(env,new URL('/?eventId=e'+suffix,origin),origin)).json());
  const old=await get('&id=r');r.queries.length=0;
  const detail=await get('&id=r&projection=detail');
  assert.deepEqual(detail.reservations,old.reservations);assert.deepEqual(detail.pagination,old.pagination);
  assert.equal(detail.counts,undefined);assert.equal(detail.freshness.consistency,'primary-detail');
  assert.equal(r.queries.length,3);assert.ok(!r.queries.some(q=>q.sql.includes('COUNT(CASE')));
  const galleryQueries=r.queries.filter(q=>q.sql.includes('event_accommodation_photos'));
  assert.equal(galleryQueries.length,1);assert.deepEqual(galleryQueries[0].args,['e']);
  assert.match(galleryQueries[0].sql,/JOIN event_accommodation_options o ON o\.id = p\.option_id/);
  assert.match(galleryQueries[0].sql,/WHERE o\.event_id = \?/);assert.match(galleryQueries[0].sql,/photo_rank <= 5/);
  assert.equal((await get('&projection=detail')).counts.all,300);
  assert.equal((await get('&id=absent&projection=detail')).pagination.total,0);
  assert.equal((await(await getAdminReservations(env,new URL('/?eventId=missing&id=r&projection=detail',origin),origin)).json()).error,'event_not_found');
  assert.equal(r.writes,0);r.db.close();
});

test('exact new index migration preserves the populated fixture and actually bounds the hydration input',async()=>{
  const r=adminGrowth(),migration=read('db/migrations/2026-09-08-admin-read-budget.sql').trim();
  assert.ok(read('db/schema.sql').includes(migration));
  r.db.exec("DROP INDEX admin_reservations_page; DELETE FROM schema_migrations WHERE id='2026-09-08-admin-read-budget'");
  const previous=r.db.prepare('SELECT * FROM reservations ORDER BY id').all();
  r.db.exec(migration);assert.deepEqual(r.db.prepare('SELECT * FROM reservations ORDER BY id').all(),previous);
  assert.throws(()=>r.db.exec(migration),/already exists/);
  assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(r.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  const q=after.report.find(e=>e.name==='reservation-list').queries[2];
  const actualPlan=r.db.prepare('EXPLAIN QUERY PLAN '+q.sql).all(...q.args).map(p=>p.detail);
  assert.ok(actualPlan.includes('SEARCH r USING INDEX admin_reservations_page (event_id=?)'));
  assert.ok(actualPlan.some(p=>p.includes('idx_reservation_accommodation_option (option_id=?)')));
  assert.ok(q.plan.includes('SEARCH r USING INDEX admin_reservations_page (event_id=?)'));
  assert.ok(q.loops.some(l=>l.access.includes('admin_reservations_page')&&l.visits===50));
  assert.ok(q.plan.some(p=>p.includes('idx_reservation_accommodation_option (option_id=?)')));
  assert.ok(!q.plan.includes('SCAN approved'));r.db.close();
});

test('actual coordinator task selection reproduces the 12h workload without polling inactive workspaces',async()=>{
  const source=read('admin.js'),start=source.indexOf('  beginEventContext(context.eventId);',source.indexOf('async function refreshResources'));
  const body=source.slice(start,source.indexOf('  const settled=',start));assert.ok(body.includes('memberRefreshTasks()'));
  const memberTasks=read('admin/member-detail.js').match(/export function memberRefreshTasks\(\)\{[\s\S]*?\n\}/)[0].replace('export ','');
  const noop=()=>{},state={selectedEventId:'e',memberPage:1,historyPagination:{page:1},galleryMode:'community'};
  const mocks={adminState:state,ADMIN_REFRESH,beginEventContext:noop,renderMemberHeader:noop,renderMemberTab:noop,renderMembers:noop,
    dashboardWantsPlanner:()=>false,dashboardWantsMailing:()=>false,resourceFreshness:new Map(),resourceDue:()=>true,renderAdminFunnel:noop,receiveDashboardPreferences:noop,
    renderReservations:noop,renderAccommodation:noop,renderGallery:noop,renderHistoryClaims:noop,renderReservationDetail:noop,
    reservationRequestPath:id=>'/reservations'+(id?'?id='+id:''),galleryRequestPath:()=>'/gallery',historyRequestPath:()=>'/history',scopedPath:p=>p};
  let now=0;const counts={},fresh=new Map();let context={key:'e',eventId:'e',authenticated:true,visible:true,online:true};
  const coordinator=createAdminRefresh({readContext:()=>context,now:()=>now,setTimer:(_fn,ms)=>{assert.equal(ms,60000);return 1},clearTimer:noop,
    refresh:async()=>{const tasks=runInNewContext(memberTasks+'\n(function(){'+body+'return tasks;})()',{...mocks,context,reason:'poll'});
      assert.ok(tasks.length<=3);
      for(const[name,path,_render,interval=name==='summary'?300000:60000]of tasks){if(!resourceDue(fresh.get(path),path,interval,'poll',now))continue;
        counts[name]=(counts[name]||0)+1;fresh.set(path,{state:'fresh',context:path,lastSuccess:now});
      }
    }});
  for(const [minutes,view,member,tab,detail]of [[240,'reservations','m','event','r'],[240,'reservations','m','garage','r'],[120,'reservations',null,'event','r'],[60,'dashboard',null,'event',null],[60,'gallery',null,'event',null]]){
    Object.assign(state,{activeAdminView:view,memberId:member,memberTab:tab,selectedReservationId:detail});context={...context,view};
    for(let i=0;i<minutes;i++){now+=60000;await coordinator.trigger('poll');}
  }
  const normalized={...counts,'reservation-list':counts.reservations,'member-garage':counts['member-tab']};delete normalized.reservations;delete normalized['member-tab'];
  assert.equal(normalized['dashboard-analytics'],12); // Stage 3 incremental, separately budgeted; all Stage 2 counts remain exact.
  delete normalized['dashboard-analytics'];
  assert.deepEqual(normalized,{...PERIODIC_PER_CONTEXT,summary:144}); // NEW adds 96 shared summaries over eight Member hours; other work unchanged.
  const previous={...counts};for(const condition of [{visible:false},{online:false},{denied:true},{authenticated:false}]){context={...context,visible:true,online:true,denied:false,authenticated:true,...condition};await coordinator.trigger('poll');}
  assert.deepEqual(counts,previous);coordinator.dispose();
  Object.assign(state,{activeAdminView:'mailing',memberId:null,selectedReservationId:null});
  assert.equal(runInNewContext(memberTasks+'\n(function(){'+body+'return tasks.length;})()',{...mocks,context:{view:'mailing',eventId:'e'},reason:'poll'}),1); // Shared badge summary, no hidden domain.
});
