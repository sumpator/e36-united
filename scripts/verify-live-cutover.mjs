// Read-only comparison of private pre/post D1 exports. Never prints business rows.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const [beforeFile,afterFile]=process.argv.slice(2);
if(!beforeFile||!afterFile)throw new Error('Usage: node scripts/verify-live-cutover.mjs <before.sql> <after.sql>');
const open=file=>{const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=OFF');db.exec(readFileSync(file,'utf8'));db.exec('PRAGMA foreign_keys=ON');return db};
const before=open(beforeFile),after=open(afterFile);
try{
 assert.deepEqual(after.prepare('PRAGMA foreign_key_check').all(),[]);
 assert.equal(after.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 const tables=['live_entries','live_competition_state','live_public_votes','live_judge_scores','live_judge_photos','live_category_state','event_member_presence','event_live_judges','event_program_items','cars','car_photos','reservations'];
 const counts={};
 for(const table of tables){
  const columns=before.prepare(`PRAGMA table_info(${table})`).all().map(c=>'"'+c.name+'"').join(',');
  const sort=rows=>rows.map(row=>JSON.stringify(row)).sort();
  const prior=before.prepare(`SELECT ${columns} FROM ${table}`).all(),next=after.prepare(`SELECT ${columns} FROM ${table}`).all();
  assert.deepEqual(sort(next),sort(prior),'Data changed: '+table);counts[table]=next.length;
 }
 assert.deepEqual(after.prepare('SELECT * FROM events ORDER BY id').all(),before.prepare('SELECT * FROM events ORDER BY id').all());
 for(const row of before.prepare("SELECT name,sql FROM sqlite_master WHERE type='index' AND name LIKE 'live_%'").all())assert.deepEqual(after.prepare('SELECT name,sql FROM sqlite_master WHERE name=?').get(row.name),row);
 assert.equal(after.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE id='2026-09-23-live-competition-cars'").get().n,1);
 assert.equal(after.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled'").get().n,0);
 assert.equal(after.prepare('SELECT COUNT(*) n FROM live_competition_cars').get().n,0);
 assert.equal(after.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE '%_revision_%'").get().n,30);
 assert.equal(after.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE '%_write_guard%'").get().n,31);
 console.log(JSON.stringify({preservation:'PASS',foreignKeys:'PASS',integrity:'ok',indexes:'PASS',writeFence:'active',counts},null,2));
}finally{before.close();after.close()}
