import {test,expect} from '@playwright/test';
import {prepareE2ePage} from './fixtures.mjs';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {decodeMemberQrSvg} from '../helpers/decode-member-qr.mjs';

const shots=resolve('../portal-next-review');
async function setup(page,options={}){
 const errors=await prepareE2ePage(page,options);
 await page.route('**/api/live/state',r=>r.fulfill({json:{active:false},headers:{'Access-Control-Allow-Origin':'*'}}));
 await page.route('**/api/merch/orders?**',r=>r.fulfill({json:{orders:[],hasMore:false},headers:{'Access-Control-Allow-Origin':'*'}}));
 await page.route('**/api/merch/address',r=>r.fulfill({json:{address:null},headers:{'Access-Control-Allow-Origin':'*'}}));
 await page.route('**/api/merch/catalog',r=>r.fulfill({json:{products:[],settings:{paused:true,discountBasisPoints:1000,rewardThreshold:12},ready:false},headers:{'Access-Control-Allow-Origin':'*'}}));
 const photo=readFileSync(new URL('../../assets/images/showshine/ss_coupe.webp',import.meta.url));
 await page.route('https://static.wixstatic.com/**',r=>r.fulfill({contentType:/UsingleWhite/i.test(r.request().url())?'image/png':'image/webp',body:/UsingleWhite/i.test(r.request().url())?readFileSync(new URL('../../united-logo-blue-silver-transparent.png',import.meta.url)):photo}));
 await page.route('**/api/cars/media/**',r=>r.fulfill({contentType:'image/webp',headers:{'Access-Control-Allow-Origin':'*'},body:photo}));
 await page.route(/\/api\/events\/united-2026\/accommodation\/[^/]+\/(?:photo|gallery\/[^/?]+)(?:\?.*)?$/,r=>r.fulfill({contentType:'image/webp',headers:{'Access-Control-Allow-Origin':'*'},body:readFileSync(new URL('../../cabin-zbraslavice-user.webp',import.meta.url))}));
 return errors;
}
async function capture(page,name,theme='light'){
 mkdirSync(shots,{recursive:true});await page.evaluate(theme=>window.dispatchEvent(new StorageEvent('storage',{key:'e36UnitedAppearance',newValue:theme})),theme);
 await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&i.checkVisibility()}).map(i=>i.decode().catch(()=>{})))});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:resolve(shots,name+'.png'),animations:'disabled'});
}
test('history year follows visible section in both scroll directions',async({page})=>{
 await setup(page);await page.setViewportSize({width:1366,height:768});await page.goto('/o-nas.html');
 await expect(page.locator('.timeline-entry').first()).toBeVisible();
 const errors=[];
 const positions=await page.locator('.timeline-entry').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top+scrollY));
 for(const y of [...positions,...positions.toReversed()]){
  await page.evaluate(y=>scrollTo({top:y-160,behavior:'instant'}),y);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const state=await page.evaluate(()=>{const probe=document.querySelector('.site-header').getBoundingClientRect().bottom+70;const entries=[...document.querySelectorAll('.timeline-entry')];const active=entries.filter(n=>n.getBoundingClientRect().top<=probe).at(-1)||entries[0];return {expected:active.querySelector('.timeline-year').textContent.trim(),actual:document.querySelector('[data-history-year]').textContent.trim()}});
  if(state.expected!==state.actual)errors.push(state);
 }
 expect(errors).toEqual([]);
 await page.locator('.timeline-entry').nth(2).scrollIntoViewIfNeeded();
 const directYear=await page.locator('.timeline-entry').nth(2).locator('.timeline-year').innerText();
 await page.locator('.timeline-entry').nth(2).evaluate(node=>scrollTo({top:node.getBoundingClientRect().top+scrollY-100,behavior:'instant'}));
 await expect(page.locator('[data-history-year]')).toHaveText(directYear);
 await capture(page,'history-notebook');
});
test('member navigation, milestones, account QR and compact layouts',async({page})=>{
 const errors=await setup(page,{authenticated:true,member:{qrPayload:'E36U1:'+'a'.repeat(48)},clubPayload:{points:{available:24,lifetime:24}},cars:[{id:'car-001',nickname:'Estoril',model:'328i',body:'Coupé',primary:true,photos:[{id:'photo-1'}]}]});
 await page.setViewportSize({width:1440,height:1000});await page.goto('/member.html?section=club');
 await expect(page.locator('[data-club-anchor=points]')).toBeVisible();await expect(page.locator('[data-reward-name]')).toContainText('10 %');
 await expect(page.locator('.reward-ledger-note')).toContainText('nejsou počet nevyčerpaných');await capture(page,'club-desktop');
 await expect(page.locator('.reward-achieved')).toBeVisible();await expect(page.locator('[data-reward-progress]')).toContainText('2 dosažených');
 await page.locator('[data-earn-strip]').scrollIntoViewIfNeeded();await capture(page,'club-activities-desktop');
 await page.locator('[data-club-tab=history]').click();await expect(page.locator('[data-history-grid]')).toBeVisible();await page.locator('[data-club-tab=achievements]').click();await expect(page.locator('[data-achievement-catalog]')).toBeVisible();
 await page.setViewportSize({width:1366,height:768});await page.locator('.member-sidebar [data-member-section=overview]').click();await expect(page.locator('[data-member-hero]')).toHaveJSProperty('offsetHeight',161);await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await capture(page,'overview-notebook','dark');
 await page.setViewportSize({width:390,height:844});await page.locator('[data-mobile-menu]').click();await expect(page.locator('.united-mobile-menu')).toBeVisible();await capture(page,'menu-mobile');await page.locator('.united-mobile-menu [data-mobile-section=account]').click();await expect(page.locator('[data-member-panel=account]')).toBeVisible();await expect(page.locator('[data-mobile-menu]')).toHaveAttribute('aria-current','page');
 await expect(page.locator('[data-account-qr] svg')).toBeVisible();await capture(page,'account-mobile');await page.locator('[data-account-qr-open]').click();await expect(page.locator('[data-account-qr-dialog]')).toBeVisible();await expect(page.locator('.member-bottom-nav')).toBeHidden();await capture(page,'qr-mobile','dark');await page.keyboard.press('Escape');await expect(page.locator('[data-account-qr-open]')).toBeFocused();
 expect(decodeMemberQrSvg(await page.locator('[data-account-qr] svg').evaluate(node=>node.outerHTML))).toBe('E36U1:'+'a'.repeat(48));
 await page.locator('[data-account-qr-open]').click();await page.locator('[data-account-qr-close]').click();await expect(page.locator('[data-account-qr-open]')).toBeFocused();
 await page.locator('[data-account-qr-open]').click();await page.mouse.click(5,5);await expect(page.locator('[data-account-qr-dialog]')).not.toBeVisible();
 await page.locator('[data-account-qr-open]').click();await page.goBack();await expect(page.locator('[data-account-qr-dialog]')).not.toBeVisible();await expect(page).toHaveURL(/section=account/);
 await page.locator('[data-account-form] [name=name]').focus();await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{configurable:true,value:innerHeight-300});visualViewport.dispatchEvent(new Event('resize'))});await expect(page.locator('.member-bottom-nav')).toBeHidden();await page.evaluate(()=>{delete visualViewport.height;visualViewport.dispatchEvent(new Event('resize'))});await expect(page.locator('.member-bottom-nav')).toBeVisible();
 await page.locator('[data-mobile-menu]').click();await page.goBack();await expect(page.locator('.united-mobile-menu')).not.toBeVisible();await expect(page.locator('[data-mobile-menu]')).toBeFocused();
 await page.locator('[data-mobile-menu]').click();await page.locator('.united-mobile-menu [data-mobile-section=merch]').click();await expect(page.locator('[data-merch-orders]')).toContainText('Zatím');await expect(page.locator('[data-merch-pagination]')).toBeHidden();await page.locator('[data-merch-filter=history]').click();await expect(page.locator('[data-merch-filter=history]')).toHaveAttribute('aria-pressed','true');await capture(page,'merch-mobile');
 await page.goBack();await expect(page.locator('[data-member-panel=account]')).toBeVisible();
 await page.setViewportSize({width:360,height:780});await page.locator('[data-mobile-menu]').click();await page.locator('.united-mobile-menu [data-mobile-section=club]').click();await page.locator('[data-club-tab=points]').click();await capture(page,'club-360','dark');
 expect(errors.pageErrors).toEqual([]);expect(errors.unhandledApi).toEqual([]);
});
test('public mobile menu, sign-in return and light Planner choices',async({page})=>{
 const errors=await setup(page);await page.setViewportSize({width:390,height:844});await page.goto('/index.html#planer');
 await expect(page.locator('.mobile-auth-link')).toHaveText('Přihlásit se');await page.locator('.menu-btn').click();await expect(page.locator('.united-mobile-menu')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.menu-btn')).toBeFocused();
 await page.locator('.mobile-auth-link').click();await expect(page.locator('[data-auth-form=login]')).toBeVisible();await page.locator('[data-auth-form=login] [name=email]').fill('eva@example.test');await page.locator('[data-auth-form=login] [name=password]').fill('example-password');await page.locator('[data-auth-form=login] [type=submit]').click();await expect(page).toHaveURL(/index.html#planer/);await expect(page.locator('.mobile-auth-link')).toHaveText('Můj United');
 await page.locator('[data-stay-index="1"]').click();await expect(page.locator('[data-stay-index="1"]')).toHaveClass(/is-active/);await capture(page,'planner-mobile');
 await page.setViewportSize({width:1440,height:1000});await expect(page.locator('.mobile-auth-link')).toBeHidden();await page.locator('[data-accommodation-option-id]').first().click();await expect(page.locator('[data-accommodation-option-id]').first()).toHaveAttribute('aria-pressed','true');await page.locator('#planer').scrollIntoViewIfNeeded();await capture(page,'planner-desktop');await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await capture(page,'home-desktop');
 await page.setViewportSize({width:390,height:844});await capture(page,'home-mobile');expect(errors.pageErrors).toEqual([]);
});
