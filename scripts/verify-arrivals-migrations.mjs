// Offline only: restores a private SQL export in memory. No Worker, network or email imports.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),cutover=args.includes('--cutover');const [file,afterFile]=args.filter(x=>x!=='--cutover');if(!file)throw Error('Pass a private D1 SQL export path');
const load=file=>{const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=OFF');db.exec(readFileSync(file,'utf8'));db.exec('PRAGMA foreign_keys=ON');return db};
const check=db=>{assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok')};
const schema=db=>db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name").all();
const rows=(db,t)=>db.prepare('SELECT * FROM "'+t+'"').all();
const canon=rows=>rows.map(r=>JSON.stringify(Object.fromEntries(Object.entries(r).sort(([a],[b])=>a.localeCompare(b))))).sort();
const comparisonRows=(db,table)=>rows(db,table).map(r=>table==='schema_migrations'&&['2026-09-30-arrivals','2026-09-30-live-arrival-entries'].includes(r.id)?{...r,applied_at:'MIGRATION_TIME'}:r);
const db=load(file);check(db);const beforeSchema=schema(db),before=new Map(beforeSchema.filter(x=>x.type==='table').map(t=>[t.name,rows(db,t.name)]));
const bytes=readFileSync(file);const result={file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),integrity:'ok',foreignKeys:'ok',tables:before.size};
assert.equal(rows(db,'live_judge_scores').length,new Set(rows(db,'live_judge_scores').map(r=>r.event_id+'|'+r.entry_id)).size);
for(const name of ['2026-09-30-arrivals','2026-09-30-live-arrival-entries']){
 assert.ok(!db.prepare('SELECT id FROM schema_migrations WHERE id=?').get(name),'Already migrated: '+name);
 db.exec('BEGIN');try{db.exec(readFileSync(new URL('../db/migrations/'+name+'.sql',import.meta.url),'utf8'));db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}check(db);
}
for(const [name,old] of before){
 const table=name==='event_member_presence'?'legacy_event_member_presence':name;
 let actual=rows(db,table);
 if(name==='schema_migrations')actual=actual.filter(r=>!r.id.startsWith('2026-09-30-'));
 if(name==='admin_resource_versions')actual=actual.filter(r=>r.resource_type!=='arrivals');
 actual=actual.map(r=>Object.fromEntries(Object.keys(old[0]||r).filter(k=>!['admission_registered_czk','admission_onsite_czk','admission_czk','arrival_id','payload_json'].includes(k)||Object.hasOwn(old[0]||{},k)).map(k=>[k,r[k]])));
 assert.deepEqual(canon(actual),canon(old),'Changed original data: '+name);
}
for(const table of ['event_arrivals','event_payments','arrival_invitations'])assert.equal(rows(db,table).length,0,'No conversion/seed permitted');
const normalize=sql=>sql.replace(/\s/g,'').replace(/"([\w]+)"/g,'$1').replace(/;$/,'');
for(const old of beforeSchema.filter(r=>['index','trigger'].includes(r.type))){const now=schema(db).find(x=>x.name===old.name);assert.ok(now,'Missing '+old.name);assert.equal(normalize(now.sql),normalize(old.sql.replace(/\bevent_member_presence\b/g,'legacy_event_member_presence')),'Changed '+old.name)}
result.migrations=['2026-09-30-arrivals','2026-09-30-live-arrival-entries'];result.preservation='all original rows / financial values / indexes / triggers preserved';
result.counts=Object.fromEntries([...before].filter(([k])=>k.startsWith('live_')||['events','reservations','event_member_presence','merch_config'].includes(k)).map(([k,v])=>[k,v.length]));
if(afterFile){
 const actual=load(afterFile);check(actual);
 for(const s of schema(db).filter(s=>s.type==='table'))assert.deepEqual(canon(comparisonRows(actual,s.name)),canon(comparisonRows(db,s.name)),'Production differs: '+s.name);
 for(const s of schema(db)){const a=schema(actual).find(x=>x.name===s.name&&x.type===s.type);assert.ok(a,'Missing production object '+s.name);assert.equal(normalize(a.sql),normalize(s.sql),'Production schema differs: '+s.name)}
 result.productionComparison='PASS';actual.close();
}
if(cutover){
 const rehearsal=load(file),marker=rehearsal.prepare("SELECT * FROM schema_migrations WHERE id='2026-09-23-live-writes-enabled'").get();assert.ok(marker,'Rehearsal needs the original enabled marker');
 rehearsal.exec('BEGIN');rehearsal.exec(readFileSync(new URL('../db/maintenance/2026-09-30-arrivals-lock.sql',import.meta.url),'utf8'));rehearsal.exec('COMMIT');
 const guards=schema(rehearsal).filter(s=>s.type==='trigger'&&s.name.startsWith('arrivals_cutover_'));assert.equal(guards.length,30);
 for(const table of ['events','reservations','event_member_presence','live_entries','live_judge_scores']){
  const first=rows(rehearsal,table)[0];if(first){const key=Object.keys(first)[0];assert.throws(()=>rehearsal.exec(`UPDATE "${table}" SET "${key}"="${key}"`),/schema_upgrading|writes_disabled/,'Old writes must be fenced: '+table)}
 }
 for(const name of result.migrations){rehearsal.exec('BEGIN');rehearsal.exec(readFileSync(new URL('../db/migrations/'+name+'.sql',import.meta.url),'utf8'));rehearsal.exec('COMMIT');check(rehearsal)}
 for(const table of ['event_arrivals','event_payments','arrival_invitations'])assert.throws(()=>rehearsal.exec(`INSERT INTO "${table}" DEFAULT VALUES`),/schema_upgrading|writes_disabled/,'New writes must be fenced: '+table);
 rehearsal.exec('BEGIN');rehearsal.prepare('INSERT INTO schema_migrations ('+Object.keys(marker).join(',')+') VALUES ('+Object.keys(marker).map(()=>'?').join(',')+')').run(...Object.values(marker));for(const guard of guards)rehearsal.exec('DROP TRIGGER "'+guard.name+'"');rehearsal.exec('COMMIT');check(rehearsal);
 for(const s of schema(db).filter(s=>s.type==='table'))assert.deepEqual(canon(comparisonRows(rehearsal,s.name)),canon(comparisonRows(db,s.name)),'Cutover changed data: '+s.name);
 assert.deepEqual(schema(rehearsal).map(s=>({...s,sql:normalize(s.sql)})),schema(db).map(s=>({...s,sql:normalize(s.sql)})));
 result.cutover='PASS: old/new writes fenced, both migrations, exact marker restoration, temporary guards removed';rehearsal.close();
}
writeFileSync(file+'.verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));db.close();
