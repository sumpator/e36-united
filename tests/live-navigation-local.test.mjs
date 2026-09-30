import {test} from 'node:test';
import assert from 'node:assert/strict';
import {arrivalsRuntime,seedArrivals,EVENT} from './helpers/arrivals-runtime.mjs';
import {participantList,startArrivedShowShine} from '../worker/domains/live-arrivals.js';
test('protected email search reaches beyond first page without returning email; published state remains guarded',async()=>{
 const r=arrivalsRuntime();try{
  await seedArrivals(r);r.db.prepare('UPDATE events SET live_enabled=1 WHERE id=?').run(EVENT);
  for(let i=0;i<55;i++)r.db.prepare('INSERT INTO members(id,member_code,name,email) VALUES(?,?,?,?)').run('search-'+i,'SEARCH-'+i,'ZZZ '+i,'unique-'+i+'@example.invalid');
  const initial=await participantList(r.env,EVENT);assert.equal(initial.hasMore,true);assert.ok(!initial.members.some(m=>m.memberId==='search-54'));
  const found=await participantList(r.env,EVENT,'unique-54@example.invalid');assert.equal(found.members.length,1);assert.equal(found.members[0].memberId,'search-54');assert.ok(!JSON.stringify(found).includes('@'));
  r.db.prepare("INSERT INTO live_competition_state(event_id,discipline,status,version) VALUES(?,'show_shine','published',28)").run(EVENT);
  const result=await startArrivedShowShine(r.env,{uid:'a'},EVENT,{category:'Sedan',carId:'car-paid',expectedVersion:28});
  assert.equal(result.status,409);assert.equal(result.body.error,'judging_closed');
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM live_entries WHERE event_id=?').get(EVENT).n,0);
  assert.equal(r.db.prepare('SELECT COUNT(*) n FROM event_arrivals').get().n,0);
 }finally{r.db.close()}
});
