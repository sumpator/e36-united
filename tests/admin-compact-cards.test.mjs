import test from 'node:test';
import assert from 'node:assert/strict';
import {memberRuntime} from './helpers/admin-member-runtime.mjs';
import {listAdminMembers} from '../worker/admin/members.js';
import {memberCardsSql} from '../worker/admin/member-cards.js';
import {getAdminHistoryClaims,getAdminGallery} from '../worker/domains.js';
import {reservationListQuery} from '../worker/admin/lists.js';

test('compact page projection keeps separate pending components, primary photo order and event scope without writes',async()=>{
 const r=memberRuntime();try{
 r.db.exec("INSERT INTO events(id,year,title) VALUES('older',2024,'United 2024'); INSERT INTO united_history_claims(id,member_id,event_id,attendance_status,sns_status) VALUES('both','m','older','pending','pending'); INSERT INTO car_photos(id,car_id,r2_key,sort_order) VALUES('p2','c','private/m/p2',2),('secondary','c2','private/m/secondary',-1); UPDATE gallery_submissions SET status='pending'; UPDATE reservations SET status='pending';");
 const load=async search=>(await (await listAdminMembers(r.env,new URL('https://local/api/admin/members?'+search),'x')).json());
 const plain=await load('');assert.equal(plain.members.find(m=>m.memberId==='m').card,undefined);
 const data=await load('presentation=cards&eventId=e'),card=data.members.find(m=>m.memberId==='m').card;
 assert.equal(card.attendances,1);assert.deepEqual(card.pending,{reservations:1,attendance:1,sns:1,photos:1});assert.equal(card.reservationStatus,'pending');assert.equal(card.photo.id,'p');
 const old=await load('presentation=cards&eventId=old');assert.equal(old.members.find(m=>m.memberId==='m').card.pending.reservations,0);assert.equal(old.members.find(m=>m.memberId==='m').card.reservationStatus,null);
 assert.equal(r.writes,0);assert.equal(r.mediaReads,0);
 const query=r.queries.find(q=>q.sql===memberCardsSql(3));assert.deepEqual(query.args,['e','e',...data.members.map(m=>m.memberId)]);
 const plan=r.db.prepare('EXPLAIN QUERY PLAN '+query.sql).all(...query.args);assert.ok(plan.some(p=>/SEARCH m USING (COVERING )?INDEX/.test(p.detail)));assert.ok(plan.some(p=>p.detail.includes('admin_gallery_member')));
 }finally{r.db.close()}
});
test('pending navigation filters exact member, preserves all history years and does not mix gallery totals',async()=>{
 const r=memberRuntime();try{
 r.db.exec("UPDATE united_history_claims SET attendance_status='pending',sns_status='pending'; UPDATE gallery_submissions SET status='pending'; INSERT INTO gallery_submissions(id,member_id,r2_key,status) VALUES('other','n','private/n/g','pending');");
 const h=await(await getAdminHistoryClaims(r.env,new URL('https://local/?year=all&status=pending&queueMember=m&presentation=cards&eventId=e'),'x')).json();assert.equal(h.claims.length,1);assert.equal(h.claims[0].eventYear,2025);assert.equal(h.claims[0].member.card.pending.sns,1);
 const g=await(await getAdminGallery({...r.env,ADMIN_READ:true},'x',new URL('https://local/?status=pending&queueMember=m'))).json();assert.equal(g.photos.length,1);assert.equal(g.counts.pending,1);assert.equal(g.photos[0].member.id,'m');
 const query=reservationListQuery(new URL('https://local/?filters=pending&queueMember=m'));assert.match(query.where,/r.member_id=\?/);assert.deepEqual(query.bindings,['m']);assert.equal(r.writes,0);
 }finally{r.db.close()}
});
