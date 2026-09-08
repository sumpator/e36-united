import {test,expect} from '@playwright/test';
import {prepareAdminE2ePage} from './fixtures.mjs';
const headers={'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
const reply=(route,payload,status=200)=>route.fulfill({status,headers,body:JSON.stringify(payload)});
const id='reservation-admin-e2e';
async function fixture(page){
 const observations=await prepareAdminE2ePage(page);
 const failedUrls=new Set();
 let revision=1,paid=1200,mode='success',writes=[],receipts=new Map(),denied=false,readFailure=false;
 const row=()=>({id,eventId:'united-2026',revision,memberId:'member-e2e',sourceType:'reservation',sourceId:id,member:{id:'member-e2e',name:'Synthetic Operator',email:'operator@example.invalid'},status:'approved',crew:2,attendanceType:'full_weekend',showShine:'Ne',reviewNote:'',payment:{amountDueCzk:4800,amountPaidCzk:paid,remainingCzk:4800-paid,balanceCzk:4800-paid,overpaymentCzk:0,status:'underpaid',overdue:false}});
 await page.route('https://api.e36united.cz/api/admin/reservations**',async route=>{
  const request=route.request();if(request.method()==='OPTIONS')return route.fallback();
  if(denied){failedUrls.add(request.url());return reply(route,{message:'Admin access revoked'},403);}
  if(request.method()==='GET'){
   if(readFailure){failedUrls.add(request.url());return reply(route,{message:'Synthetic unavailable'},503);}
   return reply(route,{reservations:[row()],pagination:{page:1,pageSize:50,total:1,totalPages:1}});
  }
  const op=request.headers()['idempotency-key'],base=Number(request.headers()['if-match']),body=request.postDataJSON();
  writes.push({op,base,body});
  if(mode==='undelivered'){failedUrls.add(request.url());return route.abort('connectionfailed');}
  if(base!==revision&&!receipts.has(op)){failedUrls.add(request.url());return reply(route,{message:'Data se mezitím změnila.',current:{revision}},409);}
  if(!receipts.has(op)){paid=body.amountPaidCzk;revision+=2;receipts.set(op,{id:op,state:'confirmed',revision,entityId:id,eventId:'united-2026'})}
  if(mode==='lost'){failedUrls.add(request.url());return route.abort('connectionfailed');}
  if(mode==='delayed')await new Promise(resolve=>control.release=resolve);
  return reply(route,{ok:true,operation:receipts.get(op),reservation:{id,payment:row().payment}}).catch(()=>{});
 });
 await page.route('https://api.e36united.cz/api/admin/operations/**',route=>{
  if(route.request().method()==='OPTIONS')return route.fallback();
  const op=new URL(route.request().url()).pathname.split('/').pop();
  return reply(route,{operation:receipts.get(op)||{id:op,state:'outcome_unknown'}});
 });
 const control={observations,writes,receipts,failedUrls,set mode(value){mode=value},set denied(value){denied=value},set readFailure(value){readFailure=value},change(value){paid=value;revision++},release:null};
 return control;
}
const drawer=page=>page.locator('[data-reservation-drawer]');
async function open(page){await page.goto('/admin.html?section=reservations');await expect(page.locator('[data-reservation-list]')).toContainText('Synthetic Operator');await page.locator('[data-reservation-list] button[data-reservation-open="reservation-admin-e2e"]').click();await expect(drawer(page)).toBeVisible()}
const amount=page=>drawer(page).locator('[data-payment-amount]');
const save=page=>drawer(page).locator('[data-payment-save]');
const pulse=page=>page.evaluate(()=>window.dispatchEvent(new Event('focus')));
function noUnexpectedRuntime(control){expect(control.observations.pageErrors).toEqual([]);expect(control.observations.unhandledApi).toEqual([]);expect(control.observations.consoleErrors.filter(error=>!control.failedUrls.has(error.url)||!/Failed to load resource|Fetch API cannot load/.test(error.text)),'only intentionally injected transport/HTTP errors are expected').toEqual([])}

test('dirty payment survives refresh, stays open and rejects a newer server base',async({page},testInfo)=>{
 await page.setViewportSize({width:1440,height:900});const control=await fixture(page);await open(page);
 await amount(page).fill('1700');control.change(1400);await pulse(page);
 await expect(drawer(page).locator('[data-operation-status]')).toContainText('novější data');await expect(amount(page)).toHaveValue('1700');
 await save(page).click();await expect(drawer(page).locator('[data-operation-state]')).toHaveAttribute('data-operation-state','conflict');
 await expect(amount(page)).toHaveValue('1700');expect(control.writes[0].base).toBe(1);expect(control.receipts.size).toBe(0);
 await page.screenshot({path:testInfo.outputPath('admin-conflict-desktop.png')});
 await page.setViewportSize({width:390,height:844});await amount(page).focus();await page.screenshot({path:testInfo.outputPath('admin-conflict-mobile.png')});
 page.on('dialog',dialog=>dialog.dismiss());await page.locator('[data-reservation-drawer-close]').last().click();await expect(drawer(page)).toBeVisible();
 noUnexpectedRuntime(control);
});

test('committed save with lost response survives reload and reconciles without repeating a write',async({page})=>{
 const control=await fixture(page);await open(page);control.mode='lost';await amount(page).fill('1900');await save(page).click();
 await expect(drawer(page)).toContainText('Výsledek uložení zatím nelze ověřit.');expect(control.receipts.size).toBe(1);
 page.on('dialog',dialog=>dialog.accept());await page.reload();
 await expect(drawer(page)).toBeVisible();await expect(amount(page)).toHaveValue('1900');
 await expect.poll(()=>page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.includes('.operation.')).length)).toBe(0);
 expect(control.writes).toHaveLength(1);noUnexpectedRuntime(control);
});

test('undelivered save remains unknown on reconnect and only explicit retry reuses its ID',async({page})=>{
 const control=await fixture(page);await open(page);control.mode='undelivered';await amount(page).fill('1800');await save(page).click();
 await expect(drawer(page)).toContainText('Výsledek uložení zatím nelze ověřit.');expect(control.receipts.size).toBe(0);
 await page.evaluate(()=>{window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'))});await pulse(page);
 await expect(drawer(page)).toBeVisible();expect(control.writes).toHaveLength(1);control.mode='success';
 page.on('dialog',dialog=>dialog.accept());await drawer(page).getByRole('button',{name:'Výslovně opakovat stejnou operaci'}).click();
 await expect.poll(()=>control.receipts.size).toBe(1);expect(control.writes).toHaveLength(2);expect(control.writes[1]).toEqual(control.writes[0]);noUnexpectedRuntime(control);
});

test('Back during a save never replays it and returning to the URL recovers its receipt',async({page})=>{
 const control=await fixture(page);await open(page);const detailUrl=page.url();control.mode='delayed';
 await amount(page).fill('2100');await save(page).click();await expect.poll(()=>control.writes.length).toBe(1);
 page.on('dialog',dialog=>dialog.accept());await page.goBack();await expect(drawer(page)).toBeHidden();
 control.release();await page.goto(detailUrl);await expect(drawer(page)).toBeVisible();await expect(amount(page)).toHaveValue('2100');
 expect(control.writes).toHaveLength(1);noUnexpectedRuntime(control);
});

test('failed refresh retains data with stale label; reconnect converges without mutations',async({page},testInfo)=>{
 const control=await fixture(page);await open(page);control.readFailure=true;await pulse(page);
 await expect(page.locator('[data-admin-freshness]')).toContainText('zastaralá');await expect(page.locator('[data-reservation-list]')).toContainText('Synthetic Operator');
 await expect(drawer(page).locator('[data-domain-status="reservation-detail"]')).toBeVisible();
 await expect(drawer(page).locator('[data-domain-status="reservation-detail"]')).toContainText('zastaralá');
 await drawer(page).locator('.admin-reservation-drawer-close').click({trial:true}); // A stale banner must not cover the close target.
 await page.screenshot({path:testInfo.outputPath('admin-stale.png')});
 control.readFailure=false;control.change(1500);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect(amount(page)).toHaveValue('1500');expect(control.writes).toHaveLength(0);noUnexpectedRuntime(control);
});

test('access loss clears protected state and drafts and stops refresh',async({page})=>{
 const control=await fixture(page);await open(page);await amount(page).fill('1550');control.denied=true;await pulse(page);
 await expect(page.locator('[data-admin-view]')).toBeHidden();await expect(page.locator('[data-reservation-list]')).toBeEmpty();
 expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(key=>key.startsWith('e36.admin.safe.')))).toEqual([]);
 expect(control.writes).toHaveLength(0);noUnexpectedRuntime(control);
});

test('visible polling converges within the ten-second interval; hidden tabs make no periodic requests',async({page})=>{
 await page.clock.install();const control=await fixture(page);await open(page);control.change(2200);
 await page.clock.runFor(10_100);await expect(amount(page)).toHaveValue('2200');
 let reads=0;page.on('request',request=>{if(request.url().includes('/api/admin/'))reads++});
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))});
 await page.clock.runFor(30_000);expect(reads).toBe(0);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))});
 await expect.poll(()=>reads).toBeGreaterThan(0);expect(control.writes).toHaveLength(0);noUnexpectedRuntime(control);
});

test('unsent draft survives reload only by explicit restore, and conflicting restore never auto-saves',async({page})=>{
 const control=await fixture(page);await open(page);await amount(page).fill('2300');control.change(1600);
 page.on('dialog',dialog=>dialog.accept());await page.reload();await expect(drawer(page)).toBeVisible();await expect(amount(page)).toHaveValue('1600');
 await drawer(page).getByRole('button',{name:'Obnovit koncept',exact:true}).click();await expect(amount(page)).toHaveValue('2300');
 await expect(drawer(page)).toContainText('starší revize');await page.evaluate(()=>window.dispatchEvent(new Event('online')));expect(control.writes).toHaveLength(0);
 noUnexpectedRuntime(control);
});
test('storage denial is visible and does not prevent an authenticated editor from working',async({page})=>{
 const control=await fixture(page);
 await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(String(key).startsWith('e36.admin.safe.'))throw new DOMException('Synthetic denied','SecurityError');return original.call(this,key,value)}});
 await open(page);await amount(page).fill('2400');await expect(drawer(page)).toContainText('úložiště obnovy není dostupné');await save(page).click();await expect.poll(()=>control.receipts.size).toBe(1);expect(control.writes).toHaveLength(1);noUnexpectedRuntime(control);
});
test('pagination uses full totals and a late previous reservation cannot replace the current drawer',async({page})=>{
 const control=await fixture(page);
 const makeRow=(entityId,name,paid)=>({id:entityId,eventId:'united-2026',revision:1,member:{id:entityId+'-member',name,email:'synthetic@example.invalid'},status:'approved',crew:2,payment:{amountDueCzk:4800,amountPaidCzk:paid,remainingCzk:4800-paid,status:'underpaid'}});
 const a=makeRow(id,'Synthetic Operator',1200),b=makeRow('reservation-other','Second Synthetic',1900);
 let release,started=false;
 const delayed=new Promise(resolve=>release=resolve);
 await page.route('https://api.e36united.cz/api/admin/reservations**',async route=>{
  if(route.request().method()!=='GET')return route.fallback();
  const requested=new URL(route.request().url()).searchParams.get('id');
  if(requested===id){started=true;await delayed;return reply(route,{reservations:[a],pagination:{page:1,pageSize:50,total:1,totalPages:1}}).catch(()=>{});}
  return reply(route,{reservations:requested?[b]:[a,b],pagination:{page:1,pageSize:50,total:requested?1:101,totalPages:requested?1:3}});
 });
 await open(page);
 await expect.poll(()=>started).toBe(true);
 await expect(page.locator('[data-reservation-count]')).toContainText('101');
 await expect(page.locator('[data-payment-count]')).toContainText('101');
 await drawer(page).locator('button[data-reservation-drawer-close]:not(.admin-reservation-drawer-backdrop)').click();
 await expect(drawer(page)).toBeHidden();
 await page.locator('[data-reservation-list] button[data-reservation-open="reservation-other"]').click();
 await expect(drawer(page)).toContainText('Second Synthetic');
 await expect(amount(page)).toHaveValue('1900');
 release();await pulse(page);
 await expect(drawer(page)).toContainText('Second Synthetic');
 await expect(drawer(page)).not.toContainText('Synthetic Operator');
 expect(control.writes).toHaveLength(0);noUnexpectedRuntime(control);
});
test('switching event during an unavailable read never relabels old records or enables stale settings',async({page})=>{
 const control=await fixture(page);
 const events=[{id:'united-2026',year:2026,isCurrent:true,revision:1,registrationStatus:'open',venueName:'Old venue'},{id:'united-2027',year:2027,isCurrent:false,revision:1,registrationStatus:'open',venueName:'New venue'}];
 await page.route('https://api.e36united.cz/api/admin/events',route=>reply(route,{events}));
 await page.route('https://api.e36united.cz/api/admin/summary**',route=>{
  if(new URL(route.request().url()).searchParams.get('eventId')!=='united-2027')return route.fallback();
  control.failedUrls.add(route.request().url());return reply(route,{message:'Synthetic other event unavailable'},503);
 });
 await page.route('https://api.e36united.cz/api/admin/reservations**',route=>{
  if(route.request().method()!=='GET'||new URL(route.request().url()).searchParams.get('eventId')!=='united-2027')return route.fallback();
  control.failedUrls.add(route.request().url());return reply(route,{message:'Synthetic other event unavailable'},503);
 });
 await page.goto('/admin.html?section=reservations');await expect(page.locator('[data-reservation-list]')).toContainText('Synthetic Operator');
 await page.locator('[data-event-select]').selectOption('united-2027');
 await expect(page.locator('[data-admin-freshness]')).toContainText('zastaralá');
 await expect(page.locator('[data-event-year]')).toHaveText('2027');
 await expect(page.locator('[data-reservation-list]')).not.toContainText('Synthetic Operator');
 await expect(page.locator('[data-kpi-reservations]')).toHaveText('—');
 await expect(page.locator('[data-event-settings-form]')).toHaveAttribute('inert','');
 expect(control.writes).toHaveLength(0);noUnexpectedRuntime(control);
});
