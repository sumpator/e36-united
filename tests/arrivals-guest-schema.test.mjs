// Only the approved explicit schema migration. No deployment / network / old suites.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {arrivalsRuntime} from './helpers/arrivals-runtime.mjs';
const proposal=readFileSync(new URL('../db/migrations/2026-09-30-live-arrival-entries.sql',import.meta.url),'utf8');
const affected=['live_entries','live_competition_state','live_public_votes','live_judge_scores','live_judge_photos'];
const snapshot=(db,table)=>db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all();
function fixture(){
 const r=arrivalsRuntime({guestSchema:false});
 r.db.exec(`INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category,presented_at) VALUES('existing-entry','e','show_shine','m','c','Sedan',CURRENT_TIMESTAMP);
 INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id) VALUES('e','show_shine','live','existing-entry');
 INSERT INTO live_public_votes(id,event_id,discipline,entry_id,voter_id,score) VALUES('existing-vote','e','show_shine','existing-entry','n',8);
 INSERT INTO live_judge_scores(id,event_id,entry_id,judge_id,scores_json,note,submitted) VALUES('existing-score','e','existing-entry','a','{"overall":8,"condition":7,"cohesion":9,"originality":8}','Keep note',1);
 UPDATE live_judge_scores SET scores_json='{"overall":9,"condition":7,"cohesion":9,"originality":8}',version=2,updated_by='a',correction_reason='Keep correction' WHERE id='existing-score';
 INSERT INTO live_judge_photos(id,event_id,entry_id,judge_id,r2_key,mime_type,size_bytes,gallery_submission_id) VALUES('existing-attachment','e','existing-entry','a','isolated/attachment','image/jpeg',123,'g');
 INSERT INTO event_arrivals(id,event_id,car_key,model,body,crew,registered,admission_czk,services_czk,arrived_at,confirmed_by,email,phone) VALUES('guest-arrival','e','gate-guest','BMW 328i Touring','Touring',2,0,0,0,CURRENT_TIMESTAMP,'a','private@example.invalid','private-phone');`);
 return r;
}
function apply(db){db.exec('BEGIN');try{db.exec(proposal);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}}

test('additional schema preserves every existing business row, financial value, index and trigger',()=>{
 const r=fixture();try{
  const tables=r.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'schema_migrations'").all().map(x=>x.name);
  const before=new Map(tables.map(t=>[t,snapshot(r.db,t)]));
  const objects=r.db.prepare("SELECT name,sql FROM sqlite_master WHERE type IN ('trigger','index') AND sql IS NOT NULL").all();
  apply(r.db);
  for(const t of tables){const after=snapshot(r.db,t);if(t==='live_entries')for(const row of after){assert.equal(row.arrival_id,null);delete row.arrival_id}assert.deepEqual(after,before.get(t),t)}
  for(const o of objects)assert.equal(r.db.prepare('SELECT sql FROM sqlite_master WHERE name=?').get(o.name)?.sql,o.sql,o.name);
  assert.equal(r.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.equal(r.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name LIKE '_arrival_rebuild_%'").get().n,0);
 }finally{r.db.close()}
});

test('guest has direct arrival identity without an account/car copy; linkage retains entry, votes and scores',()=>{
 const r=fixture();try{apply(r.db);const accounts=snapshot(r.db,'members').length,cars=snapshot(r.db,'cars').length,competitionCars=snapshot(r.db,'live_competition_cars').length;
  r.db.exec("INSERT INTO live_entries(id,event_id,discipline,arrival_id,category,presented_at) VALUES('guest-entry','e','show_shine','guest-arrival','Touring',CURRENT_TIMESTAMP)");
  r.db.exec(`INSERT INTO live_public_votes(id,event_id,discipline,entry_id,voter_id,score) VALUES('guest-vote','e','show_shine','guest-entry','n',9);
 INSERT INTO live_judge_scores(id,event_id,entry_id,judge_id,scores_json,submitted) VALUES('guest-score','e','guest-entry','a','{"overall":8,"condition":7,"cohesion":9,"originality":8}',1);
 INSERT INTO live_judge_photos(id,event_id,entry_id,judge_id,r2_key,mime_type,size_bytes) VALUES('guest-photo','e','guest-entry','a','isolated/guest','image/jpeg',123);`);
  const before=new Map(affected.map(t=>[t,snapshot(r.db,t)]));
  let vehicle=r.db.prepare("SELECT * FROM live_entry_vehicles WHERE entry_id='guest-entry'").get();assert.equal(vehicle.member_id,null);assert.equal(vehicle.car_id,'gate-guest');assert.equal(vehicle.model,'BMW 328i Touring');assert.match(vehicle.participant_name,/Účastník č\./);assert.ok(!JSON.stringify(vehicle).includes('private'));
  // Simulate only the already-authorized member linkage, not a fabricated account.
  r.db.exec("UPDATE event_arrivals SET member_id='n' WHERE id='guest-arrival'");
  vehicle=r.db.prepare("SELECT * FROM live_entry_vehicles WHERE entry_id='guest-entry'").get();assert.equal(vehicle.member_id,'n');assert.equal(vehicle.car_id,'gate-guest');
  for(const t of affected)assert.deepEqual(snapshot(r.db,t),before.get(t),t);
  assert.equal(snapshot(r.db,'members').length,accounts);assert.equal(snapshot(r.db,'cars').length,cars);assert.equal(snapshot(r.db,'live_competition_cars').length,competitionCars);
  assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{r.db.close()}
});

test('schema rejects missing/wrong-event arrival and duplicate physical car; failed migration rolls back',()=>{
 const r=fixture();try{
  r.db.exec('BEGIN');assert.throws(()=>{r.db.exec(proposal);r.db.exec("INSERT INTO live_entries(id,event_id,discipline,arrival_id) VALUES('bad','e','show_shine','missing')")});r.db.exec('ROLLBACK');
  assert.equal(r.db.prepare("SELECT COUNT(*) n FROM pragma_table_info('live_entries') WHERE name='arrival_id'").get().n,0);assert.equal(r.db.prepare("SELECT score FROM live_public_votes WHERE id='existing-vote'").get().score,8);
  apply(r.db);
  assert.throws(()=>r.db.exec("INSERT INTO live_entries(id,event_id,discipline,arrival_id) VALUES('bad','old','show_shine','guest-arrival')"),/confirmed_arrival/);
  r.db.exec("INSERT INTO live_entries(id,event_id,discipline,arrival_id) VALUES('guest-entry','e','show_shine','guest-arrival')");
  assert.throws(()=>r.db.exec("INSERT INTO live_entries(id,event_id,discipline,arrival_id) VALUES('duplicate','e','show_shine','guest-arrival')"),/duplicate_physical/);
  assert.throws(()=>r.db.exec("UPDATE event_arrivals SET car_key='changed' WHERE id='guest-arrival'"),/identity_locked/);
  assert.throws(()=>r.db.exec("INSERT INTO live_judge_scores(id,event_id,entry_id,judge_id,scores_json) VALUES('second','e','existing-entry','n','{}')"),/UNIQUE/);
 }finally{r.db.close()}
});
