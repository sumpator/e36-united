import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {prepareE2ePage,prepareAdminE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {bridge} from './merch-bridge.mjs';
import {merchRuntime} from '../helpers/merch-runtime.mjs';
import {changeOrder} from '../../worker/domains/merch/service.js';
import {transactionalContent} from '../../worker/domains/mailing/transactional.js';
import {renderTransactionalEmail} from '../../worker/domains/mailing/transactional-template.js';

async function captureThemes(page,info,name){
 for(const theme of ['light','dark']){
  await page.emulateMedia({colorScheme:theme});
  await page.evaluate(theme=>window.dispatchEvent(new StorageEvent('storage',{key:'e36UnitedAppearance',newValue:theme})),theme);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0}).map(i=>i.decode()))});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize().width+1);
  await page.screenshot({path:info.outputPath(name+'-'+theme+'.png'),fullPage:name.startsWith('mail-'),animations:'disabled'});
 }
}
for(const width of [1440,390])for(const shipping of ['pickup','address'])test(`Merch fulfillment and actual email content ${shipping} ${width}`,async({page,context},info)=>{
 const r=await merchRuntime();let member,preview;
 try{
  r.db.exec('UPDATE transactional_email_control SET enabled=1 WHERE id=1');
  let order=await r.order({shipping,address:{name:'Člen Test',email:'member@example.invalid',phone:'+420777000000',street:'Testovací 1',city:'Praha',postalCode:'11000'}});
  for(const input of [{action:'paid',date:new Date().toISOString().slice(0,10)},{action:'status',status:'preparing'}])order=await changeOrder(r.env,'admin',order.id,{...input,revision:order.revision,operationKey:crypto.randomUUID()},true);
  const errors=await prepareAdminE2ePage(page,{authUid:'admin'});await bridge(page,r.env,'admin');await page.setViewportSize({width,height:1000});
  await page.goto('/admin.html?section=merch');await page.locator(`[data-admin-order="${order.id}"]`).click();
  const detail=page.locator('[data-admin-order-detail]');
  async function status(value){const form=detail.locator('[data-order-admin-form]');await form.locator('[name=action]').selectOption('status');await form.locator('[name=status]').selectOption(value);if(value==='sent'){await form.locator('[name=carrier]').fill('Fixture');await form.locator('[name=trackingNumber]').fill('TEST123');await form.locator('[name=trackingUrl]').fill('https://example.invalid/track/TEST123')};await form.getByRole('button',{name:'Uložit operaci',exact:true}).click();await expect.poll(()=>JSON.parse(r.db.prepare('SELECT state FROM merch_orders WHERE id=?').get(order.id).state).status).toBe(value)}
  await status('ready');const ready=shipping==='address'?'Připraveno k odeslání':'Připraveno k převzetí';await expect(detail.locator('.merch-order>header')).toContainText(ready);await expect(page.locator(`[data-admin-order="${order.id}"]`)).toContainText(ready);
  await detail.scrollIntoViewIfNeeded();await captureThemes(page,info,'admin-ready');
  member=await context.newPage();const memberErrors=await prepareE2ePage(member,{authenticated:true,member:{id:'member'}});await bridge(member,r.env,'member');await member.setViewportSize({width,height:1000});await member.goto('/member.html?section=merch');await expect(member.locator(`[data-merch-order="${order.id}"]`)).toContainText(ready);await member.locator(`[data-merch-order="${order.id}"]`).click();await expect(member.locator('[data-merch-detail] .merch-order>header')).toContainText(ready);await member.locator('[data-merch-detail]').scrollIntoViewIfNeeded();await captureThemes(member,info,'member-ready');
  preview=await context.newPage();await preview.setViewportSize({width,height:1000});
  await preview.route('https://e36united.cz/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({contentType:path.endsWith('.webp')?'image/webp':'image/png',body:readFileSync(new URL('../..'+path,import.meta.url))})});
  await preview.route('**/__merch-email/*',async route=>{const kind=new URL(route.request().url()).pathname.split('/').at(-1),row=r.db.prepare('SELECT * FROM email_outbox WHERE entity_id=? AND template_key=? ORDER BY rowid DESC').get(order.id,kind),data=await transactionalContent(r.env,row);expect(data).toBeTruthy();await route.fulfill({contentType:'text/html',body:renderTransactionalEmail(kind,data).html})});
  await preview.goto('/__merch-email/merch_ready');await expect(preview.getByRole('heading',{level:1})).toHaveText(shipping==='address'?'Objednávka je připravená k odeslání':'Objednávka je připravená k převzetí');await captureThemes(preview,info,'mail-ready');
  if(shipping==='address')await status('sent');await status('completed');await expect(detail.locator('.merch-order>header')).toContainText('Dokončeno');await expect(page.locator(`[data-admin-order="${order.id}"]`)).toContainText('Dokončeno');
  const saved=JSON.parse(r.db.prepare('SELECT state FROM merch_orders WHERE id=?').get(order.id).state);if(shipping==='address')expect(saved.tracking.number).toBe('TEST123');
  expect(r.db.prepare("SELECT COUNT(*) n FROM email_outbox WHERE entity_id=? AND template_key='merch_completed'").get(order.id).n).toBe(1);
  await member.reload();await member.locator('[data-merch-filter="history"]').click();await member.locator(`[data-merch-order="${order.id}"]`).click();await expect(member.locator('[data-merch-detail] .merch-order>header')).toContainText('Dokončeno');await expect(member.locator('[data-merch-detail] .merch-qr')).toHaveCount(0);
  await preview.goto('/__merch-email/merch_completed');await expect(preview.getByRole('heading',{level:1})).toHaveText('Objednávka je dokončená');await expect(preview.locator('.mail-next')).toHaveText('Teď nemusíš nic dělat.');await expect(preview.locator('.mail-next')).toBeVisible();await captureThemes(preview,info,'mail-completed');
  expectNoUnexpectedClientErrors(errors);expectNoUnexpectedClientErrors(memberErrors);
 }finally{await member?.close();await preview?.close();await page.close();r.close()}
});
