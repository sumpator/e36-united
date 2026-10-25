import test from 'node:test';
import assert from 'node:assert/strict';
import {memberRuntime} from './helpers/admin-member-runtime.mjs';
import {createCar,updateCar,listCars} from '../worker/domains/garage.js';
import {putPlannerDraft,getPlannerDraft} from '../worker/domains.js';
import {validatePlannerDraft,plannerBaseKey} from '../planner-state.js';
const origin='https://e36united.cz',auth={uid:'m'};
const req=body=>new Request(origin+'/api/local',{method:'POST',body:JSON.stringify(body)});
const newCar={nickname:'Nové',model:'328i',body:'Cabrio',preservePrimary:true,primary:true};
test('Planner car is primary only in an empty garage; a concurrent primary choice survives retry',async()=>{
 const r=memberRuntime();try{
  const first=await (await createCar(req(newCar),r.env,auth,origin)).json();assert.equal(first.car.primary,false);assert.equal(r.db.prepare("SELECT is_primary FROM cars WHERE id='c'").get().is_primary,1);
  r.db.exec("UPDATE cars SET is_primary=0 WHERE member_id='m'; UPDATE cars SET is_primary=1 WHERE id='c2'");
  await updateCar(req({...newCar,nickname:'Opakování po chybě fotky'}),r.env,auth,first.car.id,origin);assert.equal(r.db.prepare("SELECT is_primary FROM cars WHERE id='c2'").get().is_primary,1);
  const empty=await(await createCar(req(newCar),r.env,{uid:'a'},origin)).json();assert.equal(empty.car.primary,true);assert.equal((await(await listCars(r.env,{uid:'a'},origin)).json()).cars.length,1);
 }finally{r.db.close()}
});
test('editor draft uses the existing UID-scoped server store without reservations, payments or messages',async()=>{
 const r=memberRuntime();try{
  const now=Date.now(),draft={version:1,source:'weekend-planner',draftId:crypto.randomUUID(),eventYear:2026,eventId:'e',createdAt:new Date(now).toISOString(),expiresAt:new Date(now+86400000).toISOString(),arrival:'Jen na otočku',departure:'Stejný den',nights:0,attendanceType:'day_visit',accommodation:'Bez ubytování',accommodationOptionId:null,accommodationUnits:0,crew:2,showShine:'Možná',editor:{accountId:'m',mode:'change',baseKey:plannerBaseKey({id:'r',updatedAt:'v1'}),carId:'c2',note:'Rozepsaná poznámka',crewDetails:['Spolujezdec']}};
  const before=r.db.prepare('SELECT * FROM reservations').all();assert.ok(validatePlannerDraft(draft));assert.equal((await putPlannerDraft(req({draft}),r.env,auth,origin)).status,200);
  assert.deepEqual((await(await getPlannerDraft(r.env,auth,origin)).json()).draft.editor,draft.editor);assert.equal((await(await getPlannerDraft(r.env,{uid:'n'},origin)).json()).draft,null);assert.equal((await putPlannerDraft(req({draft}),r.env,{uid:'n'},origin)).status,403);
  assert.deepEqual(r.db.prepare('SELECT * FROM reservations').all(),before);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM event_payments').get().n,0);assert.notEqual(plannerBaseKey({id:'r',updatedAt:'v2'}),draft.editor.baseKey);
  assert.equal(validatePlannerDraft({...draft,editor:{...draft.editor,note:'x'.repeat(1001)}}),null);
 }finally{r.db.close()}
});
