import {test,expect} from '@playwright/test';
import {prepareE2ePage,prepareAdminE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {bridge} from './merch-bridge.mjs';
import {merchRuntime} from '../helpers/merch-runtime.mjs';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const shots=resolve('../portal-workspace-review');
test('Final compact workspace layouts in both themes',async({page})=>{
 const runtime=await merchRuntime();try{
  const errors=await prepareAdminE2ePage(page,{authUid:'admin'});await bridge(page,runtime.env,'admin');
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:960});await page.goto('/admin.html?section=merch');
   await page.locator('[data-merch-admin-tab=settings]').click();await expect(page.locator('[data-merch-settings]')).toBeVisible();await page.evaluate(()=>scrollTo(0,0));await capture(page,`settings-${width}`);
   await page.locator('[data-merch-admin-tab=products]').click();await page.locator('[data-edit-product=united-u-polo]').click();await page.locator('[data-product-editor]').evaluate(node=>node.scrollIntoView({block:'start'}));await capture(page,`product-editor-${width}`);
   await page.goto('/admin.html?section=mailing');await page.locator('[data-mailing-campaign-new]').click();await capture(page,`mailing-editor-${width}`);
   if(width===390)await page.locator('[data-mailing-workspace-tab=preview]').click();await capture(page,`mailing-preview-${width}`);
  }
  expectNoUnexpectedClientErrors(errors);
 }finally{runtime.close();}
});
test('Selected event is distinct from the public current year without activation',async({page})=>{
 const runtime=await merchRuntime();try{
  const errors=await prepareAdminE2ePage(page,{authUid:'admin'});await bridge(page,runtime.env,'admin');
  await page.route('**/api/admin/events',route=>route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({events:[{id:'united-2026',year:2026,title:'United 2026',isCurrent:false,registrationStatus:'closed'},{id:'united-2027',year:2027,title:'United 2027',isCurrent:true,registrationStatus:'closed'}]})}));
  await page.route(/\/api\/admin\/(summary|overview)(\?|$)/,route=>route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({event:{id:'united-2026',year:2026,title:'United 2026',isCurrent:false,registrationStatus:'closed'},attention:{reservations:0,payments:0,gallery:0,history:0},overview:{reservations:1,people:3,statuses:{approved:1}}})}));
  const writes=[];page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/admin/events')&&['PUT','POST','PATCH','DELETE'].includes(request.method()))writes.push(request.url());});
  await page.goto('/admin.html?section=event&event=united-2026');
  await expect(page.locator('[data-settings-context]')).toContainText('Upravuješ United 2026');
  await expect(page.locator('[data-settings-context]')).toContainText('Aktuálně na webu United 2027');
  await expect(page.locator('[data-event-live-context]')).toContainText('Vybraný ročník: United 2026');
  await expect(page.locator('[data-event-live-toggle]')).toHaveText('Zapnout LIVE');
  await expect(page.locator('[name=isCurrent]')).not.toBeChecked();
  expect(writes).toEqual([]);expectNoUnexpectedClientErrors(errors);
 }finally{runtime.close();}
});
async function capture(page,name){
 await mkdir(shots,{recursive:true});
 for(const theme of ['dark','light']){
  await page.evaluate(value=>window.dispatchEvent(new StorageEvent('storage',{key:'e36UnitedAppearance',newValue:value})),theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(image=>{const box=image.getBoundingClientRect();return box.top<innerHeight&&box.bottom>0;}).map(image=>image.decode().catch(()=>{})));});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:resolve(shots,`${name}-${theme}.png`),animations:'disabled'});
 }
}
for(const width of [1440,390])test(`Portal workspace product, payments and account ${width}`,async({page,context})=>{
 test.setTimeout(90000);
 const runtime=await merchRuntime();try{
  const errors=await prepareAdminE2ePage(page,{authUid:'admin'});await bridge(page,runtime.env,'admin');await page.setViewportSize({width,height:960});
  await page.goto('/admin.html?section=merch');await page.locator('[data-merch-admin-tab=products]').click();await expect(page.locator('[data-edit-product]')).toHaveCount(6);await capture(page,`products-${width}`);
  await page.locator('[data-edit-product=united-u-polo]').click();const form=page.locator('[data-product-edit]');await form.locator('[name=name]').fill('United U lokální koncept');await expect(page.locator('[data-product-preview]')).toContainText('United U lokální koncept');
  const variant=form.locator('[data-variant]').first();await variant.locator('[name=size][value=S]').uncheck();await variant.locator('[name=size][value=XL]').check();
  await page.locator('[data-preview-variant]').selectOption('1');await page.locator('[data-preview-variant]').selectOption('0');await expect(form.locator('[name=name]')).toHaveValue('United U lokální koncept');
  page.once('dialog',dialog=>dialog.dismiss());await page.locator('[data-merch-admin-tab=orders]').click();await expect(form).toBeVisible();
  await form.locator('h3').first().scrollIntoViewIfNeeded();await capture(page,`product-editor-${width}`);
  if(width===390){await page.setViewportSize({width:360,height:800});await capture(page,'product-editor-360');await page.setViewportSize({width,height:960});}
  await form.getByRole('button',{name:'Uložit produkt',exact:true}).click();await expect(page.locator('[data-edit-product=united-u-polo]')).toContainText('United U lokální koncept');
  await page.locator('[data-merch-admin-tab=settings]').click();await expect(page.locator('[data-merch-settings]')).toBeVisible();await capture(page,`settings-${width}`);
  const order=await runtime.order();await page.goto('/admin.html?section=payments');await page.locator('[data-finance-tab=merch]').click();await expect(page).toHaveURL(/payment=merch/);await page.reload();await expect(page.locator('[data-finance-tab=merch]')).toHaveAttribute('aria-pressed','true');await page.locator(`[data-payment-order="${order.id}"]`).click();
  await expect(page.locator('[data-admin-panel=payments] [data-merch-admin-tab]')).toHaveCount(0);await expect(page.locator('[data-payment-detail]')).toContainText(order.number);await expect(page.locator('[data-payment-detail] [name=action] option')).toHaveCount(3);await capture(page,`admin-payments-${width}`);
  const member=await context.newPage();const memberErrors=await prepareE2ePage(member,{authenticated:true,member:{id:'member'}});await bridge(member,runtime.env,'member');await member.setViewportSize({width,height:960});await member.goto('/member.html?section=account');await expect(member.locator('[data-address-edit]')).toBeVisible();await expect(member.locator('[data-merch-address] form')).toHaveCount(0);await member.locator('[data-address-edit]').click();await member.locator('[data-address-cancel]').click();await expect(member.locator('[data-address-edit]')).toBeFocused();await member.locator('[data-address-edit]').click();const address=member.locator('[data-merch-address] form');await address.locator('[name=name]').fill('Izolovaný člen');await address.locator('[name=email]').fill('bad');await address.getByRole('button',{name:'Uložit dodací údaje'}).click();await expect(address.locator('[name=email]')).toHaveAttribute('aria-invalid','true');await address.locator('[name=email]').fill('member@example.invalid');await address.locator('[name=phone]').fill('+420777000000');await address.locator('[name=street]').fill('Testovací 1');await address.locator('[name=city]').fill('Praha');await address.locator('[name=postalCode]').fill('11000');await address.getByRole('button',{name:'Uložit dodací údaje'}).click();await expect(member.locator('[data-merch-address] [role=status]')).toContainText('uloženy');await member.locator('[data-merch-address]').scrollIntoViewIfNeeded();await capture(member,`account-${width}`);
  await member.goto('/member.html?section=payments');await member.locator('[data-member-payment-tab=merch]').click();await member.reload();await expect(member.locator('[data-member-payment-tab=merch]')).toHaveAttribute('aria-pressed','true');await expect(member.locator('[data-merch-payments]')).toContainText(order.number);const payment=member.locator('[data-member-merch-payment]').first();await payment.locator(':scope>summary').click();await expect(payment.locator('.merch-qr svg')).toBeVisible();await expect(payment.locator('[data-copy]')).toHaveCount(3);await capture(member,`member-payments-${width}`);await member.locator('[data-member-payment-tab=sraz]').click();await member.goBack();await expect(member.locator('[data-member-payment-tab=merch]')).toHaveAttribute('aria-pressed','true');
  await member.goto('/member.html?section=club');await expect(member.locator('[data-club-anchor=points]')).toBeVisible();await member.locator('[data-club-tab=history]').click();await expect(member.locator('[data-club-anchor=history]')).toBeVisible();await expect(member.locator('[data-club-anchor=points]')).toBeHidden();await member.locator('[data-club-tab=achievements]').click();await expect(member.locator('[data-club-anchor=achievements]')).toBeVisible();await member.locator('[data-club-tab=points]').click();await member.locator('[data-club-tab=points]').scrollIntoViewIfNeeded();await capture(member,`club-${width}`);
  expectNoUnexpectedClientErrors(errors);expectNoUnexpectedClientErrors(memberErrors);await member.close();
 }finally{runtime.close();}
});
test('Portal workspace photo draft, required image and narrow payment tabs',async({page})=>{
 const runtime=await merchRuntime();try{
  const errors=await prepareAdminE2ePage(page,{authUid:'admin'});await bridge(page,runtime.env,'admin');await page.setViewportSize({width:360,height:800});let uploads=0;
  await page.route('**/api/admin/merch/media',route=>{uploads++;return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({image:'polo-white'})});});
  await page.goto('/admin.html?section=merch');await page.locator('[data-merch-admin-tab=products]').click();await page.locator('[data-edit-product=united-u-polo]').click();const form=page.locator('[data-product-edit]'),variant=form.locator('[data-variant]').first();
  await variant.locator('[data-product-file]').setInputFiles('assets/images/merch/polo-white-card.webp');await expect(page.locator('[data-product-preview] img')).toHaveAttribute('src',/^blob:/);expect(uploads).toBe(0);
  await page.locator('[data-preview-variant]').selectOption('1');await page.locator('[data-preview-variant]').selectOption('0');await expect(page.locator('[data-product-preview] img')).toHaveAttribute('src',/^blob:/);
  await variant.locator('[data-remove-photo]').click();await form.getByRole('button',{name:'Uložit produkt',exact:true}).click();await expect(page.locator('[data-product-status]')).toContainText('Každá varianta potřebuje fotografii');expect(uploads).toBe(0);
  await variant.locator('[data-product-file]').setInputFiles('assets/images/merch/polo-white-card.webp');await variant.locator('[data-product-file]').scrollIntoViewIfNeeded();await capture(page,'photo-draft-360');await form.getByRole('button',{name:'Uložit produkt',exact:true}).click();await expect(page.locator('[data-product-edit]')).toHaveCount(0);expect(uploads).toBe(1);
  await page.locator('[data-edit-product=united-u-polo]').click();await expect(page.locator('[data-product-preview] img')).toHaveAttribute('src',/polo-white/);
  await page.goto('/admin.html?section=payments&payment=merch');await expect(page.locator('[data-finance-tab=merch]')).toHaveAttribute('aria-pressed','true');await capture(page,'payment-tabs-360');
  expectNoUnexpectedClientErrors(errors);
 }finally{runtime.close();}
});
for(const width of [1440,390])test(`Portal workspace accommodation, year and campaign ${width}`,async({page})=>{
 const runtime=await merchRuntime();try{
 const errors=await prepareAdminE2ePage(page,{authUid:'admin'});await bridge(page,runtime.env,'admin');await page.setViewportSize({width,height:960});
 await page.goto('/admin.html?section=accommodation');
 const card=page.locator('[data-accommodation-id]').first();await expect(card).toBeVisible();
 const config=card.locator('[data-accommodation-disclosure=configuration]'),photos=card.locator('[data-accommodation-disclosure=photos]');
 await config.locator('summary').click();await expect(config.locator('form')).toBeVisible();await config.locator('summary').click();await expect(config.locator('form')).toBeHidden();
 await photos.locator(':scope>summary').click();await expect(photos.locator('.admin-accommodation-gallery')).toBeVisible();
 await page.locator('[data-refresh]').click();await expect(photos).toHaveAttribute('open','');await expect(config.locator('form')).toBeHidden();await card.locator('h3').scrollIntoViewIfNeeded();await capture(page,`accommodation-${width}`);
 await page.goto('/admin.html?section=event');await expect(page.locator('[data-settings-context]')).toContainText('Potvrzené registrace');await expect(page.locator('.admin-hero-actions [data-appearance-select]')).toHaveCount(0);await capture(page,`event-${width}`);
 await page.goto('/admin.html?section=mailing');await expect(page.locator('[data-mailing-campaign-overview]')).toBeVisible();await expect(page.locator('[data-mailing-editor-workspace]')).toBeHidden();await page.locator('[data-mailing-campaign-new]').click();await expect(page.locator('[data-mailing-editor-workspace]')).toBeVisible();await page.locator('[name=internalName]').fill('Izolovaný UX koncept');await page.locator('[data-mailing-block-list] details').first().locator('summary').click();await expect(page.locator('[data-mailing-block-list] .admin-mailing-block-fields').first()).toBeVisible();await page.locator('[data-mailing-block-list] details').first().locator('summary').click();await expect(page.locator('[data-mailing-block-list] .admin-mailing-block-fields').first()).toBeHidden();
 await page.locator('[data-mailing-save]').click();await expect(page.locator('[data-mailing-save-state]')).toHaveText('Uloženo');await capture(page,`mailing-editor-${width}`);
 if(width===390)await page.locator('[data-mailing-workspace-tab=preview]').click();await expect(page.locator('[data-mailing-preview-frame]')).toBeVisible();await capture(page,`mailing-preview-${width}`);
 expectNoUnexpectedClientErrors(errors);
 }finally{runtime.close();}
});
