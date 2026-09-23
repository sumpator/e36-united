// Restores a private D1 SQL export into memory, then rehearses the exact migration.
// Prints only integrity/counts/hashes, never member data, notes, tokens or SQL rows.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const file=process.argv[2];
if(!file)throw new Error('Usage: node scripts/verify-live-upgrade.mjs <private-export.sql>');
const db=new DatabaseSync(':memory:');
const targets=['live_entries','live_competition_state','live_public_votes','live_judge_scores','live_judge_photos'];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quote=name=>'"'+name.replaceAll('"','""')+'"';
const literal=value=>value===null?'NULL':typeof value==='number'?String(value):"'"+String(value).replaceAll("'","''")+"'";
try{
 db.exec('PRAGMA foreign_keys=OFF');
 db.exec(readFileSync(file,'utf8'));
 db.exec('PRAGMA foreign_keys=ON');
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 const tables=db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'").all();
 assert.equal(db.prepare("SELECT COUNT(*) n FROM schema_migrations WHERE id='2026-09-23-live-competition-cars'").get().n,0,'Already migrated; stop');
 const allRows=new Map(tables.map(({name})=>[name,db.prepare('SELECT * FROM '+quote(name)).all()]));
 const indexes=db.prepare("SELECT name,tbl_name,sql FROM sqlite_master WHERE type='index' AND tbl_name IN ('live_entries','live_competition_state','live_public_votes','live_judge_scores','live_judge_photos')").all();
 const expectedIndexes=new Set(['live_entries_event','live_public_votes_results','live_judge_scores_results','live_judge_photos_entry']);
 for(const ix of indexes)assert.ok(!ix.sql||expectedIndexes.has(ix.name),'Unreviewed index: '+ix.name);
 const triggers=db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name IN ('live_entries','live_competition_state','live_public_votes','live_judge_scores','live_judge_photos')").all();
 for(const {name}of triggers)assert.match(name,/_write_guard_(insert|update|delete)$/,'Unreviewed trigger');
 for(const {name}of tables)for(const fk of db.prepare('PRAGMA foreign_key_list('+quote(name)+')').all())if(fk.table==='live_entries')assert.ok(targets.includes(name),'Unreviewed dependant: '+name);
 const columns=new Map(targets.map(name=>[name,db.prepare('PRAGMA table_info('+quote(name)+')').all().map(c=>c.name)]));
 const migration=readFileSync(new URL('../db/migrations/2026-09-23-live-competition-cars.sql',import.meta.url),'utf8');
 db.exec('BEGIN');try{db.exec(migration);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 for(const{name}of tables){
  if(name==='schema_migrations')continue;
  const rows=db.prepare('SELECT '+(columns.has(name)?columns.get(name).map(quote).join(','):'*')+' FROM '+quote(name)).all();
  assert.equal(hash(rows),hash(allRows.get(name)),'Changed data: '+name);
 }
 assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
 // A scoped rollback is valid only before releasing writes and creating event cars.
 // It never restores/deletes garage, reservations, members or other business tables.
 let rollback="CREATE TABLE _live_rollback_guard(ok INTEGER CHECK(ok=1));\nINSERT INTO _live_rollback_guard SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled') AND NOT EXISTS(SELECT 1 FROM live_competition_cars) THEN 1 ELSE 0 END;\nDROP TABLE _live_rollback_guard;\n";
 for(const {name}of db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND (name LIKE '%_revision_insert' OR name LIKE '%_revision_update' OR name LIKE '%_revision_delete' OR name LIKE '%_write_guard%')").all())rollback+='DROP TRIGGER '+quote(name)+';\n';
 rollback+='DROP VIEW live_vehicle_catalog;\n';
 for(const name of [...targets.slice(1),targets[0]])rollback+='DROP TABLE '+quote(name)+';\n';
 for(const name of targets){
  rollback+=tables.find(t=>t.name===name).sql+';\n';
  for(const ix of indexes.filter(i=>i.tbl_name===name&&i.sql))rollback+=ix.sql+';\n';
  for(const row of allRows.get(name))rollback+='INSERT INTO '+quote(name)+'('+Object.keys(row).map(quote).join(',')+') VALUES('+Object.values(row).map(literal).join(',')+');\n';
 }
 rollback+="DROP TABLE live_competition_cars;\nDROP TABLE live_event_revisions;\nDELETE FROM schema_migrations WHERE id='2026-09-23-live-competition-cars';\n";
 const rollbackFile=join(dirname(resolve(file)),'live-scoped-rollback.sql');
 writeFileSync(rollbackFile,rollback,{flag:'wx'});
 // Rehearse rollback as well, with the same FK enforcement and scoped data equality.
 db.exec('BEGIN');try{db.exec(rollback);db.exec('COMMIT')}catch(error){db.exec('ROLLBACK');throw error}
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
 for(const{name}of tables)assert.equal(hash(db.prepare('SELECT * FROM '+quote(name)).all()),hash(allRows.get(name)),'Rollback changed '+name);
 console.log(JSON.stringify({backup:resolve(file),sha256:createHash('sha256').update(readFileSync(file)).digest('hex'),migration:'PASS',rollback:'PASS',foreignKeys:'PASS',integrity:'ok',preservedTables:tables.length,liveRows:Object.fromEntries(targets.map(name=>[name,allRows.get(name).length])),rollbackFile},null,2));
}finally{db.close()}
