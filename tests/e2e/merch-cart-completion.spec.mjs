import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {merchRuntime} from '../helpers/merch-runtime.mjs';
import {bridge} from './merch-bridge.mjs';
import {saveSettings,getCatalog} from '../../worker/domains/merch/service.js';
import {waitForScreenshotContent} from './screenshot-readiness.mjs';
const shots=resolve('.local-evidence/mobile-completion-20261030/screenshots');
for(const [width,theme]of [[360,'light'],[390,'dark'],[1440,'light']])test(`cart completion returns to catalogue and shares header basket ${width} ${theme}`,async({page})=>{
 const r=await merchRuntime(),o=await prepareE2ePage(page,{authenticated:true,member:{id:'member'}});await bridge(page,r.env,'member');
 try{
  await page.setViewportSize({width,height:820});await page.addInitScript(t=>localStorage.setItem('e36UnitedAppearance',t),theme);await page.goto('/merch.html');await expect(page.locator('[data-product-open]')).toHaveCount(6);
  const detail=page.locator('[data-product-dialog]'),basket=page.locator('[data-cart-dialog]'),header=page.locator('.shop-header-cart');
  await header.click();await expect(basket).toBeVisible();await expect(basket.locator('[data-cart-body]')).toContainText('prázdný');await basket.getByRole('button',{name:'Zavřít košík',exact:true}).click();
  const opener=page.locator('[data-product-open=united-u-polo]');await opener.click();await detail.locator('[data-select-variant=u-polo-white]').click();await detail.locator('[data-add-cart]').click();await expect(detail).toBeVisible();await expect(detail.locator('[data-product-error]')).toContainText('velikost');await expect(detail.locator('[data-select-variant=u-polo-white]')).toHaveAttribute('aria-pressed','true');
  await detail.locator('[data-size=M]').click();await detail.evaluate(node=>node.scrollTo({top:0,behavior:'instant'}));await waitForScreenshotContent(page,{label:'merch-detail'});await expect(detail.locator('[data-detail-image]')).toBeInViewport();expect(await detail.locator('[data-detail-image]').evaluate(node=>node.complete&&node.naturalWidth>0)).toBe(true);mkdirSync(shots,{recursive:true});await page.screenshot({path:resolve(shots,`merch-detail-${width}-${theme}-${test.info().project.name}.png`),animations:'disabled'});
  await detail.locator('[data-add-cart]').dblclick();await expect(detail).toBeHidden();await expect(basket).toBeHidden();await expect(page.locator('[data-cart-count]')).toHaveText(['1','1']);await expect(page.locator('[data-shop-toast]')).toContainText('Přidáno do košíku');await expect(opener).toBeFocused();expect(await page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
  await page.getByRole('button',{name:'Zobrazit košík',exact:true}).click();await expect(basket.locator('.shop-cart-line')).toHaveCount(1);await expect(basket.locator('[data-line-quantity="0"]')).toHaveValue('1');await basket.locator('[data-line-quantity="0"]').fill('2');await basket.locator('[data-line-quantity="0"]').press('Tab');await expect(page.locator('[data-cart-count]')).toHaveText(['2','2']);await basket.getByRole('button',{name:'Zavřít košík',exact:true}).click();
  await page.locator('[data-product-open=stay-united-men]').click();await expect(detail.locator('#product-title')).toHaveText('Stay United');await detail.locator('[data-size=L]').click();await detail.locator('[data-add-cart]').click();await expect(detail).toBeHidden();await expect(page.locator('[data-cart-count]')).toHaveText(['3','3']);
  await page.reload();await expect(detail).toBeHidden();await expect(page.locator('[data-cart-count]')).toHaveText(['3','3']);await header.click();await expect(basket.locator('.shop-cart-line')).toHaveCount(2);await basket.locator('[data-line-remove="1"]').click();await expect(page.locator('[data-cart-count]')).toHaveText(['2','2']);await basket.getByRole('button',{name:'Zavřít košík',exact:true}).click();
  await waitForScreenshotContent(page,{label:'merch-catalogue'});await page.screenshot({path:resolve(shots,`merch-catalogue-${width}-${theme}-${test.info().project.name}.png`),fullPage:true,animations:'disabled'});
  const orders=await r.env.DB.prepare('SELECT COUNT(*) n FROM merch_orders').first();expect(orders.n).toBe(0);expectNoUnexpectedClientErrors(o);
 }finally{r.close()}
});

test('failed cart persistence keeps the exact choice and retry adds once; paused checkout stays blocked',async({page})=>{
 const r=await merchRuntime(),o=await prepareE2ePage(page,{authenticated:true,member:{id:'member'}});await bridge(page,r.env,'member');
 try{
  await saveSettings(r.env,'admin',{revision:(await getCatalog(r.env,true)).revision,settings:{...r.settings,paused:true}});
  await page.addInitScript(()=>{const set=Storage.prototype.setItem;window.__denyCart=true;Storage.prototype.setItem=function(key,value){if(key==='e36UnitedMerchCartV1'&&window.__denyCart)throw new DOMException('Controlled write denial','SecurityError');return set.call(this,key,value)}});
  await page.setViewportSize({width:390,height:740});await page.goto('/merch.html');await expect(page.locator('.shop-catalog-note')).toContainText('objednávání zatím není aktivní');
  await page.locator('[data-product-open=united-u-polo]').click();const detail=page.locator('[data-product-dialog]');await detail.locator('[data-select-variant=u-polo-white]').click();await detail.locator('[data-size=L]').click();await detail.locator('[data-add-cart]').click();
  await expect(detail).toBeVisible();await expect(detail.locator('[data-product-error]')).toContainText('nepodařilo uložit');await expect(detail.locator('[data-select-variant=u-polo-white]')).toHaveAttribute('aria-pressed','true');await expect(detail.locator('[data-size=L]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('[data-cart-count]')).toHaveText(['0','0']);
  await page.evaluate(()=>window.__denyCart=false);await detail.locator('[data-add-cart]').click();await expect(detail).toBeHidden();await expect(page.locator('[data-cart-count]')).toHaveText(['1','1']);await page.locator('.shop-header-cart').click();await expect(page.locator('[data-checkout-open]')).toBeDisabled();await expect(page.locator('[data-cart-error]')).toContainText('Objednávání zatím není aktivní');expect((await r.env.DB.prepare('SELECT COUNT(*) n FROM merch_orders').first()).n).toBe(0);expectNoUnexpectedClientErrors(o);
 }finally{r.close()}
});
