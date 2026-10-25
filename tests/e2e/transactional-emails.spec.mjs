import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {commandFixture} from './command-fixture.mjs';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {routeAdminMailing} from '../../worker/domains/mailing/index.js';
import {patchAdminReservationPayment} from '../../worker/domains.js';
import {getCurrentReservation} from '../../worker/domains/reservations/index.js';
import {memberRuntime} from '../helpers/admin-member-runtime.mjs';
import {deliverTransactionalEmails} from '../../worker/domains/mailing/transactional.js';
import {TRANSACTIONAL_TYPES,renderTransactionalEmail} from '../../worker/domains/mailing/transactional-template.js';
import {transactionalExample} from '../../worker/domains/mailing/transactional-routes.js';
const origin='https://e36united.cz';
async function images(page){
 await page.route('https://e36united.cz/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(!/^\/(assets\/images\/[a-z0-9/_.-]+\.(?:webp|jpg|png)|united-logo-blue-silver-transparent.png)$/.test(path))return route.abort('blockedbyclient');
  return route.fulfill({contentType:path.endsWith('.webp')?'image/webp':'image/png',body:readFileSync(new URL('../..'+path,import.meta.url))});
 });
}
const req=body=>new Request(origin,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
for(const width of [1440,390])test(`transactional Mailing history, safe failure and audited retry ${width}`,async({page},info)=>{
 const c=await commandFixture(page);await images(page);await page.setViewportSize({width,height:960});
 try{
  await page.route('https://api.e36united.cz/api/admin/mailing/transactional**',async route=>{
   const q=route.request(),url=new URL(q.url());if(q.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}});
   const request=new Request(q.url(),{method:q.method(),headers:q.headers(),...(q.postDataBuffer()?{body:q.postDataBuffer()}:{})});
   const response=await routeAdminMailing({request,env:c.r.env,url,auth:{uid:'a'},origin});return route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),'Access-Control-Allow-Origin':'*'},body:await response.text()});
  });
  await page.goto('/admin.html?section=mailing&event=e');await page.locator('[data-mailing-tab=transactional]').click();
  const panel=page.locator('[data-mailing-area=transactional]');await expect(panel.locator('[data-transactional-list]')).toContainText('member@example.invalid');
  await expect(panel.locator('[data-transactional-transport]')).toContainText('Odesílání je vypnuté — dosud neaktivováno');
  await panel.locator('[data-transactional-transport]').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('transport-off.png'),animations:'disabled'});
  c.r.db.exec('UPDATE transactional_email_control SET enabled=1 WHERE id=1');
  await patchAdminReservationPayment(req({amountPaidCzk:400}),c.r.env,{uid:'a'},'r',origin);
  const row=c.r.db.prepare("SELECT * FROM email_outbox WHERE template_key='reservation_payment' ORDER BY rowid DESC").get();
  await deliverTransactionalEmails(c.r.env,{id:row.id,transport:{async sendBatch(){throw {code:'provider_rejected',definiteRejection:true}}}});
  await panel.getByRole('button',{name:'Filtrovat historii'}).click();
  await expect(panel.locator('[data-transactional-transport]')).toContainText('Odesílání je zapnuté');
  await panel.locator('[name=status]').selectOption('failed');await panel.getByRole('button',{name:'Filtrovat historii'}).click();await expect(panel.locator('[data-transactional-list] article')).toHaveCount(1);
  await panel.getByRole('button',{name:'Detail zprávy',exact:true}).click();await expect(panel.locator('[data-transactional-detail] [role=alert]')).toContainText('Poskytovatel zprávu odmítl');
  await expect(panel.frameLocator('[data-transactional-preview]').getByRole('heading',{level:1})).toHaveText('Platbu jsme zaevidovali');
  await panel.locator('[data-transactional-detail]').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('mailing-failure.png'),animations:'disabled'});
  await panel.locator('[data-transactional-preview]').scrollIntoViewIfNeeded();await expect(panel.frameLocator('[data-transactional-preview]').getByRole('heading',{level:1})).toBeVisible();
  await panel.locator('[data-transactional-preview]').screenshot({path:info.outputPath('mailing-preview.png'),animations:'disabled'});
  await panel.locator('[name=reason]').fill('Výslovně opakuji jednoznačně odmítnutou zprávu');page.once('dialog',dialog=>dialog.accept());await panel.getByRole('button',{name:'Výslovně zařadit nové odeslání'}).click();
  await expect.poll(()=>c.r.db.prepare('SELECT COUNT(*) n FROM email_outbox WHERE retry_of=?').get(row.id).n).toBe(1);expect(c.r.db.prepare('SELECT COUNT(*) n FROM transactional_email_audit').get().n).toBe(1);
  c.r.db.exec('UPDATE transactional_email_control SET enabled=0 WHERE id=1');
  await panel.getByRole('button',{name:'Filtrovat historii'}).click();await expect(panel.locator('[data-transactional-transport]')).toContainText('Odesílání je pozastavené');
  await panel.locator('[data-transactional-transport]').scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('transport-paused.png'),animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
  await page.locator('[data-mailing-tab=campaigns]').click();await expect(page.locator('[data-mailing-area=campaigns]')).toBeVisible();expectNoUnexpectedClientErrors(c.observations);
 }finally{await page.close();c.r.db.close()}
});

for(const width of [1440,390])for(const theme of ['light','dark'])test(`transactional email render and blocked images ${width} ${theme}`,async({page},info)=>{
 await page.setViewportSize({width,height:1000});await page.emulateMedia({colorScheme:theme});await images(page);
 await page.route('**/__transactional-preview/*',route=>{const kind=new URL(route.request().url()).pathname.split('/').at(-1);return route.fulfill({contentType:'text/html',body:renderTransactionalEmail(kind,transactionalExample(kind)).html})});
 for(const kind of ['reservation_payment','merch_confirmation','reservation_rejected']){
  await page.goto('/__transactional-preview/'+kind);await expect(page.getByRole('heading',{level:1})).toHaveText(TRANSACTIONAL_TYPES[kind][1]);
  await expect.poll(()=>page.locator('img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
  await page.screenshot({path:info.outputPath(kind+'.png'),fullPage:kind==='merch_confirmation',animations:'disabled'});
 }
 await page.route('**/*',route=>route.request().resourceType()==='image'?route.abort('blockedbyclient'):route.fallback());
 await page.goto('/__transactional-preview/merch_confirmation');await expect(page.getByRole('heading',{name:'Objednávku jsme přijali',exact:true})).toBeVisible();await expect(page.getByText('Celkem uhrazeno',{exact:true})).toBeVisible();
 await expect.poll(()=>page.locator('img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth===0))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);await page.screenshot({path:info.outputPath('images-blocked.png'),animations:'disabled'});
});

test('transactional reservation link keeps the exact protected destination through sign-in and reload',async({page})=>{
 const r=memberRuntime();const o=await prepareE2ePage(page,{member:{id:'m',email:'member@example.invalid'}});
 r.db.exec("UPDATE events SET payment_recipient_name='Fixture',payment_account_display='19-2000145399/0800',payment_iban='CZ6508000000192000145399',payment_test_mode=0 WHERE id='e'; UPDATE reservations SET payment_vs='2026000001' WHERE id='r'");
 try{
  await page.route('**/api/reservations/current?reservation=*',async route=>{const q=route.request();if(q.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type'}});const url=new URL(q.url()),response=await getCurrentReservation(r.env,{uid:'m'},origin,url.searchParams.get('reservation'));return route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),'Access-Control-Allow-Origin':'*'},body:await response.text()})});
  await page.goto('/member.html?section=payments&reservation=r&event=e');await expect(page.locator('[data-auth-form=register]')).toBeVisible();await page.locator('[data-auth-switch=login]').click();const form=page.locator('[data-auth-form=login]');await expect(form).toBeVisible();await form.locator('[name=email]').fill('member@example.invalid');await form.locator('[name=password]').fill('isolated-password');await form.locator('[type=submit]').click();
  await expect(page.locator('[data-member-panel=payments]')).toHaveClass(/is-active/);await expect(page).toHaveURL(/section=payments&reservation=r/);await expect(page.locator('[data-payments-list]')).toContainText(/United 2026/i);await page.reload();await expect(page.locator('[data-member-panel=payments]')).toHaveClass(/is-active/);expectNoUnexpectedClientErrors(o);
 }finally{await page.close();r.db.close()}
});
