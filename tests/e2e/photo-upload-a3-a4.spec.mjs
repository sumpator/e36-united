import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
import {uploadGallerySubmission,listMyGallery,privateMemberGalleryMedia} from '../../worker/domains/member-gallery.js';

test('A3 member queue retains the confirmed photo at quota and retries only the rejected photo through real handlers',async({page})=>{
 const observations=await prepareE2ePage(page,{authenticated:true,member:{id:'m'}}),r=memberRuntime(),objects=new Map(),calls=[];
 const bytes=readFileSync(new URL('../../assets/images/showshine/ss_coupe.webp',import.meta.url));
 r.env.MEDIA={async put(key,body,options){objects.set(key,{body:await new Response(body).arrayBuffer(),type:options.httpMetadata.contentType})},async delete(key){objects.delete(key)},async get(key){const item=objects.get(key);return item&&{body:item.body,writeHttpMetadata(headers){headers.set('Content-Type',item.type)}}}};
 const ids=['g'];objects.set('private/m/g',{body:bytes,type:'image/webp'});
 for(let index=0;index<22;index++){const id='seed-'+index,key='existing/'+id;ids.push(id);r.db.prepare("INSERT INTO gallery_submissions(id,member_id,r2_key,status) VALUES(?,'m',?,'pending')").run(id,key);objects.set(key,{body:bytes,type:'image/webp'})}
 await page.route('https://api.e36united.cz/api/gallery/**',async route=>{
  const q=route.request(),url=new URL(q.url()),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type'};
  if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});let response;
  if(q.method()==='POST'&&url.pathname==='/api/gallery/submissions'){
   const request=new Request(q.url(),{method:'POST',headers:q.headers(),body:q.postDataBuffer()});calls.push((await request.clone().formData()).get('uploadId'));response=await uploadGallerySubmission(request,r.env,{uid:'m'},'https://e36united.cz');
  }else if(q.method()==='GET'&&url.pathname==='/api/gallery/mine')response=await listMyGallery(r.env,{uid:'m'},url,'https://e36united.cz');
  else if(q.method()==='GET'&&url.pathname.startsWith('/api/gallery/mine/media/'))response=await privateMemberGalleryMedia(r.env,{uid:'m'},url.pathname.split('/').at(-1),'https://e36united.cz');
  else return route.fallback();
  return route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),...headers},body:Buffer.from(await response.arrayBuffer())});
 });
 try{
  await page.setViewportSize({width:390,height:900});await page.goto('/member.html?section=photos');await page.locator('[data-member-photo-toggle]').click();
  for(const name of ['first.webp','second.webp'])await page.locator('[data-member-photo-input]').setInputFiles({name,mimeType:'image/webp',buffer:bytes});
  await expect(page.locator('[data-member-photo-previews] figure')).toHaveCount(2);await page.locator('[data-member-gallery-form] button[type=submit]').click();
  await expect(page.locator('[data-upload-state=uploaded]')).toHaveCount(1);await expect(page.locator('[data-upload-state=error]')).toHaveCount(1);await expect(page.locator('[data-upload-state=error]')).toContainText('limit');
  expect(calls).toHaveLength(2);const confirmed=r.db.prepare("SELECT id FROM gallery_submissions WHERE id NOT IN ('g') AND id NOT LIKE 'seed-%'").get().id;expect(r.db.prepare("SELECT COUNT(*) n FROM gallery_submissions WHERE member_id='m' AND created_at>=datetime('now','-1 day')").get().n).toBe(24);
  r.db.prepare("UPDATE gallery_submissions SET created_at=datetime('now','-2 days') WHERE id=?").run(ids[0]);
  await page.locator('[data-member-gallery-form] button[type=submit]').click();await expect(page.locator('[data-upload-state=uploaded]')).toHaveCount(2);expect(calls).toHaveLength(3);expect(calls[2]).toBe(calls[1]);
  expect(r.db.prepare('SELECT COUNT(*) n FROM gallery_submissions WHERE id=?').get(confirmed).n).toBe(1);expect(r.db.prepare("SELECT COUNT(*) n FROM member_gallery_upload_attempts WHERE state='committed'").get().n).toBe(2);expect(objects.size).toBe(25);
  const expectedQuotaErrors=observations.consoleErrors.filter(error=>error.url==='https://api.e36united.cz/api/gallery/submissions'&&/Failed to load resource.*429 \(Too Many Requests\)/.test(error.text));
  expect(expectedQuotaErrors).toHaveLength(1);
  expectNoUnexpectedClientErrors({...observations,consoleErrors:observations.consoleErrors.filter(error=>!expectedQuotaErrors.includes(error))});
 }finally{await page.close();r.db.close()}
});
