import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
import {uploadGallerySubmission,listMyGallery,privateMemberGalleryMedia} from '../../worker/domains/member-gallery.js';

const privateImage=readFileSync(new URL('../../assets/images/showshine/ss_coupe.webp',import.meta.url));
const privateHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type'};
async function closePhotoIntro(page){const intro=page.locator('[data-onboarding-intro-modal]');await expect(intro).toBeVisible();await intro.getByRole('button',{name:'Zavřít úvod',exact:true}).click();}
async function openPhotoSection(page){await page.locator('.member-sidebar [data-member-section=photos]').click();await expect(page.locator('[data-member-panel=photos]')).toBeVisible();}
async function loginPhotoMember(page,observations,member){
 await observations.switchMember(member);const form=page.locator('[data-auth-form=login]');await expect(form).toBeVisible();await form.locator('[name=email]').fill(member.email);await form.locator('[name=password]').fill('isolated-password');await form.locator('[type=submit]').click();await expect(page.locator('[data-app-view]')).toBeVisible();await closePhotoIntro(page);await openPhotoSection(page);
}
async function privatePhotoFixture(page,{existing=false,holdUpload=false}={}){
 const observations=await prepareE2ePage(page,{authenticated:true,cars:[],member:{id:'m'}}),r=memberRuntime(),objects=new Map(),uploadStarted=Promise.withResolvers(),uploadRelease=Promise.withResolvers();let actor='m',uploads=0;
 r.db.exec('DELETE FROM gallery_submissions');
 if(existing){r.db.prepare("INSERT INTO gallery_submissions(id,member_id,r2_key,caption,status) VALUES('private-old-photo','m','private/old','PRIVATE OLD PHOTO','pending')").run();objects.set('private/old',{body:privateImage,type:'image/webp'});}
 r.env.MEDIA={async put(key,body,options){objects.set(key,{body:await new Response(body).arrayBuffer(),type:options.httpMetadata.contentType})},async delete(key){objects.delete(key)},async get(key){const item=objects.get(key);return item&&{body:item.body,writeHttpMetadata(headers){headers.set('Content-Type',item.type)}}}};
 // Preserve the actual multipart bytes in WebKit, as in member-task-flows.
 await page.addInitScript(()=>{const original=window.fetch;window.fetch=async(input,init)=>{if(/\/api\/gallery\/submissions$/.test(String(input))&&init?.body instanceof FormData){const request=new Request(input,init);return original(input,{...init,headers:request.headers,body:await request.arrayBuffer()})}return original(input,init)}});
 await page.route('https://api.e36united.cz/api/gallery/**',async route=>{
  const q=route.request(),url=new URL(q.url()),path=url.pathname;if(q.method()==='OPTIONS')return route.fulfill({status:204,headers:privateHeaders});
  const auth={uid:actor,email:actor+'@example.invalid',emailVerified:true};let response;
  if(path==='/api/gallery/mine')response=await listMyGallery(r.env,auth,url,url.origin);
  else if(path.startsWith('/api/gallery/mine/media/'))response=await privateMemberGalleryMedia(r.env,auth,path.split('/').at(-1),url.origin);
  else if(path==='/api/gallery/submissions'&&q.method()==='POST'){
   uploads++;response=await uploadGallerySubmission(new Request(q.url(),{method:q.method(),headers:q.headers(),body:q.postDataBuffer()}),r.env,auth,url.origin);
   uploadStarted.resolve({status:response.status,actor:auth.uid});if(holdUpload)await uploadRelease.promise;
  }else return route.fallback();
  return route.fulfill({status:response.status,headers:privateHeaders,body:Buffer.from(await response.arrayBuffer())});
 });
 return{observations,r,objects,uploadStarted,uploadRelease,get uploads(){return uploads},async switchMember(member){actor=member.id;await loginPhotoMember(page,observations,member)},async close(){uploadRelease.resolve();await page.close();r.db.close()}};
}

test('a delayed private gallery read cannot block or populate the next signed-in account',async({page})=>{
 const observations=await prepareE2ePage(page,{authenticated:true,cars:[]});
 const oldStarted=Promise.withResolvers(),oldRelease=Promise.withResolvers(),newRelease=Promise.withResolvers();
 const image=readFileSync(new URL('../../assets/images/showshine/ss_coupe.webp',import.meta.url));
 let galleryReads=0,oldRequest;
 await page.route('https://api.e36united.cz/api/gallery/mine**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()!=='GET'||url.pathname!=='/api/gallery/mine')return route.fallback();
  const order=++galleryReads;
  if(order===1){oldRequest=request;oldStarted.resolve();await oldRelease.promise}else await newRelease.promise;
  await route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},json:{submissions:[{id:order===1?'private-old-account':'private-new-account',caption:order===1?'SOUKROMÁ FOTKA PRVNÍHO ÚČTU':'SOUKROMÁ FOTKA DRUHÉHO ÚČTU',status:'pending',createdAt:'2026-10-28T10:00:00.000Z'}],pagination:{hasMore:false}}});
 });
 await page.route('https://api.e36united.cz/api/gallery/mine/media/private-new-account',route=>route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/webp',body:image}));
 const closeIntro=async()=>{const intro=page.locator('[data-onboarding-intro-modal]');await expect(intro).toBeVisible();await intro.getByRole('button',{name:'Zavřít úvod',exact:true}).click();};
 try{
  await page.setViewportSize({width:1440,height:900});await page.goto('/member.html?section=photos');await oldStarted.promise;await expect(page.locator('[data-app-view]')).toBeVisible();await closeIntro();
  await expect(page.locator('[data-photos-loading-state]')).toContainText('Načítám');
  await page.locator('.member-sidebar-logout[data-logout]').click();await expect(page.locator('[data-auth-view]')).toBeVisible();
  await observations.switchMember({id:'isolated-second-member',name:'Druhý člen',nickname:'Druhý',email:'second@example.test'});
  const login=page.locator('[data-auth-form=login]');await expect(login).toBeVisible();await login.locator('[name=email]').fill('second@example.test');await login.locator('[name=password]').fill('isolated-password');await login.locator('[type=submit]').click();await expect(page.locator('[data-app-view]')).toBeVisible();await closeIntro();
  await page.locator('.member-sidebar [data-member-section=photos]').click();
  await expect.poll(()=>galleryReads,{message:'The second account starts its own private gallery read before the previous account responds'}).toBe(2);
  oldRelease.resolve();const oldResponse=await oldRequest.response();if(oldResponse)await oldResponse.finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.locator('[data-photos-loading-state]')).toContainText('Načítám');await expect(page.locator('[data-member-gallery-list]')).toBeHidden();await expect(page.locator('[data-member-panel=photos]')).not.toContainText('SOUKROMÁ FOTKA PRVNÍHO ÚČTU');
  newRelease.resolve();await expect(page.locator('[data-member-gallery-list]')).toBeVisible();await expect(page.locator('.member-gallery-item')).toHaveCount(1);await expect(page.locator('[data-member-gallery-list]')).toContainText('SOUKROMÁ FOTKA DRUHÉHO ÚČTU');await expect(page.locator('[data-member-gallery-list]')).not.toContainText('SOUKROMÁ FOTKA PRVNÍHO ÚČTU');expect(galleryReads).toBe(2);expectNoUnexpectedClientErrors(observations);
 }finally{oldRelease.resolve();newRelease.resolve();}
});

test('logout clears the unsent private photo caption before another account opens Photos',async({page})=>{
 const observations=await prepareE2ePage(page,{authenticated:true,cars:[]});await page.setViewportSize({width:1440,height:900});await page.goto('/member.html?section=photos');await expect(page.locator('[data-app-view]')).toBeVisible();await closePhotoIntro(page);
 const form=page.locator('[data-member-gallery-form]');await page.locator('[data-member-photo-toggle]').click();await form.locator('[name=caption]').fill('PRIVATE OLD');
 await page.locator('.member-sidebar-logout[data-logout]').click();await expect(page.locator('[data-auth-view]')).toBeVisible();await expect(form).toBeHidden();await expect(form.locator('[name=caption]')).toHaveValue('');
 await loginPhotoMember(page,observations,{id:'private-caption-second',name:'Druhý člen',nickname:'Druhý',email:'second@example.test'});await expect(form).toBeHidden();await expect(page.locator('[data-member-photo-toggle]')).toHaveAttribute('aria-expanded','false');await page.locator('[data-member-photo-toggle]').click();await expect(form.locator('[name=caption]')).toBeVisible();await expect(form.locator('[name=caption]')).toHaveValue('');expect(await form.locator('[data-member-photo-input]').evaluate(input=>input.files.length)).toBe(0);expectNoUnexpectedClientErrors(observations);
});

test('SDK sign-out closes and clears an already decoded private photo lightbox',async({page})=>{
 const c=await privatePhotoFixture(page,{existing:true});try{
  await page.setViewportSize({width:1440,height:900});await page.goto('/member.html?section=photos');await expect(page.locator('[data-app-view]')).toBeVisible();await closePhotoIntro(page);await page.locator('[data-member-gallery-open="0"]').click();
  const box=page.locator('[data-member-gallery-lightbox]'),image=box.locator('[data-member-gallery-lightbox-image]');await expect(box).toBeVisible();await expect.poll(()=>image.evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);await expect(box).toContainText('PRIVATE OLD PHOTO');
  await page.evaluate(async()=>{const sdk=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');await sdk.signOut(sdk.getAuth());});await expect(page.locator('[data-auth-view]')).toBeVisible();
  await expect(box).toBeHidden();await expect(image).not.toHaveAttribute('src');await expect(image).toHaveAttribute('alt','');await expect(box.locator('[data-member-gallery-lightbox-caption]')).toBeEmpty();await expect(page.locator('body')).not.toHaveClass(/modal-open/);
  expect(c.r.db.prepare('SELECT id,member_id,caption FROM gallery_submissions').all()).toEqual([{id:'private-old-photo',member_id:'m',caption:'PRIVATE OLD PHOTO'}]);expect(c.objects.size).toBe(1);expect(c.uploads).toBe(0);expectNoUnexpectedClientErrors(c.observations);
 }finally{await c.close()}
});

test('a committed old-account upload response cannot clear the next account caption or announce success there',async({page},info)=>{
 const c=await privatePhotoFixture(page,{holdUpload:true});try{
  await page.setViewportSize({width:1440,height:900});await page.goto('/member.html?section=photos');await expect(page.locator('[data-app-view]')).toBeVisible();await closePhotoIntro(page);await page.locator('[data-member-photo-toggle]').click();
  const form=page.locator('[data-member-gallery-form]'),caption=form.locator('[name=caption]'),submit=form.locator('[type=submit]');await caption.fill('PRIVATE OLD UPLOAD');await form.locator('[data-member-photo-input]').setInputFiles({name:'old-account.webp',mimeType:'image/webp',buffer:privateImage});await submit.click();expect(await c.uploadStarted.promise).toEqual({status:201,actor:'m'});
  const stored=c.r.db.prepare('SELECT id,member_id,caption,status FROM gallery_submissions').all();expect(stored).toHaveLength(1);expect(stored[0]).toMatchObject({member_id:'m',caption:'PRIVATE OLD UPLOAD',status:'pending'});expect(c.objects.size).toBe(1);
  await page.locator('.member-sidebar-logout[data-logout]').click();await expect(page.locator('[data-auth-view]')).toBeVisible();await c.switchMember({id:'n',name:'Druhý člen',nickname:'Druhý',email:'other@example.invalid'});if(!await form.isVisible())await page.locator('[data-member-photo-toggle]').click();await caption.fill('PRIVATE NEW DRAFT');
  const busyAfterReset=await submit.isDisabled();await page.evaluate(()=>{window.__latePhotoNotices=[];new MutationObserver(()=>window.__latePhotoNotices.push(document.querySelector('[data-toast]').textContent)).observe(document.querySelector('[data-toast]'),{childList:true,subtree:true,characterData:true})});
  c.uploadRelease.resolve();await expect(form.locator('[data-member-photo-input]')).toBeEnabled();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  const proof={busyAfterReset,caption:await caption.inputValue(),notices:await page.evaluate(()=>window.__latePhotoNotices)};await info.attach('old-upload-after-account-switch',{body:JSON.stringify(proof),contentType:'application/json'});
  await expect(caption).toHaveValue('PRIVATE NEW DRAFT');expect(busyAfterReset).toBe(false);await expect(submit).toBeEnabled();expect(proof.notices).toEqual([]);await expect(page.locator('[data-member-gallery-list]')).not.toContainText('PRIVATE OLD UPLOAD');await expect(page.locator('[data-member-gallery-open]')).toHaveCount(0);expect(c.uploads).toBe(1);expect(c.r.db.prepare('SELECT id,member_id,caption,status FROM gallery_submissions').all()).toEqual(stored);expect(c.objects.size).toBe(1);expectNoUnexpectedClientErrors(c.observations);
 }finally{await c.close()}
});
