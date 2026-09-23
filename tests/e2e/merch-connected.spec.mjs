import {bridge} from './merch-bridge.mjs';
import {test,expect} from '@playwright/test';
import {prepareE2ePage,prepareAdminE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {merchRuntime} from '../helpers/merch-runtime.mjs';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const shots=resolve(process.env.MERCH_SCREENSHOTS||'../merch-connected-review');
async function capture(page,name){await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0}).map(i=>i.decode()));});await mkdir(shots,{recursive:true});await page.screenshot({path:resolve(shots,name+'.png'),animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);}
async function captureThemes(page,name){for(const t of ['light','dark']){await page.evaluate(value=>window.dispatchEvent(new StorageEvent('storage',{key:'e36UnitedAppearance',newValue:value})),t);await expect(page.locator('html')).toHaveAttribute('data-theme',t);await capture(page,`${name}-${t}`);}}
for(const [width,theme] of [[1440,'light'],[390,'dark']])test(`Connected Merch member and Admin ${width} ${theme}`,async({page,context})=>{
 const r=await merchRuntime();try{
  const observations=await prepareE2ePage(page,{authenticated:true,member:{id:'member'}});await bridge(page,r.env,'member');await page.setViewportSize({width,height:900});await page.addInitScript(theme=>localStorage.setItem('e36UnitedAppearance',theme),theme);
  await page.goto('/merch.html');await expect(page.locator('[data-product-open]')).toHaveCount(6);
  await page.locator('#shop-main').scrollIntoViewIfNeeded();await capture(page,`catalog-${width}-${theme}`);
  await page.locator('[data-product-open="united-u-polo"]').click();await page.locator('[data-size="M"]').click();await page.locator('[data-add-cart]').click();await page.locator('[data-product-dialog] [data-cart-open]').click();await page.locator('[data-checkout-open]').click();
  await expect(page.locator('[data-server-checkout]')).toBeVisible();await page.locator('[data-server-checkout] [name=name]').fill('Člen Test');await page.locator('[data-server-checkout] [name=email]').fill('member@example.invalid');
  await page.getByRole('button',{name:'Zkontrolovat objednávku',exact:true}).click();await expect(page.locator('[data-confirm-order]')).toBeVisible();await captureThemes(page,`checkout-${width}`);
  await page.locator('[data-accept-terms]').check();await page.locator('[data-confirm-order]').click();await expect(page.locator('[data-order-id]')).toBeVisible();await expect(page.locator('.merch-qr svg')).toBeVisible();
  const id=await page.locator('[data-order-id]').getAttribute('data-order-id');expect(r.db.prepare('SELECT COUNT(*) n FROM merch_orders').get().n).toBe(1);await captureThemes(page,`payment-${width}`);
  await page.goto('/member.html?section=merch');await expect(page.locator('[data-merch-orders] [data-merch-order]')).toHaveCount(1);await page.locator(`[data-merch-order="${id}"]`).click();await expect(page.locator('[data-merch-detail]')).toContainText('890');
  const admin=await context.newPage();const adminErrors=await prepareAdminE2ePage(admin,{authUid:'admin'});await bridge(admin,r.env,'admin');await admin.setViewportSize({width,height:900});await admin.goto('/admin.html?section=merch');await expect(admin.locator(`[data-admin-order="${id}"]`)).toBeVisible();await admin.locator(`[data-admin-order="${id}"]`).click();
  const form=admin.locator('[data-order-admin-form]');await form.locator('[name=amount]').fill('200');await form.getByRole('button',{name:'Uložit operaci'}).click();await expect(admin.locator('[data-admin-order-detail]')).toContainText('Nedoplatek');await captureThemes(admin,`admin-${width}`);
  await page.reload();await page.locator(`[data-merch-order="${id}"]`).click();await expect(page.locator('[data-merch-detail]')).toContainText('690');
  await form.locator('[name=action]').selectOption('paid');await form.getByRole('button',{name:'Uložit operaci'}).click();await expect(admin.locator('[data-admin-order-detail]')).toContainText('Uhrazeno');
  await page.reload();await page.locator(`[data-merch-order="${id}"]`).click();await expect(page.locator('[data-merch-detail] .merch-qr')).toHaveCount(0);await expect(page.locator('[data-merch-detail]')).toContainText('Zaplaceno');
  for(const selected of ['light','dark']){await page.evaluate(value=>window.dispatchEvent(new StorageEvent('storage',{key:'e36UnitedAppearance',newValue:value})),selected);await capture(page,`member-${width}-${selected}`);}
  if(width===390){await page.setViewportSize({width:360,height:780});await page.locator('[data-merch-detail]').scrollIntoViewIfNeeded();await capture(page,'member-360');}
  expectNoUnexpectedClientErrors(observations);expectNoUnexpectedClientErrors(adminErrors);await admin.close();
 }finally{r.close();}
});
test('Merch catalog administration, account defaults and payment tabs share authoritative orders',async({page,context})=>{
 const r=await merchRuntime();try{
 const errors=await prepareAdminE2ePage(page,{authUid:'admin'});await bridge(page,r.env,'admin');await page.goto('/admin.html?section=merch');
 await page.locator('[data-merch-admin-tab="products"]').click();await page.locator('[data-new-product]').click();const f=page.locator('[data-product-edit]');
 for(const [name,value]of Object.entries({id:'ui-product',name:'UI produkt',category:'Nová UI kategorie',variantId:'ui-blue',color:'Modrá',sizes:'S, M, L, XL',price:'690'}))await f.locator(`[name=${name}]`).fill(value);
 await f.locator('[name=image]').selectOption('polo-navy');await f.locator('[name=availability]').selectOption('available');await f.locator('[name=status]').selectOption('published');await f.getByRole('button',{name:'Uložit produkt',exact:true}).click();await expect(page.locator('[data-edit-product="ui-product"]')).toBeVisible();
 const member=await context.newPage(),memberErrors=await prepareE2ePage(member,{authenticated:true,member:{id:'member'}});await bridge(member,r.env,'member');await member.goto('/merch.html');await expect(member.getByRole('button',{name:'Nová UI kategorie',exact:true})).toBeVisible();
 await member.goto('/member.html?section=account');const address=member.locator('[data-merch-address] form');await expect(address).toBeVisible();
 for(const [name,value]of Object.entries({name:'Člen Test',email:'member@example.invalid',phone:'+420777000000',street:'Testovací 1',city:'Praha',postalCode:'11000'}))await address.locator(`[name=${name}]`).fill(value);
 await address.getByRole('button',{name:'Uložit dodací údaje'}).click();await expect(address.locator('[role=status]')).toContainText('uloženy');
 const o=await r.order();await member.goto('/member.html?section=overview');await expect(member.locator('[data-merch-overview]')).toContainText(o.number);
 await member.goto('/member.html?section=payments');await member.locator('[data-member-payment-tab="merch"]').click();await expect(member.locator('[data-merch-payments]')).toContainText(o.number);await expect(member.locator('[data-payments-list]')).toBeHidden();await member.locator('[data-member-payment-tab="sraz"]').click();await expect(member.locator('[data-payments-list]')).toBeVisible();
 await page.goto('/admin.html?section=payments');await page.locator('[data-finance-tab="merch"]').click();await page.locator(`[data-admin-order="${o.id}"]`).click();await expect(page.locator('[data-admin-order-detail]')).toContainText(o.number);await page.locator('[data-finance-tab="sraz"]').click();await expect(page.locator('[data-sraz-payments]')).toBeVisible();
 expectNoUnexpectedClientErrors(errors);expectNoUnexpectedClientErrors(memberErrors);await member.close();
 }finally{r.close();}
});
