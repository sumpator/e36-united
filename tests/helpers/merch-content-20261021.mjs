// Rehearsal over the existing isolated Merch runtime, never a production seed.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {getCatalog} from '../../worker/domains/merch/service.js';
import {routeMerch} from '../../worker/domains/merch/index.js';

export const contentBatch=JSON.parse(readFileSync(new URL('../../content/merch-20261021.json',import.meta.url),'utf8'));
const bytes=path=>readFileSync(new URL('../../'+path,import.meta.url));
const hash=value=>createHash('sha256').update(value).digest('hex');
const fields=({id,name,type,description,category,gender,status})=>({id,name,type,description,category,gender,status});
const variantFields=({id,color,swatch,priceMinor,sizes,availability})=>({id,color,swatch,priceMinor,sizes,availability});

export async function addContentBatch(runtime){
 const {db,env}=runtime;
 // Only this helper's in-memory R2 can receive files. No network or mail adapter.
 if(!runtime.contentMedia){
  assert.equal(env.MEDIA,undefined,'Do not attach the rehearsal to an external bucket');
  runtime.contentMedia=new Map();
  env.MEDIA={put:async(key,body)=>runtime.contentMedia.set(key,Buffer.from(body)),get:async key=>runtime.contentMedia.has(key)?{body:runtime.contentMedia.get(key)}:null,delete:async key=>runtime.contentMedia.delete(key)};
 }
 const catalog=await getCatalog(env,true),added=[],existing=[];
 const configBefore=db.prepare('SELECT * FROM merch_config').all();
 // Check both identities before writing either product; never overwrite drift.
 for(const plan of contentBatch.products){
  const current=catalog.products.find(product=>product.id===plan.id);
  if(!current)continue;
  assert.deepEqual(fields(current),fields(plan),'Existing product differs from this content batch');
  assert.deepEqual(current.variants.map(variantFields),plan.variants.map(variantFields));
  for(let index=0;index<plan.variants.length;index++){
   const image=current.variants[index].image;
   assert.match(image,/^r2:/);
   const meta=db.prepare('SELECT object_key FROM merch_media WHERE id=?').get(image.slice(3));
   assert.ok(meta,'Saved media reference must exist');
   assert.equal(hash(runtime.contentMedia.get(meta.object_key)),hash(bytes(plan.variants[index].imageFile)));
  }
 }
 const invoke=async(path,method,body,headers={})=>{
  const request=new Request('https://api.e36united.cz/api/admin/merch/'+path,{method,headers,body});
  const response=await routeMerch({request,url:new URL(request.url),env,auth:{uid:'admin'},origin:'https://e36united.cz'},true);
  const payload=await response.json();assert.equal(response.status,200,JSON.stringify(payload));return payload;
 };
 let position=Math.max(-1,...catalog.products.map(product=>product.position))+1;
 for(const plan of contentBatch.products){
  if(catalog.products.some(product=>product.id===plan.id)){existing.push(plan.id);continue;}
  const variants=[];
  for(const source of plan.variants){
   const form=new FormData();form.set('file',new File([bytes(source.imageFile)],source.id+'.webp',{type:'image/webp'}));
   const encoded=new Request('https://local.invalid',{method:'POST',body:form}),body=await encoded.arrayBuffer();
   const uploaded=await invoke('media','POST',body,{'Content-Type':encoded.headers.get('Content-Type'),'Content-Length':String(body.byteLength)});
   variants.push({...variantFields(source),image:uploaded.image});
  }
  await invoke('products','PUT',JSON.stringify({...fields(plan),position:position++,variants}),{'Content-Type':'application/json'});
  added.push(plan.id);
 }
 assert.deepEqual(db.prepare('SELECT * FROM merch_config').all(),configBefore,'Content must not change shop settings');
 return {added,existing,catalog:await getCatalog(env)};
}
