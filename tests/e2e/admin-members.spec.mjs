import {decodeMemberQrSvg} from '../helpers/decode-member-qr.mjs';
import {test,expect} from '@playwright/test';
import {prepareAdminE2ePage} from './fixtures.mjs';
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
import {getAdminMember,listAdminMembers,resolveAdminMemberQr,adminMemberMedia} from '../../worker/admin/members.js';
import {getAdminGallery,getAdminHistoryClaims} from '../../worker/domains.js';
import {loadMailingContacts} from '../../worker/domains/mailing/contacts.js';
import {provisionMemberQrBatch} from '../../worker/admin/member-qr.js';

async function fixture(page){
 const observations=await prepareAdminE2ePage(page),r=memberRuntime(),calls=[];let failure=false,delay=null;
 r.db.exec("PRAGMA foreign_keys=OFF; UPDATE events SET id='united-2026' WHERE id='e'; UPDATE reservations SET event_id='united-2026' WHERE event_id='e'; PRAGMA foreign_keys=ON;");
 await provisionMemberQrBatch(r.env);
 await page.route('https://api.e36united.cz/api/admin/members**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST'}});
  const url=new URL(route.request().url());calls.push(url.pathname+url.search);
  if(failure)return route.fulfill({status:503,headers:{'Access-Control-Allow-Origin':'*'},body:'{"message":"Synthetic unavailable"}'});
  if(delay&&url.pathname.includes('/n'))await delay;
  const parts=url.pathname.split('/');let response;
  if(parts.length===4)response=await listAdminMembers(r.env,url,'https://e36united.cz');
  else if(parts[5]==='media')response=await adminMemberMedia(r.env,parts[4],parts[6],parts[7],parts[8]||parts[7],'https://e36united.cz');
  else response=await getAdminMember(r.env,url,parts[4],parts[5],'https://e36united.cz');
  if(parts[5]==='media')return route.fulfill({status:response.status,headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"><rect width="180" height="120" fill="#2a527a"/></svg>'});
  await route.fulfill({status:response.status,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:await response.text()});
 });
 await page.route('https://api.e36united.cz/api/admin/member-qr/resolve',async route=>{if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'POST'}});const response=await resolveAdminMemberQr(new Request(route.request().url(),{method:'POST',body:route.request().postData()}),r.env,'https://e36united.cz');await route.fulfill({status:response.status,headers:{'Access-Control-Allow-Origin':'*'},body:await response.text()})});
 return{r,calls,observations,get failure(){return failure},set failure(v){failure=v},set delay(v){delay=v}};
}
const drawer=page=>page.locator('[data-member-dialog]');

for(const width of [1440,390])test('read-only Member return preserves fresh source cache and dirty editor; due/focus refresh still runs '+width,async({page},info)=>{
 await page.setViewportSize({width,height:900});await page.clock.install();const c=await fixture(page);
 await page.goto('/admin.html?section=payments');await page.locator('[data-payment-filter="all"]').click();
 const detailRequest=page.waitForRequest(q=>q.method()==='GET'&&q.url().includes('/api/admin/reservations?')&&new URL(q.url()).searchParams.get('projection')==='detail');
 await page.locator('[data-payment-list] button[data-reservation-open]').first().click();await detailRequest;
 const source=page.locator('[data-reservation-drawer]'),amount=source.locator('[data-payment-amount]');await expect(amount).toBeVisible();await amount.fill('1700');
 const reads=[];page.on('request',q=>{if(q.method()==='GET'&&/\/api\/admin\/(summary|reservations)(\?|$)/.test(q.url()))reads.push(new URL(q.url()));});
 const writes=c.r.writes;await source.locator('[data-member-open="m"]').click();await expect(drawer(page)).toContainText('EU-MEMBER');
 await drawer(page).locator('[data-member-close]').click();await expect(drawer(page)).not.toBeVisible();await page.clock.runFor(1000);
 expect(reads).toHaveLength(0);await expect(amount).toHaveValue('1700');
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect.poll(()=>reads.filter(u=>u.searchParams.get('projection')==='detail').length).toBeGreaterThan(0);
 expect(reads.filter(u=>u.pathname.endsWith('/summary'))).toHaveLength(0);await expect(amount).toHaveValue('1700');
 reads.length=0;await source.locator('[data-member-open="m"]').click();await expect(drawer(page)).toContainText('EU-MEMBER');
 await expect(page.locator('[data-member-freshness]')).toContainText('Profil / event: načteno');
 for(let i=0;i<5;i++){
  const before=c.calls.length;await page.clock.runFor(61000);
  await expect.poll(()=>c.calls.length).toBeGreaterThan(before);
  await expect(page.locator('[data-admin-freshness]')).toHaveAttribute('data-state','fresh');
 }
 // NEW keeps the shared navigation badges fresh above Member; the dirty source stays idle.
 await expect.poll(()=>reads.filter(u=>u.pathname.endsWith('/summary')).length).toBe(1);
 expect(reads.filter(u=>u.pathname.endsWith('/reservations'))).toHaveLength(0);
 await drawer(page).locator('[data-member-close]').click();await expect(drawer(page)).not.toBeVisible();
 await expect.poll(()=>reads.filter(u=>u.pathname.endsWith('/summary')).length).toBe(1);
 await expect.poll(()=>reads.filter(u=>u.searchParams.get('projection')==='detail').length).toBe(1);
 await expect(amount).toHaveValue('1700');await page.screenshot({path:info.outputPath('budget-source-'+width+'.png')});
 expect(c.r.writes).toBe(writes);expect(c.observations.requests.filter(x=>/PATCH|PUT/.test(x))).toEqual([]);
 expect(c.observations.pageErrors).toEqual([]);expect(c.observations.consoleErrors).toEqual([]);expect(c.observations.unhandledApi).toEqual([]);c.r.db.close();
});
test('Member 360 desktop search/tab/QR and close are read-only; search Enter is coalesced',async({page},info)=>{
 await page.setViewportSize({width:1440,height:900});const c=await fixture(page);await page.goto('/admin.html?section=members');await expect(page.locator('[data-member-list]')).toContainText('First');
 const writes=c.r.writes;await page.locator('[data-member-search]').fill('BMW');await page.locator('[data-member-search]').press('Enter');await expect(page.locator('[data-member-suggestions]')).toContainText('First');await expect(page.locator('[data-member-suggestions] [data-member-open]')).toHaveCount(2);expect(c.calls.filter(p=>p.includes('?q=BMW'))).toHaveLength(1);
 await page.locator('[data-member-suggestions] [data-member-open="m"]').click();await expect(drawer(page)).toBeVisible();await expect(drawer(page)).toContainText('EU-MEMBER');expect(c.calls.filter(p=>/\/(garage|history|club|points|qr)/.test(p))).toHaveLength(0);
 await drawer(page).locator('[data-member-tab="garage"]').click();await expect(drawer(page)).toContainText('BMW 328i');await expect(drawer(page).locator('img').first()).toHaveJSProperty('complete',true);
 await page.screenshot({path:info.outputPath('member360-desktop.png')});
 await drawer(page).locator('[data-member-tab="club"]').click();await expect(drawer(page)).toContainText('S&S TOP 3');
 await drawer(page).locator('[data-member-tab="qr"]').click();await expect(drawer(page).locator('.admin-member-qr svg')).toBeVisible();const rendered=await drawer(page).locator('.admin-member-qr').innerHTML();expect(decodeMemberQrSvg(rendered)).toBe('E36U1:'+c.r.db.prepare("SELECT token FROM member_qr_identities WHERE member_id='m'").get().token);await page.screenshot({path:info.outputPath('member360-qr.png')});
 await drawer(page).locator('[data-member-close]').click();await expect(drawer(page)).not.toBeVisible();expect(c.r.writes).toBe(writes);expect(c.observations.consoleErrors.filter(e=>!(c.failure&&e.text.includes('503')&&e.url.includes('/api/admin/members/')))).toEqual([]);expect(c.observations.pageErrors).toEqual([]);expect(c.observations.unhandledApi).toEqual([]);c.r.db.close();
});
test('Member mobile direct entry, tabs, Back, reload and private media cleanup preserve safe parent',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});const c=await fixture(page);await page.goto('/admin.html?section=members&event=united-2026&member=m&tab=history');await expect(drawer(page)).toContainText('United 2025');
 expect(await drawer(page).evaluate(n=>Math.round(n.getBoundingClientRect().width))).toBe(390);await page.screenshot({path:info.outputPath('member360-mobile.png')});
 await page.reload();await expect(drawer(page)).toContainText('United 2025');await drawer(page).locator('[data-member-close]').click();await expect(drawer(page)).not.toBeVisible();await expect(page).not.toHaveURL(/member=/);await expect(page.locator('[data-member-list]')).toContainText('First');
 await page.locator('[data-member-list] [data-member-open="m"]').click();await expect(drawer(page)).toContainText('EU-MEMBER');await page.goBack();await expect(drawer(page)).not.toBeVisible();expect(c.observations.pageErrors).toEqual([]);c.r.db.close();
});
test('Member uses one sixty-second coordinator, suspends background list and hidden/offline requests',async({page})=>{
 await page.clock.install();const c=await fixture(page);await page.goto('/admin.html?section=members&member=m');await expect(drawer(page)).toContainText('EU-MEMBER');await drawer(page).locator('[data-member-tab="garage"]').click();await expect(drawer(page).locator('img').first()).toHaveAttribute('src',/^blob:/);const imageReads=c.calls.filter(p=>p.includes('/media/')).length;
 const writes=c.r.writes;let count=0;page.on('request',q=>{if(q.method()==='GET'&&q.url().includes('/api/admin/'))count++});
 c.r.db.exec("UPDATE members SET nickname='Updated by another admin' WHERE id='m'");await page.clock.runFor(60_100);await expect(drawer(page)).toContainText('Updated by another admin');expect(count).toBeLessThanOrEqual(3);expect(c.calls.filter(p=>p.includes('/media/'))).toHaveLength(imageReads);
 count=0;await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});window.dispatchEvent(new Event('offline'))});await page.clock.runFor(300_000);expect(count).toBe(0);
 await page.evaluate(()=>{Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});window.dispatchEvent(new Event('online'))});await expect.poll(()=>count).toBeGreaterThan(0);
 count=0;await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))});await page.clock.runFor(300_000);expect(count).toBe(0);expect(c.r.writes).toBe(writes);expect(c.observations.pageErrors).toEqual([]);c.r.db.close();
});
test('Member link from a dirty payment keeps the editor, URL context and typed amount through Back',async({page})=>{
 const c=await fixture(page);await page.goto('/admin.html?section=payments');await page.locator('[data-payment-filter="all"]').click();await page.locator('[data-payment-list] button[data-reservation-open]').first().click();
 const source=page.locator('[data-reservation-drawer]'),amount=source.locator('[data-payment-amount]');
 await amount.fill('1700');await source.locator('[data-member-open="m"]').click();await expect(drawer(page)).toContainText('EU-MEMBER');
 await expect(page).toHaveURL(/reservation=reservation-admin-e2e.*member=m/);await page.goBack();await expect(drawer(page)).not.toBeVisible();await expect(amount).toHaveValue('1700');await expect(source).toBeVisible();
 expect(c.observations.requests.filter(x=>/PATCH|PUT/.test(x))).toEqual([]);expect(c.observations.pageErrors).toEqual([]);c.r.db.close();
});
test('late prior-member search/detail cannot replace current identity, failed section is honest',async({page})=>{
 const c=await fixture(page);await page.goto('/admin.html?section=members');await expect(page.locator('[data-member-list]')).toContainText('Second');
 let release;const held=new Promise(resolve=>release=resolve);c.delay=held;
 await page.locator('[data-member-list] [data-member-open="n"]').click();await drawer(page).locator('[data-member-close]').click();
 await page.locator('[data-member-list] [data-member-open="m"]').click();await expect(drawer(page)).toContainText('EU-MEMBER');release();c.delay=null;await expect(drawer(page).locator('[data-member-identity]')).not.toContainText('EU-OTHER');
 c.failure=true;await drawer(page).locator('[data-member-tab="points"]').click();await expect(drawer(page)).toContainText('nejsou dostupná');await expect(drawer(page)).toContainText('EU-MEMBER');
 expect(c.observations.pageErrors).toEqual([]);c.r.db.close();
});
test('Member cached media and QR resolver clear on definitive access loss; identification remains read-only',async({page})=>{
 const c=await fixture(page);await page.goto('/admin.html?section=members');await expect(page.locator('[data-member-list]')).toContainText('First');
 const payload='E36U1:'+c.r.db.prepare("SELECT token FROM member_qr_identities WHERE member_id='m'").get().token;
 await page.locator('[data-member-search]').fill(payload);await page.locator('[data-member-search]').press('Enter');await expect(drawer(page)).toContainText('EU-MEMBER');await expect(page).not.toHaveURL(/E36U1|token=/);expect(c.calls.some(p=>p.includes('E36U1'))).toBe(false);
 await drawer(page).locator('[data-member-tab="garage"]').click();await expect(drawer(page).locator('img').first()).toHaveAttribute('src',/^blob:/);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('admin:accesslost')));await expect(drawer(page)).not.toBeVisible();await expect(page.locator('[data-member-list]')).toBeEmpty();await expect(page.locator('[data-member-search]')).toHaveValue('');
 expect(c.observations.requests.filter(x=>/PATCH|PUT/.test(x))).toEqual([]);expect(c.observations.pageErrors).toEqual([]);c.r.db.close();
});
test('canonical links from reservation lists, gallery, history and truly linked Mailing contacts share Member 360',async({page})=>{
 const c=await fixture(page);c.r.db.exec("UPDATE gallery_submissions SET status='pending'; UPDATE united_history_claims SET attendance_status='pending';");
 const json=async(route,response)=>route.fulfill({status:response.status,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:await response.text()});
 await page.route('https://api.e36united.cz/api/admin/gallery?*',async route=>json(route,await getAdminGallery(c.r.env,'https://e36united.cz',new URL(route.request().url()))));
 await page.route('https://api.e36united.cz/api/admin/gallery/media/**',route=>route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="180" height="120"/>'}));
 await page.route('https://api.e36united.cz/api/admin/history/claims?*',async route=>json(route,await getAdminHistoryClaims(c.r.env,new URL(route.request().url()),'https://e36united.cz')));
 await page.route('https://api.e36united.cz/api/admin/mailing/contacts?*',async route=>{const contacts=await loadMailingContacts(c.r.env);await route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},contentType:'application/json',body:JSON.stringify({contacts,pagination:{page:1,total:contacts.length,totalPages:1}})})});
 for(const section of ['reservations','gallery']){
  await page.goto('/admin.html?section='+section);const source=page.locator('[data-admin-panel="'+section+'"] [data-member-open="m"]').first();await source.click();await expect(drawer(page)).toContainText('EU-MEMBER');await drawer(page).locator('[data-member-close]').click();await expect(drawer(page)).not.toBeVisible();
 }
 await page.locator('[data-gallery-mode="history"]').click();await page.locator('[data-history-list] [data-member-open="m"]').click();await expect(drawer(page)).toContainText('EU-MEMBER');
 await page.goto('/admin.html?section=mailing');await page.locator('[data-mailing-tab="contacts"]').click();
 const list=page.locator('[data-mailing-contact-list]');await expect(list).toContainText('other@example.invalid');await expect(list.locator('[data-member-open="n"]')).toHaveCount(0);await list.locator('[data-member-open="m"]').click();await expect(drawer(page)).toContainText('EU-MEMBER');
 expect(c.observations.pageErrors).toEqual([]);expect(c.observations.consoleErrors).toEqual([]);c.r.db.close();
});
