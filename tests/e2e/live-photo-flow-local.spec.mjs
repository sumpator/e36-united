import {test,expect} from '@playwright/test';
import {prepareE2ePage} from './fixtures.mjs';
import {commandFixture} from './command-fixture.mjs';
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
import * as live from '../../worker/domains/live.js';
import * as stays from '../../worker/domains/accommodation.js';
import {readFileSync} from 'node:fs';
const photo=readFileSync(new URL('../../assets/images/showshine/ss_sedan.webp',import.meta.url));
const file=name=>({name,mimeType:'image/webp',buffer:photo});
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'};
async function shot(page,name){await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))});await page.screenshot({path:'test-results/local-flow/'+name+'.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(()=>innerWidth+1));}
async function theme(page,value){await page.evaluate(value=>{const select=document.querySelector('[data-appearance-select]');select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}))},value);await expect(page.locator('html')).toHaveAttribute('data-theme',value);}

test('photo queue decodes, resizes, preserves EXIF orientation and blocks concurrent send',async({page})=>{
 await prepareE2ePage(page);await page.goto('/member.html');const result=await page.evaluate(async()=>{
  const {createPhotoBatch}=await import('/photo-batch.js');const canvas=document.createElement('canvas');canvas.width=4000;canvas.height=2000;canvas.getContext('2d').fillRect(0,0,4000,2000);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
  const bytes=new Uint8Array(await blob.arrayBuffer()),exif=new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,6,0,0,0,0,0,0,0]);
  const oriented=new File([bytes.slice(0,2),exif,bytes.slice(2)],'camera.jpg',{type:'image/jpeg'}),bad=new File(['not an image'],'bad.jpg',{type:'image/jpeg'}),notices=[];const batch=createPhotoBatch({onNotice:message=>notices.push(message)});
  batch.add([oriented]);batch.add([bad,new File(['text'],'not-photo.txt',{type:'text/plain'})]);let calls=0,dimensions=[];const send=async file=>{calls++;const img=await createImageBitmap(file);dimensions=[img.width,img.height];img.close();await new Promise(resolve=>setTimeout(resolve,80));return {ok:true}};
  const first=batch.send(send),second=batch.send(send);await Promise.all([first,second]);const states=batch.items.map(item=>item.status);await batch.send(send);return {calls,dimensions,states,notices};
 });expect(result.calls).toBe(1);expect(result.dimensions).toEqual([900,1800]);expect(result.states).toEqual(['uploaded','error']);expect(result.notices.join(' ')).toContain('JPG');
});

for(const width of [390,1440])test('Admin LIVE exact own confirmation and photo controls '+width,async({page})=>{
 const c=await commandFixture(page);c.r.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'; INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category,presented_at) VALUES('car1','e','show_shine','m','c','Sedan',CURRENT_TIMESTAMP); INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id,version) VALUES('e','show_shine','live','car1',1); INSERT INTO live_category_state(event_id,discipline,category,status) VALUES('e','show_shine','Sedan','live')");
 await page.route('https://api.e36united.cz/api/**',async route=>{
  const q=route.request(),url=new URL(q.url()),p=url.pathname;if(!p.includes('/live'))return route.fallback();if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
  const req=new Request(q.url(),{method:q.method(),headers:q.headers(),...(q.postDataBuffer()?{body:q.postDataBuffer()}:{})});let response;
  if(p==='/api/admin/live')response=await live.getAdminLive(c.r.env,url,'https://e36united.cz');else if(p==='/api/live')response=await live.getMemberLive(c.r.env,{uid:'a'},'https://e36united.cz');else if(p==='/api/live/state')response=await live.getLiveState(c.r.env,{uid:'a'},url,'https://e36united.cz');else if(p.includes('/judge/scores/'))response=await live.saveJudgeScore(req,c.r.env,{uid:'a'},'car1','https://e36united.cz');else return route.fulfill({headers,contentType:'image/webp',body:photo});return route.fulfill({headers,status:response.status,body:await response.text()});
 });
 try{await page.setViewportSize({width,height:900});await page.goto('/admin.html?section=live&event=e');await page.locator('[data-admin-live-entry-confirm]').click();await page.locator('[data-live-select-category=Sedan]').click();for(const key of ['overall','condition','cohesion','originality'])await page.locator('[data-live-judge-criterion="'+key+'"][data-live-judge-score="6"]').click();await page.locator('[data-live-judge-submit]').click();await expect(page.locator('[data-live-judge-form]')).toHaveCount(0);await expect(page.locator('.admin-live-judge')).toContainText('Hodnocení potvrzeno');for(const mode of ['light','dark']){await theme(page,mode);await shot(page,'admin-live-'+width+'-'+mode)}}finally{await page.close();c.r.db.close()}
});

test('theme toggle, navigation, reload, system and restored document reconciliation',async({page})=>{
 await prepareE2ePage(page);await page.goto('/index.html');await theme(page,'light');await page.goto('/galerie.html');await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.emulateMedia({colorScheme:'dark'});await page.evaluate(()=>{const s=document.querySelector('[data-appearance-select]');s.value='system';s.dispatchEvent(new Event('change',{bubbles:true}))});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.evaluate(()=>{localStorage.setItem('e36UnitedAppearance','dark');window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});

for(const width of [390,1440])test('member photo batch, partial failure and retry '+width,async({page})=>{
 const o=await prepareE2ePage(page,{authenticated:true});let count=0;const saved=new Map();
 await page.route('https://api.e36united.cz/api/gallery/**',async route=>{
  const q=route.request();if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(q.url().includes('/mine/media/'))return route.fulfill({headers,contentType:'image/webp',body:photo});
  if(q.method()==='GET')return route.fulfill({headers,json:{ok:true,submissions:[...saved.values()],pagination:{hasMore:false}}});
  const form=await new Request(q.url(),{method:'POST',headers:q.headers(),body:q.postDataBuffer()}).formData();count++;
  if(count===2)return route.fulfill({status:503,headers,json:{ok:false,message:'Lokální simulace výpadku'}});
  const id=form.get('uploadId');saved.set(id,{id,caption:'Local fixture',status:'pending',createdAt:new Date().toISOString()});return route.fulfill({headers,json:{ok:true,submission:saved.get(id)}});
 });
 await page.setViewportSize({width,height:900});await page.goto('/member.html?section=photos');await page.locator('[data-member-photo-toggle]').click();
 await page.locator('[data-member-photo-input]').setInputFiles(file('first.webp'));await page.locator('[data-member-photo-input]').setInputFiles(file('second.webp'));await expect(page.locator('[data-member-photo-previews] figure')).toHaveCount(2);
 await page.locator('[data-member-gallery-form] button[type=submit]').click();await expect(page.locator('[data-upload-state=error]')).toHaveCount(1);await expect(page.locator('[data-upload-state=uploaded]')).toHaveCount(1);
 await page.locator('[data-member-gallery-form] button[type=submit]').click();await expect(page.locator('[data-upload-state=uploaded]')).toHaveCount(2);expect(count).toBe(3);await expect(page.locator('[data-member-gallery-list] .member-gallery-item')).toHaveCount(2);
 for(const mode of ['light','dark']){await theme(page,mode);await shot(page,'member-photos-'+width+'-'+mode)}expect(o.pageErrors).toEqual([]);
});

for(const width of [390,1440])test('LIVE confirms own scores, notice does not repeat, explicit close '+width,async({page})=>{
 await prepareE2ePage(page,{authenticated:true});const r=memberRuntime();r.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'; INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category,presented_at) VALUES('car1','e','show_shine','m','c','Sedan',CURRENT_TIMESTAMP); INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id,version) VALUES('e','show_shine','live','car1',1); INSERT INTO live_category_state(event_id,discipline,category,status) VALUES('e','show_shine','Sedan','live')");
 await page.route('https://api.e36united.cz/api/live**',async route=>{
  const q=route.request(),url=new URL(q.url()),p=url.pathname;if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});
  const req=new Request(q.url(),{method:q.method(),headers:q.headers(),...(q.postDataBuffer()?{body:q.postDataBuffer()}:{})});let response;
  if(p==='/api/live')response=await live.getMemberLive(r.env,{uid:'a'},'https://e36united.cz');else if(p==='/api/live/state')response=await live.getLiveState(r.env,{uid:'a'},url,'https://e36united.cz');else if(p.includes('/votes/'))response=await live.saveLiveVote(req,r.env,{uid:'a'},'car1','https://e36united.cz');else if(p.includes('/judge/scores/'))response=await live.saveJudgeScore(req,r.env,{uid:'a'},'car1','https://e36united.cz');else if(p.endsWith('/close'))response=await live.closeLiveEntry(req,r.env,{uid:'a'},'car1','https://e36united.cz');else return route.fulfill({headers,contentType:'image/webp',body:photo});
  return route.fulfill({headers,status:response.status,body:await response.text()});
 });
 try{
  await page.setViewportSize({width,height:900});await page.goto('/member.html?section=live');await page.locator('[data-live-entry-confirm]').click();await expect(page.locator('[data-live-new-notice]')).toBeVisible();await page.locator('[data-live-new-notice] button').click();await expect(page.locator('[data-live-new-notice]')).toBeHidden();
  await page.locator('[data-live-vote] [data-live-score="8"]').click();await page.locator('[data-live-vote] button[type=submit]').click();await expect(page.locator('.live-score-confirmed')).toContainText('8 / 10');await expect(page.locator('[data-live-vote]')).toHaveCount(0);
  for(const key of ['overall','condition','cohesion','originality'])await page.locator('[data-live-judge-criterion="'+key+'"][data-live-judge-score="7"]').click();await page.locator('[data-judge-submit]').click();await expect(page.locator('[data-live-judge]')).toHaveCount(0);await expect(page.locator('.live-judge-form')).toContainText('Hodnocení potvrzeno');
  for(const mode of ['light','dark']){await theme(page,mode);await shot(page,'live-'+width+'-'+mode)}
  page.on('dialog',dialog=>dialog.accept());await page.locator('[data-live-close-entry]').click();await expect.poll(()=>r.db.prepare("SELECT voting_closed FROM live_entries WHERE id='car1'").get().voting_closed).toBe(1);await expect(page.locator('[data-live-vote]')).toHaveCount(0);
  await page.locator('[data-live-more-toggle]').click();await page.locator('[data-live-exit]').click();await expect(page.locator('[data-member-live-mode]')).toBeHidden();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 }finally{await page.close();r.db.close()}
});

for(const width of [390,1440])test('Admin photos refresh while configuration remains dirty '+width,async({page})=>{
 const c=await commandFixture(page),objects=new Map();c.r.env.MEDIA.head=async key=>objects.get(key)||null;c.r.env.MEDIA.put=async(key,stream,meta)=>objects.set(key,{...meta,etag:crypto.randomUUID(),httpEtag:crypto.randomUUID(),size:(await new Response(stream).arrayBuffer()).byteLength});c.r.env.MEDIA.delete=async key=>objects.delete(key);
 await page.route('https://api.e36united.cz/api/accommodation/media/**',route=>route.fulfill({headers,contentType:'image/webp',body:photo}));
 await page.route('https://api.e36united.cz/api/admin/accommodation/*/photos',async route=>{const q=route.request();if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});const req=new Request(q.url(),{method:q.method(),headers:q.headers(),body:q.postDataBuffer()});const response=await stays.postAdminAccommodationGalleryPhoto(req,c.r.env,{uid:'a'},'cab','https://e36united.cz');return route.fulfill({headers,status:response.status,body:await response.text()});});
 try{await page.setViewportSize({width,height:900});await page.goto('/admin.html?section=accommodation&event=e');const card=page.locator('[data-accommodation-id=cab]');await card.locator('[data-accommodation-disclosure=configuration] summary').click();await card.locator('[name=name]').fill('Local unsaved edit');await card.locator('[data-accommodation-disclosure=photos] summary').click();await card.locator('[data-accommodation-gallery-input]').setInputFiles([file('one.webp'),file('two.webp')]);await card.locator('[data-accommodation-gallery-upload]').click();await expect(card.locator('[data-accommodation-gallery-photo]')).toHaveCount(2);await expect(card.locator('[name=name]')).toHaveValue('Local unsaved edit');for(const mode of ['light','dark']){await theme(page,mode);await shot(page,'admin-media-'+width+'-'+mode)}}finally{await page.close();c.r.db.close()}
});

test('slow vote double submit and lost response retain draft, retry and refresh recover own vote',async({page})=>{
 await prepareE2ePage(page,{authenticated:true});const r=memberRuntime();let writes=0;
 r.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'; INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category,presented_at) VALUES('car1','e','show_shine','m','c','Sedan',CURRENT_TIMESTAMP); INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id,version) VALUES('e','show_shine','live','car1',1)");
 await page.route('https://api.e36united.cz/api/live**',async route=>{
  const q=route.request(),url=new URL(q.url());if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});let response;
  if(url.pathname.includes('/votes/')){writes++;await new Promise(resolve=>setTimeout(resolve,150));response=await live.saveLiveVote(new Request(q.url(),{method:q.method(),headers:q.headers(),body:q.postDataBuffer()}),r.env,{uid:'a'},'car1','https://e36united.cz');if(writes===1)return route.abort('failed')}
  else if(url.pathname==='/api/live')response=await live.getMemberLive(r.env,{uid:'a'},'https://e36united.cz');else if(url.pathname==='/api/live/state')response=await live.getLiveState(r.env,{uid:'a'},url,'https://e36united.cz');else return route.fulfill({headers,contentType:'image/webp',body:photo});
  return route.fulfill({headers,status:response.status,body:await response.text()});
 });
 try{await page.goto('/member.html?section=live');await page.locator('[data-live-entry-confirm]').click();await page.locator('[data-live-new-notice] button').click();await page.locator('[data-live-vote] [data-live-score="8"]').click();
  await page.locator('[data-live-vote]').evaluate(form=>{form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))});
  await expect(page.locator('[data-live-vote] button[type=submit]')).toBeEnabled();expect(writes).toBe(1);await expect(page.locator('.live-score-confirmed')).toHaveCount(0);
  await page.locator('[data-live-vote] button[type=submit]').click();await expect(page.locator('.live-score-confirmed')).toContainText('8 / 10');expect(writes).toBe(2);expect(r.db.prepare('SELECT COUNT(*) n FROM live_public_votes').get().n).toBe(1);
  await page.reload();if(await page.locator('[data-live-entry-confirm]').isVisible())await page.locator('[data-live-entry-confirm]').click();await page.locator('[data-live-tab="showshine"]').click();await expect(page.locator('.live-score-confirmed')).toContainText('8 / 10');
 }finally{await page.close();r.db.close()}
});

test('LIVE camera/gallery selections append; judge attachment retry keeps confirmed criteria',async({page})=>{
 await prepareE2ePage(page,{authenticated:true});const r=memberRuntime(),objects=new Map();let judgeUploads=0;
 r.env.MEDIA.put=async(key,stream)=>objects.set(key,await new Response(stream).arrayBuffer());r.env.MEDIA.delete=async key=>objects.delete(key);
 r.db.exec("UPDATE events SET live_enabled=1 WHERE id='e'; INSERT INTO live_entries(id,event_id,discipline,member_id,car_id,category,presented_at) VALUES('car1','e','show_shine','m','c','Sedan',CURRENT_TIMESTAMP); INSERT INTO live_competition_state(event_id,discipline,status,current_entry_id,version) VALUES('e','show_shine','live','car1',1)");
 await page.route('https://api.e36united.cz/api/live**',async route=>{
  const q=route.request(),url=new URL(q.url()),p=url.pathname;if(q.method()==='OPTIONS')return route.fulfill({status:204,headers});const req=new Request(q.url(),{method:q.method(),headers:q.headers(),...(q.postDataBuffer()?{body:q.postDataBuffer()}:{})});let response;
  if(p==='/api/live')response=await live.getMemberLive(r.env,{uid:'a'},'https://e36united.cz');else if(p==='/api/live/state')response=await live.getLiveState(r.env,{uid:'a'},url,'https://e36united.cz');else if(p==='/api/live/photos')response=await live.uploadLivePhoto(req,r.env,{uid:'a'},'https://e36united.cz');else if(p.includes('/judge/scores/'))response=await live.saveJudgeScore(req,r.env,{uid:'a'},'car1','https://e36united.cz');else if(p.includes('/judge/entries/')&&p.endsWith('/photos')){judgeUploads++;if(judgeUploads===2)return route.fulfill({status:503,headers,json:{ok:false,message:'Local photo failure'}});response=await live.uploadJudgePhoto(req,r.env,{uid:'a'},'car1','https://e36united.cz')}else return route.fulfill({headers,contentType:'image/webp',body:photo});return route.fulfill({headers,status:response.status,body:await response.text()});
 });
 try{await page.setViewportSize({width:390,height:900});await page.goto('/member.html?section=live');await page.locator('[data-live-entry-confirm]').click();await page.locator('[data-live-tab=photos]').click();const upload=page.locator('[data-live-upload]');await upload.locator('[name=photos]').setInputFiles(file('camera.webp'));await upload.locator('[name=gallery]').setInputFiles([file('gallery.webp'),file('remove.webp')]);await expect(upload.locator('figure')).toHaveCount(3);await upload.locator('[data-live-remove-gallery-file]').last().click();await upload.locator('button[type=submit]').click();await expect(upload.locator('[data-upload-state=uploaded]')).toHaveCount(2);expect(r.db.prepare("SELECT COUNT(*) n FROM gallery_submissions WHERE member_id='a' AND status='pending'").get().n).toBe(2);for(const mode of ['light','dark']){await theme(page,mode);await shot(page,'live-photo-390-'+mode)}
  await page.locator('[data-live-tab=showshine]').click();for(const key of ['overall','condition','cohesion','originality'])await page.locator('[data-live-judge-criterion="'+key+'"][data-live-judge-score="7"]').click();const judge=page.locator('[data-live-judge]');await judge.locator('summary').click();await judge.locator('[name=judgePhoto]').setInputFiles(file('judge-camera.webp'));await judge.locator('[name=judgeGallery]').setInputFiles(file('judge-gallery.webp'));await page.locator('[data-judge-submit]').click();await expect(judge.locator('[data-upload-state=error]')).toHaveCount(1);await expect(judge.locator('fieldset:visible')).toHaveCount(0);await page.locator('[data-judge-submit]').click();await expect(page.locator('[data-live-judge]')).toHaveCount(0);expect(judgeUploads).toBe(3);expect(r.db.prepare('SELECT COUNT(*) n FROM live_judge_photos').get().n).toBe(2);await expect(page.locator('.live-judge-photos img')).toHaveCount(2);
 }finally{await page.close();r.db.close()}
});
