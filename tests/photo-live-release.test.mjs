import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePhotoInput,PHOTO_INPUT_MAX_BYTES,PHOTO_OUTPUT_MAX_BYTES} from '../photo-limits.js';
import {createPhotoBatch} from '../photo-batch.js';
import {memberRuntime} from './helpers/admin-member-runtime.mjs';
import { seedConfirmedArrival } from './helpers/live-fixtures.mjs';
import {saveLiveVote,startLiveEntry,searchLiveMembers,createCompetitionCar} from '../worker/domains/live.js';

function jpeg(width=8000,height=6000,size=14*1024*1024){
 const bytes=Uint8Array.from([255,216,255,192,0,11,8,height>>8,height&255,width>>8,width&255,1,1,17,0,255,217]);
 return {name:'phone.jpg',lastModified:1,type:'image/jpeg',size,slice:()=>new Blob([bytes])};
}
test('large photo byte and dimension limits apply independently before decoding',async()=>{
 assert.deepEqual(await validatePhotoInput(jpeg()),{width:8000,height:6000});
 await validatePhotoInput(jpeg(10000,8000,PHOTO_INPUT_MAX_BYTES));
 await assert.rejects(validatePhotoInput(jpeg(8000,6000,PHOTO_INPUT_MAX_BYTES+1)),/50 MiB/);
 await assert.rejects(validatePhotoInput(jpeg(12000,9000)),/80 megapixelů/);
 await assert.rejects(validatePhotoInput(jpeg(17000,100)),/16 384/);
 await assert.rejects(validatePhotoInput({...jpeg(),type:'image/heic'}),/HEIC.*JPG/);
 await assert.rejects(validatePhotoInput({...jpeg(),slice:()=>new Blob(['broken'])}),/rozměry/);
});
test('PNG and WebP metadata preserve dimensions',async()=>{
 for(const kind of ['png','VP8X','VP8 ','VP8L']){
  const b=new Uint8Array(32),v=new DataView(b.buffer),text=(at,s)=>b.set([...s].map(c=>c.charCodeAt(0)),at);
  if(kind==='png'){b[0]=137;text(1,'PNG');text(12,'IHDR');v.setUint32(16,8000);v.setUint32(20,6000)}
  else{ text(0,'RIFF');text(8,'WEBP');text(12,kind);
   if(kind==='VP8X'){b[24]=7999&255;b[25]=7999>>8;b[27]=5999&255;b[28]=5999>>8}
   if(kind==='VP8 '){b.set([157,1,42],23);v.setUint16(26,8000,true);v.setUint16(28,6000,true)}
   if(kind==='VP8L'){b[20]=47;v.setUint32(21,7999|(5999<<14),true)}
  }
  assert.deepEqual(await validatePhotoInput({type:kind==='png'?'image/png':'image/webp',size:32,slice:()=>new Blob([b])}),{width:8000,height:6000});
 }
});
test('batch accepts >12 MiB, keeps whole aspect ratio, checks final bytes, and never decodes unsafe thumbnails',async()=>{
 const original={Image:globalThis.Image,FileReader:globalThis.FileReader,document:globalThis.document,create:URL.createObjectURL,revoke:URL.revokeObjectURL};
 let dimensions=[8000,6000],outputSize=100_000,urls=0,uploads=0,draw;
 try{
  URL.createObjectURL=()=>{urls++;return 'blob:synthetic'};URL.revokeObjectURL=()=>{};
  globalThis.Image=class{constructor(){[this.width,this.height]=dimensions}set src(value){queueMicrotask(()=>this.onload?.())}};
  globalThis.FileReader=class{readAsDataURL(){this.result='data:image/jpeg;base64,synthetic';queueMicrotask(()=>this.onload?.())}};
  globalThis.document={createElement:()=>({getContext:()=>({drawImage:(...args)=>{draw=args.slice(1)}}),toBlob:callback=>callback({size:outputSize})})};
  const batch=createPhotoBatch();batch.add([jpeg()]);await batch.send(async()=>{uploads++;return {ok:true}});
  assert.equal(uploads,1);assert.deepEqual(draw,[0,0,1800,1350]);assert.equal(batch.items[0].status,'uploaded');batch.clear();
  dimensions=[6000,8000];batch.add([jpeg()]);await batch.send(async()=>({ok:true}));assert.deepEqual(draw,[0,0,1350,1800]);batch.clear();
  outputSize=PHOTO_OUTPUT_MAX_BYTES+1;batch.add([jpeg()]);await batch.send(async()=>{uploads++;return {ok:true}});assert.equal(uploads,1);assert.match(batch.items[0].error,/8 MiB/);batch.clear();
  const before=urls;batch.add([jpeg(12000,9000)]);await batch.send(async()=>{throw new Error('Must not upload')});assert.equal(urls,before);assert.match(batch.items[0].error,/80 megapixelů/);batch.clear();
 }finally{globalThis.Image=original.Image;globalThis.FileReader=original.FileReader;globalThis.document=original.document;URL.createObjectURL=original.create;URL.revokeObjectURL=original.revoke}
});
const origin='https://example.invalid',request=body=>new Request(origin,{method:'POST',body:JSON.stringify(body)});
test('active public voter has no reservation or check-in; own car remains forbidden',async()=>{
 const r=memberRuntime();try{
  r.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'; INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category,presented_at) VALUES('entry','e','show_shine','m','c','Sedan',CURRENT_TIMESTAMP); INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id) VALUES('e','show_shine','live','entry'); INSERT INTO live_category_state(event_id,discipline,category,status) VALUES('e','show_shine','Sedan','live');");
  assert.equal(r.db.prepare("SELECT COUNT(*) n FROM reservations WHERE member_id='n'").get().n,0);
  assert.equal(r.db.prepare("SELECT COUNT(*) n FROM event_member_presence WHERE member_id='n'").get().n,0);
  assert.equal((await saveLiveVote(request({score:8}),r.env,{uid:'n'},'entry',origin)).status,200);
  assert.equal((await saveLiveVote(request({score:8}),r.env,{uid:'m'},'entry',origin)).status,403);
 }finally{r.db.close()}
});
test('Admin can present registered, alternate garage and standalone competition cars',async()=>{
 for(const carId of ['c','c2','standalone']){const r=memberRuntime();try{
  r.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'; UPDATE reservations SET car_id='c',show_shine='Ano'; UPDATE cars SET body='Sedan'; ");
  seedConfirmedArrival(r,'m','c');
  const form=new FormData();form.set('id','standalone');form.set('model','Synthetic E36');form.set('body','Sedan');
  assert.equal((await createCompetitionCar(new Request(origin,{method:'POST',body:form}),r.env,{uid:'a'},'e','m',origin)).status,201);
  const found=await (await searchLiveMembers(r.env,'e',new URL(origin),origin)).json();
  assert.deepEqual(found.members.find(m=>m.memberId==='m').cars.map(c=>c.id).sort(),['c','c2','standalone']);
  const response=await startLiveEntry(request({discipline:'show_shine',memberId:'m',carId,category:'Sedan',expectedVersion:1}),r.env,{uid:'a'},'e',origin);
  assert.equal(response.status,201,JSON.stringify(await response.json()));
  const entry=r.db.prepare('SELECT car_id FROM live_entry_vehicles').get();assert.equal(entry.car_id,carId);
 }finally{r.db.close()}}
});
