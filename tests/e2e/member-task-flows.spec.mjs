import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
import {bootstrapMember,getMember} from '../../worker/domains/members.js';
import {getUnitedClub} from '../../worker/domains/club/index.js';
import {submitHistoryClaim,historyEvidenceMedia} from '../../worker/domains/club/history.js';
import {uploadGallerySubmission,listMyGallery,privateMemberGalleryMedia} from '../../worker/domains/member-gallery.js';

const bytes=readFileSync(new URL('../../assets/images/showshine/ss_coupe.webp',import.meta.url));
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type'};
const auth={uid:'m',email:'member@example.invalid',emailVerified:true};
const incoming=q=>new Request(q.url(),{method:q.method(),headers:q.headers(),body:q.postDataBuffer()});

// Only these task endpoints use real D1/R2 handlers. Auth and unrelated read
// domains remain the established deterministic browser fixture, not production.
async function taskFixture(page){
 const observations=await prepareE2ePage(page,{authenticated:true,member:{id:'m'}}),r=memberRuntime(),objects=new Map(),calls=[],photoUploadIds=[];
 // WebKit's intercepted multipart body omits file bytes. Use the same real
 // browser serialization bridge as registration-live-continuity: no fake image
 // or handler response, and server image validation still checks the bytes.
 await page.addInitScript(()=>{const original=window.fetch;window.fetch=async(input,init)=>{if(/\/api\/(history\/claims|gallery\/submissions)$/.test(String(input))&&init?.body instanceof FormData){const request=new Request(input,init),body=await request.arrayBuffer();return original(input,{...init,headers:request.headers,body})}return original(input,init)}});
 let failProfile=false,failPhoto=false;
 r.env.MEDIA={async put(key,body,options){objects.set(key,{body:await new Response(body).arrayBuffer(),type:options.httpMetadata.contentType})},async delete(key){objects.delete(key)},async get(key){const item=objects.get(key);return item&&{body:item.body,writeHttpMetadata(h){h.set('Content-Type',item.type)}}}};
 r.db.exec("DELETE FROM united_history_evidence;DELETE FROM united_history_claims;DELETE FROM gallery_submissions;UPDATE events SET event_end_at='2025-08-01' WHERE id='old'");
 await page.route('https://api.e36united.cz/api/**',async route=>{
  const q=route.request(),u=new URL(q.url()),p=u.pathname,method=q.method();
  if(!['/api/me','/api/bootstrap','/api/united-club','/api/history/claims','/api/gallery/mine','/api/gallery/submissions'].includes(p)&&!p.startsWith('/api/history/evidence/')&&!p.startsWith('/api/gallery/mine/media/'))return route.fallback();
  if(method==='OPTIONS')return route.fulfill({status:204,headers});calls.push(method+' '+p);let response;
  if(p==='/api/me')response=await getMember(r.env,auth,u.origin);
  else if(p==='/api/bootstrap'){if(failProfile){failProfile=false;return route.fulfill({status:503,headers,json:{error:'profile_test_unavailable',message:'Profil se nyní nepodařilo uložit.'}})}response=await bootstrapMember(incoming(q),r.env,auth,u.origin)}
  else if(p==='/api/united-club')response=await getUnitedClub(r.env,auth,u.origin);
  else if(p==='/api/history/claims')response=await submitHistoryClaim(incoming(q),r.env,auth,u.origin);
  else if(p.startsWith('/api/history/evidence/'))response=await historyEvidenceMedia(r.env,p.split('/').at(-1),'m',u.origin);
  else if(p==='/api/gallery/mine')response=await listMyGallery(r.env,auth,u,u.origin);
  else if(p.startsWith('/api/gallery/mine/media/'))response=await privateMemberGalleryMedia(r.env,auth,p.split('/').at(-1),u.origin);
  else if(p==='/api/gallery/submissions'){photoUploadIds.push((await incoming(q).formData()).get('uploadId'));if(failPhoto){failPhoto=false;return route.fulfill({status:503,headers,json:{error:'photo_test_unavailable',message:'Fotografii se nyní nepodařilo uložit.'}})}response=await uploadGallerySubmission(incoming(q),r.env,auth,u.origin)}
  return route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});
 });
 return {r,objects,calls,photoUploadIds,observations,failProfile(){failProfile=true},failPhoto(){failPhoto=true}};
}

test('profile completion retries failed write and restores confirmed summaries from actual member handler',async({page,browserName})=>{
 const c=await taskFixture(page);try{
  await page.goto('/member.html?section=account');const form=page.locator('[data-account-form]');
  await expect(form.locator('[name=name]')).toHaveValue('Same Name');
  await form.locator('[name=name]').fill('Dokončený profil');await form.locator('[name=nickname]').fill('Nová přezdívka');await form.locator('[name=phone]').fill('+420 777 111 222');
  // The shared API client deliberately maps bootstrap 503 to this safe label.
  c.failProfile();await form.locator('button[type=submit]').click();await expect(form.locator('[data-account-save-status]')).toHaveText('Členský profil je dočasně nedostupný.');
  expect(c.r.db.prepare("SELECT name FROM members WHERE id='m'").get().name).toBe('Same Name');await expect(form.locator('[name=name]')).toHaveValue('Dokončený profil');
  await form.locator('button[type=submit]').click();await expect(form.locator('[data-account-save-status]')).toHaveText('Profil byl uložen.');
  expect(c.r.db.prepare("SELECT name,nickname,phone FROM members WHERE id='m'").get()).toMatchObject({name:'Dokončený profil',nickname:'Nová přezdívka',phone:'+420 777 111 222'});
  await expect(page.locator('[data-summary-name]')).toHaveText('Dokončený profil');await page.reload();await expect(form.locator('[name=nickname]')).toHaveValue('Nová přezdívka');
  expect(c.calls.filter(value=>value==='POST /api/bootstrap')).toHaveLength(2);
  expect(c.observations.pageErrors).toEqual([]);expect(c.observations.unhandledApi).toEqual([]);
  // Firefox serializes this Error argument as just "Error". Keep its exact
  // message and source scoped to the one deliberately rejected bootstrap.
  const expectedProfileError=c.observations.consoleErrors.filter(error=>(error.text.startsWith('Member profile update failed Error: Profil se nyní nepodařilo uložit.')||browserName==='firefox'&&error.text==='Member profile update failed Error')&&error.url.includes('/member/modules/account.js?'));expect(expectedProfileError).toHaveLength(1);
  expect(c.observations.consoleErrors.filter(error=>!(error.url.endsWith('/api/bootstrap')&&/503/.test(error.text))&&!expectedProfileError.includes(error))).toEqual([]);
 }finally{await page.close();c.r.db.close()}
});

test('history proof and category complete actual pending review without awarding points',async({page},info)=>{
 const c=await taskFixture(page);try{
  const before=c.r.db.prepare("SELECT SUM(delta) n FROM united_points_ledger WHERE member_id='m'").get().n;
  await page.goto('/member.html?section=club');await page.locator('[data-club-tab=history]').click();await page.locator('[data-open-history-editor]').click();
  const form=page.locator('[data-history-claim-form]'),submit=form.locator('[data-history-submit]');await expect(submit).toBeEnabled();
  await form.locator('[data-history-evidence-input]').setInputFiles({name:'cancelled-proof.webp',mimeType:'image/webp',buffer:bytes});
  page.once('dialog',dialog=>{expect(dialog.message()).toBe('Zahodit neodeslané změny tohoto ročníku?');return dialog.accept()});await page.getByRole('button',{name:'Zavřít editor historie',exact:true}).click();expect(c.objects.size).toBe(0);expect(c.r.db.prepare("SELECT COUNT(*) n FROM united_history_claims WHERE member_id='m'").get().n).toBe(0);expect(c.calls).not.toContain('POST /api/history/claims');
  await page.locator('[data-open-history-editor]').click();await expect(submit).toBeEnabled();expect(await form.locator('[data-history-evidence-input]').evaluate(input=>input.files.length)).toBe(0);
  await form.locator('[data-history-evidence-input]').setInputFiles({name:'proof.webp',mimeType:'image/webp',buffer:bytes});await form.locator('[data-history-sns-choice=yes]').click();await expect(submit).toBeEnabled();await submit.click();await expect(page.locator('[data-toast]')).toHaveText('Vyber Show & Shine kategorii.');expect(c.calls).not.toContain('POST /api/history/claims');
  await form.locator('[data-history-category-trigger]').click();await form.locator('[data-history-category-value=coupe]').click();await expect(submit).toBeEnabled();await submit.click();
  await expect(page.locator('[data-history-editor-list]')).toContainText('ODESLÁNO KE KONTROLE');await expect(page.locator('[data-history-editor-list]')).toContainText('Coupé');
  const claim=c.r.db.prepare("SELECT * FROM united_history_claims WHERE member_id='m'").get();expect(claim).toMatchObject({event_id:'old',attendance_status:'pending',sns_status:'pending',sns_category:'coupe'});
  expect(c.r.db.prepare('SELECT COUNT(*) n FROM united_history_evidence WHERE claim_id=?').get(claim.id).n).toBe(1);expect(c.objects.size).toBe(1);expect(c.r.db.prepare("SELECT SUM(delta) n FROM united_points_ledger WHERE member_id='m'").get().n).toBe(before);
  await page.getByRole('button',{name:'Zavřít editor historie',exact:true}).click();await page.locator('[data-open-history-year=old]').click();await expect(page.locator('[data-history-editor-list]')).toContainText('ČEKÁ NA KONTROLU');expect(c.calls.filter(value=>value==='POST /api/history/claims')).toHaveLength(1);expectNoUnexpectedClientErrors(c.observations);
  await page.screenshot({path:info.outputPath('history-pending-review-desktop.png')});
 }finally{await page.close();c.r.db.close()}
});

test('photo completion validates selection retries only failed upload and preserves saved pending photo when clearing',async({page},info)=>{
 const c=await taskFixture(page);try{
  await page.goto('/member.html?section=photos');
  await page.evaluate(()=>{window.__taskClickProof=[];for(const type of ['pointerdown','pointerup','click'])document.addEventListener(type,event=>{const button=document.querySelector('[data-member-photo-toggle]'),rect=button?.getBoundingClientRect();window.__taskClickProof.push({type,target:event.target?.outerHTML?.slice(0,250),point:[event.clientX,event.clientY],button:rect&&{x:rect.x,y:rect.y,width:rect.width,height:rect.height},scrollY,expanded:button?.getAttribute('aria-expanded')})},true)});
  try{await page.locator('[data-member-photo-toggle]').click();await expect(page.locator('[data-member-gallery-form]')).toBeVisible()}finally{await info.attach('photo-toggle-pointer-target',{body:JSON.stringify(await page.evaluate(()=>window.__taskClickProof)),contentType:'application/json'})}
  const input=page.locator('[data-member-photo-input]');
  await input.setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('not a photo')});await expect(page.locator('.member-toast')).toContainText('JPG');expect(c.calls.filter(value=>value==='POST /api/gallery/submissions')).toHaveLength(0);
  await input.setInputFiles({name:'photo.webp',mimeType:'image/webp',buffer:bytes});c.failPhoto();const submit=page.locator('[data-member-gallery-form] button[type=submit]');await submit.click();await expect(page.locator('[data-upload-state=error]')).toHaveCount(1);
  expect(c.r.db.prepare('SELECT COUNT(*) n FROM gallery_submissions').get().n).toBe(0);await submit.click();await expect(page.locator('[data-upload-state=uploaded]')).toHaveCount(1);await expect(page.locator('[data-member-gallery-list]')).toContainText('ČEKÁ NA SCHVÁLENÍ');
  const saved=c.r.db.prepare('SELECT id,member_id,status FROM gallery_submissions').all();expect(saved).toHaveLength(1);expect(saved[0]).toMatchObject({member_id:'m',status:'pending'});expect(c.objects.size).toBe(1);
  await page.locator('[data-member-photo-clear]').click();await expect(page.locator('[data-member-photo-selection]')).toBeHidden();await expect(page.locator('[data-member-gallery-list]')).toContainText('ČEKÁ NA SCHVÁLENÍ');expect(c.r.db.prepare('SELECT id,member_id,status FROM gallery_submissions').all()).toEqual(saved);expect(c.calls.filter(value=>value==='POST /api/gallery/submissions')).toHaveLength(2);expect(c.photoUploadIds).toHaveLength(2);expect(c.photoUploadIds[1]).toBe(c.photoUploadIds[0]);
  expect(c.observations.pageErrors).toEqual([]);expect(c.observations.unhandledApi).toEqual([]);expect(c.observations.consoleErrors.filter(error=>!(error.url.endsWith('/api/gallery/submissions')&&/503/.test(error.text)))).toEqual([]);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:info.outputPath('photo-pending-preserved-mobile.png')});
 }finally{await page.close();c.r.db.close()}
});
