import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {prepareE2ePage,expectNoUnexpectedClientErrors} from './fixtures.mjs';
import {merchRuntime} from '../helpers/merch-runtime.mjs';
import {contentBatch,addContentBatch} from '../helpers/merch-content-20261021.mjs';
import {bridge} from './merch-bridge.mjs';
import {installScreenshotReadiness,waitForScreenshotContent} from './screenshot-readiness.mjs';

const historyPlan=JSON.parse(readFileSync(new URL('../../content/history-20261021.json',import.meta.url),'utf8'));
const money690=/^690(?:,00)?\s*Kč$/;
async function capture(page,info,name,locator){
 await waitForScreenshotContent(page,{label:name});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 if(locator)await locator.screenshot({path:info.outputPath(name+'.png'),animations:'disabled'});
 else await page.screenshot({path:info.outputPath(name+'.png'),animations:'disabled'});
}

for(const width of [1440,390])for(const theme of ['light','dark'])test(`Content batch catalog, details and history ${width} ${theme}`,async({page},info)=>{
 const r=await merchRuntime();
 try{
  r.db.exec("UPDATE merch_config SET data=json_set(data,'$.paused',json('true'))");
  const configBefore=r.db.prepare('SELECT * FROM merch_config').get();
  await addContentBatch(r);await addContentBatch(r);
  const errors=await prepareE2ePage(page);await bridge(page,r.env,'member');
  installScreenshotReadiness(page);await page.setViewportSize({width,height:960});
  await page.addInitScript(theme=>{if(window===window.top)localStorage.setItem('e36UnitedAppearance',theme)},theme);
  await page.route('https://static.wixstatic.com/**',route=>{
   const url=route.request().url(),old2025=url===historyPlan.before['2025'],logo=/UsingleWhite/.test(url);
   return route.fulfill({contentType:logo?'image/png':old2025?'image/jpeg':'image/webp',body:readFileSync(new URL(logo?'../../united-logo-blue-silver-transparent.png':old2025?'../fixtures/content-20261021/previous-2025.jpg':'../../assets/images/program/saturday.webp',import.meta.url))});
  });
  await page.goto('/merch.html');await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await expect(page.locator('[data-product-open]')).toHaveCount(8);
  await expect(page.locator('.shop-catalog-note')).toContainText('objednávání zatím není aktivní');
  await page.getByRole('button',{name:'Trička',exact:true}).click();await expect(page.locator('[data-product-open]')).toHaveCount(7);
  for(const [gender,count] of [['Pánské',4],['Dámské',5]]){
   await page.getByRole('button',{name:gender,exact:true}).click();await expect(page.locator('[data-product-open]')).toHaveCount(count);
   for(const product of contentBatch.products)await expect(page.locator(`[data-product-open="${product.id}"]`)).toHaveCount(1);
  }
  await page.locator('[data-gender="all"]').click();await page.locator('[data-merch-filter="all"]').click();
  for(const image of await page.locator('[data-product="not-fast-not-furious"] img,[data-product="sweetest-things"] img').all()){
   await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate(node=>node.complete&&node.naturalWidth>0)).toBe(true);
  }
  await page.locator('[data-product="not-fast-not-furious"]').evaluate(node=>scrollTo({top:node.getBoundingClientRect().top+scrollY-document.querySelector('.site-header').getBoundingClientRect().height-20,behavior:'instant'}));
  await capture(page,info,'catalog');
  for(const product of contentBatch.products){
   await page.locator(`[data-product-open="${product.id}"]`).click();
   const dialog=page.locator('[data-product-dialog]');await expect(dialog).toBeVisible();
   await expect(dialog.locator('#product-title')).toHaveText(product.name);await expect(dialog.locator('[data-product-type]')).toHaveText('Unisex tričko');
   await expect(dialog.locator('[data-product-price]')).toHaveText(money690);
   const saved=JSON.parse(r.db.prepare('SELECT data FROM merch_products WHERE id=?').get(product.id).data),imageURL='/api/merch/media/'+saved.variants[0].image.slice(3);
   await expect(dialog.locator('[data-detail-image]')).toHaveAttribute('src',new RegExp(imageURL+'$'));
   await dialog.evaluate(node=>node.scrollTop=0);await capture(page,info,'detail-'+product.id);
   await expect(dialog.locator('[data-size]')).toHaveText(['S','M','L','XL']);
   for(const size of ['S','M','L','XL']){
    await dialog.locator(`[data-size="${size}"]`).click();await expect(dialog.locator(`[data-size="${size}"]`)).toHaveAttribute('aria-pressed','true');
    await expect(dialog.locator('[data-detail-image]')).toHaveAttribute('src',new RegExp(imageURL+'$'));
   }
   await dialog.locator('[data-size="M"]').click();await dialog.locator('[data-add-cart]').click();
   await expect(dialog.locator('[data-add-status]')).toContainText(product.name+' / M je v košíku.');
   if(width===390)await capture(page,info,'detail-options-'+product.id);
   await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  }
  await page.locator('.shop-cart-launch').click();await expect(page.locator('.shop-cart-line')).toHaveCount(2);
  await expect(page.locator('[data-cart-total]')).toHaveText(/^1\s*380(?:,00)?\s*Kč$/);
  await expect(page.locator('[data-cart-error]')).toContainText('Objednávání zatím není aktivní');await expect(page.locator('[data-checkout-open]')).toBeDisabled();
  await capture(page,info,'cart-paused');await page.keyboard.press('Escape');
  await page.goto('/o-nas.html');
  for(const year of ['2025','2026']){
   const article=page.locator('.timeline-entry').filter({has:page.locator('.timeline-year').getByText(year,{exact:true})});
   const image=article.locator('.timeline-photo img');await image.scrollIntoViewIfNeeded();
   await expect(image).toHaveAttribute('src',historyPlan.after[year]);await expect.poll(()=>image.evaluate(node=>node.complete&&node.naturalWidth>0)).toBe(true);
   await capture(page,info,'history-'+year,article);
   const geometry=await image.evaluate(node=>({source:node.currentSrc,naturalWidth:node.naturalWidth,naturalHeight:node.naturalHeight,fit:getComputedStyle(node).objectFit,position:getComputedStyle(node).objectPosition,photo:node.parentElement.getBoundingClientRect().toJSON()}));
   await info.attach('history-'+year+'-geometry',{body:JSON.stringify(geometry,null,2),contentType:'application/json'});
  }
  expectNoUnexpectedClientErrors(errors);
  expect(r.db.prepare('SELECT COUNT(*) n FROM merch_products').get().n).toBe(8);expect(r.contentMedia.size).toBe(2);
  expect(r.db.prepare('SELECT * FROM merch_config').get()).toEqual(configBefore);
  expect(r.db.prepare('SELECT COUNT(*) n FROM merch_orders').get().n).toBe(0);expect(r.db.prepare('SELECT COUNT(*) n FROM merch_outbox').get().n).toBe(0);
 }finally{r.close();}
});
