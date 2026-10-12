import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {memberRuntime} from './helpers/admin-member-runtime.mjs';
import {imageFixture,jpegFixture} from './helpers/image-fixtures.mjs';
import {uploadGallerySubmission,privateMemberGalleryMedia} from '../worker/domains/member-gallery.js';
import {uploadLivePhoto,uploadJudgePhoto,judgePhotoMedia,saveCompetitionPhoto,createCompetitionCar} from '../worker/domains/live.js';
import {uploadCarPhoto,replaceCarPhoto} from '../worker/domains/garage.js';
import {putAdminAccommodationPhoto,postAdminAccommodationGalleryPhoto} from '../worker/domains/accommodation.js';
import {routeMerch} from '../worker/domains/merch/index.js';
import {MAX_GALLERY_DAILY} from '../worker/domains/member-gallery-uploads.js';
import {uploadIdentity} from '../worker/domains/upload-identity.js';

const origin='https://example.invalid';
function request(bytes=jpegFixture(),{id=crypto.randomUUID(),type='image/jpeg',signal,fields={}}={}){
 const form=new FormData();form.append('uploadId',id);form.append('file',new Blob([bytes],{type}),'photo');
 for(const [key,value] of Object.entries(fields))form.set(key,value);
 return new Request(origin,{method:'POST',body:form,signal});
}
function runtime(t){
 const r=memberRuntime(),native=new DatabaseSync(':memory:'),objects=new Map(),puts=[],deletes=[],controls={};let time='2026-10-11 12:00:00';
 t.after(()=>{r.db.close();native.close()});
 r.db.function('current_timestamp',()=>time);
 r.db.function('datetime',{varargs:true},(...args)=>native.prepare('SELECT datetime('+args.map(()=>'?').join(',')+') value').get(...args.map(value=>value==='now'?time:value)).value);
 r.db.exec("UPDATE gallery_submissions SET created_at='2026-10-01 12:00:00'; UPDATE events SET live_enabled=1 WHERE id='e'; INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category,presented_at) VALUES('entry','e','show_shine','m','c','Sedan',CURRENT_TIMESTAMP); INSERT INTO event_accommodation_options(id,event_id,name,kind,inventory_mode,capacity_per_unit) VALUES('stay','e','Cabin','cabin','limited',4)");
 const statement=(sql,args=[])=>({sql,args,bind:(...values)=>statement(sql,values),first:async()=>{await controls.beforeRead?.(sql,args);return r.db.prepare(sql).get(...args)||null},all:async()=>{await controls.beforeRead?.(sql,args);return {results:r.db.prepare(sql).all(...args)}},run:async()=>{await controls.beforeRun?.(sql,args);const result=r.db.prepare(sql).run(...args);controls.afterRun?.(sql,args);return {meta:{changes:Number(result.changes)}}}});
 r.env.DB={prepare:statement,async batch(statements){await controls.beforeBatch?.(statements);r.db.exec('BEGIN IMMEDIATE');let results;try{results=statements.map((s,index)=>{controls.beforeBatchStatement?.(s,index);return{meta:{changes:Number(r.db.prepare(s.sql).run(...s.args).changes)}}});r.db.exec('COMMIT')}catch(error){r.db.exec('ROLLBACK');throw error}controls.afterBatch?.(statements);return results}};
 r.env.MEDIA={async put(key,body,options){const bytes=new Uint8Array(await new Response(body).arrayBuffer());puts.push(key);await controls.beforePut?.(key);objects.set(key,{bytes,options});await controls.afterPut?.(key);return {etag:key}},async delete(key){await controls.beforeDelete?.(key);deletes.push(key);objects.delete(key)},async get(key){const object=objects.get(key);return object&&{body:object.bytes,size:object.bytes.length,httpMetadata:object.options?.httpMetadata,writeHttpMetadata(headers){headers.set('Content-Type',object.options?.httpMetadata?.contentType)}}},async head(key){return objects.get(key)||null}};
 return {...r,objects,puts,deletes,controls,setTime:value=>time=value,recent:member=>r.db.prepare("SELECT COUNT(*) n FROM gallery_submissions WHERE member_id=? AND created_at>=datetime('now','-1 day')").get(member).n,
  seed(member,count,at=time){for(let i=0;i<count;i++)r.db.prepare('INSERT INTO gallery_submissions(id,member_id,r2_key,status,created_at) VALUES(?,?,?,?,?)').run(`seed-${member}-${i}`,member,`existing/${member}/${i}`,['pending','approved','rejected'][i%3],at)}};
}

test('A3 different simultaneous Worker requests take exactly the two available slots',async t=>{
 const r=runtime(t);r.seed('m',22);const ready=Promise.withResolvers(),release=Promise.withResolvers();r.controls.beforePut=async()=>{if(r.puts.length===2)ready.resolve();await release.promise};
 const jobs=Array.from({length:4},(_,i)=>uploadGallerySubmission(request(jpegFixture(String(i))),{...r.env},{uid:'m'},origin));
 await ready.promise;assert.equal(r.puts.length,2);assert.equal(r.db.prepare("SELECT COUNT(*) n FROM member_gallery_upload_attempts WHERE state='pending'").get().n,2);release.resolve();
 const results=await Promise.all(jobs);assert.deepEqual(results.map(x=>x.status).sort(),[201,201,429,429]);assert.equal(r.recent('m'),24);assert.equal(r.objects.size,2);
 assert.equal(r.db.prepare("SELECT COUNT(*) n FROM member_gallery_upload_attempts WHERE state='committed'").get().n,2);
});

test('A3 quotas and retry identities are independent for two accounts',async t=>{
 const r=runtime(t);r.seed('m',23);r.seed('n',23);const id=crypto.randomUUID();
 const replies=await Promise.all(['m','n'].map(uid=>uploadGallerySubmission(request(jpegFixture(),{id}),{...r.env},{uid},origin)));
 assert.deepEqual(replies.map(x=>x.status),[201,201]);const receipts=await Promise.all(replies.map(x=>x.json()));assert.notEqual(receipts[0].submission.id,receipts[1].submission.id);assert.equal(r.recent('m'),24);assert.equal(r.recent('n'),24);assert.equal(r.objects.size,2);
});

test('A3 simultaneous same-photo requests make one object; later retry replays without another slot',async t=>{
 const r=runtime(t);r.seed('m',23);const id=crypto.randomUUID(),ready=Promise.withResolvers(),release=Promise.withResolvers();r.controls.beforePut=async()=>{ready.resolve();await release.promise};
 const first=uploadGallerySubmission(request(jpegFixture(),{id}),r.env,{uid:'m'},origin);await ready.promise;
 const racing=await uploadGallerySubmission(request(jpegFixture(),{id}),{...r.env},{uid:'m'},origin);assert.equal(racing.status,409);assert.equal((await racing.json()).error,'upload_in_progress');assert.equal(r.puts.length,1);release.resolve();
 assert.equal((await first).status,201);const retry=await uploadGallerySubmission(request(jpegFixture(),{id}),r.env,{uid:'m'},origin);assert.equal(retry.status,200);assert.equal((await retry.json()).replayed,true);assert.equal(r.puts.length,1);assert.equal(r.recent('m'),24);
});

test('A3 committed retry checks content and preserves the original receipt even on another day',async t=>{
 const r=runtime(t),id=crypto.randomUUID();const first=await uploadGallerySubmission(request(jpegFixture('original'),{id,fields:{caption:'Original'}}),r.env,{uid:'m'},origin),saved=await first.json();
 assert.equal(first.status,201);const other=await uploadGallerySubmission(request(jpegFixture('different'),{id}),r.env,{uid:'m'},origin);assert.equal(other.status,409);assert.equal((await other.json()).error,'upload_content_conflict');assert.equal(r.puts.length,1);
 r.setTime('2026-10-13 12:00:00');const retry=await uploadGallerySubmission(request(jpegFixture('original'),{id}),r.env,{uid:'m'},origin);assert.equal(retry.status,200);assert.deepEqual((await retry.json()).submission,saved.submission);assert.equal(r.puts.length,1);assert.equal(r.recent('m'),0);
});

test('A3 different bodies with the same key racing after preflight cannot replace the accepted photograph',async t=>{
 const r=runtime(t),id=crypto.randomUUID(),both=Promise.withResolvers(),release=Promise.withResolvers();let arrivals=0;
 r.controls.beforeRun=async sql=>{if(sql.startsWith('INSERT INTO member_gallery_upload_attempts')){if(++arrivals===2)both.resolve();await release.promise}};
 const jobs=['one','two'].map(label=>uploadGallerySubmission(request(jpegFixture(label),{id}),{...r.env},{uid:'m'},origin));await both.promise;release.resolve();
 const responses=await Promise.all(jobs);assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);assert.equal(r.puts.length,1);assert.equal(r.objects.size,1);assert.equal(r.recent('m'),1);
 assert.equal((await responses.find(r=>r.status===409).json()).error,'upload_content_conflict');
});

test('A3 pre-migration confirmed photo replays by byte comparison without backfill or a new object',async t=>{
 const r=runtime(t),id=crypto.randomUUID(),body=jpegFixture(),form=new FormData();form.set('uploadId',id);const savedId=await uploadIdentity(form,'member-gallery:m'),key='existing/legacy-photo';
 r.db.prepare("INSERT INTO gallery_submissions(id,member_id,r2_key,status,caption) VALUES(?,'m',?,'approved','Existing caption')").run(savedId,key);r.objects.set(key,{bytes:body,options:{httpMetadata:{contentType:'image/jpeg'}}});
 const response=await uploadGallerySubmission(request(body,{id}),r.env,{uid:'m'},origin);assert.equal(response.status,200);assert.equal((await response.json()).submission.status,'approved');assert.equal(r.puts.length,0);assert.equal(r.objects.size,1);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM member_gallery_upload_attempts').get().n,0);
 assert.equal((await uploadGallerySubmission(request(jpegFixture('other'),{id}),r.env,{uid:'m'},origin)).status,409);assert.equal(r.objects.size,1);
});

test('A3 a racing failed attempt still binds its key to the original content',async t=>{
 const r=runtime(t),id=crypto.randomUUID(),waiting=Promise.withResolvers(),release=Promise.withResolvers();let claims=0;
 r.controls.beforeRun=async sql=>{if(sql.startsWith('INSERT INTO member_gallery_upload_attempts')&&++claims===1){waiting.resolve();await release.promise}};
 const delayed=uploadGallerySubmission(request(jpegFixture('different'),{id}),r.env,{uid:'m'},origin);await waiting.promise;
 r.controls.beforePut=()=>{throw new Error('original R2 failure')};
 await assert.rejects(uploadGallerySubmission(request(jpegFixture('original'),{id}),r.env,{uid:'m'},origin),/original R2 failure/);delete r.controls.beforePut;release.resolve();
 const response=await delayed;assert.equal(response.status,409);assert.equal((await response.json()).error,'upload_content_conflict');assert.equal(r.puts.length,1);assert.equal(r.objects.size,0);assert.equal(r.recent('m'),0);
 assert.equal((await uploadGallerySubmission(request(jpegFixture('original'),{id}),r.env,{uid:'m'},origin)).status,201);assert.equal(r.objects.size,1);
});

test('A3 R2 errors, ambiguous R2 ack and precommit DB errors release only their own attempt',async t=>{
 for(const mode of ['put','put-ack','db','db-mid','claim-ack']){
  const r=runtime(t),id=crypto.randomUUID();r.seed('m',23);
  if(mode==='put')r.controls.beforePut=()=>{throw new Error(mode)};
  if(mode==='put-ack')r.controls.afterPut=()=>{throw new Error(mode)};
  if(mode==='db')r.controls.beforeBatch=()=>{throw new Error(mode)};
  if(mode==='db-mid')r.controls.beforeBatchStatement=(statement,index)=>{if(index===1)throw new Error(mode)};
  if(mode==='claim-ack')r.controls.afterRun=sql=>{if(sql.startsWith('INSERT INTO member_gallery_upload_attempts'))throw new Error(mode)};
  await assert.rejects(uploadGallerySubmission(request(jpegFixture(),{id}),r.env,{uid:'m'},origin),new RegExp(mode));assert.equal(r.recent('m'),23);assert.equal(r.objects.size,0);assert.equal(r.db.prepare("SELECT COUNT(*) n FROM member_gallery_upload_attempts WHERE state='pending'").get().n,0);
  for(const key of Object.keys(r.controls))delete r.controls[key];assert.equal((await uploadGallerySubmission(request(jpegFixture(),{id}),r.env,{uid:'m'},origin)).status,201);assert.equal(r.recent('m'),24);assert.equal(r.objects.size,1);
 }
});

test('A3 lost D1 acknowledgement never removes a committed object and retry returns its receipt',async t=>{
 const r=runtime(t),id=crypto.randomUUID();r.controls.afterBatch=()=>{throw new Error('lost ack')};
 await assert.rejects(uploadGallerySubmission(request(jpegFixture(),{id}),r.env,{uid:'m'},origin),/lost ack/);assert.equal(r.objects.size,1);assert.equal(r.deletes.length,0);assert.equal(r.recent('m'),1);
 delete r.controls.afterBatch;const retry=await uploadGallerySubmission(request(jpegFixture(),{id}),r.env,{uid:'m'},origin);assert.equal(retry.status,200);assert.equal((await retry.json()).replayed,true);assert.equal(r.puts.length,1);
});

test('A3 abort after R2 and expiration with late completion cannot delete the replacement winner',async t=>{
 const r=runtime(t),abort=new AbortController(),id=crypto.randomUUID(),ready=Promise.withResolvers(),release=Promise.withResolvers();r.seed('m',23);r.controls.beforePut=async()=>{ready.resolve();await release.promise};
 const first=uploadGallerySubmission(request(jpegFixture(),{id,signal:abort.signal}),r.env,{uid:'m'},origin);await ready.promise;abort.abort();release.resolve();await assert.rejects(first,{name:'AbortError'});assert.equal(r.objects.size,0);assert.equal(r.recent('m'),23);
 const ready2=Promise.withResolvers(),release2=Promise.withResolvers();let delayed=true;r.controls.beforePut=async()=>{if(delayed){delayed=false;ready2.resolve();await release2.promise}};
 const old=uploadGallerySubmission(request(jpegFixture(),{id}),r.env,{uid:'m'},origin);await ready2.promise;r.setTime('2026-10-11 12:11:00');
 const winner=await uploadGallerySubmission(request(jpegFixture(),{id}),{...r.env},{uid:'m'},origin);assert.equal(winner.status,201);const winnerKey=[...r.objects.keys()][0];
 release2.resolve();assert.equal((await old).status,200);assert.equal(r.objects.size,1);assert.ok(r.objects.has(winnerKey));assert.equal(r.deletes.includes(winnerKey),false);assert.equal(r.recent('m'),24);
});

test('A3 unavailable cleanup leaves only private staging; expired retry safely frees it',async t=>{
 const r=runtime(t),id=crypto.randomUUID();r.seed('m',23);r.controls.beforeBatch=()=>{throw new Error('DB unavailable')};r.controls.beforeRun=sql=>{if(sql.startsWith('UPDATE member_gallery_upload_attempts'))throw new Error('DB unavailable')};
 const warnings=[],warn=console.warn;console.warn=(...args)=>warnings.push(args);try{await assert.rejects(uploadGallerySubmission(request(jpegFixture(),{id}),r.env,{uid:'m'},origin),/DB unavailable/)}finally{console.warn=warn}
 assert.equal(warnings.length,1);assert.equal(r.objects.size,1);assert.equal(r.recent('m'),23);const staged=r.db.prepare('SELECT upload_id FROM member_gallery_upload_attempts').get().upload_id;assert.equal((await privateMemberGalleryMedia(r.env,{uid:'m'},staged,origin)).status,404);
 for(const key of Object.keys(r.controls))delete r.controls[key];r.setTime('2026-10-11 12:11:00');assert.equal((await uploadGallerySubmission(request(jpegFixture(),{id}),r.env,{uid:'m'},origin)).status,201);assert.equal(r.objects.size,1);assert.equal(r.recent('m'),24);
});

test('A3 midnight does not reset a rolling UTC day; the exact inclusive boundary is retained',async t=>{
 const r=runtime(t);r.setTime('2026-10-12 00:00:00');r.seed('m',23,'2026-10-11 23:59:00');r.db.prepare("INSERT INTO gallery_submissions(id,member_id,r2_key,status,created_at) VALUES('boundary','m','existing/boundary','rejected','2026-10-11 00:00:00')").run();
 assert.equal((await uploadGallerySubmission(request(),r.env,{uid:'m'},origin)).status,429);r.setTime('2026-10-12 00:00:01');assert.equal((await uploadGallerySubmission(request(),r.env,{uid:'m'},origin)).status,201);assert.equal(r.recent('m'),24);
});

test('A3 LIVE keeps its separate policy but its rows still count in the member rolling window',async t=>{
 const r=runtime(t);r.seed('m',24);assert.equal((await uploadLivePhoto(request(),r.env,{uid:'m'},origin)).status,201);assert.equal(r.recent('m'),25);assert.equal((await uploadGallerySubmission(request(),r.env,{uid:'m'},origin)).status,429);assert.equal(r.puts.length,1);
});

test('A3 additive migration preserves a populated previous schema, IDs, references and existing over-quota history',t=>{
 const schema=readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8').split('-- Member gallery upload attempts (additive, 2026-10-11).')[0],r=memberRuntime({schema});t.after(()=>r.db.close());
 for(let i=0;i<25;i++)r.db.prepare("INSERT INTO gallery_submissions(id,member_id,r2_key,status) VALUES(?,'n',?,'pending')").run('old-'+i,'existing/old/'+i);
 const names=r.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'schema_migrations' ORDER BY name").all().map(r=>r.name),before=names.map(name=>r.db.prepare('SELECT * FROM '+name+' ORDER BY rowid').all()),catalog=r.db.prepare("SELECT name,sql FROM sqlite_master WHERE type IN ('index','trigger') ORDER BY name").all();
 r.db.exec('BEGIN');r.db.exec(readFileSync(new URL('../db/migrations/2026-10-11-photo-upload-attempts.sql',import.meta.url),'utf8'));r.db.exec('COMMIT');
 names.forEach((name,i)=>assert.deepEqual(r.db.prepare('SELECT * FROM '+name+' ORDER BY rowid').all(),before[i]));for(const item of catalog)assert.deepEqual(r.db.prepare('SELECT name,sql FROM sqlite_master WHERE name=?').get(item.name),item);
 assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(r.db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(r.db.prepare('SELECT COUNT(*) n FROM member_gallery_upload_attempts').get().n,0);
 assert.throws(()=>r.db.prepare("INSERT INTO gallery_submissions(id,member_id,r2_key,status) VALUES('over','n','new/over','pending')").run(),/member_gallery_daily_limit/);assert.equal(MAX_GALLERY_DAILY,24);
});

test('A4 real JPEG PNG and WebP upload and private delivery use the verified MIME and bytes',async t=>{
 const r=runtime(t);for(const type of ['image/jpeg','image/png','image/webp']){
  const bytes=imageFixture(type),response=await uploadGallerySubmission(request(bytes,{type}),r.env,{uid:'m'},origin);assert.equal(response.status,201);const {submission}=await response.json();const media=await privateMemberGalleryMedia(r.env,{uid:'m'},submission.id,origin);assert.equal(media.headers.get('Content-Type'),type);assert.deepEqual(Buffer.from(await media.arrayBuffer()),bytes);
  assert.equal((await privateMemberGalleryMedia(r.env,{uid:'n'},submission.id,origin)).status,404);
 }assert.equal(r.objects.size,3);
});

test('A4 text, MIME spoofing, signatures and damaged/truncated containers leave no photo, attempt or quota',async t=>{
 const r=runtime(t),png=Buffer.from(imageFixture('image/png'));png[100]^=1;
 const samples=[['image/jpeg',Buffer.from('<html>not a photo</html>')],['image/jpeg',imageFixture('image/png')],['image/jpeg',Buffer.alloc(0)],['image/jpeg',Buffer.concat([Buffer.from([255,216,255]),Buffer.from('not an image')])],['image/png',Buffer.concat([imageFixture('image/png').subarray(0,33),Buffer.from('not an image')])],['image/webp',Buffer.from('RIFF\x20\x00\x00\x00WEBPnot an image')],['image/jpeg',imageFixture('image/jpeg').subarray(0,-2)],['image/png',png],['image/webp',imageFixture('image/webp').subarray(0,-1)],['image/gif',Buffer.from('GIF89a')]];
 for(const [type,bytes] of samples){assert.equal((await uploadGallerySubmission(request(bytes,{type}),r.env,{uid:'m'},origin)).status,400,type);assert.equal(r.recent('m'),0);assert.equal(r.objects.size,0);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM member_gallery_upload_attempts').get().n,0)}
});

test('A4 bounded validation rejects oversized inputs and excessive dimensions before R2 or claims',async t=>{
 const r=runtime(t),jpeg=Buffer.from(imageFixture('image/jpeg'));let position=2;
 while(position<jpeg.length){const marker=jpeg[position+1],size=jpeg.readUInt16BE(position+2);if([0xc0,0xc1,0xc2].includes(marker)){jpeg.writeUInt16BE(65535,position+7);break}position+=size+2}
 assert.equal((await uploadGallerySubmission(request(jpeg),r.env,{uid:'m'},origin)).status,400);
 assert.equal((await uploadGallerySubmission(request(new Uint8Array(8*1024*1024+1)),r.env,{uid:'m'},origin)).status,400);assert.equal(r.puts.length,0);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM member_gallery_upload_attempts').get().n,0);
});

test('A4 directly affected upload paths reject non-images before R2 and keep jury attachment privacy',async t=>{
 const r=runtime(t),bad=()=>request(Buffer.from('not-an-image'));
 const paths=[()=>uploadLivePhoto(bad(),r.env,{uid:'m'},origin),()=>uploadJudgePhoto(bad(),r.env,{uid:'a'},'entry',origin),()=>uploadCarPhoto(bad(),r.env,{uid:'m'},'c',origin),()=>replaceCarPhoto(bad(),r.env,{uid:'m'},'c',origin),()=>putAdminAccommodationPhoto(bad(),r.env,{uid:'a'},'stay',origin),()=>postAdminAccommodationGalleryPhoto(bad(),r.env,{uid:'a'},'stay',origin),()=>saveCompetitionPhoto(bad(),r.env,{uid:'a'},'e','c',origin),()=>createCompetitionCar(request(Buffer.from('not-an-image'),{fields:{id:'new-car',model:'BMW 325i',body:'Sedan'}}),r.env,{uid:'a'},'e','m',origin)];
 for(const path of paths)assert.equal((await path()).status,400);assert.equal(r.puts.length,0);
 const raw=bad(),body=await raw.arrayBuffer(),merch=new Request(origin+'/api/admin/merch/media',{method:'POST',headers:{'Content-Type':raw.headers.get('Content-Type'),'Content-Length':String(body.byteLength)},body});assert.equal((await routeMerch({request:merch,url:new URL(merch.url),env:r.env,auth:{uid:'a'},origin},true)).status,400);assert.equal(r.puts.length,0);
 assert.equal((await uploadJudgePhoto(request(),r.env,{uid:'m'},'entry',origin)).status,403);assert.equal((await uploadJudgePhoto(request(),r.env,{uid:'a'},'entry',origin)).status,201);
 const photo=r.db.prepare('SELECT id FROM live_judge_photos').get();assert.equal((await judgePhotoMedia(r.env,{uid:'n'},photo.id,origin)).status,404);assert.equal((await judgePhotoMedia(r.env,{uid:'a'},photo.id,origin)).status,200);assert.equal(r.db.prepare("SELECT COUNT(*) n FROM gallery_submissions WHERE created_at>=datetime('now','-1 day')").get().n,0);
});
