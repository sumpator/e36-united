import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { MAX_RESERVATION_CREW, newerPlannerDraft, PLANNER_CLOCK_SKEW_MS, shouldShowJoinCta, validatePlannerDraft } from '../planner-state.js';
import { initPublicMemberState } from '../public-member-state.js';

const eventMigration=readFileSync(new URL('../D1-event-accommodation-v1.sql',import.meta.url),'utf8');
const paymentMigration=readFileSync(new URL('../D1-reservation-payments-v1.sql',import.meta.url),'utf8');
const plannerMigration=readFileSync(new URL('../D1-member-planner-drafts-v1.sql',import.meta.url),'utf8');
const workerSource=readFileSync(new URL('../cloudflare-worker-media.js',import.meta.url),'utf8');
const mainSource=readFileSync(new URL('../main.js',import.meta.url),'utf8');
const indexSource=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const memberSource=readFileSync(new URL('../member.js',import.meta.url),'utf8');
const memberHtml=readFileSync(new URL('../member.html',import.meta.url),'utf8');
const worker=await import(`data:text/javascript;base64,${Buffer.from(`${workerSource}\nexport { getPlannerDraft, putPlannerDraft, deletePlannerDraft, getMemberNavigationState, putCurrentReservation, validatePlannerDraft, MAX_RESERVATION_CREW, PLANNER_CLOCK_SKEW_MS };`).toString('base64')}`);

function database(){
  const db=new DatabaseSync(':memory:');
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE events (
      id TEXT PRIMARY KEY, year INTEGER NOT NULL, registration_status TEXT NOT NULL,
      accommodation_capacity INTEGER NOT NULL DEFAULT 0, reservation_capacity INTEGER NOT NULL DEFAULT 0,
      booking_commitment_czk INTEGER NOT NULL DEFAULT 0, booking_due_at TEXT, booking_paid_czk INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CZK', payment_deadline TEXT
    );
    CREATE TABLE members (id TEXT PRIMARY KEY, name TEXT, nickname TEXT, email TEXT, member_code TEXT);
    CREATE TABLE cars (id TEXT PRIMARY KEY, member_id TEXT NOT NULL, model TEXT, body TEXT, year INTEGER, color TEXT, nickname TEXT);
    CREATE TABLE reservations (
      id TEXT PRIMARY KEY, member_id TEXT NOT NULL, event_id TEXT NOT NULL,
      car_id TEXT, car_model TEXT, car_body TEXT, car_year INTEGER, car_color TEXT, car_nickname TEXT,
      arrival TEXT, crew INTEGER NOT NULL DEFAULT 1, accommodation TEXT, show_shine TEXT, note TEXT,
      status TEXT NOT NULL DEFAULT 'pending', attendance_type TEXT, accommodation_units INTEGER NOT NULL DEFAULT 0,
      amount_due_czk INTEGER NOT NULL DEFAULT 0, amount_paid_czk INTEGER NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'unpaid', paid_at TEXT, submitted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_by TEXT, reviewed_at TEXT, review_note TEXT,
      UNIQUE(member_id,event_id), FOREIGN KEY(event_id) REFERENCES events(id)
    );
    CREATE TABLE admin_actions (id TEXT PRIMARY KEY, admin_member_id TEXT, action_type TEXT, entity_type TEXT, entity_id TEXT, old_state_json TEXT, new_state_json TEXT, note TEXT, created_at TEXT);
    INSERT INTO events (id,year,registration_status) VALUES ('event-2026',2026,'closed');
    INSERT INTO members (id,name) VALUES ('member-a','A'),('member-b','B');
    INSERT INTO cars (id,member_id,model,body,year) VALUES ('car-a','member-a','328i','Coupé',1996);
  `);
  db.exec(eventMigration);db.exec(paymentMigration);db.exec(plannerMigration);
  return db;
}

function d1(db){
  class Statement{
    constructor(sql,bindings=[]){this.sql=sql;this.bindings=bindings}
    bind(...bindings){return new Statement(this.sql,bindings)}
    first(){return db.prepare(this.sql).get(...this.bindings)||null}
    all(){return {results:db.prepare(this.sql).all(...this.bindings)}}
    run(){const result=db.prepare(this.sql).run(...this.bindings);return {meta:{changes:Number(result.changes||0)}}}
  }
  return {prepare(sql){return new Statement(sql)},batch(statements){db.exec('BEGIN IMMEDIATE');try{const results=statements.map(statement=>statement.run());db.exec('COMMIT');return results}catch(error){db.exec('ROLLBACK');throw error}}};
}

function draft({id='11111111-1111-4111-8111-111111111111',createdOffset=-60_000,crew=2}={}){
  const created=Date.now()+createdOffset;
  return {version:1,draftId:id,source:'weekend-planner',eventYear:2026,eventId:'event-2026',createdAt:new Date(created).toISOString(),expiresAt:new Date(created+6*24*60*60*1000).toISOString(),arrival:'Pátek',departure:'Neděle',nights:2,attendanceType:'full_weekend',accommodation:'Chatka',accommodationOptionId:'cabin-a',accommodationUnits:crew,crew,showShine:'Možná'};
}

function timedDraft(now,createdOffset){
  const created=now+createdOffset,candidate=draft();
  candidate.createdAt=new Date(created).toISOString();
  candidate.expiresAt=new Date(created+6*24*60*60*1000).toISOString();
  return candidate;
}

function stayDraft(arrival,departure,nights){
  const candidate=draft();
  candidate.arrival=arrival;candidate.departure=departure;candidate.nights=nights;
  candidate.attendanceType=arrival==='Pátek'?'full_weekend':arrival==='Sobota'?'saturday_only':'day_visit';
  if(arrival==='Jen na otočku'){candidate.accommodation='Bez ubytování';candidate.accommodationOptionId=null;candidate.accommodationUnits=0}
  return candidate;
}

function request(body){return new Request('https://api.e36united.cz/api/planner-draft',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}
async function jsonOf(response){return {status:response.status,payload:await response.json()}}

test('planner routes require verified authentication before touching D1',async()=>{
  const response=await worker.default.fetch(new Request('https://api.e36united.cz/api/planner-draft'),{DB:{prepare(){throw new Error('must not query')}}});
  assert.equal(response.status,401);
});

test('closed event accepts a valid UID-scoped draft and creates no reservation',async()=>{
  const db=database(),DB=d1(db),candidate=draft();
  const saved=await jsonOf(await worker.putPlannerDraft(request({draft:candidate,memberId:'member-b'}),{DB},{uid:'member-a'},'https://e36united.cz'));
  assert.equal(saved.status,200);assert.equal(saved.payload.accepted,true);
  assert.equal(db.prepare('SELECT member_id FROM member_planner_drafts').get().member_id,'member-a');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM reservations').get().count,0);
  const navigation=await jsonOf(await worker.getMemberNavigationState({DB},{uid:'member-a'},'https://e36united.cz'));
  assert.deepEqual({hasWaitingPlan:navigation.payload.hasWaitingPlan,hasReservation:navigation.payload.hasReservation},{hasWaitingPlan:true,hasReservation:false});
  const other=await jsonOf(await worker.getPlannerDraft({DB},{uid:'member-b'},'https://e36united.cz'));
  assert.equal(other.payload.draft,null);
});

test('server rejects malformed drafts at least as strictly as the browser validator',async()=>{
  const db=database(),DB=d1(db),invalid=draft({crew:6});
  assert.equal(validatePlannerDraft(invalid),null);
  assert.equal(worker.validatePlannerDraft(invalid),null);
  const response=await jsonOf(await worker.putPlannerDraft(request({draft:invalid}),{DB},{uid:'member-a'},'https://e36united.cz'));
  assert.equal(response.status,400);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM member_planner_drafts').get().count,0);
});

test('planner crew limit is exactly five in shared and server validation',()=>{
  assert.equal(MAX_RESERVATION_CREW,5);
  assert.equal(worker.MAX_RESERVATION_CREW,5);
  for(const crew of [1,5]){
    const candidate=draft({crew});
    assert.ok(validatePlannerDraft(candidate));
    assert.ok(worker.validatePlannerDraft(candidate));
  }
  for(const crew of [0,-1,6,8,1.5,'abc']){
    const candidate=draft({crew});
    assert.equal(validatePlannerDraft(candidate),null);
    assert.equal(worker.validatePlannerDraft(candidate),null);
  }
});

test('planner and member controls expose five as the maximum and edits send the current reservation id',()=>{
  assert.match(mainSource,/Math\.min\(5, plannerState\.people \+ 1\)/);
  assert.doesNotMatch(mainSource,/Math\.min\(8, plannerState\.people \+ 1\)/);
  assert.match(indexSource,/<span>\/ 05<\/span>/);
  assert.match(memberHtml,/name="crew" type="number" value="2"\/?>/);
  assert.match(memberHtml,/name="crew"[^>]*max="5"|max="5"[^>]*name="crew"/);
  assert.doesNotMatch(memberHtml,/name="crew"[^>]*max="8"|max="8"[^>]*name="crew"/);
  assert.match(memberSource,/reservationId:data\.reservation\?\.id\|\|null/);
});

test('server and shared validators reject future timestamps beyond the five-minute clock skew',async()=>{
  const now=Date.parse('2026-08-26T12:00:00.000Z');
  assert.equal(PLANNER_CLOCK_SKEW_MS,5*60*1000);
  assert.equal(worker.PLANNER_CLOCK_SKEW_MS,PLANNER_CLOCK_SKEW_MS);
  for(const candidate of [
    timedDraft(now,PLANNER_CLOCK_SKEW_MS+1),
    {...timedDraft(now,0),createdAt:'2099-01-01T00:00:00.000Z',expiresAt:'2099-01-07T00:00:00.000Z'},
  ]){
    assert.equal(worker.validatePlannerDraft(candidate,now),null);
    assert.equal(validatePlannerDraft(candidate,{now}),null);
  }
  for(const candidate of [timedDraft(now,PLANNER_CLOCK_SKEW_MS),timedDraft(now,-60_000)]){
    assert.ok(worker.validatePlannerDraft(candidate,now));
    assert.ok(validatePlannerDraft(candidate,{now}));
  }

  const db=database(),DB=d1(db),farFuture={...timedDraft(now,0),createdAt:'2099-01-01T00:00:00.000Z',expiresAt:'2099-01-07T00:00:00.000Z'};
  const response=await jsonOf(await worker.putPlannerDraft(request({draft:farFuture}),{DB},{uid:'member-a'},'https://e36united.cz'));
  assert.equal(response.status,400);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM member_planner_drafts').get().count,0);
});

test('authoritative server validator enforces the exact planner stay matrix',()=>{
  const accepted=[['Pátek','Sobota',1],['Pátek','Neděle',2],['Sobota','Neděle',1],['Jen na otočku','Stejný den',0]];
  const rejected=[['Pátek','Sobota',2],['Pátek','Neděle',1],['Sobota','Neděle',2],['Jen na otočku','Stejný den',1]];
  for(const values of accepted){const candidate=stayDraft(...values);assert.ok(worker.validatePlannerDraft(candidate),`server accepts ${values.join(' / ')}`);assert.ok(validatePlannerDraft(candidate),`shared accepts ${values.join(' / ')}`)}
  for(const values of rejected){const candidate=stayDraft(...values);assert.equal(worker.validatePlannerDraft(candidate),null,`server rejects ${values.join(' / ')}`);assert.equal(validatePlannerDraft(candidate),null,`shared rejects ${values.join(' / ')}`)}
});

test('newer explicit handoff wins and an older browser cannot overwrite it',async()=>{
  const db=database(),DB=d1(db);
  const older=draft({id:'22222222-2222-4222-8222-222222222222',createdOffset:-120_000});
  const newer=draft({id:'33333333-3333-4333-8333-333333333333',createdOffset:-60_000});
  await worker.putPlannerDraft(request({draft:older}),{DB},{uid:'member-a'},'https://e36united.cz');
  await worker.putPlannerDraft(request({draft:newer}),{DB},{uid:'member-a'},'https://e36united.cz');
  const rejected=await jsonOf(await worker.putPlannerDraft(request({draft:older}),{DB},{uid:'member-a'},'https://e36united.cz'));
  assert.equal(rejected.payload.accepted,false);assert.equal(rejected.payload.draft.draftId,newer.draftId);
  const secondBrowser=await jsonOf(await worker.getPlannerDraft({DB},{uid:'member-a'},'https://e36united.cz'));
  assert.equal(secondBrowser.payload.draft.draftId,newer.draftId);
  assert.equal(newerPlannerDraft(older,newer),newer);
});

test('reservation consumes the plan only after success and keeps it after failure',async()=>{
  const db=database(),DB=d1(db),auth={uid:'member-a'};
  await worker.putPlannerDraft(request({draft:draft()}),{DB},auth,'https://e36united.cz');
  const closed=await worker.putCurrentReservation(new Request('https://api.e36united.cz/api/reservations/current',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{}'}),{DB},auth,'https://e36united.cz');
  assert.equal(closed.status,409);assert.equal(db.prepare('SELECT COUNT(*) AS count FROM member_planner_drafts').get().count,1);
  db.prepare("UPDATE events SET registration_status='open'").run();
  const reservationRequest=new Request('https://api.e36united.cz/api/reservations/current',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({carId:'car-a',arrival:'Jen na otočku',crew:1,attendanceType:'day_visit',accommodation:'Bez ubytování',accommodationOptionId:null,accommodationUnits:0,showShine:'Ne',note:''})});
  const success=await worker.putCurrentReservation(reservationRequest,{DB},auth,'https://e36united.cz');
  assert.equal(success.status,200);assert.equal(db.prepare('SELECT COUNT(*) AS count FROM reservations').get().count,1);assert.equal(db.prepare('SELECT COUNT(*) AS count FROM member_planner_drafts').get().count,0);
  const navigation=await jsonOf(await worker.getMemberNavigationState({DB},auth,'https://e36united.cz'));
  assert.deepEqual({hasWaitingPlan:navigation.payload.hasWaitingPlan,hasReservation:navigation.payload.hasReservation},{hasWaitingPlan:false,hasReservation:true});
});

test('join CTA matrix hides for any plan or reservation and fails closed while unresolved',()=>{
  assert.equal(shouldShowJoinCta({status:'anonymous'}),true);
  assert.equal(shouldShowJoinCta({status:'authenticated'}),true);
  assert.equal(shouldShowJoinCta({status:'authenticated',hasWaitingPlan:true}),false);
  assert.equal(shouldShowJoinCta({status:'authenticated',hasReservation:true}),false);
  assert.equal(shouldShowJoinCta({status:'authenticated',hasWaitingPlan:true,hasReservation:true}),false);
  assert.equal(shouldShowJoinCta({status:'loading'}),false);
  assert.equal(shouldShowJoinCta({status:'error'}),false);
});

test('navigation reservation state is scoped to the current event, not the account forever',async()=>{
  const db=database(),DB=d1(db),auth={uid:'member-a'};
  db.prepare("INSERT INTO events (id,year,registration_status,is_current) VALUES ('event-2025',2025,'closed',0)").run();
  db.prepare("INSERT INTO reservations (id,member_id,event_id,status) VALUES ('old-reservation','member-a','event-2025','approved')").run();
  const historicalOnly=await jsonOf(await worker.getMemberNavigationState({DB},auth,'https://e36united.cz'));
  assert.equal(historicalOnly.payload.hasReservation,false);
  db.prepare("INSERT INTO reservations (id,member_id,event_id,status) VALUES ('current-reservation','member-a','event-2026','pending')").run();
  const current=await jsonOf(await worker.getMemberNavigationState({DB},auth,'https://e36united.cz'));
  assert.equal(current.payload.hasReservation,true);
});

test('public auth bootstrap fetches only the boolean navigation summary',async()=>{
  let emitAuth;
  const states=[],requests=[];
  const controller=initPublicMemberState({
    config:{},apiBaseUrl:'https://api.example',onStateChange:state=>states.push(state),
    authFactory:({onStateChange})=>{emitAuth=onStateChange;return {stop(){}}},
    fetchImpl:async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify({hasWaitingPlan:true,hasReservation:false}),{status:200,headers:{'Content-Type':'application/json'}})},
  });
  emitAuth({status:'anonymous',user:null});
  assert.equal(states.at(-1).showJoinCta,true);
  emitAuth({status:'authenticated',user:{getIdToken:async()=> 'token-a'}});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(requests.length,1);assert.equal(requests[0].url,'https://api.example/api/navigation-state');
  assert.equal(requests[0].options.headers.Authorization,'Bearer token-a');
  assert.deepEqual({hasWaitingPlan:states.at(-1).hasWaitingPlan,hasReservation:states.at(-1).hasReservation,showJoinCta:states.at(-1).showJoinCta},{hasWaitingPlan:true,hasReservation:false,showJoinCta:false});
  controller.stop();
});
