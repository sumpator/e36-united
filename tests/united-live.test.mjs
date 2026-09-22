import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { memberRuntime } from './helpers/admin-member-runtime.mjs';
import {
  controlLive,
  createEvent,
  getMemberLive,
  saveJudgeScore,
  saveLiveVote,
  searchLiveMembers,
  setAdminLiveEnabled,
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
    INSERT INTO reservations(id,member_id,event_id,car_id,status,crew)
      VALUES('rn','n','e','cn','approved',1);
    INSERT INTO event_member_presence(event_id,member_id,present,confirmed_by)
      VALUES('e','m',1,'a'),('e','n',1,'a');
    INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category)
      VALUES('entry-n','e','show_shine','n','cn','Street');
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

test('public vote is one editable 1-10 score, rejects own car and closes authoritatively', async () => {
  const runtime = setupLive();
  try {
    let response = await saveLiveVote(request({ score: 6 }), runtime.env, member, 'entry-n', origin);
    assert.equal(response.status, 200);
    response = await saveLiveVote(request({ score: 9 }), runtime.env, member, 'entry-n', origin);
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(JSON.stringify(runtime.db.prepare('SELECT voter_id,score FROM live_public_votes').all())), [{ voter_id: 'm', score: 9 }]);
    assert.equal((await saveLiveVote(request({ score: 11 }), runtime.env, member, 'entry-n', origin)).status, 400);
    assert.equal((await saveLiveVote(request({ score: 7 }), runtime.env, other, 'entry-n', origin)).status, 403);
    runtime.db.exec("UPDATE live_competition_state SET status='closed' WHERE event_id='e' AND discipline='show_shine'");
    assert.equal((await saveLiveVote(request({ score: 8 }), runtime.env, member, 'entry-n', origin)).status, 409);
  } finally {
    runtime.db.close();
  }
});

test('jury notes stay private and results appear only after explicit publication', async () => {
  const runtime = setupLive();
  try {
    runtime.db.exec("INSERT INTO event_live_judges(event_id,member_id,created_by) VALUES('e','m','a')");
    const scored = await saveJudgeScore(request({ scores: { overall: 8, condition: 7, cohesion: 9, originality: 6 }, note: 'Interní poznámka', submitted: true }), runtime.env, member, 'entry-n', origin);
    assert.equal(scored.status, 200);
    const before = await body(await getMemberLive(runtime.env, other, origin));
    assert.deepEqual(before.results, {});
    assert.equal(JSON.stringify(before).includes('Interní poznámka'), false);

    let transition = await controlLive(request({ action: 'close', expectedVersion: 1 }), runtime.env, admin, 'e', 'show_shine', origin);
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
    const queries = runtime.queries.slice(start);
    assert.equal(queries.length, 1);
    assert.equal(queries[0].sql.includes('json_group_array'), true);

    const searched = await body(await searchLiveMembers(runtime.env, 'e', new URL('https://api.e36united.cz/api/admin/live/members?eventId=e&q=Second'), origin));
    assert.deepEqual(searched.members.map(item => item.memberId), ['n']);
  } finally {
    runtime.db.close();
  }
});
