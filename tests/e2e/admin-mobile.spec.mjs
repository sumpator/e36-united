import {test,expect} from '@playwright/test';
import {commandFixture} from './command-fixture.mjs';
import {routeAdminMailing} from '../../worker/domains/mailing/index.js';
import {listAdminPreliminaryReservations} from '../../worker/domains/reservations/preliminary.js';
import {bridge} from './merch-bridge.mjs';
import {expectNoUnexpectedClientErrors} from './fixtures.mjs';

async function fixture(page){
 const c=await commandFixture(page);await bridge(page,c.r.env,'a');
 await page.route('https://api.e36united.cz/api/admin/preliminary-reservations?*',async route=>{const response=await listAdminPreliminaryReservations(c.r.env,new URL(route.request().url()),'https://e36united.cz');await route.fulfill({status:response.status,headers:{'Access-Control-Allow-Origin':'*'},body:await response.text()})});
 await page.route('https://api.e36united.cz/api/admin/mailing/**',async route=>{const q=route.request(),url=new URL(q.url());if(url.pathname.endsWith('/provider-status'))return route.fallback();if(q.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PUT,PATCH,OPTIONS'}});const response=await routeAdminMailing({request:new Request(q.url(),{method:q.method(),headers:q.headers(),...(q.postData()?{body:q.postData()}:{})}),env:c.r.env,url,auth:{uid:'a'},origin:'https://e36united.cz'});return route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),'Access-Control-Allow-Origin':'*'},body:await response.text()})});
 return c;
}
const menu=page=>page.locator('[data-portal-sheet-dialog]');
async function openMenu(page){await page.locator('[data-portal-menu-open]').click();await expect(menu(page)).toBeVisible()}
async function open(page,section='dashboard'){await page.goto('/admin.html?section='+section+'&event=e');await expect(page.locator('[data-dashboard-edit]')).toBeEnabled()}
async function select(page,id){await openMenu(page);await menu(page).locator('[data-portal-target="'+id+'"],[data-admin-jump="'+id+'"]').click()}

test('mobile menu uses existing routes, Back, relevant event context, Escape and modal isolation',async({page})=>{
 await page.setViewportSize({width:390,height:720});const c=await fixture(page);try{
  await open(page);await expect(page.locator('.admin-mobile-bar button>span')).toHaveText(['Přehled','Registrace','Platby','Příjezdy']);await expect(page.locator('.portal-nav-viewport')).toBeHidden();
  const header=await page.locator('.admin-header').boundingBox();expect(header.height).toBeLessThan(76);
  await openMenu(page);await expect(page.locator('.admin-mobile-bar')).toHaveJSProperty('inert',true);await expect(menu(page).locator('[data-portal-target],[data-admin-jump]')).toHaveCount(13);await expect(menu(page).locator('[data-portal-target=live]')).toBeVisible();await expect(menu(page).locator('.command-nav-logout')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('[data-portal-menu-open]')).toBeFocused();
  await page.locator('[data-mobile-admin-target=payments]').click();await expect(page.locator('[data-admin-panel=payments]')).toBeVisible();await expect(page.locator('.admin-mobile-context [data-event-select]')).toBeVisible();
  await select(page,'members');await expect(page.locator('[data-admin-panel=members]')).toBeVisible();await expect(page.locator('[data-event-select]')).toBeHidden();await page.goBack();await expect(page.locator('[data-admin-panel=payments]')).toBeVisible();await expect(page.locator('.admin-mobile-context [data-event-select]')).toBeVisible();
  await page.locator('[data-event-select]').selectOption('old');await expect(page).toHaveURL(/event=old/);await expect.poll(()=>c.calls.some(x=>x.includes('/reservations?')&&x.includes('eventId=old'))).toBe(true);
  await expect(page.locator('[data-admin-payment-test]')).toBeVisible();expectNoUnexpectedClientErrors(c.observations);
 }finally{c.r.db.close()}
});

test('mobile shortcuts save three and four through actual versioned preferences and preserve dashboard settings',async({page})=>{
 await page.setViewportSize({width:390,height:720});const c=await fixture(page);try{
  await open(page);await openMenu(page);await menu(page).getByRole('button',{name:'Upravit spodní menu',exact:true}).click();const form=page.locator('[data-dashboard-preferences]');await expect(form).toBeVisible();await expect(form.locator('[data-widget-toggle]')).toHaveCount(0);
  await form.locator('[data-mobile-shortcut=arrivals]').uncheck();await expect(form.locator('[data-mobile-shortcut-count]')).toContainText('3 ze 4');await form.locator('[data-dashboard-save]').click();await expect(form).toBeHidden();await expect(page.locator('.admin-mobile-bar button>span')).toHaveText(['Přehled','Registrace','Platby']);
  const stored=c.stored();expect(stored.value.mobileShortcuts).toEqual(['dashboard','reservations','payments']);const compositions=structuredClone(stored.value.compositions);await page.reload();await expect(page.locator('.admin-mobile-bar button')).toHaveCount(3);
  await openMenu(page);await menu(page).getByRole('button',{name:'Upravit spodní menu',exact:true}).click();await form.locator('[data-mobile-shortcut=members]').check();await form.locator('[data-mobile-shortcut=mailing]').click();await expect(form.locator('[data-mobile-shortcut=mailing]')).not.toBeChecked();await form.locator('[data-dashboard-save]').click();await expect(form).toBeHidden();await expect(page.locator('.admin-mobile-bar button>span')).toHaveText(['Přehled','Registrace','Platby','Členové']);expect(c.stored().value.compositions).toEqual(compositions);
  await openMenu(page);await menu(page).getByRole('button',{name:'Upravit spodní menu',exact:true}).click();await form.locator('[data-mobile-shortcut=members]').uncheck();page.once('dialog',d=>d.accept());await form.locator('[data-dashboard-cancel]').click();expect(c.stored().value.mobileShortcuts).toHaveLength(4);await expect(page.locator('[data-portal-menu-open]')).toBeFocused();expectNoUnexpectedClientErrors(c.observations);
 }finally{c.r.db.close()}
});

test('mobile shortcuts retain conflicts and leave newer account preferences intact',async({page})=>{
 await page.setViewportSize({width:360,height:640});const c=await fixture(page);try{await open(page);await openMenu(page);await menu(page).getByRole('button',{name:'Upravit spodní menu',exact:true}).click();const form=page.locator('[data-dashboard-preferences]');await form.locator('[data-mobile-shortcut=arrivals]').uncheck();const base=structuredClone((await import('../../admin/command-model.js')).commandDefaults());base.mobileShortcuts=['members','mailing','payments'];c.otherDevice(base);await form.locator('[data-dashboard-save]').click();await expect(form.locator('[data-operation-status]')).toContainText('Data se mezitím změnila');await expect(form).toBeVisible();await expect(form.locator('[data-mobile-shortcut=arrivals]')).not.toBeChecked();expect(c.stored().value.mobileShortcuts).toEqual(base.mobileShortcuts);expect(c.observations.pageErrors).toEqual([]);expect(c.observations.unhandledApi).toEqual([]);expect(c.observations.consoleErrors.filter(e=>!c.failures.has(e.url)||!/Failed to load resource|Fetch API cannot load|net::ERR/.test(e.text))).toEqual([]);}finally{c.r.db.close()}
});

for(const [width,theme] of [[360,'light'],[390,'dark'],[820,'light'],[1440,'dark']])test('mobile Admin representative layout '+width+' '+theme,async({page},info)=>{
 await page.setViewportSize({width,height:width===360?640:844});const c=await fixture(page);try{await open(page);await page.evaluate(value=>window.dispatchEvent(new StorageEvent('storage',{key:'e36UnitedAppearance',newValue:value})),theme);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath('dashboard-'+width+'-'+theme+'.png')});if(width<1051){await openMenu(page);await page.screenshot({path:info.outputPath('menu-'+width+'-'+theme+'.png')});await page.keyboard.press('Escape')}expectNoUnexpectedClientErrors(c.observations);}finally{c.r.db.close()}
});

async function shot(page,info,name){await expect(page.locator('[data-admin-freshness]')).toHaveAttribute('data-state','fresh');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:info.outputPath(name+'.png'),animations:'disabled'});}
test('mobile agendas retain real content, filters, member sections and LIVE entry without writes',async({page},info)=>{
 await page.setViewportSize({width:390,height:760});const c=await fixture(page);try{
  await open(page);for(const section of await page.locator('.command-approvals>section').all()){const caption=await section.locator(':scope>.command-action-caption').boundingBox(),scope=await section.locator(':scope>small').boundingBox();expect(scope.y).toBeGreaterThanOrEqual(caption.y+caption.height);}await shot(page,info,'dashboard');
  for(const id of ['arrivals','reservations','preliminary','accommodation','payments','members','photos','club','mailing','merch','settings']){
   await select(page,id);const target=({photos:'gallery',club:'gallery',settings:'event'})[id]||id;await expect(page.locator('[data-admin-panel='+target+']')).toBeVisible();
   if(id==='arrivals')await expect(page.locator('[data-admin-panel=arrivals] .gate-actions')).toBeVisible();
   if(id==='payments')await expect(page.locator('[data-sraz-payments] .booking-collapse-body')).toBeHidden();
   if(id==='members')await expect(page.locator('[data-member-list]')).toContainText('First');
   if(id==='photos')await expect(page.locator('[data-gallery-list]')).toBeVisible();
   if(id==='club')await expect(page.locator('[data-history-list]')).toBeVisible();
   await shot(page,info,id);
  }
  await select(page,'members');await page.locator('[data-member-list] [data-member-open=m]').click();const detail=page.locator('[data-member-dialog]');await expect(detail).toBeVisible();await expect(page.locator('.admin-mobile-bar')).toHaveJSProperty('inert',true);
  await expect(detail.locator('[data-member-tab]')).toHaveCount(5);for(const tab of ['overview','profile','event','club','media']){await detail.locator('[data-member-section-select]').selectOption(tab);await expect(detail.locator('[data-member-panel]')).toBeVisible();await expect(detail.locator('[data-member-section-select]')).toHaveValue(tab);await expect(detail.locator('[data-member-tab='+tab+']')).toHaveAttribute('aria-selected','true');await shot(page,info,'member-'+tab)}
  await detail.locator('[data-member-close]').click();await select(page,'live');await expect(page.locator('[data-admin-live-entry]')).toBeVisible();await expect(menu(page)).toBeHidden();await page.locator('[data-admin-live-entry] footer [data-admin-live-entry-cancel]').click();await expect(page.locator('[data-portal-menu-open]')).toBeFocused();await expect(page.locator('[data-admin-panel=members]')).toBeVisible();expect(c.writes).toEqual([]);expectNoUnexpectedClientErrors(c.observations);
 }finally{c.r.db.close()}
});
test('mobile Mailing and Merch keep all editors, secondary filters and desktop restoration',async({page},info)=>{
 await page.setViewportSize({width:430,height:844});const c=await fixture(page);try{
  await open(page,'mailing');await page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'e36UnitedAppearance',newValue:'dark'})));for(const id of ['overview','contacts','transactional','campaigns']){await page.locator('[data-mailing-tab='+id+']').click();await expect(page.locator('[data-mailing-area='+id+']')).toBeVisible();await shot(page,info,'mailing-'+id)}
  await page.locator('[data-mailing-campaign-new]').click();await expect(page.locator('[data-mailing-campaign-form]')).toBeVisible();await shot(page,info,'mailing-editor');await page.locator('[data-mailing-back]').click();
  await select(page,'merch');for(const id of ['orders','products','settings']){await page.locator('[data-merch-admin-tab='+id+']').click();await shot(page,info,'merch-'+id)}
  await page.setViewportSize({width:1440,height:900});await expect(page.locator('.admin-header [data-event-select]')).toBeVisible();await expect(page.locator('.admin-section-nav')).toBeVisible();await expect(page.locator('.admin-mobile-bar')).toBeHidden();await shot(page,info,'desktop-restored');expectNoUnexpectedClientErrors(c.observations);
 }finally{c.r.db.close()}
});

test('mobile filters retain their query, clear only restrictions and restore desktop controls',async({page})=>{
 await page.setViewportSize({width:360,height:640});const c=await fixture(page);try{
  await open(page,'payments');await expect(page.locator('[data-admin-payment-test]')).toBeVisible();const filters=page.locator('[data-payment-tabs] .admin-mobile-filters');await filters.locator('summary').click();await filters.locator('[data-payment-filter=overpaid]').click();await expect(filters.locator('summary')).toContainText('1');await filters.locator('summary').click();await expect(page.locator('[data-payment-filter=overpaid]')).toBeHidden();await select(page,'members');await page.goBack();await expect(page.locator('[data-payment-filter=overpaid]')).toHaveAttribute('aria-selected','true');await filters.locator('summary').click();await filters.getByRole('button',{name:'Zrušit omezení'}).click();await expect(page.locator('[data-payment-filter=all]')).toHaveAttribute('aria-selected','true');
  await page.locator('[data-finance-tab=merch]').click();await expect(page.locator('[data-event-select]')).toBeHidden();await expect(page.locator('[data-admin-payment-test]')).toBeHidden();await expect(page.locator('[data-admin-panel=payments]>.merch-connected')).toBeVisible();
  await select(page,'mailing');await page.locator('[data-mailing-tab=contacts]').click();const form=page.locator('[data-mailing-contact-form]');await form.locator('[name=q]').fill('First');await form.locator('details>summary').click();await form.locator('[name=scope]').selectOption('historical');await form.locator('button[type=submit]').click();await expect(form.locator('summary')).toContainText('1');await form.locator('details').getByRole('button',{name:'Zrušit omezení'}).click();await expect(form.locator('[name=q]')).toHaveValue('First');await expect(form.locator('[name=scope]')).toHaveValue('relevant');
  await page.setViewportSize({width:1440,height:900});await expect(form.locator('details.admin-mobile-filters')).toHaveCount(0);await expect(form.locator('[name=scope]')).toBeVisible();expect(await page.locator('[data-admin-payment-test]').evaluate(n=>n.parentElement.className)).toBe('admin-payment-overview');expectNoUnexpectedClientErrors(c.observations);
 }finally{c.r.db.close()}
});

test('mobile invalid shortcuts fall back read-only and existing event editor rejects accidental navigation',async({page})=>{
 await page.setViewportSize({width:390,height:640});const c=await fixture(page);try{
  const prefs=(await import('../../admin/dashboard-model.js')).factoryPreferences();prefs.mobileShortcuts=['removed','logout','members'];c.r.db.prepare("INSERT INTO admin_preferences(id,schema_version,configuration_json,revision) VALUES('a',1,?,1)").run(JSON.stringify(prefs));
  await open(page,'event');await expect(page.locator('.admin-mobile-bar button>span')).toHaveText(['Přehled','Registrace','Platby','Příjezdy']);expect(c.stored().value.mobileShortcuts).toEqual(prefs.mobileShortcuts);expect(c.writes).toEqual([]);
  const form=page.locator('[data-event-settings-form]'),input=form.locator('[name=venueName]');await expect(input).toBeVisible();await input.fill('Unsaved venue');page.once('dialog',d=>d.dismiss());await page.locator('[data-mobile-admin-target=payments]').click();await expect(page.locator('[data-admin-panel=event]')).toBeVisible();await expect(input).toHaveValue('Unsaved venue');
  await openMenu(page);await expect(menu(page).locator('input[type=checkbox]')).toHaveCount(0);await page.keyboard.press('Escape');await expect(input).toHaveValue('Unsaved venue');expect(c.writes).toEqual([]);expectNoUnexpectedClientErrors(c.observations);
 }finally{c.r.db.close()}
});
