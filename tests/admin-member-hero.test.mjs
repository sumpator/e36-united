import test from 'node:test';
import assert from 'node:assert/strict';
import {memberRuntime} from './helpers/admin-member-runtime.mjs';
import {adminGrowth} from './helpers/admin-growth.mjs';
import {getAdminMember,adminMemberMedia,MEMBER_HERO_CAR_SQL,MEMBER_HERO_PHOTO_SQL} from '../worker/admin/members.js';
import {memberIdentity} from '../admin/member-presentation.js';
const origin='https://example.invalid',url=new URL('/?eventId=e',origin);
const header=async(r,id='m')=>(await getAdminMember(r.env,url,id,'',origin)).json();

test('HERO header adds one owned primary car and stable first photo, without media or writes',async()=>{
 const r=memberRuntime();r.db.exec("INSERT INTO car_photos(id,car_id,r2_key,sort_order) VALUES('p0','c','private/first',-1),('p1','c','private/tie',-1),('secondary','c2','private/secondary',-2)");
 const p=await header(r);assert.deepEqual(Object.keys(p.heroCar).sort(),['body','id','model','nickname','photo']);assert.equal(p.heroCar.id,'c');assert.equal(p.heroCar.photo.id,'p0');
 assert.equal(p.heroCar.photo.mediaPath,'/api/admin/members/m/media/cars/c/p0');assert.ok(p.heroCar.photo.version);assert.equal(p.member.memberId,'m');assert.equal(p.reservations[0].amountPaidCzk,200);
 assert.equal(r.queries.length,5);assert.equal(r.mediaReads,0);assert.equal(r.writes,0);assert.ok(!JSON.stringify(p).includes('r2_key'));
 assert.equal((await adminMemberMedia(r.env,'n','cars','c','p0',origin)).status,404);assert.equal((await adminMemberMedia(r.env,'m','cars','cn','pn',origin)).status,404);r.db.close();
});
test('HERO primary without photo remains known, but never borrows another car photo',async()=>{
 const r=memberRuntime();r.db.exec("UPDATE cars SET is_primary=0 WHERE id='c'; UPDATE cars SET is_primary=1 WHERE id='c2'");
 const p=await header(r);assert.equal(p.heroCar.id,'c2');assert.equal(p.heroCar.photo,null);assert.equal(r.mediaReads,0);assert.equal(r.writes,0);r.db.close();
});
test('HERO no primary means null, not arbitrary secondary; skips photo query',async()=>{
 const r=memberRuntime();r.db.exec("UPDATE cars SET is_primary=0 WHERE member_id='m'");
 assert.equal((await header(r)).heroCar,null);assert.equal(r.queries.length,4);assert.ok(!r.queries.some(q=>q.sql===MEMBER_HERO_PHOTO_SQL));assert.equal(r.writes,0);r.db.close();
});
test('HERO legacy multiple-primary selection is deterministic and owner scoped',async()=>{
 const r=memberRuntime();r.db.exec("UPDATE cars SET is_primary=1,created_at='2020-01-01' WHERE id='c2'");
 assert.equal((await header(r)).heroCar.id,'c2');assert.equal((await header(r,'n')).heroCar.id,'cn');assert.equal((await header(r)).heroCar.id,'c2');r.db.close();
});
test('HERO metadata version changes on replacement, and existing private route handles missing R2',async()=>{
 const r=memberRuntime(),first=await header(r);r.db.exec("UPDATE car_photos SET created_at='2040-01-01' WHERE id='p'");
 const second=await header(r);assert.notEqual(first.heroCar.photo.version,second.heroCar.photo.version);assert.notEqual(first.dataVersion,second.dataVersion);
 r.env.MEDIA.get=async()=>null;assert.equal((await adminMemberMedia(r.env,'m','cars','c','p',origin)).status,404);assert.equal(r.writes,0);r.db.close();
});
test('HERO is header-only: explicit Garage stays complete, Club has no hero SQL',async()=>{
 const r=memberRuntime(),garage=await(await getAdminMember(r.env,url,'m','garage',origin)).json();
 assert.equal(garage.items.length,2);assert.equal(garage.items[0].photos.length,1);assert.equal(garage.heroCar,undefined);assert.ok(!r.queries.some(q=>q.sql===MEMBER_HERO_CAR_SQL));
 r.queries.length=0;const club=await(await getAdminMember(r.env,url,'m','club',origin)).json();assert.equal(club.points.available,4);assert.ok(!r.queries.some(q=>q.sql===MEMBER_HERO_CAR_SQL));assert.equal(r.writes,0);r.db.close();
});
test('HERO growth uses existing owner/photo indexes, returns at most one row per lookup and no full-table scan',async()=>{
 const r=adminGrowth(),changes=r.db.prepare('SELECT total_changes() n').get().n;
 assert.equal(r.db.prepare('SELECT COUNT(*) n FROM cars').get().n,750);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM car_photos').get().n,750);
 await header(r);const extra=r.queries.filter(q=>[MEMBER_HERO_CAR_SQL,MEMBER_HERO_PHOTO_SQL].includes(q.sql));assert.equal(extra.length,2);
 const plans=extra.map(q=>({...q,plan:r.db.prepare('EXPLAIN QUERY PLAN '+q.sql).all(...q.args).map(p=>p.detail),returned:r.db.prepare(q.sql).all(...q.args).length}));
 assert.ok(plans[0].plan.some(p=>p.includes('SEARCH cars USING INDEX idx_cars_member')));assert.ok(plans[1].plan.some(p=>p.includes('SEARCH car_photos USING INDEX admin_car_photos_car')));
 assert.ok(plans.every(q=>q.returned<=1&&q.plan.every(p=>!/^SCAN /.test(p))));
 const maxOwnerCars=r.db.prepare('SELECT MAX(n) n FROM (SELECT COUNT(*) n FROM cars GROUP BY member_id)').get().n;assert.equal(maxOwnerCars,3);
 assert.equal(r.db.prepare('SELECT total_changes() n').get().n,changes);assert.equal(r.writes,0);
 console.log('HERO_QUERY_PLAN '+JSON.stringify({plans,maxOwnerCars,note:'Owner subset is filtered/sorted, not guaranteed one visited car; local plan/row counts, NOT Cloudflare meta.rows_read.'}));r.db.close();
});
test('HERO car chip is escaped auxiliary Garage information, never a member photo identity',()=>{
 const html=memberIdentity({nickname:'Member',name:'Real Name',memberCode:'EU-X',status:'active',role:'member'},{model:'BMW <script>',nickname:'Garage',body:'coupe'});
 assert.ok(html.includes('Hlavní vůz'));assert.ok(html.includes('BMW &lt;script&gt;'));assert.ok(html.includes('Coupé'));assert.ok(html.includes('admin-member-monogram'));assert.ok(html.includes('Real Name'));assert.ok(!html.includes('<img'));assert.ok(!memberIdentity({name:'Member'}).includes('Hlavní vůz'));
});
