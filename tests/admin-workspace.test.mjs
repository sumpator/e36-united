import test from 'node:test';import assert from 'node:assert/strict';
import {merchRuntime} from './helpers/merch-runtime.mjs';
import {getCatalog,saveProduct,deleteProduct} from '../worker/domains/merch/service.js';
import {routeRequest} from '../worker/router.js';
import {uploadMailingImage,publicMailingImage} from '../worker/domains/mailing/media.js';
import {imageFixture} from './helpers/image-fixtures.mjs';
const origin='https://e36united.cz';
const form=(bytes=imageFixture('image/jpeg'),type='image/jpeg')=>{const f=new FormData();f.append('file',new Blob([bytes],{type}),'mail-image');return new Request('https://api.e36united.cz/api/admin/mailing/media',{method:'POST',body:f})};
function media(env){const objects=new Map(),deletes=[];env.MEDIA={async put(k,b,options){objects.set(k,{body:b,httpMetadata:options.httpMetadata})},async get(k){return objects.get(k)||null},async delete(k){deletes.push(k);objects.delete(k)}};return{objects,deletes}}

test('unused product and variant deletion is revision-checked, audited and never deletes shared media',async()=>{
 const r=await merchRuntime();try{const files=media(r.env),catalog=await getCatalog(r.env,true),p=catalog.products[0];const variant=p.variants[0];
 await saveProduct(r.env,'admin',{...p,variants:[...p.variants,{...variant,id:'unused-extra'}]});const updated=(await getCatalog(r.env,true)).products.find(x=>x.id===p.id);
 await saveProduct(r.env,'admin',{...updated,variants:updated.variants.filter(v=>v.id!=='unused-extra')});const current=(await getCatalog(r.env,true)).products.find(x=>x.id===p.id);
 await assert.rejects(deleteProduct(r.env,'admin',{id:p.id,revision:current.revision-1}),/změnil/);await deleteProduct(r.env,'admin',{id:p.id,revision:current.revision});assert.equal(r.db.prepare('SELECT id FROM merch_products WHERE id=?').get(p.id),undefined);assert.equal(r.db.prepare("SELECT COUNT(*) n FROM merch_audit WHERE resource=? AND action='product_deleted'").get(p.id).n,1);assert.deepEqual(files.deletes,[]);assert.deepEqual(r.db.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{r.close()}
});

test('orders protect products and used variants while archival and unavailability preserve exact snapshots',async()=>{
 const r=await merchRuntime();try{const order=await r.order(),before=r.db.prepare('SELECT snapshot,state FROM merch_orders WHERE id=?').get(order.id),p=(await getCatalog(r.env,true)).products.find(p=>p.variants.some(v=>v.id==='u-polo-navy'));
 assert.equal(p.hasOrders,true);assert.ok(p.usedVariantIds.includes('u-polo-navy'));await assert.rejects(deleteProduct(r.env,'admin',p),/objednávky/);await assert.rejects(saveProduct(r.env,'admin',{...p,variants:p.variants.filter(v=>v.id!=='u-polo-navy')}),/objednávky/);
 await saveProduct(r.env,'admin',{...p,status:'archived',variants:p.variants.map(v=>v.id==='u-polo-navy'?{...v,availability:'unavailable'}:v)});assert.deepEqual(r.db.prepare('SELECT snapshot,state FROM merch_orders WHERE id=?').get(order.id),before);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM merch_orders').get().n,1);
 }finally{r.close()}
});

test('order arriving between delete precheck and atomic delete prevents deletion',async()=>{
 const r=await merchRuntime();try{const p=(await getCatalog(r.env,true)).products.find(p=>p.variants.some(v=>v.id==='u-polo-navy')),batch=r.env.DB.batch;let insert=true;
 r.env.DB.batch=async statements=>{if(insert){insert=false;await r.order()}return batch(statements)};
 await assert.rejects(deleteProduct(r.env,'admin',p),/objednávku/);assert.ok(r.db.prepare('SELECT id FROM merch_products WHERE id=?').get(p.id));assert.equal(r.db.prepare('SELECT COUNT(*) n FROM merch_orders').get().n,1);
 }finally{r.close()}
});

test('mailing upload validates actual JPEG/PNG bytes and exposes only dedicated permanent objects',async()=>{
 const env={},m=media(env);for(const type of ['image/jpeg','image/png']){const saved=await uploadMailingImage(form(imageFixture(type),type),env),url=new URL(saved.imageUrl);assert.equal(url.protocol,'https:');assert.equal(url.search,'');const response=await publicMailingImage(new Request(url),env,url,origin);assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),type);assert.ok((await response.arrayBuffer()).byteLength>0);const head=await publicMailingImage(new Request(url,{method:'HEAD'}),env,url,origin);assert.equal((await head.text()).length,0)}
 m.objects.set('private/member/photo',{body:'private'});assert.equal(await publicMailingImage(new Request(origin),env,new URL('/api/mailing/media/../../private/member/photo',origin),origin),null);assert.equal(m.objects.size,3);assert.deepEqual(m.deletes,[]);
 await assert.rejects(uploadMailingImage(form(imageFixture('image/webp'),'image/webp'),env),/invalid_image_type/);await assert.rejects(uploadMailingImage(form(new TextEncoder().encode('<script>bad</script>'),'image/png'),env),/invalid_image/);await assert.rejects(uploadMailingImage(form(new Uint8Array(8*1024*1024+1),'image/jpeg'),env),/invalid_image/);assert.equal(m.objects.size,3);
});

test('real router requires active Admin for mailing upload; public media read does not send mail',async t=>{
 const r=await merchRuntime();t.after(()=>r.close());const m=media(r.env),keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']),jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);Object.assign(jwk,{kid:'workspace-isolated',alg:'RS256',use:'sig'});
 t.mock.method(globalThis,'fetch',async url=>{assert.match(String(url),/googleapis.com.*jwk/);return new Response(JSON.stringify({keys:[jwk]}),{headers:{'Cache-Control':'max-age=3600'}})});
 const token=async uid=>{const now=Math.floor(Date.now()/1000),encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url'),data=encode({alg:'RS256',kid:jwk.kid})+'.'+encode({aud:'e36-united',iss:'https://securetoken.google.com/e36-united',sub:uid,iat:now,auth_time:now,exp:now+3600});return data+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(data))).toString('base64url')};
 for(const [uid,status]of [[null,401],['member',403],['admin',201]]){const q=form();if(uid)q.headers.set('Authorization','Bearer '+await token(uid));const response=await routeRequest({request:q,env:r.env,url:new URL(q.url),origin});assert.equal(response.status,status);}
 assert.equal(m.objects.size,1);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0);assert.equal(r.db.prepare('SELECT COUNT(*) n FROM merch_orders').get().n,0);
});
