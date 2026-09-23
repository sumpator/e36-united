import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {prepareE2ePage,expectNoUnexpectedClientErrors as expectNoBrowserErrors} from './fixtures.mjs';
const source=readFileSync(new URL('../../merch/catalog.js',import.meta.url),'utf8');
async function setup(page,width,theme='light',commerce=false){
 const observations=await prepareE2ePage(page,{authenticated:true});
 await page.setViewportSize({width,height:900});
 await page.addInitScript(theme=>localStorage.setItem('e36UnitedAppearance',theme),theme);
 // Only this local intercepted response has synthetic commercial data. Nothing
 // is wired into the application's catalog or a production test switch.
 if(commerce)await page.route('**/merch/catalog.js*',route=>route.fulfill({contentType:'text/javascript',body:source+`\nfor(const p of catalog)for(const v of p.variants){v.priceMinor=55000;v.sizes=['S','M','L'];v.availability='available'};catalog[0].variants[1].availability='unconfirmed';catalog[0].variants[2].priceMinor=65000;shopSettings.fulfillment={id:'test-only',label:'TESTOVACÍ předání — není nabídka obchodu'};`}));
 await page.goto('/merch.html');await expect(page.locator('[data-product-open]')).toHaveCount(6);
 if(commerce)await page.locator('.shop-catalog-note').evaluate(el=>{el.textContent='TESTOVACÍ CENY A VELIKOSTI — nejsou obchodní nabídkou.'});
 return observations;
}
async function shot(page,name){
 if(name.includes('fixture'))await page.locator('[data-cart-dialog]').evaluate(el=>{if(el.querySelector('[data-test-label]'))return;const label=document.createElement('p');label.dataset.testLabel='';label.textContent='TESTOVACÍ CENY A VELIKOSTI — nejsou nabídkou obchodu';label.style.cssText='padding:8px;background:#fff1c9;color:#634600;font:700 12px/1.5 sans-serif';el.querySelector('.shop-dialog-bar').after(label)});
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>i.getBoundingClientRect().top<innerHeight&&i.getBoundingClientRect().bottom>0).map(i=>i.decode().catch(()=>{})))});
 await page.screenshot({path:`${process.env.MERCH_SCREENSHOTS||'test-results/merch'}/${name}.png`,animations:'disabled'});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);expect(overflow).toBe(false);
}
for(const width of [1440,390,360])for(const theme of ['light','dark'])test(`Merch real catalog and variant detail ${width} ${theme}`,async({page})=>{
 const o=await setup(page,width,theme);await shot(page,`catalog-${width}-${theme}`);
 await page.locator('[data-product-open="united-u-polo"]').click();const dialog=page.locator('[data-product-dialog]');await expect(dialog).toBeVisible();
 await expect(page).toHaveURL(/product=united-u-polo/);await expect(page.locator('[data-product-images] button')).toHaveCount(4);
 await page.locator('[data-select-variant="u-polo-white"]').click();await expect(page.locator('[data-detail-image]')).toHaveAttribute('src',/polo-white/);
 await expect(page.locator('[data-color-label]')).toHaveText('Bílá / zlaté U');await expect(page.locator('[data-add-cart]')).toBeDisabled();
 await expect(page.locator('[data-product-sizes] button')).toHaveCount(0);await shot(page,`detail-${width}-${theme}`);
 await page.locator('[data-view="1"]').click();await expect(page.locator('[data-detail-image]')).toHaveAttribute('src',/close-1/);
 await page.locator('[data-image-zoom]').click();await expect(page.locator('[data-image-dialog]')).toBeVisible();await page.getByRole('button',{name:'Zavřít zvětšení'}).click();
 await page.goBack();await expect(dialog).not.toBeVisible();await expect(page.locator('[data-product-open="united-u-polo"]')).toBeFocused();
 await page.getByRole('button',{name:'Trička',exact:true}).click();await expect(page.locator('[data-product-open]')).toHaveCount(5);
 await page.locator('[data-product-open="stay-united-women-v"]').click();await page.locator('[data-select-variant="stay-women-pink"]').click();await expect(page.locator('[data-detail-image]')).toHaveAttribute('src',/stay-women-pink/);
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
 expectNoBrowserErrors(o);
});
for(const [width,theme] of [[1440,'light'],[390,'light'],[360,'light'],[390,'dark']])test(`Merch fixture cart and honest email recap ${width} ${theme}`,async({page})=>{
 const o=await setup(page,width,theme,true);
 await page.locator('[data-product-open="united-u-polo"]').click();await page.locator('[data-add-cart]').click();await expect(page.locator('[data-product-error]')).toContainText('velikost');
 await page.locator('[data-size="M"]').click();await page.locator('[data-add-cart]').click();await expect(page.locator('[data-add-status]')).toContainText('je v košíku');
 await page.locator('[data-add-cart]').click();await page.locator('[data-size="L"]').click();await page.locator('[data-add-cart]').click();
 await page.locator('[data-product-dialog] [data-cart-open]').click();await expect(page.locator('[data-cart-body] .shop-cart-line')).toHaveCount(2);await expect(page.locator('[data-line-quantity="0"]')).toHaveValue('2');
 await page.locator('[data-line-quantity="0"]').fill('3');await page.locator('[data-line-quantity="0"]').press('Tab');await expect(page.locator('[data-cart-total]')).toContainText('2 200');
 await shot(page,`cart-fixture-${width}-${theme}`);
 await page.getByRole('button',{name:'Zavřít košík',exact:true}).click();await page.getByRole('button',{name:'Zavřít detail',exact:true}).click();
 await expect(page.locator('[data-product-dialog]')).not.toBeVisible();await page.reload();await page.locator('.shop-cart-launch').click();await expect(page.locator('[data-cart-body] .shop-cart-line')).toHaveCount(2);
 await page.locator('[data-checkout-open]').click();await expect(page.locator('[name="email"]')).toHaveValue('eva@example.test');
 await page.locator('[name="note"]').fill('TEST — neposílat');await page.getByRole('button',{name:'Zkontrolovat objednávku →'}).click();await expect(page.locator('[data-order-review]')).toBeVisible();
 const link=page.locator('[data-order-email]');const href=await link.getAttribute('href');expect(href).toMatch(/^mailto:united@e36united.cz/);expect(new URL(href).searchParams.get('body')).toContain('u-polo-navy');
 await expect(page.locator('[data-order-review]')).toContainText('Objednávka se neodesílá z webu');await shot(page,`recap-fixture-${width}-${theme}`);
 await page.locator('[data-order-email]').scrollIntoViewIfNeeded();await shot(page,`recap-actions-fixture-${width}-${theme}`);
 // Let the real click handler build/validate the message, suppress only the
 // operating-system mail client handoff so no real email can be sent.
 await link.evaluate(el=>el.addEventListener('click',e=>e.preventDefault(),{once:true}));await link.click();await expect(page.locator('[data-order-status]')).toContainText('web ho nemůže ověřit');
 // No actual mailto navigation or email is sent. Exercise the denied clipboard fallback.
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('fixture denied'))}}));
 await page.locator('[data-order-copy]').click();await expect(page.locator('[data-copy-fallback] textarea')).toHaveValue(/TEST — neposílat/);
 await page.getByRole('button',{name:'Zavřít košík',exact:true}).click();await page.locator('.shop-cart-launch').click();await page.locator('[data-line-remove="1"]').click();await expect(page.locator('[data-cart-body] .shop-cart-line')).toHaveCount(1);
 const persisted=await page.evaluate(()=>JSON.parse(localStorage.getItem('e36UnitedMerchCartV1')));expect(persisted).toEqual([{variantId:'u-polo-navy',size:'M',quantity:3}]);
 expect(o.requests.filter(r=>r.startsWith('POST '))).toEqual([]);expectNoBrowserErrors(o);
});
test('Merch variant availability, account privacy and return from sign-in',async({page})=>{
 const o=await setup(page,390,'light',true);await page.locator('[data-product-open="united-u-polo"]').click();
 await page.locator('[data-size="M"]').click();await page.locator('[data-select-variant="u-polo-white"]').click();await expect(page.locator('[data-add-cart]')).toBeDisabled();
 await page.locator('[data-select-variant="u-polo-blue"]').click();await expect(page.locator('[data-product-price]')).toContainText('650');await expect(page.locator('[data-size][aria-pressed="true"]')).toHaveCount(0);
 await page.locator('[data-size="L"]').click();await page.locator('[data-add-cart]').click();await page.locator('[data-product-dialog] [data-cart-open]').click();await page.locator('[data-checkout-open]').click();await page.locator('[name="note"]').fill('Soukromá poznámka Evy');
 await page.evaluate(async()=>{const auth=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');await auth.signOut()});
 await page.locator('[data-checkout-open]').click();await expect(page.locator('[name="note"]')).toHaveValue('');await expect(page.locator('[name="email"]')).toHaveValue('');
 await o.switchMember({id:'second-member',name:'Petr',email:'petr@example.test'});
 await page.evaluate(async()=>{const auth=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');await auth.signInWithEmailAndPassword()});
 await page.locator('[data-checkout-open]').click();await expect(page.locator('[name="email"]')).toHaveValue('petr@example.test');await expect(page.locator('[name="note"]')).toHaveValue('');
 await page.goto('/member.html?section=account');await page.goto('/merch.html');await page.locator('.shop-cart-launch').click();await expect(page.locator('[data-cart-body] .shop-cart-line')).toHaveCount(1);await expect(page.locator('[data-cart-total]')).toContainText('650');expectNoBrowserErrors(o);
});
test('Merch direct link, system appearance and invalid persisted variant',async({page})=>{
 const o=await setup(page,390,'system');await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.goto('/merch.html?product=stay-united-women-v&variant=stay-women-blue');await expect(page.locator('[data-product-dialog]')).toBeVisible();await expect(page.locator('[data-detail-image]')).toHaveAttribute('src',/stay-women-blue/);
 await page.getByRole('button',{name:'Zavřít detail'}).click();await expect(page).not.toHaveURL(/product=/);
 await page.evaluate(()=>localStorage.setItem('e36UnitedMerchCartV1',JSON.stringify([{variantId:'retired',size:'M',quantity:1,priceMinor:1}])));await page.reload();await page.locator('.shop-cart-launch').click();await expect(page.locator('[data-cart-error]')).toContainText('už není potvrzená');await expect(page.locator('[data-checkout-open]')).toBeDisabled();await page.locator('[data-line-remove="0"]').click();await expect(page.locator('[data-cart-body]')).toContainText('prázdný');expectNoBrowserErrors(o);
});
