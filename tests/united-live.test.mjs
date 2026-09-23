import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { memberRuntime } from './helpers/admin-member-runtime.mjs';
import {
  controlLive,
  createEvent,
  getAdminLive,
  getMemberLive,
  saveJudgeScore,
  saveLiveVote,
  searchLiveMembers,
  setAdminLiveEnabled,
  startLiveEntry,
} from '../worker/domains/live.js';

const origin = 'https://e36united.cz';
const admin = { uid: 'a' };
const member = { uid: 'm' };
const other = { uid: 'n' };
const request = (body, method = 'POST') => new Request('https://api.e36united.cz/api/live', {
  method,
  headers: { Origin: origin, 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const body = async response => response.json();

function setupLive() {
  const runtime = memberRuntime();
  runtime.db.exec(`
    UPDATE events SET live_enabled=1 WHERE id='e';
    UPDATE cars SET body='Sedan' WHERE id='cn';
    INSERT INTO reservations(id,member_id,event_id,car_id,status,crew,show_shine)
      VALUES('rn','n','e','cn','approved',1,'Ano');
    INSERT INTO event_member_presence(event_id,member_id,present,confirmed_by)
      VALUES('e','m',1,'a'),('e','n',1,'a');
    INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category)
      VALUES('entry-n','e','show_shine','n','cn','Sedan');
    INSERT INTO live_category_state(event_id,discipline,category,status,version,updated_by)
      VALUES('e','show_shine','Sedan','live',1,'a');
    INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id,version,updated_by)
      VALUES('e','show_shine','live','entry-n',1,'a'),
            ('e','best_exhaust','idle',NULL,1,'a');
    UPDATE live_entries SET presented_at=CURRENT_TIMESTAMP WHERE id='entry-n';
  `);
  return runtime;
}

test('UNITED LIVE migration is additive and activates the current event once', () => {
  const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../db/migrations/2026-09-22-united-live.sql', import.meta.url), 'utf8');
  const marker = '-- UNITED LIVE v1.';
  assert.ok(schema.includes(marker));
  const db = new DatabaseSync(':memory:');
  db.exec(schema.slice(0, schema.indexOf(marker)) + 'COMMIT;');
  db.exec("INSERT INTO events(id,year,title,is_current) VALUES('current',2026,'United 2026',1),('archive',2025,'United 2025',0)");
  db.exec(migration);
  assert.equal(db.prepare("SELECT id FROM events WHERE live_enabled=1").get().id, 'current');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name='events_single_live'").get().n, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name IN ('event_program_items','event_live_judges','event_member_presence','live_entries','live_competition_state','live_public_votes','live_judge_scores','live_judge_photos')").get().n, 8);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE id='2026-09-22-united-live'").get().n, 1);
  db.close();
});

test('Show & Shine category migration is additive and does not classify existing entries by guess', () => {
  const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../db/migrations/2026-09-22-united-live-categories.sql', import.meta.url), 'utf8');
  const marker = '-- UNITED LIVE category state.';
  const db = new DatabaseSync(':memory:');
  db.exec(schema.slice(0, schema.indexOf(marker)) + 'COMMIT;');
  db.exec("INSERT INTO members(id,member_code,email,name) VALUES('m','EU-M','m@example.invalid','Member'); INSERT INTO events(id,year,title) VALUES('e',2026,'United'); INSERT INTO cars(id,member_id,model,body) VALUES('c','m','BMW','Sedan'); INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category) VALUES('le','e','show_shine','m','c',NULL)");
  db.exec(migration);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM live_category_state').get().n, 0);
  assert.equal(db.prepare("SELECT category FROM live_entries WHERE id='le'").get().category, null);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
});

test('public vote is one editable 1-10 score, rejects own car and closes authoritatively', async () => {
  const runtime = setupLive();
  try {
    runtime.db.exec("DELETE FROM event_member_presence WHERE event_id='e' AND member_id='m'");
    let response = await saveLiveVote(request({ score: 6 }), runtime.env, member, 'entry-n', origin);
    assert.equal(response.status, 200);
    response = await saveLiveVote(request({ score: 9 }), runtime.env, member, 'entry-n', origin);
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(JSON.stringify(runtime.db.prepare('SELECT voter_id,score FROM live_public_votes').all())), [{ voter_id: 'm', score: 9 }]);
    assert.equal((await saveLiveVote(request({ score: 11 }), runtime.env, member, 'entry-n', origin)).status, 400);
    assert.equal((await saveLiveVote(request({ score: 7 }), runtime.env, other, 'entry-n', origin)).status, 403);
    const unregistered = await saveLiveVote(request({ score: 7 }), runtime.env, admin, 'entry-n', origin);
    assert.equal(unregistered.status, 200);
    assert.equal((await body(unregistered)).score, 7);
    runtime.db.exec("UPDATE live_competition_state SET status='closed' WHERE event_id='e' AND discipline='show_shine'");
    assert.equal((await saveLiveVote(request({ score: 8 }), runtime.env, member, 'entry-n', origin)).status, 409);
  } finally {
    runtime.db.close();
  }
});

test('jury notes stay private and results appear only after explicit publication', async () => {
  const runtime = setupLive();
  try {
    const denied = await saveJudgeScore(request({ scores: { overall: 8 }, submitted: false }), runtime.env, member, 'entry-n', origin);
    assert.equal(denied.status, 403);
    assert.equal((await body(denied)).error, 'judge_forbidden');
    runtime.db.exec("UPDATE live_entries SET member_id='a' WHERE id='entry-n'");
    const own = await saveJudgeScore(request({ scores: { overall: 8 }, submitted: false }), runtime.env, admin, 'entry-n', origin);
    assert.equal(own.status, 403);
    assert.equal((await body(own)).error, 'own_car_score');
    runtime.db.exec("UPDATE live_entries SET member_id='n' WHERE id='entry-n'");
    const scored = await saveJudgeScore(request({ scores: { overall: 8, condition: 7, cohesion: 9, originality: 6 }, note: 'Interní poznámka', submitted: true }), runtime.env, admin, 'entry-n', origin);
    assert.equal(scored.status, 200);
    const before = await body(await getMemberLive(runtime.env, other, origin));
    assert.deepEqual(before.results, {});
    assert.equal(before.me.judge, false);
    assert.deepEqual(before.judgeHistory, []);
    assert.equal(JSON.stringify(before).includes('Interní poznámka'), false);
    const adminView = await body(await getMemberLive(runtime.env, admin, origin));
    assert.equal(adminView.me.judge, true);
    assert.equal(adminView.judgeHistory.length, 1);

    let transition = await controlLive(request({ action: 'close_category', category: 'Sedan', expectedCategoryVersion: 1 }), runtime.env, admin, 'e', 'show_shine', origin);
    assert.equal(transition.status, 200);
    transition = await controlLive(request({ action: 'publish', expectedVersion: 2 }), runtime.env, admin, 'e', 'show_shine', origin);
    assert.equal(transition.status, 200);
    const after = await body(await getMemberLive(runtime.env, other, origin));
    assert.equal(after.results.show_shine[0].jury.average, 7.5);
    assert.equal(after.results.show_shine[0].jury.criteria.overall, 8);
    assert.equal(after.results.show_shine[0].juryRank, 1);
    assert.equal(JSON.stringify(after.results).includes('Interní poznámka'), false);
    assert.equal(JSON.stringify(after.results).includes('judge_id'), false);
  } finally {
    runtime.db.close();
  }
});

test('atomic start is idempotent under repeat, lost response and concurrent requests', async () => {
  const runtime = memberRuntime();
  try {
    runtime.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'; UPDATE cars SET body='Sedan' WHERE id='c'; UPDATE reservations SET car_id='c',show_shine='Ano' WHERE id='r'; INSERT INTO event_member_presence(event_id,member_id,present,confirmed_by) VALUES('e','m',1,'a'); INSERT INTO live_competition_state(event_id,discipline,status,version,updated_by) VALUES('e','show_shine','idle',1,'a')");
    const originalBatch=runtime.env.DB.batch.bind(runtime.env.DB);let tail=Promise.resolve();runtime.env.DB.batch=statements=>{const next=tail.then(()=>originalBatch(statements));tail=next.catch(()=>{});return next};
    const start=()=>startLiveEntry(request({discipline:'show_shine',memberId:'m',carId:'c',category:'Sedan',expectedVersion:1}),runtime.env,admin,'e',origin);
    const [first,concurrent]=await Promise.all([start(),start()]),firstBody=await body(first),concurrentBody=await body(concurrent);
    assert.equal(first.status,201);assert.equal(concurrent.status,200);assert.equal(firstBody.entryId,concurrentBody.entryId);assert.equal(concurrentBody.replayed,true);
    const repeated=await start(),repeatedBody=await body(repeated);assert.equal(repeated.status,200);assert.equal(repeatedBody.entryId,firstBody.entryId);assert.equal(repeatedBody.replayed,true);
    assert.equal(runtime.db.prepare("SELECT COUNT(*) n FROM live_entries WHERE event_id='e' AND discipline='show_shine' AND car_id='c'").get().n,1);
    assert.equal(runtime.db.prepare("SELECT COUNT(*) n FROM live_category_state WHERE event_id='e' AND category='Sedan'").get().n,1);
    assert.equal(runtime.db.prepare("SELECT status FROM live_competition_state WHERE event_id='e' AND discipline='show_shine'").get().status,'live');
  } finally { runtime.db.close(); }
});

test('rejected start leaves no entry or category state and a closed category does not close others', async () => {
  const runtime = memberRuntime();
  try {
    runtime.db.exec("UPDATE cars SET body='Sedan' WHERE id='c'; UPDATE reservations SET car_id='c',show_shine='Ano' WHERE id='r'; INSERT INTO event_member_presence(event_id,member_id,present,confirmed_by) VALUES('e','m',1,'a'); INSERT INTO live_competition_state(event_id,discipline,status,version,updated_by) VALUES('e','show_shine','idle',1,'a')");
    let denied=await startLiveEntry(request({discipline:'show_shine',memberId:'m',carId:'c',category:'Sedan',expectedVersion:1}),runtime.env,admin,'e',origin);assert.equal(denied.status,409);assert.equal((await body(denied)).error,'live_disabled');
    assert.equal(runtime.db.prepare("SELECT COUNT(*) n FROM live_entries WHERE event_id='e'").get().n,0);assert.equal(runtime.db.prepare("SELECT COUNT(*) n FROM live_category_state").get().n,0);
    runtime.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'");
    denied=await startLiveEntry(request({discipline:'show_shine',memberId:'m',carId:'c',category:'Coupé',expectedVersion:1}),runtime.env,admin,'e',origin);assert.equal(denied.status,409);assert.equal((await body(denied)).error,'category_mismatch');
    assert.equal(runtime.db.prepare("SELECT COUNT(*) n FROM live_entries WHERE event_id='e'").get().n,0);assert.equal(runtime.db.prepare("SELECT COUNT(*) n FROM live_category_state").get().n,0);
    const started=await startLiveEntry(request({discipline:'show_shine',memberId:'m',carId:'c',category:'Sedan',expectedVersion:1}),runtime.env,admin,'e',origin);assert.equal(started.status,201);
    runtime.db.exec("INSERT INTO live_category_state(event_id,discipline,category,status,version,updated_by) VALUES('e','show_shine','Coupé','live',1,'a')");
    const closed=await controlLive(request({action:'close_category',category:'Sedan',expectedCategoryVersion:2}),runtime.env,admin,'e','show_shine',origin);assert.equal(closed.status,200);
    assert.deepEqual(JSON.parse(JSON.stringify(runtime.db.prepare("SELECT category,status FROM live_category_state ORDER BY category").all())),[{category:'Coupé',status:'live'},{category:'Sedan',status:'closed'}]);
    const scoreDenied=await saveJudgeScore(request({scores:{overall:8,condition:8,cohesion:8,originality:8},submitted:true}),runtime.env,admin,(await body(started)).entryId,origin);assert.equal(scoreDenied.status,409);assert.equal((await body(scoreDenied)).error,'judging_closed');
  } finally { runtime.db.close(); }
});

test('admin may present own eligible car but cannot score it and results stay one row per entry', async () => {
  const runtime = memberRuntime();
  try {
    runtime.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'; UPDATE cars SET body='Sedan' WHERE id='c'; UPDATE reservations SET member_id='a',car_id='c',show_shine='Ano' WHERE id='r'; UPDATE cars SET member_id='a' WHERE id='c'; INSERT INTO event_member_presence(event_id,member_id,present,confirmed_by) VALUES('e','a',1,'a'); INSERT INTO live_competition_state(event_id,discipline,status,version,updated_by) VALUES('e','show_shine','idle',1,'a')");
    const started=await startLiveEntry(request({discipline:'show_shine',memberId:'a',carId:'c',category:'Sedan',expectedVersion:1}),runtime.env,admin,'e',origin),startedBody=await body(started);assert.equal(started.status,201);
    const denied=await saveJudgeScore(request({scores:{overall:8,condition:8,cohesion:8,originality:8},submitted:true}),runtime.env,admin,startedBody.entryId,origin);assert.equal(denied.status,403);assert.equal((await body(denied)).error,'own_car_score');
    const adminPayload=await body(await getAdminLive(runtime.env,new URL('https://api.e36united.cz/api/admin/live?eventId=e'),origin));assert.equal(adminPayload.entries.length,1);assert.equal(adminPayload.results.show_shine.length,1);
  } finally { runtime.db.close(); }
});

test('new year is closed and inactive while LIVE switching remains single and independent of current', async () => {
  const runtime = setupLive();
  try {
    const created = await createEvent(request({ year: 2027, title: 'United 2027', startsOn: '2027-09-03', endsOn: '2027-09-05', venue: 'Sosnová' }), runtime.env, admin, origin);
    assert.equal(created.status, 201);
    assert.deepEqual({ ...runtime.db.prepare("SELECT registration_status,is_current,live_enabled FROM events WHERE id='united-2027'").get() }, { registration_status: 'closed', is_current: 0, live_enabled: 0 });
    const switched = await setAdminLiveEnabled(request({ enabled: true }, 'PUT'), runtime.env, admin, 'united-2027', origin);
    assert.equal(switched.status, 200);
    assert.deepEqual(JSON.parse(JSON.stringify(runtime.db.prepare('SELECT id,is_current,live_enabled FROM events ORDER BY year').all())), [
      { id: 'old', is_current: 0, live_enabled: 0 },
      { id: 'e', is_current: 1, live_enabled: 0 },
      { id: 'united-2027', is_current: 0, live_enabled: 1 },
    ]);
  } finally {
    runtime.db.close();
  }
});

test('member organization search is event-scoped by default and loads cars without N+1', async () => {
  const runtime = memberRuntime();
  try {
    const start = runtime.queries.length;
    const listed = await body(await searchLiveMembers(runtime.env, 'e', new URL('https://api.e36united.cz/api/admin/live/members?eventId=e'), origin));
    assert.deepEqual(listed.members.map(item => item.memberId), ['m']);
    assert.deepEqual(listed.members[0].cars.map(car => car.id).sort(), ['c', 'c2']);
    assert.equal(listed.members[0].cars.find(car => car.id === 'c').photoId, 'p');
    assert.equal(listed.members[0].cars.find(car => car.id === 'c2').photoId, null);
    const queries = runtime.queries.slice(start);
    assert.equal(queries.length, 1);
    assert.equal(queries[0].sql.includes('json_group_array'), true);
    assert.equal(queries[0].sql.includes('FROM live_vehicle_catalog c2'), true);
    assert.equal(queries[0].sql.includes('c2.event_id=r.event_id'), true);

    const searched = await body(await searchLiveMembers(runtime.env, 'e', new URL('https://api.e36united.cz/api/admin/live/members?eventId=e&q=Second'), origin));
    assert.deepEqual(searched.members.map(item => item.memberId), ['n']);
  } finally {
    runtime.db.close();
  }
});

test('LIVE clients keep one result row, cancellable jury drafts and stale-response guards', () => {
  const adminSource=readFileSync(new URL('../admin/modules/live.js',import.meta.url),'utf8'),memberSource=readFileSync(new URL('../member/modules/live.js',import.meta.url),'utf8');
  for(const source of [adminSource,memberSource]){
    assert.match(source,/Zrušit hodnocení/);
    assert.match(source,/readSequence/);
    assert.match(source,/sequence!==readSequence/);
    assert.doesNotMatch(source,/resultRows\(items,'public'/);
    assert.doesNotMatch(source,/resultRows\(items,'jury'/);
  }
  assert.match(adminSource,/\/live\/start/);
  assert.match(adminSource,/data-live-close-category/);
  assert.doesNotMatch(adminSource,/discipline==='show_shine'.*data-live-control="pause"/);
  assert.match(memberSource,/MOJE HODNOCENÍ POROTY/);
});
