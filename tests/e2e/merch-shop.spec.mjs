import {test,expect} from '@playwright/test';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {merchRuntime} from '../helpers/merch-runtime.mjs';
import {bridge} from './merch-bridge.mjs';
import {saveProduct,getCatalog} from '../../worker/domains/merch/service.js';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
async function setup(page,width,theme){
 const r=await merchRuntime(),errors=await prepareE2ePage(page,{authenticated:true,member:{id:'member'}});
 await bridge(page,r.env,'member');await page.setViewportSize({width,height:900});await page.addInitScript(t=>localStorage.setItem('e36UnitedAppearance',t),theme);await page.goto('/merch.html');await expect(page.locator('[data-product-open]')).toHaveCount(6);return {...r,errors};
}
for(const width of [1440,390,360])for(const theme of ['light','dark'])test('Merch variants and combined filters '+width+' '+theme,async({page})=>{
 const r=await setup(page,width,theme);try{
 await page.locator('[data-product-open="united-u-polo"]').click();await expect(page).toHaveURL(/product=united-u-polo/);await expect(page.locator('[data-product-images] button')).toHaveCount(4);
 await page.locator('[data-select-variant="u-polo-white"]').click();await expect(page.locator('[data-detail-image]')).toHaveAttribute('src',/polo-white/);await expect(page.locator('[data-size]')).toHaveCount(4);
 await page.locator('[data-add-cart]').click();await expect(page.locator('[data-product-error]')).toContainText('velikost');
 await page.locator('[data-view="1"]').click();await expect(page.locator('[data-detail-image]')).toHaveAttribute('src',/close-1/);await page.locator('[data-image-zoom]').click();await expect(page.locator('[data-image-dialog]')).toBeVisible();await page.getByRole('button',{name:'Zavřít zvětšení'}).click();
 await page.goBack();await expect(page.locator('[data-product-dialog]')).not.toBeVisible();await expect(page.locator('[data-product-open="united-u-polo"]')).toBeFocused();
 await page.getByRole('button',{name:'Trička',exact:true}).click();await page.getByRole('button',{name:'Dámské',exact:true}).click();await expect(page.locator('[data-product-open]')).toHaveCount(3);
 await page.locator('[data-product-open="stay-united-women-v"]').click();await page.locator('[data-select-variant="stay-women-pink"]').click();await expect(page.locator('[data-detail-image]')).toHaveAttribute('src',/stay-women-pink/);await page.keyboard.press('Escape');
 await page.locator('[data-catalog-filters]').scrollIntoViewIfNeeded();await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0}).map(i=>i.decode()));});
 const dir=resolve(process.env.MERCH_SCREENSHOTS||'../merch-connected-review');await mkdir(dir,{recursive:true});await page.screenshot({path:resolve(dir,'filters-'+width+'-'+theme+'.png'),animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expectNoUnexpectedClientErrors(r.errors);
 }finally{r.close();}
});
test('Merch cart survives reload and sign-in; private contact is cleared',async({page})=>{
 const r=await setup(page,390,'light');try{
 await page.locator('[data-product-open="united-u-polo"]').click();await page.locator('[data-size="M"]').click();await page.locator('[data-add-cart]').click();await page.locator('[data-add-cart]').click();await page.locator('[data-size="L"]').click();await page.locator('[data-add-cart]').click();await page.locator('[data-product-dialog] [data-cart-open]').click();await expect(page.locator('.shop-cart-line')).toHaveCount(2);await expect(page.locator('[data-line-quantity="0"]')).toHaveValue('2');
 await page.reload();await expect(page.locator('[data-product-dialog]')).toBeVisible();await page.locator('[data-product-dialog] [data-cart-open]').click();await expect(page.locator('.shop-cart-line')).toHaveCount(2);await page.locator('[data-checkout-open]').click();await page.locator('[name=note]').fill('Soukromá poznámka prvního účtu');
 await page.evaluate(async()=>{const auth=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');await auth.signOut();});await expect(page.locator('[name=note]')).toHaveCount(0);await page.locator('[data-checkout-open]').click();await expect(page.locator('[data-cart-error]')).toContainText('Přihlas');
 await page.evaluate(async()=>{const auth=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');await auth.signInWithEmailAndPassword();});await page.locator('[data-checkout-open]').click();await expect(page.locator('[name=note]')).toHaveValue('');await expect(page.locator('[data-cart-count]')).toHaveText('3');expectNoUnexpectedClientErrors(r.errors);
 }finally{r.close();}
});
test('Merch publication drives categories and unavailable variants stay blocked',async({page})=>{
 const r=await setup(page,1440,'light');try{
 const p=(await getCatalog(r.env,true)).products[0];await saveProduct(r.env,'admin',{...p,id:'new-row',category:'Nová kategorie',variants:[{...p.variants[0],id:'new-row-blue',priceMinor:null}]});await page.reload();await expect(page.getByRole('button',{name:'Nová kategorie',exact:true})).toBeVisible();await page.getByRole('button',{name:'Nová kategorie',exact:true}).click();await page.locator('[data-product-open="new-row"]').click();await expect(page.locator('[data-product-price]')).toContainText('Cena bude doplněna');await expect(page.locator('[data-add-cart]')).toBeDisabled();await page.keyboard.press('Escape');
 await page.evaluate(()=>localStorage.setItem('e36UnitedMerchCartV1',JSON.stringify([{variantId:'retired',size:'M',quantity:1,priceMinor:1}])));await page.reload();await page.locator('.shop-cart-launch').click();await expect(page.locator('[data-checkout-open]')).toBeDisabled();await page.locator('[data-line-remove="0"]').click();await expect(page.locator('[data-cart-body]')).toContainText('prázdný');expectNoUnexpectedClientErrors(r.errors);
 }finally{r.close();}
});
