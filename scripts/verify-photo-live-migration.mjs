// Read-only comparison of private D1 snapshots; never print row contents.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const [beforePath,afterPath]=process.argv.slice(2);
if(!beforePath||!afterPath)throw new Error('Pass before and after snapshot JSON paths.');
const before=JSON.parse(readFileSync(beforePath,'utf8')),after=JSON.parse(readFileSync(afterPath,'utf8'));
const migrations=['2026-09-28-live-entry-close','2026-09-28-accommodation-apartment'];
const rows=values=>values.map(value=>JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))))).sort();
assert.deepEqual(Object.keys(after.tables).sort(),Object.keys(before.tables).sort(),'table names changed');
for(const [name,values] of Object.entries(before.tables)){
 let actual=after.tables[name];
 if(name==='live_entries')actual=actual.map(({voting_closed,...row})=>{assert.equal(voting_closed,0,'historical closure changed');return row});
 if(name==='schema_migrations'){
  for(const id of migrations)assert.equal(actual.filter(row=>row.id===id).length,1,'migration registry mismatch');
  actual=actual.filter(row=>!migrations.includes(row.id));
 }
 assert.deepEqual(rows(actual),rows(values),`data changed: ${name}`);
}
const normalize=sql=>sql.replace(/\s/g,'').replace(/"([\w]+)"/g,'$1').replace(/;$/,'');
assert.deepEqual(after.schema.map(s=>[s.type,s.name]),before.schema.map(s=>[s.type,s.name]),'schema object names changed');
for(const old of before.schema){
 const current=after.schema.find(s=>s.type===old.type&&s.name===old.name);
 let expected=normalize(old.sql),actual=normalize(current.sql);
 if(['event_accommodation_options','reservation_accommodation'].includes(old.name)&&old.type==='table')expected=expected.replace("'cabin','tent'","'cabin','tent','apartment'");
 if(old.name==='live_entries'&&old.type==='table')actual=actual.replace(',voting_closedINTEGERNOTNULLDEFAULT0CHECK(voting_closedIN(0,1))','');
 assert.equal(actual,expected,`unexpected schema change: ${old.type} ${old.name}`);
}
for(const snapshot of [before,after]){
 assert.deepEqual(snapshot.checks[0].results,[],'foreign key violations');
 assert.equal(snapshot.checks[1].results[0].quick_check,'ok','integrity failure');
}
console.log(`Preserved all rows in ${Object.keys(before.tables).length} tables, all schema object names, indexes, triggers and FKs. Only two approved constraints + voting_closed + two registry rows changed.`);
