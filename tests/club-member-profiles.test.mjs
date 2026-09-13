import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { memberRuntime } from './helpers/admin-member-runtime.mjs';
import { bootstrapMember, getMember } from '../worker/domains/members.js';
import { publicGalleryList } from '../worker/domains/gallery.js';
import { clubMemberCarMedia, getClubGalleryLinks, getClubMemberProfile, listClubMembers } from '../worker/domains/club/members.js';

const origin='https://e36united.cz';
const jsonBody=response=>response.json();

test('club list and profile expose only bounded community data to active members',async()=>{
  const r=memberRuntime();
  r.db.exec(`INSERT INTO united_history_claims(id,member_id,event_id,attendance_status,sns_status,sns_competed) VALUES('hn','n','old','approved','not_claimed',0);
    INSERT INTO united_points_ledger(id,member_id,delta,source_type,source_key,reason) VALUES('ptn','n',3,'fixture','fixture:n','Other member points');
    INSERT INTO gallery_submissions(id,member_id,car_id,r2_key,caption,status) VALUES('gn','n','cn','private/n/g','Other approved','approved');`);
  const auth={uid:'m',member:{member_code:'EU-MEMBER'}};
  const list=await listClubMembers(r.env,auth);const other=list.members.find(member=>member.profileRef==='EU-OTHER');
  assert.ok(other);assert.equal(other.nickname,'Second');assert.equal(other.attendanceCount,1);assert.equal(other.photoUrl,'/api/united-club/members/EU-OTHER/media/cars/pn');assert.equal('email' in other,false);assert.ok(list.members.length<=24);
  const response=await getClubMemberProfile(r.env,auth,'EU-OTHER',origin);assert.equal(response.status,200);const profile=(await jsonBody(response)).profile;
  assert.equal(profile.nickname,'Second');assert.equal(profile.attendanceCount,1);assert.equal(profile.cars[0].photos[0].imageUrl,'/api/united-club/members/EU-OTHER/media/cars/pn');assert.equal(profile.gallery[0].id,'gn');
  for(const forbidden of ['email','phone','memberId','id','memberCode','reservation','payment'])assert.equal(forbidden in profile,false,forbidden);
  assert.equal(profile.history[0].eventYear,2025);assert.equal('reviewNote' in profile.history[0],false);r.db.close();
});

test('server privacy removes hidden members and links while preserving own profile and approved public photos',async()=>{
  const r=memberRuntime();r.db.exec("UPDATE members SET hide_on_club=1 WHERE id='n'; INSERT INTO gallery_submissions(id,member_id,car_id,r2_key,caption,status) VALUES('gn','n','cn','private/n/g','Still public','approved')");
  const viewer={uid:'m',member:{member_code:'EU-MEMBER'}},owner={uid:'n',member:{member_code:'EU-OTHER'}};
  assert.equal((await listClubMembers(r.env,viewer)).members.some(member=>member.profileRef==='EU-OTHER'),false);
  let response=await getClubMemberProfile(r.env,viewer,'EU-OTHER',origin);assert.equal(response.status,404);assert.deepEqual(await jsonBody(response),{ok:false,error:'club_profile_not_found'});
  response=await getClubMemberProfile(r.env,owner,'EU-OTHER',origin);assert.equal(response.status,200);assert.equal((await jsonBody(response)).profile.ownProfile,true);
  response=await getClubGalleryLinks(r.env,new URL('https://api.e36united.cz/api/united-club/gallery-links?ids=gn,g'),origin);assert.deepEqual((await jsonBody(response)).links,{g:'EU-MEMBER'});
  response=await publicGalleryList(r.env,new URL('https://api.e36united.cz/api/gallery/approved?limit=10'),origin);const gallery=await jsonBody(response);assert.ok(gallery.photos.some(photo=>photo.id==='gn'));assert.equal('profileRef' in gallery.photos.find(photo=>photo.id==='gn'),false);
  response=await clubMemberCarMedia(r.env,viewer,'EU-OTHER','pn',origin);assert.equal(response.status,404);response=await clubMemberCarMedia(r.env,owner,'EU-OTHER','pn',origin);assert.equal(response.status,200);r.db.close();
});

test('profile privacy persists through the existing owner update and leaves Admin data access intact',async()=>{
  const r=memberRuntime(),auth={uid:'m',email:'member@example.invalid',emailVerified:true,name:'Same Name',member:r.db.prepare("SELECT id,member_code,role,status FROM members WHERE id='m'").get()};
  const request=new Request('https://api.e36united.cz/api/bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Same Name',nickname:'First',phone:'',hideOnClub:true})});
  let response=await bootstrapMember(request,r.env,auth,origin);assert.equal(response.status,200);assert.equal((await jsonBody(response)).member.hideOnClub,true);assert.equal(r.db.prepare("SELECT hide_on_club FROM members WHERE id='m'").get().hide_on_club,1);
  response=await getMember(r.env,auth,origin);assert.equal((await jsonBody(response)).member.hideOnClub,true);
  const adminRow=r.db.prepare("SELECT id,email,phone,role,status FROM members WHERE id='m'").get();assert.equal(adminRow.email,'member@example.invalid');assert.equal(adminRow.role,'member');r.db.close();
});

test('club visibility migration is canonical, additive, defaults existing members visible and keeps FK state clean',()=>{
  const schema=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8'),migration=readFileSync(new URL('../db/migrations/2026-09-13-club-profile-visibility.sql',import.meta.url),'utf8').trim();assert.ok(schema.includes(migration));
  const db=new DatabaseSync(':memory:');db.exec(schema.split('-- Club-profile privacy is opt-out.')[0]+'COMMIT;');db.exec("INSERT INTO members(id,member_code,email,name) VALUES('m','EU-M','m@example.invalid','Member')");db.exec(migration);
  assert.equal(db.prepare("SELECT hide_on_club FROM members WHERE id='m'").get().hide_on_club,0);assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='members_club_visibility'").get());assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.throws(()=>db.exec(migration),/duplicate column name/);db.close();
});
