import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { getMemberLive, saveJudgeScore } from '../worker/domains/live.js';

test('LIVE rebuild preserves populated identities, dependent records, constraints and score editing', async () => {
  const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../db/migrations/2026-09-23-live-competition-cars.sql', import.meta.url), 'utf8');
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(schema.slice(0, schema.indexOf('-- Execute with LIVE writes gated')) + 'COMMIT;');
    db.exec(`INSERT INTO members(id,member_code,email,name,role) VALUES
      ('owner','EU-OWNER','owner@example.invalid','Owner','member'),
      ('judge','EU-JUDGE','judge@example.invalid','Judge','admin');
      INSERT INTO events(id,year,title,live_enabled) VALUES('event',2026,'Fixture',1);
      INSERT INTO cars(id,member_id,model,body) VALUES('car','owner','328i','Coupé');
      INSERT INTO car_photos(id,car_id,r2_key) VALUES('photo','car','fixture/car');
      INSERT INTO reservations(id,event_id,member_id,car_id,status) VALUES('reservation','event','owner','car','approved');
      INSERT INTO gallery_submissions(id,member_id,car_id,r2_key,status) VALUES('gallery','owner','car','fixture/gallery','pending');
      INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,presented_at) VALUES('entry','event','show_shine','owner','car','2026-09-22 12:00:00');
      INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id,version) VALUES('event','show_shine','live','entry',7);
      INSERT INTO live_public_votes(id,event_id,discipline,entry_id,voter_id,score) VALUES('vote','event','show_shine','entry','judge',8);
      INSERT INTO live_judge_scores(id,event_id,entry_id,judge_id,scores_json,note,submitted) VALUES('score','event','entry','judge','{"overall":8,"condition":9,"cohesion":7,"originality":8}','Keep this note',1);
      INSERT INTO live_judge_photos(id,event_id,entry_id,judge_id,r2_key,mime_type,size_bytes,gallery_submission_id) VALUES('jury-photo','event','entry','judge','fixture/jury','image/jpeg',42,'gallery');`);
    const preserved = ['live_competition_state','live_public_votes','live_judge_scores','live_judge_photos','cars','car_photos','reservations','gallery_submissions','members'];
    const before = new Map(preserved.map(table => [table, db.prepare(`SELECT * FROM ${table}`).all()]));
    const entries = db.prepare('SELECT * FROM live_entries').all();
    const oldIndexes = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='index' AND name LIKE 'live_%' ORDER BY name").all();
    db.exec(readFileSync(new URL('../db/operations/live-upgrade-write-fence.sql',import.meta.url),'utf8'));
    assert.throws(()=>db.exec("UPDATE live_judge_scores SET note='Old Worker must not write'"),/live_schema_upgrading/);
    db.exec('BEGIN');
    try { db.exec(migration); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    for (const [table, rows] of before) assert.deepEqual(db.prepare(`SELECT * FROM ${table}`).all(), rows, table);
    assert.deepEqual(db.prepare('SELECT id,event_id,discipline,member_id,car_id,category,presented_at,created_at FROM live_entries').all(), entries);
    for (const index of oldIndexes) assert.deepEqual(db.prepare('SELECT name,sql FROM sqlite_master WHERE name=?').get(index.name), index);
    assert.throws(()=>db.exec("UPDATE live_judge_scores SET note='Still fenced'"),/live_schema_upgrading/);
    db.exec("INSERT INTO schema_migrations(id,description) VALUES('2026-09-23-live-writes-enabled','Isolated verification complete')");
    assert.throws(() => db.exec("INSERT INTO live_entries(id,event_id,discipline,member_id,car_id) VALUES('duplicate','event','show_shine','owner','car')"), /UNIQUE/);
    assert.throws(() => db.exec("INSERT INTO live_entries(id,event_id,discipline,member_id) VALUES('missing','event','show_shine','owner')"), /CHECK/);
    assert.throws(() => db.exec("INSERT INTO live_entries(id,event_id,discipline,member_id,car_id) VALUES('missing-car','event','show_shine','owner','absent')"), /FOREIGN KEY/);
    assert.throws(() => db.exec("INSERT INTO live_public_votes(id,event_id,discipline,entry_id,voter_id,score) VALUES('duplicate','event','show_shine','entry','judge',9)"), /UNIQUE/);
    assert.throws(() => db.exec("INSERT INTO live_judge_scores(id,event_id,entry_id,judge_id,scores_json) VALUES('duplicate','event','entry','judge','{}')"), /UNIQUE/);
    const prepare = (sql, args = []) => ({bind: (...values) => prepare(sql, values), first: async () => db.prepare(sql).get(...args), all: async () => ({results: db.prepare(sql).all(...args)}), run: async () => ({meta: {changes: Number(db.prepare(sql).run(...args).changes)}})});
    const env = {DB: {prepare}};
    const first = await (await getMemberLive(env, {uid:'judge'}, 'https://e36united.cz')).json();
    assert.equal(first.states.show_shine.entry.id, 'entry');
    assert.equal(first.judgeHistory[0].photos[0].id, 'jury-photo');
    assert.equal(first.judgeHistory[0].scores.overall, 8);
    const response = await saveJudgeScore(new Request('https://example.invalid', {method:'PUT', body:JSON.stringify({scores:{overall:9,condition:9,cohesion:7,originality:8},note:'Edited',submitted:true})}), env, {uid:'judge'}, 'entry', 'https://e36united.cz');
    assert.equal(response.status, 200);
    assert.deepEqual(db.prepare('SELECT id,note FROM live_judge_scores').get(), Object.assign(Object.create(null), {id:'score',note:'Edited'}));
    assert.equal(db.prepare("SELECT revision FROM live_event_revisions WHERE event_id='event'").get().revision, 1);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
    assert.deepEqual(db.prepare('SELECT * FROM reservations').all(), before.get('reservations'));
  } finally { db.close(); }
});
